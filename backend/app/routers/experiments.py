from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from app.database import get_db
from app.models import Experiment, ExperimentAnswer, ExperimentJudgment
from app.services.generation import count_filtered_variants

router = APIRouter()


class ExperimentCreate(BaseModel):
    name: str
    description: str | None = None
    filter_config: dict | None = None
    open_question_prompt: str | None = None
    mcq_prompt: str | None = None
    judge_system_prompt: str | None = None
    judge_prompt: str | None = None
    model_name: str = "Qwen/Qwen3-14B"
    temperature: float = 0.7
    max_tokens: int = 2048
    judge_temperature: float = 0.3
    judge_max_tokens: int = 4096
    n_answers: int = 1


class ExperimentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    filter_config: dict | None = None
    open_question_prompt: str | None = None
    mcq_prompt: str | None = None
    judge_system_prompt: str | None = None
    judge_prompt: str | None = None
    model_name: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    judge_temperature: float | None = None
    judge_max_tokens: int | None = None
    n_answers: int | None = None


@router.post("")
def create_experiment(body: ExperimentCreate, db: Session = Depends(get_db)):
    exp = Experiment(
        name=body.name,
        description=body.description,
        filter_config=body.filter_config,
        model_name=body.model_name,
        temperature=body.temperature,
        max_tokens=body.max_tokens,
        judge_temperature=body.judge_temperature,
        judge_max_tokens=body.judge_max_tokens,
        n_answers=body.n_answers,
    )
    if body.open_question_prompt is not None:
        exp.open_question_prompt = body.open_question_prompt
    if body.mcq_prompt is not None:
        exp.mcq_prompt = body.mcq_prompt
    if body.judge_system_prompt is not None:
        exp.judge_system_prompt = body.judge_system_prompt
    if body.judge_prompt is not None:
        exp.judge_prompt = body.judge_prompt
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return _serialize(exp)


@router.get("")
def list_experiments(db: Session = Depends(get_db)):
    experiments = db.query(Experiment).order_by(Experiment.created_at.desc()).all()
    result = []
    for exp in experiments:
        answer_count = db.query(func.count(ExperimentAnswer.id)).filter(
            ExperimentAnswer.experiment_id == exp.id
        ).scalar()
        judgment_count = db.query(func.count(ExperimentJudgment.id)).join(
            ExperimentAnswer
        ).filter(
            ExperimentAnswer.experiment_id == exp.id
        ).scalar()
        d = _serialize(exp)
        d["answer_count"] = answer_count
        d["judgment_count"] = judgment_count
        d["judges"] = _judge_breakdown(db, exp.id)
        result.append(d)
    return result


@router.get("/{experiment_id}")
def get_experiment(experiment_id: int, db: Session = Depends(get_db)):
    exp = db.query(Experiment).get(experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    answer_count = db.query(func.count(ExperimentAnswer.id)).filter(
        ExperimentAnswer.experiment_id == exp.id
    ).scalar()
    judgment_count = db.query(func.count(ExperimentJudgment.id)).join(
        ExperimentAnswer
    ).filter(
        ExperimentAnswer.experiment_id == exp.id
    ).scalar()
    d = _serialize(exp)
    d["answer_count"] = answer_count
    d["judgment_count"] = judgment_count
    d["judges"] = _judge_breakdown(db, exp.id)
    return d


@router.put("/{experiment_id}")
def update_experiment(experiment_id: int, body: ExperimentUpdate, db: Session = Depends(get_db)):
    exp = db.query(Experiment).get(experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    for field in ["name", "description", "filter_config", "open_question_prompt",
                   "mcq_prompt", "judge_system_prompt", "judge_prompt",
                   "model_name", "temperature", "max_tokens",
                   "judge_temperature", "judge_max_tokens", "n_answers"]:
        val = getattr(body, field, None)
        if val is not None:
            setattr(exp, field, val)
    db.commit()
    db.refresh(exp)
    return _serialize(exp)


@router.delete("/{experiment_id}")
def delete_experiment(experiment_id: int, db: Session = Depends(get_db)):
    exp = db.query(Experiment).get(experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    db.delete(exp)
    db.commit()
    return {"ok": True}


@router.post("/{experiment_id}/reset-status")
def reset_status(experiment_id: int, db: Session = Depends(get_db)):
    """Reset a stuck experiment status back to the appropriate state."""
    exp = db.query(Experiment).get(experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    answer_count = db.query(func.count(ExperimentAnswer.id)).filter(
        ExperimentAnswer.experiment_id == exp.id
    ).scalar()
    judgment_count = db.query(func.count(ExperimentJudgment.id)).join(
        ExperimentAnswer
    ).filter(
        ExperimentAnswer.experiment_id == exp.id
    ).scalar()
    if judgment_count > 0:
        exp.status = "completed"
    elif answer_count > 0:
        exp.status = "generated"
    else:
        exp.status = "created"
    db.commit()
    db.refresh(exp)
    return _serialize(exp)


@router.get("/{experiment_id}/question-count")
def question_count(experiment_id: int, db: Session = Depends(get_db)):
    exp = db.query(Experiment).get(experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    count = count_filtered_variants(db, exp.filter_config)
    return {"count": count}


@router.post("/{experiment_id}/question-count")
def question_count_preview(body: dict, db: Session = Depends(get_db)):
    """Preview variant count for a filter config without saving."""
    return {"count": count_filtered_variants(db, body.get("filter_config", {}))}


def _judge_breakdown(db: Session, experiment_id: int) -> list:
    """Return judge model names and counts for an experiment."""
    rows = (
        db.query(ExperimentJudgment.judge_model, func.count(ExperimentJudgment.id))
        .join(ExperimentAnswer)
        .filter(ExperimentAnswer.experiment_id == experiment_id)
        .group_by(ExperimentJudgment.judge_model)
        .all()
    )
    return [{"model": row[0], "count": row[1]} for row in rows]


def _serialize(exp: Experiment) -> dict:
    return {
        "id": exp.id,
        "name": exp.name,
        "description": exp.description,
        "filter_config": exp.filter_config,
        "open_question_prompt": exp.open_question_prompt,
        "mcq_prompt": exp.mcq_prompt,
        "judge_system_prompt": exp.judge_system_prompt,
        "judge_prompt": exp.judge_prompt,
        "model_name": exp.model_name,
        "temperature": exp.temperature,
        "max_tokens": exp.max_tokens,
        "judge_temperature": exp.judge_temperature,
        "judge_max_tokens": exp.judge_max_tokens,
        "n_answers": exp.n_answers,
        "status": exp.status,
        "created_at": exp.created_at.isoformat() if exp.created_at else None,
        "updated_at": exp.updated_at.isoformat() if exp.updated_at else None,
    }
