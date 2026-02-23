from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Experiment, ExperimentAnswer, ExperimentJudgment, Variant, Question
from app.services.judging import start_judging
from app.progress import progress_store

router = APIRouter()


class JudgeRequest(BaseModel):
    judge_model: str = "Qwen/Qwen3-32B"


@router.post("/{experiment_id}/judge")
def judge_answers(experiment_id: int, body: JudgeRequest, db: Session = Depends(get_db)):
    exp = db.query(Experiment).get(experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    if exp.status in ("generating", "judging"):
        raise HTTPException(status_code=409, detail=f"Experiment is currently {exp.status}")

    start_judging(experiment_id, body.judge_model)
    return {"status": "started"}


@router.get("/{experiment_id}/judge-progress")
def get_judge_progress(experiment_id: int, judge_model: str = "Qwen/Qwen3-32B"):
    return progress_store.get(f"judge:{experiment_id}:{judge_model}")


@router.get("/{experiment_id}/judgments")
def list_judgments(
    experiment_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    judge_model: str | None = Query(None),
    db: Session = Depends(get_db),
):
    q = (
        db.query(ExperimentJudgment)
        .join(ExperimentAnswer)
        .filter(ExperimentAnswer.experiment_id == experiment_id)
        .order_by(ExperimentJudgment.id)
    )
    if judge_model:
        q = q.filter(ExperimentJudgment.judge_model == judge_model)
    total = q.count()
    rows = q.offset(offset).limit(limit).all()

    items = []
    for j in rows:
        answer = db.query(ExperimentAnswer).get(j.answer_id)
        variant = db.query(Variant).get(answer.variant_id) if answer else None
        question = db.query(Question).get(variant.question_id) if variant else None
        items.append({
            "id": j.id,
            "answer_id": j.answer_id,
            "question_id": variant.question_id if variant else None,
            "config": variant.config if variant else None,
            "course": question.course if question else None,
            "area": question.area if question else None,
            "question_text": question.question if question else None,
            "gold_answer": variant.answer if variant else None,
            "model_answer": answer.answer_text if answer and answer.answer_text else None,
            "judge_model": j.judge_model,
            "judgment_text": j.judgment_text,
            "score": j.score,
            "input_tokens": j.input_tokens,
            "output_tokens": j.output_tokens,
            "created_at": j.created_at.isoformat() if j.created_at else None,
        })

    return {"total": total, "offset": offset, "limit": limit, "items": items}


@router.delete("/{experiment_id}/judgments")
def delete_judgments(
    experiment_id: int,
    judge_model: str | None = Query(None),
    db: Session = Depends(get_db),
):
    exp = db.query(Experiment).get(experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    answer_ids = [a.id for a in db.query(ExperimentAnswer.id).filter(
        ExperimentAnswer.experiment_id == experiment_id
    ).all()]
    if answer_ids:
        del_q = db.query(ExperimentJudgment).filter(
            ExperimentJudgment.answer_id.in_(answer_ids)
        )
        if judge_model:
            del_q = del_q.filter(ExperimentJudgment.judge_model == judge_model)
        del_q.delete(synchronize_session=False)
    # Only reset status if zero judgments remain
    remaining = 0
    if answer_ids:
        remaining = db.query(func.count(ExperimentJudgment.id)).filter(
            ExperimentJudgment.answer_id.in_(answer_ids)
        ).scalar()
    if remaining == 0 and exp.status == "completed":
        exp.status = "generated"
    db.commit()
    return {"ok": True}


@router.get("/{experiment_id}/judge-summary")
def judge_summary(experiment_id: int, db: Session = Depends(get_db)):
    """Return judgment counts and avg scores grouped by judge model."""
    rows = (
        db.query(
            ExperimentJudgment.judge_model,
            func.count(ExperimentJudgment.id),
            func.avg(ExperimentJudgment.score),
        )
        .join(ExperimentAnswer)
        .filter(ExperimentAnswer.experiment_id == experiment_id)
        .group_by(ExperimentJudgment.judge_model)
        .all()
    )
    return [
        {
            "judge_model": row[0],
            "count": row[1],
            "avg_score": round(row[2], 4) if row[2] is not None else None,
        }
        for row in rows
    ]
