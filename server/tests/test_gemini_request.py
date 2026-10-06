"""The HTTP request a Gemini completion sends, captured offline at LiteLLM's HTTP client."""

import asyncio
import json

import httpx
import pytest
from litellm.llms.custom_httpx.http_handler import AsyncHTTPHandler

from assist.lm import build_lm, running
from assist.programs import CompletionProgram
from assist.settings import select_model


@pytest.fixture
def gemini_http(monkeypatch):
    sent: dict = {}

    async def post(self, url, data=None, json=None, params=None, headers=None, timeout=None, stream=False, **kwargs):
        import json as j

        sent.update(url=url, headers=headers, body=j.loads(data) if isinstance(data, (str, bytes)) else json)
        reply = {
            "candidates": [{"content": {"parts": [{"text": '{"continuation": " is received."}'}], "role": "model"}, "finishReason": "STOP"}],
            "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1, "totalTokenCount": 2},
        }
        return httpx.Response(200, json=reply, request=httpx.Request("POST", url))

    monkeypatch.setattr(AsyncHTTPHandler, "post", post)
    return sent


def test_gemini_request_settings(gemini_http):
    lm = build_lm(select_model({"GEMINI_API_KEY": "test-key"})[0], cache=False)

    async def go():
        with running(lm):
            return await CompletionProgram().acall(agent_text="Thank you, your request", conversation=[], approved_responses=[], knowledge_base=[])

    p = asyncio.run(go())
    assert p.continuation == " is received."

    assert "gemini-3.5-flash-lite:generateContent" in gemini_http["url"]
    config = gemini_http["body"]["generationConfig"]
    assert config["temperature"] == 0.2
    # LiteLLM writes the proto field names in snake_case, which the Gemini REST API accepts.
    assert config["max_output_tokens"] == 64
    assert config["response_mime_type"] == "application/json"
    schema = config["response_json_schema"]
    assert set(schema["properties"]) == {"continuation"} and schema["required"] == ["continuation"]
    assert config["thinkingConfig"]["thinkingLevel"] == "minimal"
    assert "stopSequences" not in config and "stop_sequences" not in config
    # The key travels in a header only, never in the URL.
    assert "test-key" not in gemini_http["url"]
    assert "test-key" in json.dumps(gemini_http["headers"])
