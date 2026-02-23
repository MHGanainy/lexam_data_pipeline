import statistics as stats_lib

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Experiment, ExperimentAnswer, ExperimentJudgment, Variant, Question

router = APIRouter()


@router.get("/{experiment_id}/stats")
def get_stats(
    experiment_id: int,
    model_name: str | None = None,
    judge_model: str | None = None,
    db: Session = Depends(get_db),
):
    exp = db.query(Experiment).get(experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")

    # Base query for answers
    ans_q = db.query(ExperimentAnswer).filter(ExperimentAnswer.experiment_id == experiment_id)
    if model_name:
        ans_q = ans_q.filter(ExperimentAnswer.model_name == model_name)

    answers = ans_q.all()

    # MCQ stats
    mcq_answers = [a for a in answers if a.extracted_letter is not None]
    mcq_correct = sum(1 for a in mcq_answers if a.mcq_correct)
    mcq_total = len(mcq_answers)
    mcq_accuracy = (mcq_correct / mcq_total) if mcq_total > 0 else 0

    # Open-question stats (from judgments)
    open_answers = [a for a in answers if a.extracted_letter is None]
    open_answer_ids = [a.id for a in open_answers]

    scores = []
    if open_answer_ids:
        j_q = db.query(ExperimentJudgment).filter(
            ExperimentJudgment.answer_id.in_(open_answer_ids),
            ExperimentJudgment.score.isnot(None),
        )
        if judge_model:
            j_q = j_q.filter(ExperimentJudgment.judge_model == judge_model)
        scores = [j.score for j in j_q.all()]

    avg_score = stats_lib.mean(scores) if scores else 0
    median_score = stats_lib.median(scores) if scores else 0

    # Score distribution (buckets of 0.1)
    score_dist = []
    if scores:
        for i in range(11):
            lo = i / 10
            hi = (i + 1) / 10
            count = sum(1 for s in scores if lo <= s < hi) if i < 10 else sum(1 for s in scores if s >= 1.0)
            score_dist.append({"range": f"{lo:.1f}-{hi:.1f}", "count": count})

    # Breakdown by area
    area_stats = _breakdown_by_field(db, answers, "area", judge_model)
    course_stats = _breakdown_by_field(db, answers, "course", judge_model)

    # Token usage
    total_input_tokens = sum(a.input_tokens or 0 for a in answers)
    total_output_tokens = sum(a.output_tokens or 0 for a in answers)

    # Judge token usage
    judge_input_tokens = 0
    judge_output_tokens = 0
    if open_answer_ids:
        j_q = db.query(
            func.sum(ExperimentJudgment.input_tokens),
            func.sum(ExperimentJudgment.output_tokens),
        ).filter(ExperimentJudgment.answer_id.in_(open_answer_ids))
        if judge_model:
            j_q = j_q.filter(ExperimentJudgment.judge_model == judge_model)
        row = j_q.first()
        judge_input_tokens = row[0] or 0
        judge_output_tokens = row[1] or 0

    # Self-consistency (when N > 1)
    consistency = None
    if exp.n_answers and exp.n_answers > 1:
        consistency = _self_consistency(db, answers)

    return {
        "total_answers": len(answers),
        "mcq": {
            "total": mcq_total,
            "correct": mcq_correct,
            "accuracy": round(mcq_accuracy, 4),
        },
        "open": {
            "total": len(open_answers),
            "judged": len(scores),
            "avg_score": round(avg_score, 4),
            "median_score": round(median_score, 4),
            "score_distribution": score_dist,
        },
        "by_area": area_stats,
        "by_course": course_stats,
        "tokens": {
            "generation_input": total_input_tokens,
            "generation_output": total_output_tokens,
            "judge_input": judge_input_tokens,
            "judge_output": judge_output_tokens,
            "total": total_input_tokens + total_output_tokens + judge_input_tokens + judge_output_tokens,
        },
        "self_consistency": consistency,
    }


@router.get("/{experiment_id}/stats/compare-judges")
def compare_judges(experiment_id: int, db: Session = Depends(get_db)):
    """Return per-judge stats side by side."""
    exp = db.query(Experiment).get(experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")

    rows = (
        db.query(
            ExperimentJudgment.judge_model,
            func.count(ExperimentJudgment.id),
            func.avg(ExperimentJudgment.score),
        )
        .join(ExperimentAnswer)
        .filter(
            ExperimentAnswer.experiment_id == experiment_id,
            ExperimentJudgment.score.isnot(None),
        )
        .group_by(ExperimentJudgment.judge_model)
        .all()
    )

    result = []
    for judge_model, count, avg_score in rows:
        # Compute median by fetching all scores for this judge
        scores = [
            s[0] for s in db.query(ExperimentJudgment.score)
            .join(ExperimentAnswer)
            .filter(
                ExperimentAnswer.experiment_id == experiment_id,
                ExperimentJudgment.judge_model == judge_model,
                ExperimentJudgment.score.isnot(None),
            )
            .all()
        ]
        median = stats_lib.median(scores) if scores else 0
        result.append({
            "judge_model": judge_model,
            "judged": count,
            "avg_score": round(avg_score, 4) if avg_score is not None else 0,
            "median_score": round(median, 4),
        })

    return result


@router.get("/{experiment_id}/stats/by-question")
def get_stats_by_question(
    experiment_id: int,
    model_name: str | None = None,
    judge_model: str | None = None,
    db: Session = Depends(get_db),
):
    exp = db.query(Experiment).get(experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")

    ans_q = db.query(ExperimentAnswer).filter(ExperimentAnswer.experiment_id == experiment_id)
    if model_name:
        ans_q = ans_q.filter(ExperimentAnswer.model_name == model_name)
    answers = ans_q.all()

    questions = {}
    for a in answers:
        variant = db.query(Variant).get(a.variant_id)
        question = db.query(Question).get(variant.question_id) if variant else None
        qid = variant.question_id if variant else "unknown"
        if qid not in questions:
            questions[qid] = {
                "question_id": qid,
                "course": question.course if question else None,
                "area": question.area if question else None,
                "config": variant.config if variant else None,
                "mcq_correct": None,
                "scores": [],
                "answer_count": 0,
            }
        questions[qid]["answer_count"] += 1
        if a.mcq_correct is not None:
            questions[qid]["mcq_correct"] = a.mcq_correct
        # Get judgments
        j_q = db.query(ExperimentJudgment).filter(
            ExperimentJudgment.answer_id == a.id,
            ExperimentJudgment.score.isnot(None),
        )
        if judge_model:
            j_q = j_q.filter(ExperimentJudgment.judge_model == judge_model)
        for j in j_q.all():
            questions[qid]["scores"].append(j.score)

    result = []
    for q in questions.values():
        avg = stats_lib.mean(q["scores"]) if q["scores"] else None
        result.append({
            "question_id": q["question_id"],
            "course": q["course"],
            "area": q["area"],
            "config": q["config"],
            "mcq_correct": q["mcq_correct"],
            "avg_score": round(avg, 4) if avg is not None else None,
            "answer_count": q["answer_count"],
            "judgment_count": len(q["scores"]),
        })

    result.sort(key=lambda x: (x["avg_score"] or 0), reverse=True)
    return result


def _breakdown_by_field(db: Session, answers: list, field: str, judge_model: str | None):
    """Group answers by a question field and compute MCQ accuracy + open scores."""
    groups: dict = {}
    for a in answers:
        variant = db.query(Variant).get(a.variant_id)
        question = db.query(Question).get(variant.question_id) if variant else None
        key = getattr(question, field, "unknown") if question else "unknown"
        if key not in groups:
            groups[key] = {"mcq_correct": 0, "mcq_total": 0, "scores": []}
        if a.extracted_letter is not None:
            groups[key]["mcq_total"] += 1
            if a.mcq_correct:
                groups[key]["mcq_correct"] += 1
        else:
            j_q = db.query(ExperimentJudgment).filter(
                ExperimentJudgment.answer_id == a.id,
                ExperimentJudgment.score.isnot(None),
            )
            if judge_model:
                j_q = j_q.filter(ExperimentJudgment.judge_model == judge_model)
            for j in j_q.all():
                groups[key]["scores"].append(j.score)

    result = []
    for key, g in sorted(groups.items()):
        mcq_acc = (g["mcq_correct"] / g["mcq_total"]) if g["mcq_total"] > 0 else None
        avg_score = stats_lib.mean(g["scores"]) if g["scores"] else None
        result.append({
            "name": key,
            "mcq_accuracy": round(mcq_acc, 4) if mcq_acc is not None else None,
            "mcq_total": g["mcq_total"],
            "open_avg_score": round(avg_score, 4) if avg_score is not None else None,
            "open_total": len(g["scores"]),
        })
    return result


def _self_consistency(db: Session, answers: list) -> dict:
    """Analyze self-consistency across runs for MCQ answers."""
    variant_runs: dict = {}
    for a in answers:
        if a.extracted_letter is None:
            continue
        if a.variant_id not in variant_runs:
            variant_runs[a.variant_id] = []
        variant_runs[a.variant_id].append(a.extracted_letter)

    if not variant_runs:
        return {"total_variants": 0, "unanimous": 0, "majority_correct": 0}

    unanimous = 0
    for vid, letters in variant_runs.items():
        if len(set(letters)) == 1:
            unanimous += 1

    return {
        "total_variants": len(variant_runs),
        "unanimous": unanimous,
        "unanimous_rate": round(unanimous / len(variant_runs), 4) if variant_runs else 0,
    }
