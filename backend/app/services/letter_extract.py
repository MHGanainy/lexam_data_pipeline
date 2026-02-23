import re


def gold_to_letter(gold: int) -> str:
    """Convert gold index (0-based) to letter (A, B, C, ...)."""
    return chr(ord("A") + gold)


def extract_letter(text: str) -> str | None:
    """Extract the answer letter from a model response.

    Tries multiple patterns:
    1. ###X### format
    2. "Answer: X" format
    3. Standalone capital letter at end
    """
    if not text:
        return None

    # Pattern 1: ###X###
    m = re.search(r"###\s*([A-Z])\s*###", text)
    if m:
        return m.group(1)

    # Pattern 2: "Answer: X" or "answer is X"
    m = re.search(r"(?:answer|Answer)\s*(?:is|:)\s*\(?([A-Z])\)?", text)
    if m:
        return m.group(1)

    # Pattern 3: Last standalone capital letter (with optional parenthesis/period)
    m = re.findall(r"(?:^|\s)\(?([A-Z])\)?[\.\s]*$", text, re.MULTILINE)
    if m:
        return m[-1]

    # Pattern 4: "The correct answer is (X)" or similar
    m = re.search(r"correct\s+(?:answer|option|choice)\s+is\s+\(?([A-Z])\)?", text, re.IGNORECASE)
    if m:
        return m.group(1).upper()

    return None


def extract_score(text: str) -> float | None:
    """Extract [[X.X]] score from judgment text. Clamp to 0.0-1.0."""
    if not text:
        return None

    m = re.search(r"\[\[(\d+\.?\d*)\]\]", text)
    if m:
        score = float(m.group(1))
        return max(0.0, min(1.0, score))

    return None
