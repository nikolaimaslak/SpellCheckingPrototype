"""Every completion and polish request yields one observation: reasons, input, raw output, what was shown."""

import asyncio
import json

import litellm

from assist.complete import CompletionDeps, complete
from assist.lm import build_lm
from assist.polish import PolishDeps, polish
from assist.programs import build_programs
from assist.retrieval import load_library
from assist.settings import select_model

GEMINI = select_model({"GEMINI_API_KEY": "test-key"})[0]


def run_complete(prefix, transcript=(), timeout=2.0):
    seen = []
    program, _ = build_programs(None, fake=False)
    deps = CompletionDeps(program, build_lm(GEMINI, False), True, "gemini-x", load_library(), timeout=timeout, observe=seen.append)
    status, body = asyncio.run(complete({"prefix": prefix, "transcript": list(transcript)}, deps))
    return status, body, seen


def run_polish(text):
    seen = []
    _, program = build_programs(None, fake=False)
    deps = PolishDeps(program, build_lm(GEMINI, False), True, "gemini-x", observe=seen.append)
    status, body = asyncio.run(polish({"text": text}, deps))
    return status, body, seen


def cont(text):
    return json.dumps({"continuation": text}, ensure_ascii=False)


class TestCompletion:
    def test_clean_answer(self, scripted):
        scripted.answer(cont(" will be processed soon."))
        _, body, [obs] = run_complete("Thank you, your request", [{"role": "customer", "text": "When?"}])
        assert (obs.endpoint, obs.reasons, obs.raw, obs.output) == ("complete", [], " will be processed soon.", " will be processed soon.")
        assert obs.input["agent_text"] == "Thank you, your request" and obs.input["conversation"] == [{"role": "customer", "text": "When?"}]
        assert (obs.model, obs.lang, obs.failed, obs.repaired) == ("gemini-x", "en", False, False)

    def test_format_keeps_the_unparseable_text(self, scripted):
        scripted.answer("Sure! here you go")
        _, body, [obs] = run_complete("Thank you, your request")
        assert body["withheld"] == "format"
        assert (obs.reasons, obs.raw, obs.output, obs.failed) == (["format"], "Sure! here you go", "", True)

    def test_timeout(self, scripted):
        scripted.answer(litellm.exceptions.Timeout(message="slow", model="m", llm_provider="gemini"))
        status, _, [obs] = run_complete("Thank you, your request")
        assert status == 504 and (obs.reasons, obs.raw) == (["timeout"], None)

    def test_failure(self, scripted):
        scripted.answer(litellm.exceptions.APIError(status_code=500, message="boom", llm_provider="gemini", model="m"))
        status, _, [obs] = run_complete("Thank you, your request")
        assert status == 502 and obs.reasons == ["failed"]

    def test_empty_answer_is_informational(self, scripted):
        scripted.answer(cont(""))
        _, body, [obs] = run_complete("Thank you, your request")
        assert body["completion"] == "" and "withheld" not in body
        assert (obs.reasons, obs.failed, obs.repaired) == (["empty-answer"], False, False)

    def test_repaired_arabic_answer(self, scripted):
        scripted.answer(cont("م طلبك وسيتم معالجته. شكراً لك"))
        _, body, [obs] = run_complete("تم استلا")
        assert body["completion"] == "م طلبك وسيتم معالجته."
        assert (obs.reasons, obs.raw, obs.lang, obs.repaired) == (["multi-sentence"], "م طلبك وسيتم معالجته. شكراً لك", "ar", True)


class TestPolish:
    def test_protected_content(self, scripted):
        scripted.answer(json.dumps({"polished": "Dear user, your request is ready."}))
        _, body, [obs] = run_polish("Dear $(user.firstName), your request is ready.")
        assert body["changed"] is False
        assert (obs.endpoint, obs.reasons, obs.raw, obs.output) == ("polish", ["protected-changed"], "Dear user, your request is ready.", "Dear $(user.firstName), your request is ready.")

    def test_arabic_wrapped_then_shown(self, scripted):
        scripted.answer(json.dumps({"polished": "«تم استلام هذا الطلب.»"}, ensure_ascii=False))
        _, body, [obs] = run_polish("تم استلام هذه الطلب.")
        assert body["polished"] == "تم استلام هذا الطلب."
        assert (obs.reasons, obs.lang, obs.repaired, obs.failed) == (["wrapped"], "ar", True, False)

    def test_format_and_empty(self, scripted):
        scripted.answer('{"polished": 42}', json.dumps({"polished": ""}))
        _, _, [a] = run_polish("He go home.")
        _, _, [b] = run_polish("He go home.")
        assert (a.reasons, a.raw) == (["format"], '{"polished": 42}')
        assert b.reasons == ["empty"]
