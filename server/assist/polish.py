"""POST /v1/polish: minimal grammar and spelling correction with safety checks."""

from __future__ import annotations

import asyncio
import math
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

import dspy
import regex

from .capture import Observation
from .lm import classify_error, raw_from_error, running
from .programs import PolishProgram

MAX_CHARS = 4000

# The same spans the tokenizer never checks; a polish must not touch them.
_PROTECTED: list[tuple[regex.Pattern[str], bool]] = [
    (regex.compile(r"\$\([^)]*\)"), False),
    (regex.compile(r"(?<![A-Za-z0-9_])(?:https?://|www\.)\S+", regex.IGNORECASE), True),
    (regex.compile(r"[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+"), False),
    (regex.compile(r"\S*\p{Nd}\S*"), True),
]
_TRAILING_PUNCT = regex.compile(r"\p{P}+\Z")
_FENCE = regex.compile(r"^```[^\n]*\n([\s\S]*?)\n?```\Z")
_QUOTED = regex.compile(r"^([\"“«]).*([\"”»])\Z", regex.DOTALL)
_ARABIC = regex.compile(r"\p{Script=Arabic}")
_LATIN = regex.compile(r"\p{Script=Latin}")
_LEADING_WS = regex.compile(r"^\s*")
_TRAILING_WS = regex.compile(r"\s*\Z")


def protected_tokens(text: str) -> list[str]:
    found = [_TRAILING_PUNCT.sub("", m.group(0)) if trim else m.group(0) for pattern, trim in _PROTECTED for m in pattern.finditer(text)]
    return sorted(found)


def majority_script(text: str) -> Literal["en", "ar"]:
    return "ar" if len(_ARABIC.findall(text)) > len(_LATIN.findall(text)) else "en"


def clean_output(raw: str) -> str:
    """Strips wrappers models sometimes add: code fences and surrounding quotes."""
    return clean_output_explained(raw)[0]


def clean_output_explained(raw: str) -> tuple[str, bool]:
    """clean_output, plus whether a fence or quotes were removed (the `wrapped` issue reason)."""
    out = regex.sub(r"\r\n?", "\n", raw).strip()
    wrapped = False
    fence = _FENCE.match(out)
    if fence:
        out, wrapped = fence.group(1).strip(), True
    if _QUOTED.match(out):
        out, wrapped = out[1:-1].strip(), True
    return out, wrapped


SAFETY_REASONS = {
    "protected-changed": "protected content (placeholders, links, numbers) would change",
    "length-changed": "the correction would rewrite too much of the message",
    "line-breaks-changed": "the correction would change line breaks",
}


def safety_code(draft: str, polished: str) -> str | None:
    """The issue reason when the corrected text is unsafe to offer, or None."""
    if protected_tokens(draft) != protected_tokens(polished):
        return "protected-changed"
    ratio = len(polished) / max(len(draft), 1)
    if ratio < 0.7 or ratio > 1.3:
        return "length-changed"
    if draft.count("\n") != polished.count("\n"):
        return "line-breaks-changed"
    return None


def safety_check(draft: str, polished: str) -> str | None:
    """Returns a reason when the corrected text is unsafe to offer, or None."""
    code = safety_code(draft, polished)
    return SAFETY_REASONS[code] if code else None


@dataclass
class PolishDeps:
    program: PolishProgram
    lm: dspy.LM | None
    available: bool
    model_name: str
    timeout: float = 4.0
    # Told every request's observation: reasons, input, raw output, what was shown (llm-capture).
    observe: Callable[[Observation], None] | None = None


async def polish(data: object, deps: PolishDeps) -> tuple[int, dict[str, Any]]:
    started = time.perf_counter()
    o = data if isinstance(data, dict) else {}
    text = regex.sub(r"\r\n?", "\n", o["text"]) if isinstance(o.get("text"), str) else ""
    if not text.strip():
        return 400, {"error": "text is required"}
    if len(text) > MAX_CHARS:
        return 400, {"error": "text too long"}
    if not deps.available:
        return 503, {"error": "polish model unavailable (no API key configured)"}

    lang = majority_script(text)

    def observe(reasons: list[str], raw: str | None, output: str) -> None:
        if deps.observe:
            deps.observe(Observation("polish", deps.model_name, lang, reasons, {"draft": text}, raw, output, round((time.perf_counter() - started) * 1000)))

    unparsed: str | None = None
    try:
        with running(deps.lm):
            prediction = await asyncio.wait_for(
                deps.program.acall(draft=text, config={"max_tokens": min(2048, math.ceil(len(text) / 2) + 64), "timeout": deps.timeout}),
                deps.timeout,
            )
        raw: str | None = prediction.polished
    except Exception as err:  # noqa: BLE001 - every failure maps to a fixed status and reason
        kind = classify_error(err)
        if kind in ("timeout", "failed"):
            observe([kind], None, text)
            if kind == "timeout":
                return 504, {"error": "polish model timed out"}
            return 502, {"error": "polish model request failed"}
        raw = None
        unparsed = raw_from_error(err)

    base = {"lang": lang, "model": deps.model_name}
    # Models drop surrounding whitespace (e.g. the trailing line break of an
    # email paragraph); keep the draft's own, so only the inner text is compared.
    inner, wrapped = clean_output_explained(raw) if raw is not None else ("", False)
    candidate = _LEADING_WS.match(text).group(0) + inner + _TRAILING_WS.search(text).group(0) if inner else ""  # type: ignore[union-attr]
    reasons = ["wrapped"] if wrapped else []
    if raw is None:
        reason: str | None = "the model's answer could not be used"
        reasons.append("format")
    elif not candidate:
        reason = "the model returned nothing"
        reasons.append("empty")
    else:
        code = safety_code(text, candidate)
        reason = SAFETY_REASONS[code] if code else None
        if code:
            reasons.append(code)
    latency = round((time.perf_counter() - started) * 1000)
    observe(reasons, raw if raw is not None else unparsed, text if reason else candidate)
    if reason:
        return 200, {"polished": text, "changed": False, "reason": reason, "latencyMs": latency, **base}
    return 200, {"polished": candidate, "changed": candidate != text, "latencyMs": latency, **base}
