"""Seed the database with LEXam data from HuggingFace."""
import ast
from datasets import load_dataset
from app.database import engine, SessionLocal, Base
from app.models import Question, Variant


CONFIGS = [
    "mcq_4_choices",
    "mcq_8_choices",
    "mcq_16_choices",
    "mcq_32_choices",
    "open_question",
]

INTERNATIONAL_COURSES = {
    # Private (15)
    "US Business Law",
    "Chinesisches Wirtschaftsrecht",
    "Internationales Privatrecht",
    "International Commercial Arbitration",
    "Chinese Business Law",
    "Comparative Private Law",
    "International Sales Law",
    "History of Business Law",
    "Foundations and Trusts",
    "Privatrechtsgeschichte",
    "Antike Rechtsgeschichte",
    "Europäisches Privatrecht",
    "Internationales Zivilverfahrensrecht",
    "Introduction to Sports Law",
    "Principles of Corporate Law",
    "Comparative Corporate Law",
    # Public (14)
    "Migrationsrecht",
    "Kirchenrechtsgeschichte und Kirchenrecht",
    "Sicherheits-, Polizei-, und Menschenrechte",
    "Recht der Gewaltanwendung und Humanitäres Völkerrecht",
    "Rechtsphilosophie",
    "International Organisations",
    "Recht und Religion",
    "European Economic Law",
    "International Finance Law",
    "Transnational Public Security Law",
    "International Financial Law",
    "International Human Rights",
    "International Economic Law",
    "Verfassungsgeschichte der Neuzeit",
    "Internationales Steuerrecht",
    "Comparative Constitutional Law",
    # Criminal (3)
    "International Criminal Law",
    "Internationales und Europäisches Strafrecht",
    "Internationale Rechtshilfe in Strafsachen",
    # Interdisciplinary (4)
    "Wirtschaftsrechtsgeschichte",
    "Rechtsgeschichte",
    "Legal Theory",
    "Legal Sociology",
}


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    total_variants = 0
    for config_name in CONFIGS:
        existing = db.query(Variant).filter(Variant.config == config_name).count()
        if existing > 0:
            print(f"{config_name}: already has {existing} variants, skipping.")
            total_variants += existing
            continue

        print(f"Loading {config_name}...")
        try:
            ds = load_dataset("LEXam-Benchmark/LEXam", config_name)
        except Exception as e:
            print(f"  ERROR loading {config_name}: {e}")
            continue

        variant_count = 0
        for split_name, split_data in ds.items():
            for row in split_data:
                qid = row["id"]

                # Upsert question (first config to see this ID creates it)
                q = db.get(Question, qid)
                if q is None:
                    raw_year = row["year"]
                    if isinstance(raw_year, str):
                        year = int(raw_year[:4])
                    else:
                        year = int(raw_year)

                    q = Question(
                        id=qid,
                        question=row["question"],
                        course=row["course"],
                        language=row["language"],
                        area=row["area"],
                        jurisdiction=row["jurisdiction"],
                        year=year,
                        n_statements=row.get("n_statements"),
                        none_as_an_option=row.get("none_as_an_option"),
                        negative_question=row.get("negative_question"),
                        international=row["course"] in INTERNATIONAL_COURSES,
                    )
                    db.add(q)

                # Parse choices
                choices = None
                if "choices" in row and row["choices"] is not None:
                    raw = row["choices"]
                    if isinstance(raw, list):
                        choices = raw
                    elif isinstance(raw, str):
                        choices = ast.literal_eval(raw)

                v = Variant(
                    question_id=qid,
                    config=config_name,
                    split=row.get("split", split_name),
                    choices=choices,
                    gold=row.get("gold"),
                    answer=row.get("answer"),
                )
                db.add(v)
                variant_count += 1

            db.commit()
            print(f"  {split_name}: {len(split_data)} rows")

        total_variants += variant_count
        print(f"  {config_name} done: {variant_count} variants")

    q_count = db.query(Question).count()
    db.close()
    print(f"Total: {q_count} questions, {total_variants} variants")


def backfill_international():
    """Add the international column if missing and populate it from course names."""
    from sqlalchemy import inspect, text

    db = SessionLocal()
    inspector = inspect(engine)
    columns = [c["name"] for c in inspector.get_columns("questions")]

    if "international" not in columns:
        db.execute(text("ALTER TABLE questions ADD COLUMN international BOOLEAN"))
        db.execute(text("CREATE INDEX ix_questions_international ON questions (international)"))
        db.commit()
        print("Added 'international' column to questions table.")

    # Backfill any NULL rows
    nulls = db.query(Question).filter(Question.international.is_(None)).count()
    if nulls > 0:
        for q in db.query(Question).filter(Question.international.is_(None)):
            q.international = q.course in INTERNATIONAL_COURSES
        db.commit()
        print(f"Backfilled international flag for {nulls} questions.")
    db.close()


if __name__ == "__main__":
    seed()
