import threading

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Experiment, ExperimentAnswer, Variant, Question
from app.services.deepinfra import chat_completion
from app.services.letter_extract import extract_letter, gold_to_letter
from app.progress import progress_store


def _format_choices(choices: list) -> str:
    """Format MCQ choices as A) ..., B) ..., etc."""
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    lines = []
    for i, choice in enumerate(choices):
        if i < len(letters):
            lines.append(f"{letters[i]}) {choice}")
    return "\n".join(lines)


def _build_prompt(experiment: Experiment, variant: Variant, question: Question) -> str:
    """Build the prompt for a given variant."""
    is_mcq = variant.config.startswith("mcq_")

    if is_mcq:
        template = experiment.mcq_prompt
        choices_text = _format_choices(variant.choices) if variant.choices else ""
        question_text = f"{question.question}\n\n{choices_text}"
    else:
        template = experiment.open_question_prompt
        question_text = question.question

    return template.format(
        course_name=question.course,
        question=question_text,
    )


def _get_filtered_variants(db: Session, experiment: Experiment) -> list:
    """Get variants matching the experiment's filter_config."""
    fc = experiment.filter_config or {}

    q = db.query(Variant).join(Question)

    if fc.get("config"):
        q = q.filter(Variant.config.in_(fc["config"]))
    if fc.get("split"):
        q = q.filter(Variant.split.in_(fc["split"]))
    if fc.get("area"):
        q = q.filter(Question.area.in_(fc["area"]))
    if fc.get("language"):
        q = q.filter(Question.language.in_(fc["language"]))
    if fc.get("course"):
        q = q.filter(Question.course.in_(fc["course"]))
    if fc.get("jurisdiction"):
        q = q.filter(Question.jurisdiction.in_(fc["jurisdiction"]))
    if fc.get("year"):
        q = q.filter(Question.year.in_(fc["year"]))
    if fc.get("international") is not None:
        q = q.filter(Question.international == fc["international"])

    return q.all()


def _generate_worker(experiment_id: int) -> None:
    """Background worker that generates answers for an experiment."""
    db = SessionLocal()
    progress_key = f"generate:{experiment_id}"
    try:
        experiment = db.query(Experiment).get(experiment_id)
        if not experiment:
            progress_store.finish(progress_key, error="Experiment not found")
            return

        variants = _get_filtered_variants(db, experiment)
        n_answers = experiment.n_answers or 1
        total = len(variants) * n_answers

        progress_store.create(progress_key, total)

        experiment.status = "generating"
        db.commit()

        for variant in variants:
            question = db.query(Question).get(variant.question_id)
            if not question:
                for _ in range(n_answers):
                    progress_store.increment(progress_key, failed=True)
                continue

            prompt_text = _build_prompt(experiment, variant, question)
            is_mcq = variant.config.startswith("mcq_")

            for run_idx in range(n_answers):
                try:
                    result = chat_completion(
                        model=experiment.model_name,
                        messages=[{"role": "user", "content": prompt_text}],
                        temperature=experiment.temperature or 0.7,
                        max_tokens=experiment.max_tokens or 2048,
                    )

                    answer = ExperimentAnswer(
                        experiment_id=experiment_id,
                        variant_id=variant.id,
                        run_index=run_idx,
                        model_name=experiment.model_name,
                        answer_text=result["content"],
                        input_tokens=result["input_tokens"],
                        output_tokens=result["output_tokens"],
                    )

                    if is_mcq and variant.gold is not None:
                        letter = extract_letter(result["content"])
                        answer.extracted_letter = letter
                        gold_letter = gold_to_letter(variant.gold)
                        answer.mcq_correct = (letter == gold_letter) if letter else False

                    db.add(answer)
                    db.commit()
                    progress_store.increment(progress_key)
                except Exception as e:
                    db.rollback()
                    progress_store.increment(progress_key, failed=True)

        experiment.status = "generated"
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


def start_generation(experiment_id: int) -> None:
    """Start generation in a background thread."""
    thread = threading.Thread(target=_generate_worker, args=(experiment_id,), daemon=True)
    thread.start()


def count_filtered_variants(db: Session, filter_config: dict) -> int:
    """Count variants matching a filter config."""
    fc = filter_config or {}
    q = db.query(Variant).join(Question)

    if fc.get("config"):
        q = q.filter(Variant.config.in_(fc["config"]))
    if fc.get("split"):
        q = q.filter(Variant.split.in_(fc["split"]))
    if fc.get("area"):
        q = q.filter(Question.area.in_(fc["area"]))
    if fc.get("language"):
        q = q.filter(Question.language.in_(fc["language"]))
    if fc.get("course"):
        q = q.filter(Question.course.in_(fc["course"]))
    if fc.get("jurisdiction"):
        q = q.filter(Question.jurisdiction.in_(fc["jurisdiction"]))
    if fc.get("year"):
        q = q.filter(Question.year.in_(fc["year"]))
    if fc.get("international") is not None:
        q = q.filter(Question.international == fc["international"])

    return q.count()
