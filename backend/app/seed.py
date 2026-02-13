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


if __name__ == "__main__":
    seed()
