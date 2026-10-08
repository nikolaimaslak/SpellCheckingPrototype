"""Service runtime (assist-service): body handling, error shape, headers, health, telemetry routes."""

import json

from tests.helpers import client, fake_client

CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-private-network": "true",
    "cache-control": "no-store",
}


def test_invalid_json(tmp_path):
    res = fake_client(tmp_path).post("/v1/complete", content=b'{"prefix":', headers={"content-type": "application/json"})
    assert (res.status_code, res.json()) == (400, {"error": "bad request"})


def test_body_too_large(tmp_path, scripted):
    res = client(tmp_path).post("/v1/polish", content=json.dumps({"text": "x" * 100 * 1024}).encode())
    assert (res.status_code, res.json()) == (400, {"error": "bad request"})
    assert scripted.calls == []


def test_validation_error_keeps_the_contract(tmp_path):
    res = fake_client(tmp_path).post("/v1/complete", json={"prefix": 42})
    assert (res.status_code, res.json()) == (400, {"error": "prefix is required"})


def test_cross_origin_preflight(tmp_path):
    res = fake_client(tmp_path).options("/v1/complete", headers={"origin": "https://agent.example.com", "access-control-request-method": "POST"})
    assert res.status_code == 204
    assert {k: res.headers[k] for k in CORS} == CORS


def test_headers_on_every_reply(tmp_path):
    c = fake_client(tmp_path)
    for res in (c.get("/health"), c.post("/v1/complete", json={"prefix": "hello there friend"}), c.get("/nope")):
        assert {k: res.headers[k] for k in CORS} == CORS


def test_unknown_path_or_method_is_not_found(tmp_path):
    c = fake_client(tmp_path)
    for res in (c.get("/nope"), c.get("/v1/complete"), c.post("/health")):
        assert (res.status_code, res.json()) == (404, {"error": "not found"})


def test_no_framework_pages(tmp_path):
    c = fake_client(tmp_path)
    assert c.get("/docs").status_code == 404
    assert c.get("/openapi.json").status_code == 404


class TestHealth:
    def test_offline_model(self, tmp_path):
        res = client(tmp_path, {}).get("/health").json()
        assert res == {"ok": True, "model": "fake", "mode": "auto", "external": False, "cache": False, "capture": "off"}

    def test_gemini(self, tmp_path):
        assert client(tmp_path).get("/health").json() == {
            "ok": True,
            "model": "gemini-3.5-flash-lite",
            "mode": "auto",
            "external": True,
            "cache": False,
            "capture": "off",
        }

    def test_gemini_forced_without_a_key_still_serves_telemetry(self, tmp_path):
        c = client(tmp_path, {"COMPLETION_MODEL": "gemini"})
        assert c.get("/health").json()["model"] is None
        res = c.post("/v1/complete", json={"prefix": "Thank you, your request"})
        assert res.status_code == 503 and "unavailable" in res.json()["error"]
        assert c.post("/v1/polish", json={"text": "hello there"}).status_code == 503
        assert c.post("/v1/events", json=[{"type": "accept", "ts": 1}]).json() == {"stored": 1}

    def test_local_model(self, tmp_path):
        res = client(tmp_path, {"COMPLETION_MODEL": "ollama_chat/qwen3:8b"}).get("/health").json()
        assert (res["model"], res["mode"], res["external"]) == ("ollama_chat/qwen3:8b", "id", False)

    def test_cache_reported(self, tmp_path):
        assert client(tmp_path, {"COMPLETION_MODEL": "fake", "ASSIST_LLM_CACHE": "on"}).get("/health").json()["cache"] is True


class TestTelemetryRoutes:
    def test_batch_of_two_appends_two_lines(self, tmp_path):
        c = fake_client(tmp_path)
        res = c.post("/v1/events", json=[{"type": "completion-shown", "ts": 1, "lang": "en", "latencyMs": 500, "text": "secret"}, {"type": "accept", "ts": 2}])
        assert res.json() == {"stored": 2}
        lines = (tmp_path / "telemetry" / "events.jsonl").read_text("utf-8").strip().split("\n")
        assert len(lines) == 2 and "secret" not in lines[0]

    def test_summary_shows_withheld_counts(self, tmp_path):
        c = fake_client(tmp_path)
        c.post("/v1/events", json=[{"type": "completion-withheld", "ts": 1, "lang": "en", "reason": "format"}] * 3)
        res = c.get("/summary")
        assert res.headers["content-type"].startswith("text/html")
        assert "format 3" in res.text
