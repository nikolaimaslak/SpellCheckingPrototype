import json

import pytest

from assist.telemetry import append_events, read_events, render_summary, sanitize, summarize


class TestTelemetry:
    def test_drops_non_allowlisted_fields_such_as_text(self):
        e = sanitize({"type": "completion-accepted", "ts": 1, "lang": "en", "latencyMs": 300, "acceptedLength": 22, "text": "secret completion", "prefix": "typed text"})
        assert e == {"type": "completion-accepted", "ts": 1, "lang": "en", "latencyMs": 300, "acceptedLength": 22}
        assert sanitize({"type": "autocorrect", "ts": 1, "original": "seperate", "replacement": "separate", "transcript": "x"}) == {
            "type": "autocorrect",
            "ts": 1,
            "original": "seperate",
            "replacement": "separate",
        }
        assert sanitize({"type": "evil"}) is None
        assert "shownLength" not in sanitize({"type": "completion-shown", "shownLength": "x" * 100})

    def test_booleans_are_not_numbers(self):
        assert "latencyMs" not in sanitize({"type": "completion-shown", "ts": 1, "latencyMs": True})

    def test_appends_one_line_per_event_and_reads_them_back(self, tmp_path):
        file = tmp_path / "telemetry" / "events.jsonl"
        assert append_events(file, [{"type": "revert", "ts": 1}, {"type": "accept", "ts": 2}, {"type": "nope"}]) == 2
        assert len(file.read_text("utf-8").strip().split("\n")) == 2
        assert [e["type"] for e in read_events(file)] == ["revert", "accept"]

    def test_reads_a_log_written_by_the_node_server(self, tmp_path):
        # Lines exactly as server/telemetry.ts wrote them (JSON.stringify), plus a broken one.
        file = tmp_path / "events.jsonl"
        file.write_text(
            '{"type":"completion-shown","ts":1759700000000,"lang":"en","session":"s1","latencyMs":640,"shownLength":27}\n'
            '{"type":"completion-withheld","ts":1759700000001,"lang":"ar","reason":"format"}\n'
            '{"type":"autocorrect","ts":1759700000002,"lang":"ar","original":"النضام","replacement":"النظام"}\n'
            "not json\n",
            "utf-8",
        )
        s = summarize(read_events(file))
        assert s["total"] == 3
        assert s["completion"]["withheld"]["format"] == 1
        assert s["spelling"]["ar"]["errorTypes"] == {"emphatic": 1}

    def test_computes_acceptance_revert_rate_and_latency_percentiles(self):
        events = [
            *({"type": "completion-shown", "ts": i, "lang": "en", "latencyMs": (i + 1) * 100} for i in range(10)),
            *({"type": "completion-accepted", "ts": i} for i in range(4)),
            *({"type": "autocorrect", "ts": i, "lang": "ar"} for i in range(5)),
            {"type": "revert", "ts": 0, "lang": "ar"},
        ]
        s = summarize(events)
        assert s["completion"]["acceptanceRate"] == pytest.approx(0.4)
        assert s["autocorrect"]["revertRate"] == pytest.approx(0.2)
        assert s["completion"]["latencyP50"] == 500
        assert s["completion"]["latencyP95"] == 1000
        html = render_summary(s)
        assert "40%" in html
        assert "20%" in html


class TestPolishTelemetry:
    def test_keeps_only_latency_and_change_count_for_polish_events(self):
        assert sanitize({"type": "polish-shown", "ts": 1, "lang": "ar", "latencyMs": 900, "changes": 2, "draft": "secret", "polished": "secret"}) == {
            "type": "polish-shown",
            "ts": 1,
            "lang": "ar",
            "latencyMs": 900,
            "changes": 2,
        }
        assert sanitize({"type": "polish-reverted", "ts": 1, "text": "x"}) == {"type": "polish-reverted", "ts": 1}

    def test_computes_polish_acceptance_over_previews_with_changes(self):
        events = [
            *({"type": "polish-shown", "ts": i, "changes": 2, "latencyMs": 800 + i * 100} for i in range(4)),
            {"type": "polish-shown", "ts": 9, "changes": 0, "latencyMs": 700},
            *({"type": "polish-accepted", "ts": i} for i in range(3)),
        ]
        s = summarize(events)
        assert s["polish"]["acceptanceRate"] == pytest.approx(0.75)
        assert "75%" in render_summary(s)

    def test_reports_revert_rates_per_language(self):
        def ac(lang, original, replacement):
            return {"type": "autocorrect", "ts": 0, "lang": lang, "original": original, "replacement": replacement}

        events = [
            *(ac("en", w, "x") for w in ["seperate", "paymnet", "reqeust", "pensoin"]),
            *(ac("ar", w, "y") for w in ["النضام", "اذا", "الطلبب", "التسجبل"]),
            {"type": "revert", "ts": 1, "lang": "ar", "original": "النضام", "replacement": "y"},
            {"type": "revert", "ts": 2, "lang": "ar", "original": "اذا", "replacement": "y"},
        ]
        s = summarize(events)
        assert s["spelling"]["en"]["revertRate"] == 0
        assert s["spelling"]["ar"]["revertRate"] == 0.5
        assert s["autocorrect"]["revertRate"] == 0.25

    def test_reports_the_ignore_share_as_the_field_proxy_for_false_flags(self):
        events = [
            *({"type": "accept", "ts": i, "lang": "ar", "original": "اذا", "replacement": "إذا"} for i in range(6)),
            *({"type": "ignore", "ts": i, "lang": "ar", "original": "عبدالله"} for i in range(2)),
        ]
        s = summarize(events)
        assert s["spelling"]["ar"]["ignoreShare"] == 0.25
        assert "ignore share approximates the false-flag rate" in render_summary(s)

    def test_classifies_field_corrections_with_the_benchmark_taxonomy(self):
        events = [
            {"type": "accept", "ts": 0, "lang": "ar", "original": "اذا", "replacement": "إذا"},
            {"type": "accept", "ts": 1, "lang": "ar", "original": "المساعده", "replacement": "المساعدة"},
            {"type": "autocorrect", "ts": 2, "lang": "ar", "original": "النضام", "replacement": "النظام"},
            {"type": "revert", "ts": 3, "lang": "ar", "original": "النضام", "replacement": "النظام"},
        ]
        ar = summarize(events)["spelling"]["ar"]
        assert ar["errorTypes"] == {"hamza": 1, "ta-marbuta": 1, "emphatic": 1}
        assert ar["revertsByType"]["emphatic"] == {"autocorrects": 1, "reverts": 1, "revertRate": 1}
        assert "ar: error types in the field" in render_summary(summarize(events))


class TestWithheldCompletions:
    def test_stores_only_an_allowed_reason_never_text(self):
        assert sanitize({"type": "completion-withheld", "ts": 1, "lang": "en", "reason": "figure", "completion": " within 3 days"}) == {
            "type": "completion-withheld",
            "ts": 1,
            "lang": "en",
            "reason": "figure",
        }
        assert sanitize({"type": "completion-withheld", "ts": 1, "reason": "secret text"}) == {"type": "completion-withheld", "ts": 1}
        assert sanitize({"type": "completion-shown", "ts": 1, "reason": "figure"}) == {"type": "completion-shown", "ts": 1}

    def test_counts_withheld_completions_by_reason_next_to_those_shown(self):
        def ev(t, reason=None):
            return {"type": t, "ts": 1, "lang": "en", **({"reason": reason} if reason else {})}

        events = [*(ev("completion-shown") for _ in range(10)), *(ev("completion-withheld", "figure") for _ in range(3)), ev("completion-withheld", "conversation")]
        s = summarize(events)
        assert s["completion"]["withheld"] == {"figure": 3, "date": 0, "identifier": 0, "conversation": 1, "format": 0, "spelling": 0}
        assert "figure 3 · date 0 · identifier 0 · conversation 1 · format 0 · spelling 0 · next to 10 shown" in render_summary(s)

    def test_keeps_reason_spelling_and_counts_it(self):
        assert sanitize({"type": "completion-withheld", "ts": 1, "lang": "en", "reason": "spelling", "word": "ben"}) == {
            "type": "completion-withheld",
            "ts": 1,
            "lang": "en",
            "reason": "spelling",
        }
        ev = lambda r: {"type": "completion-withheld", "ts": 1, "lang": "en", "reason": r}  # noqa: E731
        w = summarize([ev("spelling"), ev("spelling"), ev("figure")])["completion"]["withheld"]
        assert (w["spelling"], w["figure"]) == (2, 1)

    def test_keeps_reason_format_and_counts_it(self):
        assert sanitize({"type": "completion-withheld", "ts": 1, "lang": "ar", "reason": "format", "raw": '{"word":"x"}'}) == {
            "type": "completion-withheld",
            "ts": 1,
            "lang": "ar",
            "reason": "format",
        }
        s = summarize([{"type": "completion-withheld", "ts": 1, "lang": "en", "reason": "format"}] * 4)
        assert s["completion"]["withheld"]["format"] == 4
        assert "format 4" in render_summary(s)

    def test_labels_withheld_completions_without_req_3_7(self):
        html = render_summary(summarize([{"type": "completion-withheld", "ts": 1, "lang": "en", "reason": "format"}]))
        assert "Completions withheld<div" in html
        assert "Req 3.7" not in html


def test_appended_lines_are_compact_json_like_the_node_server(tmp_path):
    file = tmp_path / "e.jsonl"
    append_events(file, [{"type": "accept", "ts": 1, "lang": "ar", "original": "اذا", "replacement": "إذا"}])
    line = file.read_text("utf-8").strip()
    assert json.loads(line)["original"] == "اذا"
    assert ", " not in line and "\\u" not in line


class TestSpellingErrorEvents:
    def test_flag_stores_only_the_allowed_fields(self):
        assert sanitize({"type": "flag", "ts": 1, "lang": "en", "session": "s", "original": "chek", "text": "please chek the form", "prefix": "x"}) == {
            "type": "flag",
            "ts": 1,
            "lang": "en",
            "session": "s",
            "original": "chek",
        }

    def test_unresolved_stores_only_the_allowed_fields(self):
        assert sanitize({"type": "unresolved", "ts": 1, "lang": "ar", "original": "النضام", "message": "secret"}) == {
            "type": "unresolved",
            "ts": 1,
            "lang": "ar",
            "original": "النضام",
        }

    def test_accept_keeps_rank_and_offered(self):
        e = sanitize({"type": "accept", "ts": 1, "lang": "en", "original": "recieve", "replacement": "relieve", "rank": 2, "offered": 4})
        assert (e["rank"], e["offered"], e["replacement"]) == (2, 4, "relieve")

    def test_flags_and_unresolved_leave_the_field_figures_unchanged(self):
        base = [
            {"type": "autocorrect", "ts": 0, "lang": "en", "original": "seperate", "replacement": "separate"},
            {"type": "accept", "ts": 1, "lang": "en", "original": "recieve", "replacement": "receive"},
        ]
        extra = [
            {"type": "flag", "ts": 2, "lang": "en", "original": "chek"},
            {"type": "unresolved", "ts": 3, "lang": "en", "original": "chek"},
            {"type": "flag", "ts": 4, "lang": "ar", "original": "النضام"},
        ]
        assert summarize(base + extra)["spelling"] == summarize(base)["spelling"]
