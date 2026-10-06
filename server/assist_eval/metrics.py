"""Metrics over (case, sample) pairs: shown, withheld, errors, word completion, spacing errors."""

from __future__ import annotations

import math
from collections.abc import Iterable

import regex

from .cases import CATEGORIES, Case
from .run import Sample

LANGS = ("en", "ar", "mixed", "all")
_MARKS = regex.compile("[ً-ٰٟـ]")
_WORD_START = regex.compile(r"^[\p{L}\p{N}\p{M}]")
_ALNUM_START = regex.compile(r"^[\p{L}\p{N}]")
_ENDS_SPACE = regex.compile(r"\s\Z")
_ENDS_PUNCT = regex.compile(r"[^\p{L}\p{N}\p{M}\s]\Z")


def fold(word: str) -> str:
    """Lower case, no Arabic diacritics or tatweel: how words are compared."""
    return _MARKS.sub("", word.lower())


def completed_word(case: Case, sample: Sample) -> str | None:
    if sample.edit and sample.edit.get("word") is not None:
        return sample.edit["word"]
    return None


def word_completion_ok(case: Case, sample: Sample) -> bool | None:
    """None when the sample doesn't count (not shown, or a category without a word at the cut)."""
    if not sample.completion or case.category not in ("mid-word", "end-of-word"):
        return None
    if case.category == "end-of-word":
        return not _WORD_START.match(sample.completion)
    word = completed_word(case, sample)
    return word is not None and fold(word) == fold(case.truthWord or "")


def spacing_error(case: Case, sample: Sample) -> bool | None:
    if not sample.completion:
        return None
    if _ENDS_SPACE.search(case.prefix):
        return sample.completion[:1].isspace()
    if _ENDS_PUNCT.search(case.prefix):
        return bool(_ALNUM_START.match(sample.completion))
    return False


def _rate(num: int, den: int) -> float | None:
    return num / den if den else None


def figures(pairs: list[tuple[Case, Sample]]) -> dict:
    shown = [(c, s) for c, s in pairs if s.completion]
    words = [ok for c, s in shown if (ok := word_completion_ok(c, s)) is not None]
    spacing = [bad for c, s in shown if (bad := spacing_error(c, s)) is not None]
    return {
        "samples": len(pairs),
        "shown": _rate(len(shown), len(pairs)),
        "withheld": _rate(sum(s.withheld == "format" for _, s in pairs), len(pairs)),
        "errors": _rate(sum(s.error is not None for _, s in pairs), len(pairs)),
        "wordCompletion": _rate(sum(words), len(words)),
        "wordCompletionSamples": len(words),
        "spacingErrors": _rate(sum(spacing), len(spacing)),
    }


def _percentile(values: list[int], p: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.ceil(p / 100 * len(ordered)) - 1)]


def compute(cases: Iterable[Case], samples: Iterable[Sample]) -> dict:
    by_id = {c.id: c for c in cases}
    pairs = [(by_id[s.case], s) for s in samples if s.case in by_id]
    langs = {lang: figures([(c, s) for c, s in pairs if lang == "all" or c.lang == lang]) for lang in LANGS}
    categories = {cat: figures([(c, s) for c, s in pairs if c.category == cat]) for cat in CATEGORIES}
    latencies = [s.latencyMs for _, s in pairs]
    failures = {
        "wordCompletion": [(c, s) for c, s in pairs if word_completion_ok(c, s) is False],
        "spacing": [(c, s) for c, s in pairs if spacing_error(c, s)],
    }
    return {"languages": langs, "categories": categories, "latencyP50": _percentile(latencies, 50), "latencyP95": _percentile(latencies, 95), "failures": failures}
