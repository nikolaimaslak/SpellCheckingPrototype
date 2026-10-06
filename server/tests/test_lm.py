import asyncio

import dspy
import litellm
import pytest
from dspy.utils.exceptions import AdapterParseError

from assist.lm import CACHE_DIR, build_lm, classify_error, configure_cache, running
from assist.programs import CompletionProgram
from assist.settings import select_model

GEMINI = select_model({"GEMINI_API_KEY": "test-key"})[0]
ANSWER = '{"continuation": " is received."}'


def call(lm, agent_text="Thank you, your request"):
    async def go():
        with running(lm):
            return await CompletionProgram().acall(agent_text=agent_text, conversation=[], approved_responses=[], knowledge_base=[])

    return asyncio.run(go())


class TestBuild:
    def test_no_lm_for_the_offline_model_or_without_a_model(self):
        assert build_lm(select_model({})[0], cache=False) is None
        assert build_lm(select_model({"COMPLETION_MODEL": "gemini"})[0], cache=False) is None

    def test_settings_of_a_real_model(self):
        lm = build_lm(GEMINI, cache=False)
        assert lm.model == "gemini/gemini-3.5-flash-lite"
        assert (lm.kwargs["temperature"], lm.kwargs["max_tokens"], lm.num_retries, lm.cache) == (0.2, 64, 0, False)
        assert lm.kwargs["reasoning_effort"] == "minimal" and lm.kwargs["drop_params"] is True

    def test_local_model_gets_its_api_base(self):
        lm = build_lm(select_model({"COMPLETION_MODEL": "ollama_chat/qwen3:8b", "COMPLETION_API_BASE": "http://127.0.0.1:11434"})[0], cache=False)
        assert lm.model == "ollama_chat/qwen3:8b" and lm.kwargs["api_base"] == "http://127.0.0.1:11434"

    def test_outgoing_request(self, scripted):
        scripted.answer(ANSWER)
        call(build_lm(GEMINI, cache=False))
        sent = scripted.calls[0]
        assert (sent["model"], sent["temperature"], sent["max_tokens"], sent["num_retries"]) == ("gemini/gemini-3.5-flash-lite", 0.2, 64, 0)
        assert sent["response_format"].model_json_schema()["required"] == ["continuation"]
        assert sent["reasoning_effort"] == "minimal"


class TestCache:
    def test_off_by_default_every_call_reaches_the_model_and_nothing_is_written(self, scripted, tmp_path):
        def snapshot():
            return {(p, p.stat().st_mtime_ns) for p in CACHE_DIR.rglob("*")} if CACHE_DIR.exists() else set()

        before = snapshot()
        scripted.answer(ANSWER, ANSWER)
        lm = build_lm(GEMINI, cache=False)
        call(lm)
        call(lm)
        assert len(scripted.calls) == 2
        # A developer's own cache-on runs may have created .cache/llm/; with the cache off nothing in it changes.
        assert snapshot() == before

    def test_on_the_second_identical_call_is_served_from_the_cache(self, scripted, tmp_path):
        configure_cache(True, tmp_path / "llm")
        scripted.answer(ANSWER, ANSWER)
        lm = build_lm(GEMINI, cache=True)
        first, second = call(lm), call(lm)
        assert (first.continuation, second.continuation) == (" is received.", " is received.")
        assert len(scripted.calls) == 1
        assert any((tmp_path / "llm").rglob("*"))


class TestNothingKept:
    def test_history_stays_empty(self, scripted):
        scripted.answer(ANSWER)
        lm = build_lm(GEMINI, cache=False)
        call(lm)
        assert lm.history == []
        from dspy.clients.base_lm import GLOBAL_HISTORY

        assert all("Thank you, your request" not in str(entry) for entry in GLOBAL_HISTORY)

    def test_the_key_is_not_in_the_lm_state(self):
        assert "test-key" not in str(build_lm(GEMINI, cache=False).dump_state())


class TestOneCallAndErrors:
    def test_unparseable_output_is_format_after_exactly_one_call(self, scripted):
        scripted.answer('{"continuation": 5}')
        with pytest.raises(Exception) as err:
            call(build_lm(GEMINI, cache=False))
        assert classify_error(err.value) == "format"
        assert len(scripted.calls) == 1

    def test_provider_rejecting_structured_output_is_failed_after_one_call(self, scripted):
        scripted.answer(litellm.exceptions.BadRequestError(message="response_format not supported", model="m", llm_provider="gemini"))
        with pytest.raises(Exception) as err:
            call(build_lm(GEMINI, cache=False))
        assert classify_error(err.value) == "failed"
        assert len(scripted.calls) == 1

    def test_timeout(self, scripted):
        scripted.answer(litellm.exceptions.Timeout(message="slow", model="m", llm_provider="gemini"))
        with pytest.raises(Exception) as err:
            call(build_lm(GEMINI, cache=False))
        assert classify_error(err.value) == "timeout"
        assert len(scripted.calls) == 1

    @pytest.mark.parametrize(
        ("err", "kind"),
        [
            (asyncio.TimeoutError(), "timeout"),
            (AdapterParseError(adapter_name="x", signature=dspy.Signature, lm_response="r"), "format"),
            (RuntimeError("boom"), "failed"),
        ],
    )
    def test_classify(self, err, kind):
        assert classify_error(err) == kind
