"""Builds the app under test with given settings; the telemetry log goes to a temporary file."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from fastapi.testclient import TestClient

from assist.app import create_app
from assist.settings import load_settings

GEMINI_ENV = {"GEMINI_API_KEY": "test-key"}


def client(tmp_path: Path, env: dict[str, str] | None = None) -> TestClient:
    settings = replace(load_settings(env if env is not None else GEMINI_ENV), events_path=tmp_path / "telemetry" / "events.jsonl", cache_dir=tmp_path / "llm-cache")
    return TestClient(create_app(settings), raise_server_exceptions=False)


def fake_client(tmp_path: Path) -> TestClient:
    return client(tmp_path, {"COMPLETION_MODEL": "fake"})
