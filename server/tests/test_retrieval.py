import json

from assist.retrieval import DATA, load_library, normalize, retrieve

library = load_library()


def test_ranks_the_matching_english_response_first():
    top = retrieve(library, "Can you check the status of my contribution records?", "Your contribution")
    assert top[0].item.id == "en-contrib-status"


def test_matches_arabic_despite_hamza_and_article_differences():
    top = retrieve(library, "استعلام عن الاشتراكات", "")
    assert "ar-contrib-status" in [h.item.id for h in top]
    # "الإشتراك" in the pension entry is spelled with hamza
    assert normalize("الإشتراك") == normalize("الاشتراك")


def test_returns_nothing_for_an_unrelated_query():
    assert retrieve(library, "what is the weather in Paris", "") == []


def test_returns_at_most_three():
    assert len(retrieve(library, "request documents contribution pension account", "your request")) <= 3


def test_library_is_labeled_synthetic():
    assert "SYNTHETIC" in json.loads((DATA / "canned.json").read_text("utf-8"))["_note"]
