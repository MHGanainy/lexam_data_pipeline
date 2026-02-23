from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, Boolean, Text, JSON, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.database import Base


class Question(Base):
    __tablename__ = "questions"

    id = Column(String(50), primary_key=True)
    question = Column(Text, nullable=False)
    course = Column(String(255), nullable=False, index=True)
    language = Column(String(5), nullable=False, index=True)
    area = Column(String(50), nullable=False, index=True)
    jurisdiction = Column(String(50), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    n_statements = Column(Integer, nullable=True)
    none_as_an_option = Column(Boolean, nullable=True)
    negative_question = Column(Boolean, nullable=True)
    international = Column(Boolean, nullable=True, index=True)

    variants = relationship("Variant", back_populates="question", cascade="all, delete-orphan")


class Variant(Base):
    __tablename__ = "variants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    question_id = Column(String(50), ForeignKey("questions.id"), nullable=False, index=True)
    config = Column(String(20), nullable=False, index=True)
    split = Column(String(10), nullable=False)
    choices = Column(JSON, nullable=True)
    gold = Column(Integer, nullable=True)
    answer = Column(Text, nullable=True)

    question = relationship("Question", back_populates="variants")
    experiment_answers = relationship("ExperimentAnswer", back_populates="variant", cascade="all, delete-orphan")


class Experiment(Base):
    __tablename__ = "experiments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    filter_config = Column(JSON, nullable=True)
    open_question_prompt = Column(Text, default=(
        'You are an expert in {course_name} and address legal issues in a structured, exam-style manner.\n'
        'Assume Swiss law applies unless specifically mentioned; if the course context justifies, address legal issues beyond Swiss law as well.\n'
        'Use precise legal language and formal "Sie" when answering.\n'
        'Do NOT state any disclaimer or refer to the need for external legal advice.\n'
        'Do NOT request the user to consult laws or to research on their own.\n'
        'Offer focused legal analyses and individualized advice.\n'
        'Speak directly and authoritatively without mentioning that your response is merely for general information.\n'
        'Incorporate Swiss-specific legal terminology.\n'
        'If you have discovered relevant legal considerations (Erw\u00e4gungen), respond with a concise, clear legal analysis.\n'
        'Cite only from your identified considerations.\n'
        'Always cite the specific legal provision, explicitly indicating paragraphs (Abs.), numbers (Ziff.), or letters (lit.) where available (e.g., "\'Art. 74 Abs. 2 Ziff. 2 OR", "Art. 336 lit. a StGB"). Avoid general references (such as \'Art. 3 ZGB\') without mentioning the specific paragraph, number, or letter, if applicable.\n'
        'If no relevant considerations are found, explicitly state that no pertinent information is available.\n'
        'If you do have reliable sources, share practical guidance or insights from them.\n'
        'Respond in the same language as the question.\n'
        'If the question specifically requests a short answer, provide a concise response.\n'
        'If the prompt asks you to analyze a specific case provided in the exam, but the text or details of that case have not been provided in the prompt, explicitly flag that the required case material is missing.\n'
        '\nQuestion:\n{question}\n\nAnswer:'
    ))
    mcq_prompt = Column(Text, default=(
        'You are an expert in {course_name} and address legal issues in a structured, exam-style manner.\n'
        'You are given a multiple-choice question, where only one choice (e.g., 1, 2, 3, etc.) is correct.\n'
        'Assume Swiss law applies unless specifically stated otherwise. If the context of the course justifies it, consider legal frameworks beyond Swiss law as well.\n'
        '\nPlease reason through the question step by step, using a chain-of-thought approach:\n'
        '- Clarify the facts: Briefly restate or highlight the key facts in the question to anchor your reasoning.\n'
        '- Issue Identification: What legal issue(s) arise from the facts?\n'
        '- Rule Explanation: What legal rules or principles are relevant, and what are their sources (e.g., statutes, case law, doctrine)?\n'
        '- Application and Reasoning: Apply the relevant rules to the facts, carefully weighing any ambiguities, exceptions, or competing interpretations.\n'
        '- Eliminate Incorrect Answers: Briefly explain why each incorrect answer is wrong or less convincing.\n'
        '- Conclusion: Clearly state the correct answer choice (e.g., 1, 2, 3, etc.) with a brief justification for why it best fits the legal analysis.\n'
        '\nFormat your final answer as follows:\n Correct Answer: ###3### \n'
        '\nQuestion:\n {question}\n\nAnswer:'
    ))
    judge_system_prompt = Column(Text, default=(
        'Act as a Judge specializing in the evaluation of Swiss law schools exams. '
        'Your task is to assess how well the response aligns with the reference answer, '
        'with a focus on accuracy, completeness, and legal reasoning.'
    ))
    judge_prompt = Column(Text, default=(
        'Goal:\n'
        'Your task is to assess how well the response aligns with the reference answer, '
        'with a focus on accuracy, completeness, and legal reasoning.\n\n'
        'Context:\n'
        "You will be provided with a response (labeled: Model's Answer) to a law school exam question "
        '(labeled: Question) and a reference answer (labeled: Reference Answer). \n\n'
        'Return format:\n'
        '    After reviewing the response:\n'
        '    1. Explanation: Briefly explain your reasoning regarding how the response conforms to or '
        'deviates from the reference answer. \n'
        '    2. Constructive feedback: Additionally, provide neutral, constructive feedback and '
        'corrections in the style of a university professor.\n'
        '    3. Correctness score: Assign a final correctness score on a scale from 0.0 to 1.0 '
        '(in increments of 0.1). This score should reflect the extent to which the response satisfies '
        'the reference answer, where \n'
        '        - 1.0 = complete fulfillment (100%) \n'
        '        - lower scores reflect proportionate shortfalls (e.g. 0.5 = 50% fulfillment). \n'
        '        - strictly follow the format: "[[score]]", e.g., "The correctness score: [[0.5]]". \n\n'
        'Warnings:\n'
        '    - In some cases, the reference answer may include only keywords or factual elements to be '
        'examined, along with (+), (-) or (+/-). Respect these indications when determining correctness:\n'
        '        - (+) means the element must be affirmed.\n'
        '        - (\u2013) means the element must be denied.\n'
        '        - (-/+) indicates that arguments in either direction are acceptable if legally sound.\n'
        '    - Deviations or additional elements not found in the reference answer should generally be '
        'penalized unless you are certain they are legally correct and relevant. Assume the reference '
        'answer includes all information necessary for a perfect response.\n'
        '    - The reference answer may contain citations (e.g., from books or law review articles), '
        'which the response does not need to replicate. However, statutes should be cited precisely, '
        'specifying Abs., Ziff., or lit. whenever applicable.\n'
        '    - If the reference answer includes separate sub-points, use these for proportional scoring '
        'guidance (e.g., addressing 2 out of 4 sub-points correctly equals approximately a 0.5 score).\n'
        'Judge the below case, give the brief reasoning process and the final grade.\n\n\n'
        'Question:\n```{question_fact}```\n\n'
        'Reference Answer:\n```{ref_answer}```\n\n'
        "Model's Answer:\n```[{model_answer}]```\n\n"
        'Your Judgment:\n'
    ))
    model_name = Column(String(255), default="Qwen/Qwen3-14B")
    temperature = Column(Float, default=0.7)
    max_tokens = Column(Integer, default=2048)
    judge_temperature = Column(Float, default=0.3)
    judge_max_tokens = Column(Integer, default=4096)
    n_answers = Column(Integer, default=1)
    status = Column(String(20), default="created")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    answers = relationship("ExperimentAnswer", back_populates="experiment", cascade="all, delete-orphan")


class ExperimentAnswer(Base):
    __tablename__ = "experiment_answers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False, index=True)
    variant_id = Column(Integer, ForeignKey("variants.id"), nullable=False, index=True)
    run_index = Column(Integer, default=0)
    model_name = Column(String(255))
    answer_text = Column(Text)
    extracted_letter = Column(String(5), nullable=True)
    mcq_correct = Column(Boolean, nullable=True)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    experiment = relationship("Experiment", back_populates="answers")
    variant = relationship("Variant", back_populates="experiment_answers")
    judgments = relationship("ExperimentJudgment", back_populates="answer", cascade="all, delete-orphan")


class ExperimentJudgment(Base):
    __tablename__ = "experiment_judgments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    answer_id = Column(Integer, ForeignKey("experiment_answers.id", ondelete="CASCADE"), nullable=False, index=True)
    judge_model = Column(String(255))
    judgment_text = Column(Text)
    score = Column(Float, nullable=True)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    answer = relationship("ExperimentAnswer", back_populates="judgments")
