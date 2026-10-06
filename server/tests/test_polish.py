"""POST /v1/polish, case for case with the former test/server/polish.test.ts."""

import asyncio
import json

import litellm
import pytest

from assist.lm import build_lm
from assist.polish import PolishDeps, clean_output, polish, safety_check
from assist.programs import PolishDraft, build_programs
from assist.settings import select_model
from tests.helpers import client, fake_client


def returning(scripted, out: str):
    scripted.answer(json.dumps({"polished": out}, ensure_ascii=False))


class TestPolish:
    def test_returns_english_corrections_from_the_model(self, tmp_path):
        res = fake_client(tmp_path).post("/v1/polish", json={"text": "He go to the office yesterday and buyed a pen."})
        assert res.status_code == 200
        assert {k: res.json()[k] for k in ("polished", "changed", "lang", "model")} == {
            "polished": "He went to the office yesterday and bought a pen.",
            "changed": True,
            "lang": "en",
            "model": "fake",
        }

    def test_returns_arabic_corrections(self, tmp_path):
        res = fake_client(tmp_path).post("/v1/polish", json={"text": "تم استلام هذه الطلب وسيتم معالجته."}).json()
        assert (res["polished"], res["changed"], res["lang"]) == ("تم استلام هذا الطلب وسيتم معالجته.", True, "ar")

    def test_reports_no_change_when_the_model_returns_the_same_text(self, tmp_path, scripted):
        returning(scripted, "Your request has been received.")
        res = client(tmp_path).post("/v1/polish", json={"text": "Your request has been received."}).json()
        assert res["changed"] is False and "reason" not in res

    @pytest.mark.parametrize(
        ("text", "out"),
        [
            ("Dear $(user.firstName), your request is ready.", "Dear user, your request is ready."),
            ("Visit https://example.org/a for details.", "Visit https://example.org/b for details."),
            ("Your case CS-104233 is open.", "Your case CS-104234 is open."),
        ],
        ids=["a substitution field", "a URL", "a reference number"],
    )
    def test_rejects_a_change_to_protected_content(self, tmp_path, scripted, text, out):
        returning(scripted, out)
        res = client(tmp_path).post("/v1/polish", json={"text": text}).json()
        assert (res["polished"], res["changed"]) == (text, False)
        assert "protected" in res["reason"]

    def test_rejects_rewrites_that_are_too_short_or_too_long(self, tmp_path, scripted):
        text = "He go to the office yesterday and buyed a pen for the meeting."
        c = client(tmp_path)
        returning(scripted, "He went.")
        assert "rewrite" in c.post("/v1/polish", json={"text": text}).json()["reason"]
        returning(scripted, text + " " + text)
        assert "rewrite" in c.post("/v1/polish", json={"text": text}).json()["reason"]

    def test_keeps_the_drafts_surrounding_whitespace(self, tmp_path, scripted):
        returning(scripted, "He went to the office.")
        res = client(tmp_path).post("/v1/polish", json={"text": "He go to the office.\n"}).json()
        assert (res["polished"], res["changed"]) == ("He went to the office.\n", True)

    def test_rejects_a_change_in_line_breaks(self, tmp_path, scripted):
        returning(scripted, "Hello, he went to the office.")
        assert "line breaks" in client(tmp_path).post("/v1/polish", json={"text": "Hello,\nhe go to the office."}).json()["reason"]

    def test_cleans_fenced_and_quoted_output(self):
        assert clean_output("```\nHe went home.\n```") == "He went home."
        assert clean_output('"He went home."') == "He went home."
        assert clean_output("He went\r\nhome.") == "He went\nhome."

    def test_fenced_answer_inside_the_field(self, tmp_path, scripted):
        returning(scripted, "```\nHe went home.\n```")
        assert client(tmp_path).post("/v1/polish", json={"text": "He go home."}).json()["polished"] == "He went home."

    def test_rejects_empty_and_oversized_drafts_and_answers_503_without_a_model(self, tmp_path):
        c = fake_client(tmp_path)
        assert c.post("/v1/polish", json={"text": "  "}).status_code == 400
        assert c.post("/v1/polish", json={"text": "x" * 4001}).status_code == 400
        assert client(tmp_path, {"COMPLETION_MODEL": "gemini"}).post("/v1/polish", json={"text": "hello there"}).status_code == 503

    def test_maps_model_failures_without_leaking_the_key(self, tmp_path, scripted):
        scripted.answer(litellm.exceptions.APIError(status_code=403, message="403 key=SECRET", llm_provider="gemini", model="m"))
        res = client(tmp_path).post("/v1/polish", json={"text": "He go home."})
        assert res.status_code == 502 and "SECRET" not in res.text

    def test_timeout(self, scripted):
        scripted.answer(json.dumps({"polished": "He went home."}))
        scripted.delay = 0.5
        _, program = build_programs(None, fake=False)
        deps = PolishDeps(program, build_lm(select_model({"GEMINI_API_KEY": "k"})[0], False), True, "x", timeout=0.05)
        assert asyncio.run(polish({"text": "He go home."}, deps)) == (504, {"error": "polish model timed out"})

    def test_unusable_answer_returns_the_draft_with_a_reason(self, tmp_path, scripted):
        scripted.answer('{"polished": 42}')
        res = client(tmp_path).post("/v1/polish", json={"text": "He go home."}).json()
        assert (res["polished"], res["changed"]) == ("He go home.", False) and res["reason"]
        assert len(scripted.calls) == 1

    def test_scales_the_output_limit_with_the_draft(self, tmp_path, scripted):
        returning(scripted, "He went home.")
        client(tmp_path).post("/v1/polish", json={"text": "He go home."})
        assert scripted.calls[0]["max_tokens"] == 6 + 64

    def test_asks_for_grammar_only_edits_with_protected_content_kept(self):
        assert "Fix only errors" in PolishDraft.instructions
        assert "placeholder" in PolishDraft.instructions
        assert safety_check("a b", "a b") is None
