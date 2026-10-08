import json

from assist.spelling_report import main, render_markdown, spelling_report
from tests.helpers import fake_client


def ev(kind, word, lang="en", session="s1", replacement=None):
    e = {"type": kind, "ts": 1, "lang": lang, "session": session, "original": word}
    if replacement is not None:
        e["replacement"] = replacement
    return e


def test_english_custom_dictionary_candidate():
    events = [e for i in range(5) for e in (ev("flag", "Absher", session=f"s{i}"), ev("unresolved", "Absher", session=f"s{i}"))]
    r = spelling_report(events)["languages"]["en"]
    assert r["customDictionary"] == [{"word": "Absher", "sessions": 5, "flags": 5, "left": 5, "fixes": 0}]
    assert (r["words"][0]["flag"], r["words"][0]["unresolved"], r["words"][0]["sessions"]) == (5, 5, 5)


def test_flagged_but_fixed_by_typing_is_not_a_candidate():
    # Flagged in many sessions, but never left misspelled: the agent corrected it.
    events = [ev("flag", "chek", session=f"s{i}") for i in range(5)]
    assert spelling_report(events)["languages"]["en"]["customDictionary"] == []


def test_ignored_counts_as_left():
    events = [e for i in range(3) for e in (ev("flag", "GOSI", session=f"s{i}"), ev("ignore", "GOSI", session=f"s{i}"))]
    assert spelling_report(events)["languages"]["en"]["customDictionary"][0]["word"] == "GOSI"


def test_arabic_misspellings_candidate():
    events = []
    for i in range(4):
        events.append(ev("flag", "الطلبب", "ar", f"s{i}"))
        events.append(ev("accept", "الطلبب", "ar", f"s{i}", "الطلب"))
    r = spelling_report(events)["languages"]["ar"]
    assert r["misspellings"] == [{"word": "الطلبب", "fix": "الطلب", "type": "insert", "sessions": 4, "fixes": 4, "share": 1.0}]
    assert r["customDictionary"] == []
    assert r["words"][0]["replacements"] == {"الطلب": 4}


def test_removal_candidate():
    events = [ev("autocorrect", "Saud", session=f"s{i}", replacement="Sand") for i in range(4)]
    events += [ev("revert", "Saud", session=f"s{i}", replacement="Sand") for i in range(2)]
    r = spelling_report(events)["languages"]["en"]
    assert r["removal"] == [{"word": "Saud", "fix": "Sand", "sessions": 4, "autocorrects": 4, "reverts": 2, "revertRate": 0.5}]


def test_below_the_session_threshold():
    events = [ev("flag", "chek", session="only") for _ in range(10)] + [ev("accept", "chek", session="only", replacement="check")]
    r = spelling_report(events)["languages"]["en"]
    assert [w["word"] for w in r["words"]] == ["chek"]
    assert (r["customDictionary"], r["misspellings"], r["removal"]) == ([], [], [])


def test_mixed_languages_kept_apart_and_no_dominant_fix():
    events = [ev("unresolved", "chek", session=f"s{i}") for i in range(3)] + [ev("unresolved", "النضام", "ar", f"s{i}") for i in range(3)]
    events += [ev("accept", "teh", session=f"s{i}", replacement="the" if i < 2 else "tech") for i in range(3)]  # 67% < 80%
    report = spelling_report(events)
    assert set(report["languages"]) == {"en", "ar"}
    assert [c["word"] for c in report["languages"]["ar"]["customDictionary"]] == ["النضام"]
    assert report["languages"]["en"]["misspellings"] == []
    assert "human review" in report["note"] and "human review" in render_markdown(report)


def test_cli_writes_both_files(tmp_path, capsys):
    log = tmp_path / "events.jsonl"
    log.write_text("".join(json.dumps(ev("unresolved", "Absher", session=f"s{i}")) + "\n" for i in range(3)), "utf-8")
    assert main(["--log", str(log), "--out", str(tmp_path / "out")]) == 0
    data = json.loads((tmp_path / "out" / "spelling-report.json").read_text("utf-8"))
    assert data["languages"]["en"]["customDictionary"][0]["word"] == "Absher"
    assert "## en" in (tmp_path / "out" / "spelling-report.md").read_text("utf-8")
    assert "custom dictionary 1" in capsys.readouterr().out


def test_summary_page_shows_the_candidates(tmp_path):
    c = fake_client(tmp_path)
    c.post("/v1/events", json=[ev("unresolved", "Absher", session=f"s{i}") for i in range(3)])
    html = c.get("/summary").text
    assert "Dictionary candidates" in html and "Absher" in html and "human review" in html
