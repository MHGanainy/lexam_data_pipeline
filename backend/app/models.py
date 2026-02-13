from sqlalchemy import Column, String, Integer, Boolean, Text, JSON, ForeignKey
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
