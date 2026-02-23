import re
import threading

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Experiment, ExperimentAnswer, ExperimentJudgment, Variant, Question
from app.services.deepinfra import chat_completion
from app.services.letter_extract import extract_score
from app.progress import progress_store


def _strip_thinking(text: str) -> str:
    """Remove <think>...</think> blocks from text."""
    if not text:
        return text
    return re.sub(r"<think>[\s\S]*?</think>", "", text).strip()


def _judge_worker(experiment_id: int, judge_model: str) -> None:
    """Background worker that judges answers for an experiment."""
    db = SessionLocal()
    progress_key = f"judge:{experiment_id}:{judge_model}"
    try:
        experiment = db.query(Experiment).get(experiment_id)
        if not experiment:
            progress_store.finish(progress_key, error="Experiment not found")
            return

        # Get open-question answers only (MCQ scored by letter matching)
        all_answers = (
            db.query(ExperimentAnswer)
            .join(Variant)
            .filter(
                ExperimentAnswer.experiment_id == experiment_id,
                Variant.config == "open_question",
            )
            .all()
        )

        # Skip answers already judged by this judge_model (dedup)
        already_judged_ids = set()
        if all_answers:
            already_judged_ids = set(
                row[0] for row in db.query(ExperimentJudgment.answer_id)
                .filter(
                    ExperimentJudgment.answer_id.in_([a.id for a in all_answers]),
                    ExperimentJudgment.judge_model == judge_model,
                )
                .all()
            )
        answers = [a for a in all_answers if a.id not in already_judged_ids]

        total = len(answers)
        progress_store.create(progress_key, total)

        experiment.status = "judging"
        db.commit()

        for answer in answers:
            try:
                variant = db.query(Variant).get(answer.variant_id)
                question = db.query(Question).get(variant.question_id)

                # Strip thinking traces so judge only sees the actual answer
                clean_answer = _strip_thinking(answer.answer_text) or "(no answer)"

                prompt_text = experiment.judge_prompt.format(
                    question_fact=question.question,
                    ref_answer=variant.answer or "(no reference answer)",
                    model_answer=clean_answer,
                )

                messages = []
                if experiment.judge_system_prompt:
                    messages.append({"role": "system", "content": experiment.judge_system_prompt})
                messages.append({"role": "user", "content": prompt_text})

                result = chat_completion(
                    model=judge_model,
                    messages=messages,
                    temperature=experiment.judge_temperature if experiment.judge_temperature is not None else 0.3,
                    max_tokens=experiment.judge_max_tokens or 4096,
                )

                # Extract score from the clean judgment (without thinking traces)
                clean_judgment = _strip_thinking(result["content"])
                score = extract_score(clean_judgment)

                judgment = ExperimentJudgment(
                    answer_id=answer.id,
                    judge_model=judge_model,
                    judgment_text=result["content"],
                    score=score,
                    input_tokens=result["input_tokens"],
                    output_tokens=result["output_tokens"],
                )
                db.add(judgment)
                db.commit()
                progress_store.increment(progress_key)
            except Exception:
                db.rollback()
                progress_store.increment(progress_key, failed=True)

        experiment.status = "completed"
        db.commit()
        progress_store.finish(progress_key)
    except Exception as e:
        db.rollback()
        try:
            experiment = db.query(Experiment).get(experiment_id)
            if experiment:
                experiment.status = "error"
                db.commit()
        except Exception:
            pass
        progress_store.finish(progress_key, error=str(e))
    finally:
        db.close()


def start_judging(experiment_id: int, judge_model: str) -> None:
    """Start judging in a background thread."""
    thread = threading.Thread(
        target=_judge_worker, args=(experiment_id, judge_model), daemon=True
    )
    thread.start()
