"""Server settings from the environment and the repository's .env: port, model, cache, conversation length."""

from __future__ import annotations

import ipaddress
import os
from collections.abc import Mapping, MutableMapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

import regex

ROOT = Path(__file__).resolve().parents[2]
GEMINI_MODEL = "gemini-3.5-flash-lite"
# Providers that run on this machine when no API base points elsewhere.
LOCAL_PROVIDERS = frozenset({"ollama", "ollama_chat"})

ModelMode = Literal["auto", "gemini", "fake", "id"]

_ENV_LINE = regex.compile(r"^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$")
_QUOTED = regex.compile(r"^(['\"])(.*)\1$")


def load_dotenv(path: Path, environ: MutableMapping[str, str] = os.environ) -> None:
    """Minimal .env loader (KEY=value lines); variables already in the environment win."""
    if not path.exists():
        return
    for line in path.read_text("utf-8").split("\n"):
        m = _ENV_LINE.match(line)
        if m and m.group(1) not in environ:
            environ[m.group(1)] = _QUOTED.sub(r"\2", m.group(2))


@dataclass(frozen=True)
class ModelChoice:
    mode: ModelMode
    # LiteLLM model id ("gemini/gemini-3.5-flash-lite", "ollama_chat/qwen3:8b"), "fake", or None when unavailable.
    lm_id: str | None
    # The name replies and /health report.
    name: str | None
    # True when requests send text outside this machine.
    external: bool
    api_base: str | None = None
    api_key: str | None = field(default=None, repr=False)


@dataclass(frozen=True)
class Settings:
    port: int
    model: ModelChoice
    cache: bool
    # None: the full conversation goes to the model.
    max_turns: int | None
    events_path: Path
    cache_dir: Path
    # off | errors | all: the opt-in capture log of LLM requests and answers (holds text).
    capture: str = "off"
    capture_path: Path = ROOT / "capture" / "llm.jsonl"
    warnings: tuple[str, ...] = ()


def _is_loopback(api_base: str) -> bool:
    host = urlparse(api_base if "//" in api_base else f"//{api_base}").hostname or ""
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def select_model(env: Mapping[str, str]) -> tuple[ModelChoice, str | None]:
    """
    COMPLETION_MODEL: auto (default) = Gemini with GEMINI_API_KEY, otherwise the
    offline test model; gemini = Gemini only (unavailable without a key);
    fake = offline test model only; <provider>/<model> = that LiteLLM model,
    reached at COMPLETION_API_BASE when set. Returns the choice and a warning.
    """
    raw = (env.get("COMPLETION_MODEL") or "auto").strip()
    key = (env.get("GEMINI_API_KEY") or "").strip() or None
    api_base = (env.get("COMPLETION_API_BASE") or "").strip() or None

    if "/" in raw:
        provider = raw.split("/", 1)[0].lower()
        local = _is_loopback(api_base) if api_base else provider in LOCAL_PROVIDERS
        return ModelChoice("id", raw, raw, external=not local, api_base=api_base), None

    mode = raw.lower()
    warning = None
    if mode not in ("auto", "gemini", "fake"):
        warning = f'unknown COMPLETION_MODEL "{raw}", using auto'
        mode = "auto"
    if mode == "fake" or (mode == "auto" and not key):
        return ModelChoice(mode, "fake", "fake", external=False), warning  # type: ignore[arg-type]
    if not key:
        return ModelChoice("gemini", None, None, external=False), warning
    return ModelChoice(mode, f"gemini/{GEMINI_MODEL}", GEMINI_MODEL, external=True, api_key=key), warning  # type: ignore[arg-type]


def _max_turns(raw: str | None) -> tuple[int | None, str | None]:
    if raw is None or not raw.strip():
        return None, None
    if raw.strip().isdigit() and int(raw) > 0:
        return int(raw), None
    return None, f'COMPLETION_MAX_TURNS "{raw}" is not a positive whole number, passing the full conversation'


def _cache(raw: str | None) -> tuple[bool, str | None]:
    value = (raw or "off").strip().lower()
    if value in ("on", "off"):
        return value == "on", None
    return False, f'ASSIST_LLM_CACHE "{raw}" is not on or off, leaving the cache off'


def _capture(raw: str | None) -> tuple[str, str | None]:
    value = (raw or "off").strip().lower()
    if value in ("off", "errors", "all"):
        return value, None
    return "off", f'ASSIST_CAPTURE "{raw}" is not off, errors or all, leaving capture off'


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    """Settings from `env` (default: the process environment after loading the repository's .env)."""
    if env is None:
        load_dotenv(ROOT / ".env")
        env = os.environ
    model, w1 = select_model(env)
    max_turns, w2 = _max_turns(env.get("COMPLETION_MAX_TURNS"))
    cache, w3 = _cache(env.get("ASSIST_LLM_CACHE"))
    capture, w4 = _capture(env.get("ASSIST_CAPTURE"))
    return Settings(
        port=int(env.get("PORT") or 5175),
        model=model,
        cache=cache,
        max_turns=max_turns,
        events_path=ROOT / "telemetry" / "events.jsonl",
        cache_dir=ROOT / ".cache" / "llm",
        capture=capture,
        warnings=tuple(w for w in (w1, w2, w3, w4) if w),
    )
