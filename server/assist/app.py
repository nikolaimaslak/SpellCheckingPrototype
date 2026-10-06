"""The FastAPI app: request handling around the completion, polish and telemetry endpoints."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from .complete import CompletionDeps, complete
from .lm import build_lm, configure_cache
from .polish import PolishDeps, polish
from .programs import build_programs
from .retrieval import load_kb, load_library
from .settings import Settings
from .telemetry import append_events, read_events, render_summary, summarize

MAX_BODY = 64 * 1024

# Dev only: the demo uses the Vite proxy, the Agent Desktop loader calls cross-origin.
HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-private-network": "true",
    "cache-control": "no-store",
}


class BadRequest(Exception):
    """An unreadable body: not JSON, or too large."""


async def read_json(request: Request) -> Any:
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_BODY:
        raise BadRequest
    body = b""
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_BODY:
            raise BadRequest
    try:
        return json.loads(body.decode("utf-8") or "null")
    except ValueError as err:
        raise BadRequest from err


def error(status: int, reason: str) -> JSONResponse:
    return JSONResponse({"error": reason}, status_code=status)


def create_app(settings: Settings) -> FastAPI:
    configure_cache(settings.cache, settings.cache_dir)
    choice = settings.model
    lm = build_lm(choice, settings.cache)
    completion_program, polish_program = build_programs(settings.max_turns, fake=choice.lm_id == "fake")
    available = choice.lm_id is not None
    name = choice.name or "none"

    def on_withheld(reason: str, lang: str | None) -> None:
        # The reason only (unusable model output): the text never reaches the log.
        append_events(settings.events_path, [{"type": "completion-withheld", "reason": reason, **({"lang": lang} if lang else {})}])

    completion_deps = CompletionDeps(completion_program, lm, available, name, load_library(), load_kb(), on_withheld=on_withheld)
    polish_deps = PolishDeps(polish_program, lm, available, name)

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def headers(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        response = Response(status_code=204) if request.method == "OPTIONS" else await call_next(request)
        response.headers.update(HEADERS)
        return response

    @app.exception_handler(BadRequest)
    async def bad_request(_request: Request, _exc: BadRequest) -> JSONResponse:
        return error(400, "bad request")

    @app.exception_handler(RequestValidationError)
    async def invalid(_request: Request, _exc: RequestValidationError) -> JSONResponse:
        return error(400, "bad request")

    @app.exception_handler(StarletteHTTPException)
    async def not_found(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        # As before: any path or method that isn't served is "not found".
        return error(404, "not found") if exc.status_code in (404, 405) else error(exc.status_code, "bad request")

    @app.exception_handler(Exception)
    async def unexpected(_request: Request, _exc: Exception) -> JSONResponse:
        # Never the exception's text: it can carry request details.
        return error(500, "internal error")

    @app.post("/v1/complete")
    async def complete_route(request: Request) -> JSONResponse:
        status, body = await complete(await read_json(request), completion_deps)
        return JSONResponse(body, status_code=status)

    @app.post("/v1/polish")
    async def polish_route(request: Request) -> JSONResponse:
        status, body = await polish(await read_json(request), polish_deps)
        return JSONResponse(body, status_code=status)

    @app.post("/v1/events")
    async def events_route(request: Request) -> JSONResponse:
        return JSONResponse({"stored": append_events(settings.events_path, await read_json(request))})

    @app.get("/summary")
    async def summary_route() -> HTMLResponse:
        return HTMLResponse(render_summary(summarize(read_events(settings.events_path))))

    @app.get("/health")
    async def health_route() -> JSONResponse:
        return JSONResponse(
            {"ok": True, "model": choice.name, "mode": choice.mode, "external": choice.external, "cache": settings.cache}
        )

    return app
