import json

import pytest

from assist.retrieval import DATA, load_kb, retrieve_kb

data = json.loads((DATA / "kb.json").read_text("utf-8"))
passages = load_kb()


def ids(q: str) -> list[str]:
    return [h.item.id for h in retrieve_kb(passages, q)]


def test_labeled_synthetic_and_split_into_titled_passages():
    assert "SYNTHETIC" in data["_note"]
    assert (passages[0].id, passages[0].lang) == ("kb:en-early-retirement#0", "en")
    assert passages[0].text.startswith("Early retirement eligibility: ")


@pytest.mark.parametrize(
    ("q", "article"),
    [
        ("Am I eligible for early retirement? I have 26 years of contributions.", "kb:en-early-retirement"),
        ("My father passed away, can our family get a survivor pension?", "kb:en-survivor-benefits"),
        ("How do I claim unemployment insurance after losing my job?", "kb:en-unemployment"),
        ("How do I register an employee?", "kb:en-new-employee"),
        ("هل يحق لي التقاعد المبكر؟ لدي 26 سنة من الاشتراكات", "kb:ar-early-retirement"),
        ("توفي والدي، هل تحصل الأسرة على معاش؟", "kb:ar-survivor-benefits"),
        ("كيف أسجل موظف جديد؟", "kb:ar-new-employee"),
    ],
)
def test_strong_question_gives_passages_only_from_its_article(q, article):
    got = ids(q)
    assert got
    assert all(i.startswith(article + "#") for i in got)


@pytest.mark.parametrize(
    "q",
    [
        "Hello, good morning",
        "Thank you so much for your help",
        "مرحبا، صباح الخير",
        "شكرا جزيلا",
        "What is the weather like today?",
        "What about my pension?",
        "I have a question about my contributions",
        "سؤال عن المعاش",
    ],
)
def test_weak_or_vague_message_gives_nothing(q):
    assert ids(q) == []


def test_returns_at_most_two_passages():
    assert len(ids("early retirement contributions pension salary applications")) <= 2
