from assist.__main__ import HOST, startup_line, uvicorn_config
from assist.settings import load_settings


def test_binds_to_loopback_only():
    config = uvicorn_config(load_settings({"COMPLETION_MODEL": "fake", "PORT": "5199"}))
    assert (HOST, config.host, config.port) == ("127.0.0.1", "127.0.0.1", 5199)


def test_startup_line_names_the_model_and_where_text_goes():
    assert "offline test model" in startup_line(load_settings({}))
    assert "sent outside this machine" in startup_line(load_settings({"GEMINI_API_KEY": "k"}))
    assert "stays on this machine" in startup_line(load_settings({"COMPLETION_MODEL": "ollama_chat/qwen3:8b"}))
    assert "unavailable" in startup_line(load_settings({"COMPLETION_MODEL": "gemini"}))
    assert "LLM cache: on" in startup_line(load_settings({"ASSIST_LLM_CACHE": "on"}))


def test_startup_line_never_shows_the_key():
    assert "secret-key" not in startup_line(load_settings({"GEMINI_API_KEY": "secret-key"}))
