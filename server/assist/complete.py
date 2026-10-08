"""POST /v1/complete: retrieve → typed program (continuation) → join → finalize → edit."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

import dspy

from .capture import Observation
from .lm import classify_error, raw_from_error, running
from .postprocess import Edit, derive_edit, join_explained, script_of
from .programs import CompletionProgram, Turn
from .retrieval import CannedResponse, KbPassage, retrieve, retrieve_kb

MAX_PREFIX = 2000
MAX_TURNS_ACCEPTED = 50

OnWithheld = Callable[[str, str | None], None]


@dataclass
class CompletionDeps:
    program: CompletionProgram
    lm: dspy.LM | None
    # False when no model is configured (gemini without a key): the endpoint answers 503.
    available: bool
    model_name: str
    library: Sequence[CannedResponse]
    kb: Sequence[KbPassage] = ()
    timeout: float = 2.0
    # Told the reason (never the text) whenever model output can't be used.
    on_withheld: OnWithheld | None = None
    # Told every request's observation: reasons, input, raw output, what was shown (llm-capture).
    observe: Callable[[Observation], None] | None = None


@dataclass(frozen=True)
class CompleteRequest:
    prefix: str
    transcript: list[Turn]
    use_transcript: bool
    use_canned: bool
    use_kb: bool


def parse_request(data: object) -> CompleteRequest | str:
    """Lenient, as the previous server: malformed turns are dropped, source flags default to on."""
    o = data if isinstance(data, dict) else {}
    prefix = o.get("prefix")
    if not isinstance(prefix, str) or not prefix.strip():
        return "prefix is required"
    if len(prefix) > MAX_PREFIX:
        return "prefix too long"
    raw = o.get("transcript")
    turns = [
        Turn(role=t["role"], text=t["text"])
        for t in (raw if isinstance(raw, list) else [])
        if isinstance(t, dict) and t.get("role") in ("customer", "agent") and isinstance(t.get("text"), str)
    ][-MAX_TURNS_ACCEPTED:]
    s = o.get("sources") if isinstance(o.get("sources"), dict) else {}
    return CompleteRequest(prefix, turns, s.get("transcript") is not False, s.get("canned") is not False, s.get("kb") is not False)


def build(prefix: str, continuation: str) -> tuple[str, Edit | None, list[str]]:
    """The model's continuation → the suggestion, its edit and the issue reasons. An empty answer means nothing to add, not a failure."""
    if not continuation.strip():
        return "", None, ["empty-answer"]
    completion, reasons = join_explained(prefix, continuation)
    return completion, derive_edit(prefix, completion) if completion else None, reasons


async def complete(data: object, deps: CompletionDeps) -> tuple[int, dict[str, Any]]:
    started = time.perf_counter()
    req = parse_request(data)
    if isinstance(req, str):
        return 400, {"error": req}
    if not deps.available:
        return 503, {"error": "completion model unavailable (no API key configured)"}

    last_customer = next((t.text for t in reversed(req.transcript) if t.role == "customer"), "")
    canned = retrieve(deps.library, last_customer, req.prefix) if req.use_canned else []
    # Knowledge base only on a strong match with the customer's last message.
    kb = retrieve_kb(deps.kb, last_customer) if req.use_kb and deps.kb else []

    lang = script_of(req.prefix)
    inputs = {
        "agent_text": req.prefix,
        "conversation": [{"role": t.role, "text": t.text} for t in (req.transcript if req.use_transcript else [])],
        "approved_responses": [h.item.text for h in canned],
        "knowledge_base": [h.item.text for h in kb],
    }

    def observe(reasons: list[str], raw: str | None, output: str) -> None:
        if deps.observe:
            deps.observe(Observation("complete", deps.model_name, lang, reasons, inputs, raw, output, round((time.perf_counter() - started) * 1000)))

    try:
        with running(deps.lm):
            prediction = await asyncio.wait_for(
                deps.program.acall(
                    agent_text=req.prefix,
                    conversation=req.transcript if req.use_transcript else [],
                    approved_responses=inputs["approved_responses"],
                    knowledge_base=inputs["knowledge_base"],
                    config={"timeout": deps.timeout},
                ),
                deps.timeout,
            )
        raw: str | None = prediction.continuation
        completion, edit, reasons = build(req.prefix, raw)
        withheld = None
    except Exception as err:  # noqa: BLE001 - every failure maps to a fixed status and reason
        kind = classify_error(err)
        if kind in ("timeout", "failed"):
            observe([kind], None, "")
            if kind == "timeout":
                return 504, {"error": "completion model timed out"}
            return 502, {"error": "completion model request failed"}
        completion, edit, withheld, raw, reasons = "", None, "format", raw_from_error(err), ["format"]

    observe(reasons, raw, completion)

    if withheld and deps.on_withheld:
        deps.on_withheld(withheld, lang)
    body: dict[str, Any] = {"completion": completion, "lang": lang}
    if edit:
        body["edit"] = {"typed": edit.typed, "word": edit.word, "rest": edit.rest}
    if withheld:
        body["withheld"] = withheld
    body.update(
        latencyMs=round((time.perf_counter() - started) * 1000),
        model=deps.model_name,
        sources=[h.item.id for h in canned] + [h.item.id for h in kb],
    )
    return 200, body
