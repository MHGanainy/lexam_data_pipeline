from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, select

from app.database import Base, engine, get_db
from app.models import Question, Variant
from app.seed import seed, backfill_international


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed()
    backfill_international()
    yield


app = FastAPI(title="LEXam Data Pipeline", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Column lookup maps for clean dispatch
_QUESTION_COLUMNS = {
    "area": Question.area,
    "language": Question.language,
    "course": Question.course,
    "jurisdiction": Question.jurisdiction,
    "year": Question.year,
    "international": Question.international,
}
_VARIANT_COLUMNS = {
    "config": Variant.config,
    "split": Variant.split,
}


def _apply_filters(query, filters: dict, skip_field: str | None = None,
                    variant_joined: bool = False):
    """Apply filter conditions to a query, optionally skipping one field."""
    if not variant_joined:
        needs_variant_join = False
        for field in ("config", "split"):
            if field != skip_field and filters.get(field):
                needs_variant_join = True
        if needs_variant_join:
            query = query.join(Variant)

    for field, col in _VARIANT_COLUMNS.items():
        if field != skip_field and filters.get(field):
            val = filters[field]
            query = query.filter(col.in_(val) if isinstance(val, list) else col == val)

    for field, col in _QUESTION_COLUMNS.items():
        if field != skip_field and filters.get(field):
            val = filters[field]
            query = query.filter(col.in_(val) if isinstance(val, list) else col == val)

    if "negative_question" != skip_field and filters.get("negative_question") is not None:
        query = query.filter(Question.negative_question == filters["negative_question"])

    if "international" != skip_field and filters.get("international") is not None:
        query = query.filter(Question.international == filters["international"])

    return query


def _viable_values(db: Session, target_field: str, active_filters: dict):
    """Return distinct values for target_field, filtered by all OTHER active selections."""
    if target_field in _VARIANT_COLUMNS:
        col = _VARIANT_COLUMNS[target_field]
        q = db.query(col).join(Question)
        q = _apply_filters(q, active_filters, skip_field=target_field,
                           variant_joined=True)
    else:
        col = _QUESTION_COLUMNS[target_field]
        q = db.query(col)
        q = _apply_filters(q, active_filters, skip_field=target_field)

    return sorted([r[0] for r in q.distinct().all()], key=lambda v: (isinstance(v, str), v))


_SORTABLE_COLUMNS = {
    "id": Question.id,
    "config": (
        select(func.min(Variant.config))
        .where(Variant.question_id == Question.id)
        .correlate(Question)
        .scalar_subquery()
    ),
    "split": (
        select(func.min(Variant.split))
        .where(Variant.question_id == Question.id)
        .correlate(Question)
        .scalar_subquery()
    ),
    "area": Question.area,
    "course": Question.course,
    "language": Question.language,
    "year": Question.year,
    "negative_question": Question.negative_question,
    "international": Question.international,
    "question": Question.question,
}


@app.get("/api/questions")
def list_questions(
    config: list[str] | None = Query(None),
    split: list[str] | None = Query(None),
    area: list[str] | None = Query(None),
    language: list[str] | None = Query(None),
    course: list[str] | None = Query(None),
    jurisdiction: list[str] | None = Query(None),
    year: list[int] | None = Query(None),
    negative_question: bool | None = None,
    international: bool | None = None,
    sort_by: str | None = None,
    sort_dir: str = "asc",
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    filters = {
        "config": config,
        "split": split,
        "area": area,
        "language": language,
        "course": course,
        "jurisdiction": jurisdiction,
        "year": year,
        "negative_question": negative_question,
        "international": international,
    }

    q = db.query(Question).options(joinedload(Question.variants))
    q = _apply_filters(q, filters)

    total = q.count()

    if sort_by and sort_by in _SORTABLE_COLUMNS:
        col = _SORTABLE_COLUMNS[sort_by]
        order = col.desc() if sort_dir == "desc" else col.asc()
        rows = q.order_by(order, Question.id).offset(offset).limit(limit).all()
    else:
        rows = q.order_by(Question.year.desc(), Question.id).offset(offset).limit(limit).all()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [_serialize(r) for r in rows],
    }


@app.get("/api/questions/{question_id}")
def get_question(question_id: str, db: Session = Depends(get_db)):
    row = (
        db.query(Question)
        .options(joinedload(Question.variants))
        .filter(Question.id == question_id)
        .first()
    )
    if not row:
        return {"error": "not found"}, 404
    return _serialize(row)


@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    total_questions = db.query(Question).count()
    total_variants = db.query(Variant).count()
    by_config = dict(
        db.query(Variant.config, func.count()).group_by(Variant.config).all()
    )
    by_area = dict(
        db.query(Question.area, func.count()).group_by(Question.area).all()
    )
    by_language = dict(
        db.query(Question.language, func.count()).group_by(Question.language).all()
    )
    by_year = dict(
        db.query(Question.year, func.count())
        .group_by(Question.year)
        .order_by(Question.year)
        .all()
    )
    return {
        "total_questions": total_questions,
        "total_variants": total_variants,
        "by_config": by_config,
        "by_area": by_area,
        "by_language": by_language,
        "by_year": by_year,
    }


@app.get("/api/course-summary")
def get_course_summary(db: Session = Depends(get_db)):
    """Per-course breakdown: area, jurisdiction, international, mcq_4, mcq_all, open_qa, language."""
    rows = (
        db.query(
            Question.course, Question.area, Question.jurisdiction,
            Question.international, Question.language, Question.id,
            Variant.config, Variant.split,
        )
        .join(Variant)
        .all()
    )

    courses: dict = {}
    for course, area, juris, intl, lang, qid, config, split in rows:
        if course not in courses:
            courses[course] = {
                "course": course, "area": area,
                "jurisdictions": set(), "international": intl,
                "languages": set(),
                "mcq4": set(), "mcq_all": set(),
                "open": set(), "open_dev": set(), "open_test": set(),
            }
        courses[course]["jurisdictions"].add(juris)
        courses[course]["languages"].add(lang)
        if config == "mcq_4_choices":
            courses[course]["mcq4"].add(qid)
        if config in ("mcq_4_choices", "mcq_8_choices", "mcq_16_choices", "mcq_32_choices"):
            courses[course]["mcq_all"].add(qid)
        if config == "open_question":
            courses[course]["open"].add(qid)
            if split == "dev":
                courses[course]["open_dev"].add(qid)
            elif split == "test":
                courses[course]["open_test"].add(qid)

    result = []
    for c in courses.values():
        langs = c["languages"]
        lang_label = "both" if len(langs) > 1 else next(iter(langs))
        total = len(c["mcq4"] | c["mcq_all"] | c["open"])
        result.append({
            "course": c["course"],
            "area": c["area"],
            "jurisdiction": ", ".join(sorted(c["jurisdictions"])),
            "international": bool(c["international"]),
            "mcq_4": len(c["mcq4"]),
            "mcq_all": len(c["mcq_all"]),
            "open_qa": len(c["open"]),
            "open_dev": len(c["open_dev"]),
            "open_test": len(c["open_test"]),
            "total": total,
            "language": lang_label,
        })

    result.sort(key=lambda x: (x["area"], -x["total"]))
    return result


@app.get("/api/dashboard")
def get_dashboard(
    config: list[str] | None = Query(None),
    language: list[str] | None = Query(None),
    db: Session = Depends(get_db),
):
    import statistics

    # Optional config filter — restrict to questions that have a variant with matching config
    if config:
        q_ids = select(Variant.question_id).where(Variant.config.in_(config)).distinct()

    def fq(q):
        if config:
            q = q.filter(Question.id.in_(q_ids))
        if language:
            q = q.filter(Question.language.in_(language))
        return q

    def fv(q):
        if config:
            q = q.filter(Variant.config.in_(config))
        if language:
            lang_ids = select(Question.id).where(Question.language.in_(language))
            q = q.filter(Variant.question_id.in_(lang_ids))
        return q

    total_questions = fq(db.query(Question)).count()

    # ── Courses with area + language breakdown ──
    course_lang = fq(db.query(
        Question.course, Question.area, Question.language, func.count()
    )).group_by(Question.course, Question.area, Question.language).all()

    courses_map: dict = {}
    for course, area, lang, cnt in course_lang:
        if course not in courses_map:
            courses_map[course] = {"course": course, "area": area, "count": 0, "lang_de": 0, "lang_en": 0}
        courses_map[course]["count"] += cnt
        if lang == "de":
            courses_map[course]["lang_de"] += cnt
        else:
            courses_map[course]["lang_en"] += cnt
    courses_list = sorted(courses_map.values(), key=lambda x: -x["count"])

    total_de = sum(c["lang_de"] for c in courses_list)
    total_en = sum(c["lang_en"] for c in courses_list)

    # ── Area distribution ──
    areas = [{"name": n, "value": v} for n, v in
             fq(db.query(Question.area, func.count())).group_by(Question.area).all()]

    # ── Jurisdiction distribution ──
    jurisdictions = [{"name": n, "value": v} for n, v in
                     fq(db.query(Question.jurisdiction, func.count())).group_by(Question.jurisdiction).all()]

    # ── Year × area ──
    year_area_raw = fq(db.query(
        Question.year, Question.area, func.count()
    )).group_by(Question.year, Question.area).order_by(Question.year).all()

    years_map: dict = {}
    for yr, area, cnt in year_area_raw:
        if yr not in years_map:
            years_map[yr] = {"year": yr, "Private": 0, "Public": 0, "Criminal": 0, "Interdisciplinary": 0, "total": 0}
        years_map[yr][area] = cnt
        years_map[yr]["total"] += cnt
    years_list = sorted(years_map.values(), key=lambda x: x["year"])

    # ── Split (distinct questions per split) ──
    total_split = fv(db.query(func.count(Variant.question_id.distinct()))).scalar()
    splits = []
    for name, cnt in fv(db.query(Variant.split, func.count(Variant.question_id.distinct()))).group_by(Variant.split).all():
        splits.append({"name": name, "value": cnt, "pct": f"{round(cnt / total_split * 100)}%" if total_split else "0%"})

    # ── Area × jurisdiction cross-tab ──
    aj_raw = fq(db.query(
        Question.area, Question.jurisdiction, func.count()
    )).group_by(Question.area, Question.jurisdiction).all()
    aj_map: dict = {}
    for area, juris, cnt in aj_raw:
        if area not in aj_map:
            aj_map[area] = {"area": area, "Swiss": 0, "International": 0, "Generic": 0}
        aj_map[area][juris] = cnt
    aj_list = [aj_map.get(a, {"area": a}) for a in ["Private", "Public", "Criminal", "Interdisciplinary"] if a in aj_map]

    # ── Language × area ──
    la_raw = fq(db.query(
        Question.area, Question.language, func.count()
    )).group_by(Question.area, Question.language).all()
    la_map: dict = {}
    for area, lang, cnt in la_raw:
        if area not in la_map:
            la_map[area] = {"area": area, "de": 0, "en": 0}
        la_map[area][lang] = cnt
    la_list = [la_map.get(a, {"area": a}) for a in ["Private", "Public", "Criminal", "Interdisciplinary"] if a in la_map]

    # ── Answer length analysis (open_question only) ──
    ans_q = db.query(Question.area, Variant.answer).join(Variant).filter(
        Variant.config == "open_question", Variant.answer.isnot(None)
    )
    if config:
        ans_q = ans_q.filter(Question.id.in_(q_ids))
    if language:
        ans_q = ans_q.filter(Question.language.in_(language))
    answers_raw = ans_q.all()

    wc_by_area: dict = {}
    all_wcs: list = []
    for area, answer in answers_raw:
        wc = len(answer.split()) if answer else 0
        all_wcs.append(wc)
        wc_by_area.setdefault(area, []).append(wc)

    bins = [(0, 50, "< 50 words"), (50, 100, "50\u2013100"), (100, 200, "100\u2013200"),
            (200, 400, "200\u2013400"), (400, 600, "400\u2013600"), (600, float("inf"), "600+")]
    answer_lengths = [{"range": label, "count": sum(1 for w in all_wcs if lo <= w < hi)}
                      for lo, hi, label in bins]

    answer_stats = []
    for area in ["Private", "Public", "Criminal", "Interdisciplinary"]:
        wcs = wc_by_area.get(area, [])
        if wcs:
            answer_stats.append({
                "area": area,
                "avgWords": round(statistics.mean(wcs)),
                "medianWords": round(statistics.median(wcs)),
                "minWords": min(wcs),
                "maxWords": max(wcs),
            })

    return {
        "total_questions": total_questions,
        "total_courses": len(courses_list),
        "total_de": total_de,
        "total_en": total_en,
        "min_year": years_list[0]["year"] if years_list else 0,
        "max_year": years_list[-1]["year"] if years_list else 0,
        "courses": courses_list,
        "areas": areas,
        "jurisdictions": jurisdictions,
        "years": years_list,
        "splits": splits,
        "area_jurisdiction": aj_list,
        "lang_area": la_list,
        "answer_lengths": answer_lengths,
        "answer_stats": answer_stats,
    }


@app.get("/api/filters")
def get_filters(
    config: list[str] | None = Query(None),
    split: list[str] | None = Query(None),
    area: list[str] | None = Query(None),
    language: list[str] | None = Query(None),
    course: list[str] | None = Query(None),
    jurisdiction: list[str] | None = Query(None),
    year: list[int] | None = Query(None),
    negative_question: bool | None = None,
    international: bool | None = None,
    db: Session = Depends(get_db),
):
    active = {
        "config": config,
        "split": split,
        "area": area,
        "language": language,
        "course": course,
        "jurisdiction": jurisdiction,
        "year": year,
        "negative_question": negative_question,
        "international": international,
    }
    return {
        "configs": _viable_values(db, "config", active),
        "splits": _viable_values(db, "split", active),
        "areas": _viable_values(db, "area", active),
        "languages": _viable_values(db, "language", active),
        "courses": _viable_values(db, "course", active),
        "jurisdictions": _viable_values(db, "jurisdiction", active),
        "years": sorted(_viable_values(db, "year", active), reverse=True),
    }


def _serialize(row: Question) -> dict:
    return {
        "id": row.id,
        "question": row.question,
        "course": row.course,
        "language": row.language,
        "area": row.area,
        "jurisdiction": row.jurisdiction,
        "year": row.year,
        "n_statements": row.n_statements,
        "none_as_an_option": row.none_as_an_option,
        "negative_question": row.negative_question,
        "international": row.international,
        "variants": [
            {
                "config": v.config,
                "split": v.split,
                "choices": v.choices,
                "gold": v.gold,
                "answer": v.answer,
            }
            for v in row.variants
        ],
    }
