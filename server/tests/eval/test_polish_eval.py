import json
from argparse import Namespace

import litellm
import pytest

from assist_eval.paths import POLISH_WORKSPACE, workspace
from assist_eval.polish_cases import PolishCase, read_cases, read_pairs, read_parallel
from assist_eval.polish_cases import build_command as build
from assist_eval.polish_metrics import compute, edits, score, tokens
from assist_eval.polish_report import write_report
from assist_eval.polish_run import PolishSample
from assist_eval.polish_run import run_command as run

GEMINI = {"GEMINI_API_KEY": "test-key"}
GRAMMAR = "﻿Serial Number,Error Type,Ungrammatical Statement,Standard English\n"
COLLEGE = "﻿sample_id,original_text,corrected_text,primary_error_type,fluency_score\n"


def csv_file(tmp_path, text, name="pairs.csv"):
    path = tmp_path / name
    path.write_text(text, "utf-8")
    return path


def build_args(path, name="s", limit=None, seed=1, source=None, target=None, kind=None, target_file=None, type_="unknown", local_only=False):
    return Namespace(input=str(path), name=name, source_column=source, target_column=target, type_column=kind, limit=limit, seed=seed,
                     target_file=str(target_file) if target_file else None, type=type_, local_only=local_only)


def case(source, target, error_type="t", lang="en", id_="s:2", count=1):
    return PolishCase(id_, "s", lang, error_type, source, target, count, 2)


# --- workspace -------------------------------------------------------------


def test_polish_workspace_is_under_eval_local_polish(tmp_path):
    assert POLISH_WORKSPACE.parts[-3:] == ("eval", "local", "polish")
    root = workspace(tmp_path / "polish")
    assert {p.name for p in root.iterdir()} == {"sources", "sets", "runs"}


# --- import ----------------------------------------------------------------


def test_grammar_correction_layout(tmp_path):
    path = csv_file(tmp_path, GRAMMAR + '1,Verb Tense Errors,He go to the office yesterday.,He went to the office yesterday.\n')
    (c,) = read_pairs(path, "s").cases
    assert (c.source, c.target, c.errorType, c.lang, c.count) == ("He go to the office yesterday.", "He went to the office yesterday.", "Verb Tense Errors", "en", 1)


def test_college_layout_duplicates_collapsed(tmp_path):
    rows = "".join(f"COL_{i},The results shows improvement.,The results show improvement.,Subject_Verb_Agreement,{i % 5}\n" for i in range(200))
    imported = read_pairs(csv_file(tmp_path, COLLEGE + rows), "s")
    assert imported.rows == 200 and imported.layout == "college-writing"
    (c,) = imported.cases
    assert c.count == 200 and c.errorType == "Subject_Verb_Agreement" and c.row == 2


def test_text_kept_as_is_and_unchanged_pair_kept(tmp_path):
    path = csv_file(tmp_path, GRAMMAR + '1,Spelling Mistakes,31. I has a question.,31. I have a question.\n2,Punctuation Errors,Can you help me with this problem?,Can you help me with this problem?\n')
    first, second = read_pairs(path, "s").cases
    assert first.source == "31. I has a question." and first.target == "31. I have a question."
    assert second.source == second.target


def test_arabic_and_mixed_rows_with_named_columns(tmp_path):
    path = csv_file(tmp_path, "draft,fixed\nهذه الطلب قيد المراجعة.,هذا الطلب قيد المراجعة.\nيرجى تحديث بياناتك عبر Absher,يرجى تحديث بياناتك عبر Absher\n")
    ar, mixed = read_pairs(path, "s", "draft", "fixed").cases
    assert (ar.lang, mixed.lang) == ("ar", "mixed")
    assert ar.errorType == "unknown"


def test_unknown_layout_lists_the_columns(tmp_path, capsys):
    path = csv_file(tmp_path, "text,fixed\na,b\n")
    assert build(build_args(path), root=tmp_path / "ws") == 1
    out = capsys.readouterr().out
    assert "text" in out and "fixed" in out


def test_empty_rows_skipped_and_counted(tmp_path, capsys):
    path = csv_file(tmp_path, GRAMMAR + "1,Spelling Mistakes,,x\n2,Spelling Mistakes,I has it.,I have it.\n")
    assert build(build_args(path), root=tmp_path / "ws") == 0
    assert "1 skipped" in capsys.readouterr().out


def test_empty_set_fails(tmp_path, capsys):
    path = csv_file(tmp_path, GRAMMAR + "1,Spelling Mistakes,,x\n")
    assert build(build_args(path), root=tmp_path / "ws") == 1
    assert "no cases" in capsys.readouterr().out


def test_deterministic_subset_in_input_order(tmp_path):
    rows = "".join(f"{i},T{i % 3},I has {i} apples.,I have {i} apples.\n" for i in range(120))
    path = csv_file(tmp_path, GRAMMAR + rows)
    ws = tmp_path / "ws"
    assert build(build_args(path, name="a", limit=50), root=ws) == 0
    assert build(build_args(path, name="b", limit=50), root=ws) == 0
    a, b = read_cases(ws / "sets" / "a.jsonl"), read_cases(ws / "sets" / "b.jsonl")
    assert len(a) == 50 and [c.source for c in a] == [c.source for c in b]
    assert [c.row for c in a] == sorted(c.row for c in a)
    meta = json.loads((ws / "sets" / "a.meta.json").read_text("utf-8"))
    assert meta["rows"] == 120 and meta["cases"] == 50 and meta["layout"] == "grammar-correction"


def test_type_fills_in_for_a_csv_without_a_type_column_and_a_type_column_wins(tmp_path):
    named = csv_file(tmp_path, "draft,fixed\nI has it.,I have it.\n", "named.csv")
    (c,) = read_pairs(named, "s", "draft", "fixed", default_type="gec-x").cases
    assert c.errorType == "gec-x"
    typed = csv_file(tmp_path, GRAMMAR + "1,Spelling Mistakes,I has it.,I have it.\n", "typed.csv")
    (c,) = read_pairs(typed, "s", default_type="gec-x").cases
    assert c.errorType == "Spelling Mistakes"


# --- parallel files ----------------------------------------------------------


def text_file(tmp_path, name, text):
    path = tmp_path / name
    path.write_text(text, "utf-8")
    return path


def test_english_parallel_files(tmp_path):
    src = text_file(tmp_path, "a.sent", "He go to the office yesterday.\nI has a question.\n")
    tgt = text_file(tmp_path, "a.cor", "He went to the office yesterday.\nI have a question.\n")
    imported = read_parallel(src, tgt, "s")
    assert imported.rows == 2 and imported.layout == "parallel"
    a, b = imported.cases
    assert (a.source, a.target, a.row, a.errorType) == ("He go to the office yesterday.", "He went to the office yesterday.", 1, "unknown")
    assert (b.source, b.target, b.row) == ("I has a question.", "I have a question.", 2)


def test_arabic_parallel_files_with_a_type_and_bom(tmp_path):
    src = text_file(tmp_path, "a.sent", "\ufeffتم استلام طلبك و سيتم مراجعتة خلال ثلاثة ايام.\r\n")
    tgt = text_file(tmp_path, "a.cor", "تم استلام طلبك وسيتم مراجعته خلال ثلاثة أيام.\r\n")
    (c,) = read_parallel(src, tgt, "s", "qalb14").cases
    assert (c.lang, c.errorType) == ("ar", "qalb14")
    assert c.source == "تم استلام طلبك و سيتم مراجعتة خلال ثلاثة ايام." and c.target == "تم استلام طلبك وسيتم مراجعته خلال ثلاثة أيام."


def test_mixed_parallel_line(tmp_path):
    src = text_file(tmp_path, "a.sent", "أرجو تحديث تطبيق Absher ثم ارسال الطلب")
    tgt = text_file(tmp_path, "a.cor", "أرجو تحديث تطبيق Absher ثم إرسال الطلب")
    (c,) = read_parallel(src, tgt, "s").cases
    assert c.lang == "mixed"


def test_line_counts_differ_fails_and_writes_nothing(tmp_path, capsys):
    src = text_file(tmp_path, "a.sent", "one\ntwo\nthree\n")
    tgt = text_file(tmp_path, "a.cor", "one\ntwo\n")
    ws = tmp_path / "ws"
    assert build(build_args(src, target_file=tgt), root=ws) == 1
    out = capsys.readouterr().out
    assert "3 lines" in out and "has 2" in out
    assert not (ws / "sets" / "s.jsonl").exists()


def test_empty_line_pair_skipped_and_line_numbers_kept(tmp_path, capsys):
    src = text_file(tmp_path, "a.sent", "I has it.\nHe go home.\n\nShe have a pen.\n")
    tgt = text_file(tmp_path, "a.cor", "I have it.\nHe went home.\n\nShe has a pen.\n")
    ws = tmp_path / "ws"
    assert build(build_args(src, target_file=tgt), root=ws) == 0
    assert "1 skipped" in capsys.readouterr().out
    assert [c.row for c in read_cases(ws / "sets" / "s.jsonl")] == [1, 2, 4]


def test_parallel_duplicates_collapse_and_subset_is_deterministic(tmp_path):
    lines = [f"I has {i % 40} apples." for i in range(120)]
    src = text_file(tmp_path, "a.sent", "\n".join(lines) + "\n")
    tgt = text_file(tmp_path, "a.cor", "\n".join(l.replace("has", "have") for l in lines) + "\n")
    imported = read_parallel(src, tgt, "s")
    assert len(imported.cases) == 40 and {c.count for c in imported.cases} == {3}
    ws = tmp_path / "ws"
    assert build(build_args(src, name="a", target_file=tgt, limit=10), root=ws) == 0
    assert build(build_args(src, name="b", target_file=tgt, limit=10), root=ws) == 0
    assert [c.source for c in read_cases(ws / "sets" / "a.jsonl")] == [c.source for c in read_cases(ws / "sets" / "b.jsonl")]


def test_local_only_mark_recorded_and_printed(tmp_path, capsys):
    src = text_file(tmp_path, "a.sent", "I has it.\n")
    tgt = text_file(tmp_path, "a.cor", "I have it.\n")
    ws = tmp_path / "ws"
    assert build(build_args(src, target_file=tgt, local_only=True, type_="qalb14"), root=ws) == 0
    assert "local-only" in capsys.readouterr().out
    meta = json.loads((ws / "sets" / "s.meta.json").read_text("utf-8"))
    assert meta["localOnly"] is True and meta["layout"] == "parallel" and meta["targetInput"] == "a.cor"


# --- metrics ---------------------------------------------------------------


def test_tokens_keep_arabic_words_and_split_punctuation():
    assert tokens("Thank you ,the payment.") == ["Thank", "you", ",", "the", "payment", "."]
    assert tokens("مراجعتُه، الآن") == ["مراجعتُه", "،", "الآن"]


def test_exact_correction():
    s = score(case("He go to the office.", "He went to the office."), "He went to the office.")
    assert (s.outcome, s.tp, s.system, s.gold) == ("exact", 1, 1, 1)


def test_missed_correction():
    s = score(case("She have completed her homework.", "She has completed her homework."), "She have completed her homework.")
    assert (s.outcome, s.tp, s.system, s.gold) == ("missed", 0, 0, 1)


def test_over_edit_of_a_correct_sentence():
    text = "Can you help me with this problem?"
    assert score(case(text, text), "Could you help me with this problem?").outcome == "over-edited"
    assert score(case(text, text), text).outcome == "kept"


def test_partly_right():
    c = case("He go to the store and buyed a pen.", "He went to the store and bought a pen.")
    s = score(c, "He went to the store and buyed a pen.")
    assert s.outcome == "different"
    m = compute([(c, s, 100)])["languages"]["all"]
    assert m["precision"] == 1.0 and m["recall"] == 0.5


def test_arabic_edit_matched():
    c = case("تم استلام طلبك و سيتم مراجعتة.", "تم استلام طلبك وسيتم مراجعته.", lang="ar")
    assert score(c, "تم استلام طلبك وسيتم مراجعته.").outcome == "exact"


def test_whitespace_ignored_case_kept():
    c = case("Thank you the payment was sent.", "Thank you, the payment was sent.")
    assert score(c, "Thank you ,the payment was sent.").outcome == "exact"
    assert score(c, "thank you, the payment was sent.").outcome == "different"


def test_errors_excluded_from_precision_and_recall():
    c = case("He go home.", "He went home.")
    items = [(c, score(c, "He went home."), 100), (case("I has it.", "I have it.", id_="s:3"), score(c, None), 4000)]
    m = compute(items)["languages"]["all"]
    assert m["error"] == 0.5 and m["precision"] == 1.0 and m["recall"] == 1.0 and m["goldEdits"] == 1
    assert m["latencyP95"] == 100


def test_error_types_reported_separately_in_input_order():
    a, b = case("I has it.", "I have it.", "Spelling Mistakes"), case("The small little dog.", "The small dog.", "Tautology", id_="s:3")
    m = compute([(b, score(b, b.source), 1), (a, score(a, a.target), 1)])
    assert list(m["types"]) == ["Tautology", "Spelling Mistakes"]
    assert m["types"]["Spelling Mistakes"]["exact"] == 1.0 and m["types"]["Tautology"]["missed"] == 1.0
    assert m["languages"]["all"]["cases"] == 2


def test_edits_are_in_source_positions():
    assert edits(["a", "b", "c"], ["a", "x", "c"]) == {(1, 2, ("x",))}


# --- run -------------------------------------------------------------------


def write_set(ws, cases):
    workspace(ws)
    (ws / "sets" / "s.jsonl").write_text("".join(json.dumps(c.__dict__, ensure_ascii=False) + "\n" for c in cases), "utf-8")


def run_args(samples=1, allow_fake=False):
    return Namespace(set="s", samples=samples, concurrency=4, allow_fake=allow_fake)


def rows_of(ws):
    (run_dir,) = (ws / "runs").iterdir()
    return run_dir, [json.loads(line) for line in (run_dir / "samples.jsonl").read_text("utf-8").splitlines()]


def test_fake_run_english_and_arabic(tmp_path):
    ws = tmp_path / "ws"
    write_set(ws, [case("He go to the office yesterday.", "He went to the office yesterday."),
                   case("هذه الطلب قيد المراجعة.", "هذا الطلب قيد المراجعة.", lang="ar", id_="s:3")])
    assert run(run_args(allow_fake=True), root=ws, env={"COMPLETION_MODEL": "fake"}) == 0
    run_dir, rows = rows_of(ws)
    got = {r["case"]: r for r in rows}
    assert got["s:2"]["polished"] == "He went to the office yesterday." and got["s:2"]["changed"]
    assert got["s:3"]["polished"] == "هذا الطلب قيد المراجعة."
    report = json.loads((run_dir / "report.json").read_text("utf-8"))
    assert report["languages"]["all"]["exact"] == 1.0
    assert report["languages"]["en"]["cases"] == 1 and report["languages"]["ar"]["cases"] == 1


def test_offline_model_refused_without_the_flag(tmp_path, capsys):
    ws = tmp_path / "ws"
    write_set(ws, [case("He go home.", "He went home.")])
    assert run(run_args(), root=ws, env={}) == 1
    assert "a live model is needed" in capsys.readouterr().out
    assert not any((ws / "runs").iterdir())


def test_timeout_counted_and_rejection_reported(tmp_path, scripted, capsys):
    ws = tmp_path / "ws"
    write_set(ws, [case("Please quote REF-20491 in you reply.", "Please quote REF-20491 in your reply."), case("He go home.", "He went home.", id_="s:3")])
    scripted.answer('{"polished": "Please quote the reference in your reply."}', litellm.exceptions.Timeout(message="slow", model="m", llm_provider="gemini"))
    run_args_ = Namespace(set="s", samples=1, concurrency=1, allow_fake=False)
    assert run(run_args_, root=ws, env=GEMINI) == 0
    out = capsys.readouterr().out
    assert "sent outside this machine" in out and "2 cases × 1 samples = 2 requests" in out
    run_dir, rows = rows_of(ws)
    got = {r["case"]: r for r in rows}
    assert got["s:2"]["polished"] == "Please quote REF-20491 in you reply." and got["s:2"]["reason"]
    assert got["s:3"]["error"] and got["s:3"]["polished"] is None
    report = json.loads((run_dir / "report.json").read_text("utf-8"))
    assert report["languages"]["all"]["rejected"] == 0.5 and report["languages"]["all"]["missed"] == 0.5 and report["languages"]["all"]["error"] == 0.5
    assert list(report["rejectionReasons"].values()) == [1]
    assert "## Rejections (1)" in (run_dir / "report.md").read_text("utf-8")
    assert all("test-key" not in p.read_text("utf-8") for p in run_dir.iterdir())


def test_cache_forced_off(tmp_path, scripted):
    ws = tmp_path / "ws"
    write_set(ws, [case("He go home.", "He went home.")])
    scripted.answer('{"polished": "He went home."}', '{"polished": "He went home."}')
    assert run(run_args(samples=2), root=ws, env={**GEMINI, "ASSIST_LLM_CACHE": "on"}) == 0
    assert len(scripted.calls) == 2


def mark_local_only(ws):
    (ws / "sets" / "s.meta.json").write_text(json.dumps({"input": "a.sent", "localOnly": True}), "utf-8")


def test_local_only_set_refused_on_a_hosted_model(tmp_path, scripted, capsys):
    ws = tmp_path / "ws"
    write_set(ws, [case("هذه الطلب قيد المراجعة.", "هذا الطلب قيد المراجعة.", lang="ar")])
    mark_local_only(ws)
    assert run(run_args(), root=ws, env=GEMINI) == 1
    out = capsys.readouterr().out
    assert "set s is local-only" in out and "gemini" in out
    assert not any((ws / "runs").iterdir()) and scripted.calls == []


def test_local_only_set_allowed_on_a_loopback_model(tmp_path, scripted):
    ws = tmp_path / "ws"
    write_set(ws, [case("He go home.", "He went home.")])
    mark_local_only(ws)
    scripted.answer('{"polished": "He went home."}')
    env = {"COMPLETION_MODEL": "ollama_chat/gemma3:12b", "COMPLETION_API_BASE": "http://127.0.0.1:11434"}
    assert run(run_args(), root=ws, env=env) == 0
    _, rows = rows_of(ws)
    assert rows[0]["polished"] == "He went home."


def test_set_without_metadata_runs_as_before(tmp_path, scripted):
    ws = tmp_path / "ws"
    write_set(ws, [case("He go home.", "He went home.")])
    scripted.answer('{"polished": "He went home."}')
    assert run(run_args(), root=ws, env=GEMINI) == 0


# --- report ----------------------------------------------------------------


def test_report_figures_and_example_lists(tmp_path):
    ok, missed, over = case("He go home.", "He went home.", "Tense"), case("I has it.", "I have it.", "Agreement", id_="s:3"), case("Can you help?", "Can you help?", "Punctuation", id_="s:4")
    samples = [
        PolishSample("s:2", 0, "He went home.", True, None, None, 100),
        PolishSample("s:3", 0, "I has it.", False, None, None, 200),
        PolishSample("s:4", 0, "Could you help?", True, None, None, 300),
    ]
    report = write_report(tmp_path, [ok, missed, over], samples, {"set": "s", "model": "m", "samples": 1, "input": "x.csv", "seconds": 1})
    md = (tmp_path / "report.md").read_text("utf-8")
    assert "## Missed (1)" in md and "'I has it.'" in md
    assert "## Over-edited (1)" in md and "'Could you help?'" in md
    assert "## Different (0)" in md
    types = report.data["types"]
    assert list(types) == ["Tense", "Agreement", "Punctuation"]
    assert types["Tense"]["exact"] == 1.0 and types["Agreement"]["missed"] == 1.0 and types["Punctuation"]["over-edited"] == 1.0
    assert report.data["languages"]["all"]["latencyP50"] == 200
    assert "exact 33.3%" in report.summary


@pytest.mark.parametrize("count", [1, 7])
def test_rows_column_counts_dataset_rows(tmp_path, count):
    c = case("He go home.", "He went home.", count=count)
    report = write_report(tmp_path, [c], [PolishSample("s:2", 0, "He went home.", True, None, None, 1)], {"set": "s", "model": "m", "samples": 1})
    assert report.data["languages"]["all"]["rows"] == count and report.data["languages"]["all"]["cases"] == 1
