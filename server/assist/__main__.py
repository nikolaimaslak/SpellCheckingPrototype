"""Dev stand-in for the Intelligence Engine: inline completion, grammar polish and assistance telemetry.

Usage: uv run --project server python -m assist
(env: GEMINI_API_KEY, COMPLETION_MODEL=auto|gemini|fake|<provider>/<model>, COMPLETION_API_BASE,
COMPLETION_MAX_TURNS, ASSIST_LLM_CACHE=on|off, PORT; a .env at the repository root is read too)
"""

from __future__ import annotations

import uvicorn

from .app import create_app
from .settings import Settings, load_settings

# Loopback only: the endpoint (and the key's quota) is never exposed to the network.
HOST = "127.0.0.1"


def startup_line(settings: Settings) -> str:
    m = settings.model
    if not m.name:
        where = "unavailable (COMPLETION_MODEL=gemini needs GEMINI_API_KEY)"
    elif m.name == "fake":
        where = f"{m.name} (offline test model: canned results, nothing leaves this machine)"
    elif m.external:
        where = f"{m.name} (typed text is sent outside this machine: use made-up text only)"
    else:
        where = f"{m.name} (local model: text stays on this machine)"
    cache = "on (.cache/llm/ stores the text sent to the model)" if settings.cache else "off"
    capture = "off" if settings.capture == "off" else f"{settings.capture} (capture/ stores request and answer text)"
    return f"assistance server on http://{HOST}:{settings.port} · model: {where} · LLM cache: {cache} · capture: {capture}"


def uvicorn_config(settings: Settings) -> uvicorn.Config:
    return uvicorn.Config(create_app(settings), host=HOST, port=settings.port, log_level="warning", access_log=False)


def main() -> None:
    settings = load_settings()
    for warning in settings.warnings:
        print(f"warning: {warning}", flush=True)
    config = uvicorn_config(settings)
    print(startup_line(settings), flush=True)
    uvicorn.Server(config).run()


if __name__ == "__main__":
    main()
