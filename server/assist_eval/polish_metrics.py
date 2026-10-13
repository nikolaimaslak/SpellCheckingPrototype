"""Polish eval metrics: token edits against the reference, per-sample outcomes, precision / recall / F0.5."""

from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher

import regex

from .metrics import _percentile as percentile
from .polish_cases import PolishCase

# Runs of letters, digits and combining marks (Arabic words keep their diacritics), and single punctuation or symbols.
_TOKEN = regex.compile(r"[\p{L}\p{N}\p{M}]+|[^\s\p{L}\p{N}\p{M}]")
LANGS = ("en", "ar", "mixed", "all")
OUTCOMES = ("exact", "missed", "different", "kept", "over-edited", "error")

Edit = tuple[int, int, tuple[str, ...]]


def tokens(text: str) -> list[str]:
    return _TOKEN.findall(text)


def edits(source: list[str], other: list[str]) -> set[Edit]:
    """Changes from source to other, in source positions: (start, end, replacement tokens)."""
    sm = SequenceMatcher(None, source, other, autojunk=False)
    return {(i1, i2, tuple(other[j1:j2])) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != "equal"}


@dataclass(frozen=True)
class Scored:
    outcome: str
    rejected: bool
    tp: int
    system: int
    gold: int


def score(case: PolishCase, returned: str | None, reason: str | None = None) -> Scored:
    """One sample's outcome; `returned` is None for a failed request."""
    if returned is None:
        return Scored("error", False, 0, 0, 0)
    src, ref, out = tokens(case.source), tokens(case.target), tokens(returned)
    gold, system = edits(src, ref), edits(src, out)
    needs_fix = src != ref
    if out == ref:
        outcome = "exact" if needs_fix else "kept"
    elif not needs_fix:
        outcome = "over-edited"
    else:
        outcome = "missed" if out == src else "different"
    return Scored(outcome, reason is not None, len(gold & system), len(system), len(gold))


def _ratio(n: int, d: int) -> float | None:
    return n / d if d else None


def summarize(items: list[tuple[PolishCase, Scored, int]]) -> dict:
    """Figures over (case, scored sample, latency ms) items: outcome shares, P / R / F0.5, rejections, latency."""
    n = len(items)
    scored = [s for _, s, _ in items if s.outcome != "error"]
    tp, sys_, gold = sum(s.tp for s in scored), sum(s.system for s in scored), sum(s.gold for s in scored)
    p = tp / sys_ if sys_ else 1.0
    r = tp / gold if gold else 1.0
    f05 = (1.25 * p * r / (0.25 * p + r)) if (p + r) else 0.0
    latencies = [ms for _, s, ms in items if s.outcome != "error"]
    cases = {c.id: c.count for c, _, _ in items}
    return {
        "samples": n,
        "cases": len(cases),
        "rows": sum(cases.values()),
        **{o: _ratio(sum(s.outcome == o for _, s, _ in items), n) for o in OUTCOMES},
        "rejected": _ratio(sum(s.rejected for _, s, _ in items), n),
        "precision": p if scored else None,
        "recall": r if scored else None,
        "f05": f05 if scored else None,
        "systemEdits": sys_,
        "goldEdits": gold,
        "latencyP50": percentile(latencies, 50),
        "latencyP95": percentile(latencies, 95),
    }


def compute(items: list[tuple[PolishCase, Scored, int]]) -> dict:
    """By error type (input order), by language and overall."""
    types: list[str] = []
    for c, _, _ in items:
        if c.errorType not in types:
            types.append(c.errorType)
    return {
        "types": {t: summarize([i for i in items if i[0].errorType == t]) for t in types},
        "languages": {lang: summarize([i for i in items if lang == "all" or i[0].lang == lang]) for lang in LANGS},
    }
