import pytest

from assist.settings import load_dotenv, load_settings, select_model


def model(env):
    return select_model(env)[0]


class TestSelectModel:
    """Same cases as the former test/server/model-select.test.ts, plus provider-qualified ids."""

    def test_auto_without_a_key_uses_the_offline_model(self):
        assert (model({}).mode, model({}).external, model({}).name) == ("auto", False, "fake")
        assert model({"GEMINI_API_KEY": "  "}).name == "fake"

    def test_auto_with_a_key_uses_gemini_and_reports_external(self):
        m = model({"GEMINI_API_KEY": "k"})
        assert (m.mode, m.external, m.name, m.lm_id) == ("auto", True, "gemini-3.5-flash-lite", "gemini/gemini-3.5-flash-lite")

    def test_gemini_without_a_key_is_unavailable(self):
        m = model({"COMPLETION_MODEL": "gemini"})
        assert (m.mode, m.lm_id, m.name, m.external) == ("gemini", None, None, False)

    def test_fake_ignores_the_key(self):
        m = model({"COMPLETION_MODEL": "fake", "GEMINI_API_KEY": "k"})
        assert (m.mode, m.external, m.name) == ("fake", False, "fake")

    def test_an_empty_value_means_auto_without_a_warning(self):
        m, warning = select_model({"COMPLETION_MODEL": ""})
        assert m.mode == "auto" and warning is None

    def test_unknown_values_fall_back_to_auto_with_a_warning(self):
        m, warning = select_model({"COMPLETION_MODEL": "gpt"})
        assert m.mode == "auto"
        assert "unknown COMPLETION_MODEL" in warning

    def test_local_model_by_id(self):
        m = model({"COMPLETION_MODEL": "ollama_chat/qwen3:8b"})
        assert (m.mode, m.lm_id, m.name, m.external) == ("id", "ollama_chat/qwen3:8b", "ollama_chat/qwen3:8b", False)

    def test_model_on_a_remote_endpoint(self):
        m = model({"COMPLETION_MODEL": "hosted_vllm/some-model", "COMPLETION_API_BASE": "https://llm.example.com/v1"})
        assert m.external is True and m.api_base == "https://llm.example.com/v1"

    @pytest.mark.parametrize("base", ["http://localhost:8000/v1", "http://127.0.0.1:11434", "http://[::1]:8000"])
    def test_model_on_a_loopback_endpoint_stays_local(self, base):
        assert model({"COMPLETION_MODEL": "hosted_vllm/m", "COMPLETION_API_BASE": base}).external is False

    def test_local_provider_pointed_elsewhere_is_external(self):
        assert model({"COMPLETION_MODEL": "ollama_chat/m", "COMPLETION_API_BASE": "http://gpu.example.com:11434"}).external is True

    def test_unknown_provider_without_a_base_is_external(self):
        assert model({"COMPLETION_MODEL": "openai/gpt-x"}).external is True

    def test_key_is_not_in_the_repr(self):
        assert "secret-key" not in repr(model({"GEMINI_API_KEY": "secret-key"}))


class TestSettings:
    def test_defaults(self):
        s = load_settings({})
        assert (s.port, s.cache, s.max_turns, s.warnings) == (5175, False, None, ())

    def test_cache_on(self):
        assert load_settings({"ASSIST_LLM_CACHE": "on"}).cache is True

    def test_unknown_cache_value_stays_off_with_a_warning(self):
        s = load_settings({"ASSIST_LLM_CACHE": "yes"})
        assert s.cache is False and "ASSIST_LLM_CACHE" in s.warnings[0]

    def test_turn_limit(self):
        assert load_settings({"COMPLETION_MAX_TURNS": "6"}).max_turns == 6

    @pytest.mark.parametrize("raw", ["0", "all", "-3", "2.5"])
    def test_invalid_turn_limit_means_the_full_conversation_with_a_warning(self, raw):
        s = load_settings({"COMPLETION_MAX_TURNS": raw})
        assert s.max_turns is None and "COMPLETION_MAX_TURNS" in s.warnings[0]


class TestDotenv:
    def test_environment_wins_over_dotenv(self, tmp_path):
        f = tmp_path / ".env"
        f.write_text("COMPLETION_MODEL=gemini\nGEMINI_API_KEY='abc'\n# comment\nlower=x\n", "utf-8")
        env = {"COMPLETION_MODEL": "fake"}
        load_dotenv(f, env)
        assert env == {"COMPLETION_MODEL": "fake", "GEMINI_API_KEY": "abc"}
        assert model(env).name == "fake"

    def test_missing_file_is_fine(self, tmp_path):
        env: dict[str, str] = {}
        load_dotenv(tmp_path / "none", env)
        assert env == {}
