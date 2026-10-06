import json
from argparse import Namespace

import litellm

from assist.settings import ROOT
from assist_eval.cases import build_command
from assist_eval.run import run_command

EXAMPLE = ROOT / "eval" / "completion" / "examples" / "chat-example.txt"
GEMINI = {"GEMINI_API_KEY": "test-key"}


def build(tmp_path, limit=None):
    args = Namespace(input=str(EXAMPLE), name="ex", plain=False, split="paragraphs", per_category=1, seed=1, limit=limit)
    assert build_command(args, root=tmp_path) == 0


def run(tmp_path, env, samples=1, allow_fake=False):
    return run_command(Namespace(set="ex", samples=samples, concurrency=4, allow_fake=allow_fake), root=tmp_path, env=env)


def samples(tmp_path):
    (run_dir,) = (tmp_path / "runs").iterdir()
    return run_dir, [json.loads(line) for line in (run_dir / "samples.jsonl").read_text("utf-8").splitlines()]


def test_no_canned_or_kb_and_the_transcript_sent(tmp_path, scripted):
    build(tmp_path, limit=4)
    assert run(tmp_path, GEMINI) == 0
    assert len(scripted.calls) == 4
    for call in scripted.calls:
        sent = call["messages"][-1]["content"]
        assert "[[ ## approved_responses ## ]]\n[]" in sent
        assert "[[ ## knowledge_base ## ]]\n[]" in sent
        assert "pension documents last week" in sent  # the case's transcript


def test_errors_counted_and_the_run_finishes(tmp_path, scripted):
    build(tmp_path, limit=3)
    scripted.answer(litellm.exceptions.Timeout(message="slow", model="m", llm_provider="gemini"), '{"continuation": " ok."}')
    assert run(tmp_path, GEMINI) == 0
    _, rows = samples(tmp_path)
    assert len(rows) == 3 and sum(r["error"] is not None for r in rows) == 1
    assert sum(r["completion"] != "" for r in rows) >= 1


def test_offline_model_refused_without_the_flag(tmp_path, capsys):
    build(tmp_path)
    assert run(tmp_path, {}) == 1
    assert "a live model is needed" in capsys.readouterr().out
    assert not (tmp_path / "runs").exists() or not any((tmp_path / "runs").iterdir())


def test_external_model_reminder(tmp_path, scripted, capsys):
    build(tmp_path, limit=1)
    assert run(tmp_path, GEMINI) == 0
    out = capsys.readouterr().out
    assert "sent outside this machine" in out and "no personal data" in out
    assert "1 cases × 1 samples = 1 requests" in out


def test_cache_forced_off(tmp_path, scripted):
    build(tmp_path, limit=1)
    assert run(tmp_path, {**GEMINI, "ASSIST_LLM_CACHE": "on"}, samples=2) == 0
    assert len(scripted.calls) == 2  # both samples reached the model


def test_files_only_in_the_run_folder(tmp_path, scripted):
    build(tmp_path, limit=2)
    before = {p for p in tmp_path.rglob("*")}
    assert run(tmp_path, GEMINI) == 0
    created = {p for p in tmp_path.rglob("*")} - before
    run_dir, _ = samples(tmp_path)
    assert all(p == run_dir or run_dir in p.parents for p in created)
    assert {p.name for p in run_dir.iterdir()} == {"samples.jsonl", "report.md", "report.json"}
    assert all("test-key" not in p.read_text("utf-8") for p in run_dir.iterdir())
