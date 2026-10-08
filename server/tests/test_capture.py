"""The opt-in capture log and the text-free counters, through the app (llm-capture)."""

import json

from assist.__main__ import startup_line
from assist.settings import load_settings
from tests.helpers import client


def cont(text):
    return json.dumps({"continuation": text}, ensure_ascii=False)


def lines(path):
    return [json.loads(l) for l in path.read_text("utf-8").splitlines()] if path.exists() else []


def test_off_by_default_counters_still_written(tmp_path, scripted):
    c = client(tmp_path)
    scripted.answer("Sure! here you go")
    c.post("/v1/complete", json={"prefix": "Thank you, your request"})
    assert not (tmp_path / "capture").exists()
    events = lines(tmp_path / "telemetry" / "events.jsonl")
    assert [e["type"] for e in events if e["type"].startswith("llm-")] == ["llm-request", "llm-issue"]
    issue = next(e for e in events if e["type"] == "llm-issue")
    assert (issue["reason"], issue["endpoint"], issue["lang"]) == ("format", "complete", "en")
    assert "Sure!" not in json.dumps(events) and "Thank you" not in json.dumps(events)


def test_errors_writes_only_failing_requests_with_raw_text(tmp_path, scripted):
    c = client(tmp_path, {"GEMINI_API_KEY": "test-key", "ASSIST_CAPTURE": "errors"})
    scripted.answer(cont(" will be processed soon."), "Sure! here you go")
    c.post("/v1/complete", json={"prefix": "Thank you, your request"})  # clean
    c.post("/v1/complete", json={"prefix": "Thank you, your request"})  # format
    [rec] = lines(tmp_path / "capture" / "llm.jsonl")
    assert (rec["reasons"], rec["raw"], rec["output"], rec["input"]["agent_text"]) == (["format"], "Sure! here you go", "", "Thank you, your request")
    assert all(k in rec for k in ("id", "ts", "endpoint", "model", "lang", "latencyMs"))


def test_all_writes_an_arabic_record_unchanged(tmp_path, scripted):
    c = client(tmp_path, {"GEMINI_API_KEY": "test-key", "ASSIST_CAPTURE": "all"})
    turns = [{"role": "customer", "text": "متى سيتم معالجة طلبي؟"}]
    scripted.answer(cont("م طلبك."))
    c.post("/v1/complete", json={"prefix": "تم استلا", "transcript": turns})
    [rec] = lines(tmp_path / "capture" / "llm.jsonl")
    assert (rec["input"]["agent_text"], rec["input"]["conversation"], rec["raw"], rec["output"], rec["lang"]) == ("تم استلا", turns, "م طلبك.", "م طلبك.", "ar")
    assert "تم استلا" in (tmp_path / "capture" / "llm.jsonl").read_text("utf-8")  # not escaped


def test_polish_captured(tmp_path, scripted):
    c = client(tmp_path, {"GEMINI_API_KEY": "test-key", "ASSIST_CAPTURE": "errors"})
    scripted.answer(json.dumps({"polished": "Dear user, your request is ready."}))
    c.post("/v1/polish", json={"text": "Dear $(user.firstName), your request is ready."})
    [rec] = lines(tmp_path / "capture" / "llm.jsonl")
    assert (rec["endpoint"], rec["reasons"], rec["input"]) == ("polish", ["protected-changed"], {"draft": "Dear $(user.firstName), your request is ready."})


def test_no_record_holds_the_key(tmp_path, scripted):
    c = client(tmp_path, {"GEMINI_API_KEY": "test-key", "ASSIST_CAPTURE": "all"})
    scripted.answer(cont(" ok."))
    c.post("/v1/complete", json={"prefix": "Thank you, your request"})
    assert "test-key" not in (tmp_path / "capture" / "llm.jsonl").read_text("utf-8")


def test_health_and_startup_line(tmp_path):
    assert client(tmp_path, {"ASSIST_CAPTURE": "errors"}).get("/health").json()["capture"] == "errors"
    assert "capture: errors (capture/ stores request and answer text)" in startup_line(load_settings({"ASSIST_CAPTURE": "errors"}))
    assert "capture: off" in startup_line(load_settings({}))
    s = load_settings({"ASSIST_CAPTURE": "yes"})
    assert s.capture == "off" and any("ASSIST_CAPTURE" in w for w in s.warnings)


def test_report_from_captured_failures(tmp_path):
    from assist.capture import main

    def rec(endpoint, reasons, text, raw, output, lang="en"):
        key = "agent_text" if endpoint == "complete" else "draft"
        return {"id": "x", "ts": 1, "endpoint": endpoint, "model": "m", "lang": lang, "reasons": reasons, "input": {key: text}, "raw": raw, "output": output, "latencyMs": 5}

    log = tmp_path / "llm.jsonl"
    rows = [rec("complete", ["format"], f"Thank you, your request {i}", "Sure! here you go", "") for i in range(3)]
    rows += [rec("complete", ["multi-sentence"], "Thank you, your request", " will be processed. Anything else?", " will be processed.") for _ in range(2)]
    rows += [rec("polish", ["protected-changed"], "Dear $(user.firstName), ready.", "Dear user, ready.", "Dear $(user.firstName), ready.")]
    log.write_text("".join(json.dumps(r) + "\n" for r in rows), "utf-8")
    assert main(["--log", str(log), "--out", str(tmp_path / "report.md")]) == 0
    md = (tmp_path / "report.md").read_text("utf-8")
    assert "| complete | format | failure | 3 |" in md and "| complete | multi-sentence | repair | 2 |" in md and "| polish | protected-changed | failure | 1 |" in md
    assert "## complete: format (3)" in md and "'Sure! here you go'" in md and "' will be processed.'" in md
    assert main(["--log", str(tmp_path / "none.jsonl"), "--out", str(tmp_path / "r.md")]) == 1
