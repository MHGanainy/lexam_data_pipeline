from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Experiment, ExperimentAnswer, Variant, Question
from app.services.generation import start_generation
from app.progress import progress_store

router = APIRouter()


@router.post("/{experiment_id}/generate")
def generate_answers(experiment_id: int, db: Session = Depends(get_db)):
    exp = db.query(Experiment).get(experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    if exp.status in ("generating", "judging"):
        raise HTTPException(status_code=409, detail=f"Experiment is currently {exp.status}")

    start_generation(experiment_id)
    return {"status": "started"}


@router.get("/{experiment_id}/progress")
def get_progress(experiment_id: int):
    return progress_store.get(f"generate:{experiment_id}")


@router.get("/{experiment_id}/answers")
def list_answers(
    experiment_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = (
        db.query(ExperimentAnswer)
        .filter(ExperimentAnswer.experiment_id == experiment_id)
        .order_by(ExperimentAnswer.id)
    )
    total = q.count()
    rows = q.offset(offset).limit(limit).all()

    items = []
    for ans in rows:
        variant = db.query(Variant).get(ans.variant_id)
        question = db.query(Question).get(variant.question_id) if variant else None
        items.append({
            "id": ans.id,
            "variant_id": ans.variant_id,
            "question_id": variant.question_id if variant else None,
            "config": variant.config if variant else None,
            "course": question.course if question else None,
            "area": question.area if question else None,
            "question_text": question.question if question else None,
            "gold_answer": variant.answer if variant else None,
            "gold_index": variant.gold if variant else None,
            "choices": variant.choices if variant else None,
            "run_index": ans.run_index,
            "model_name": ans.model_name,
            "answer_text": ans.answer_text,
            "extracted_letter": ans.extracted_letter,
            "mcq_correct": ans.mcq_correct,
            "input_tokens": ans.input_tokens,
            "output_tokens": ans.output_tokens,
            "created_at": ans.created_at.isoformat() if ans.created_at else None,
        })

    return {"total": total, "offset": offset, "limit": limit, "items": items}


@router.delete("/{experiment_id}/answers")
def delete_answers(experiment_id: int, db: Session = Depends(get_db)):
    exp = db.query(Experiment).get(experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    db.query(ExperimentAnswer).filter(
        ExperimentAnswer.experiment_id == experiment_id
    ).delete()
    exp.status = "created"
    db.commit()
    progress_store.remove(f"generate:{experiment_id}")
    return {"ok": True}
