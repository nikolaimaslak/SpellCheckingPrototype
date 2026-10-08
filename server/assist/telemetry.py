"""Assistance telemetry: the allowlisted event log and the /summary page (port of the former server/telemetry.ts)."""

from __future__ import annotations

import json
import math
import time
from html import escape as _html_escape
from pathlib import Path
from typing import Any

from .error_types import classify

COMPLETION = ("completion-shown", "completion-accepted", "completion-dismissed", "completion-withheld")
# Why a completion was withheld. The service now writes only `format` (model
# output it couldn't use); `figure`, `date`, `identifier` and `conversation`
# (the removed safety filter) and `spelling` (a former client word check) are
# accepted so older log lines still count. Nothing else may be stored for it.
WITHHELD_REASONS = ("figure", "date", "identifier", "conversation", "format", "spelling")
SPELLING = ("flag", "unresolved", "autocorrect", "revert", "accept", "ignore")
# The events the field figures on /summary are computed from (flags and words left misspelled feed the spelling report).
_SPELLING_RATES = ("autocorrect", "revert", "accept", "ignore")
POLISH = ("polish-shown", "polish-accepted", "polish-dismissed", "polish-reverted")

_COMMON = ("type", "ts", "lang", "session")
_EXTRA = {
    "completion": ("latencyMs", "shownLength", "acceptedLength"),
    "spelling": ("original", "replacement", "rank", "offered"),
    "polish": ("latencyMs", "changes"),
}

Event = dict[str, Any]


def _kind(t: object) -> str | None:
    if t in COMPLETION:
        return "completion"
    if t in SPELLING:
        return "spelling"
    if t in POLISH:
        return "polish"
    return None


def _allowed(v: object) -> bool:
    if isinstance(v, str):
        return len(v) <= 64
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def sanitize(data: object) -> Event | None:
    """Keeps only allowlisted fields per event type, so completion text, transcripts or composer content can never be stored even if a client sends them."""
    o = data if isinstance(data, dict) else {}
    kind = _kind(o.get("type"))
    if not kind:
        return None
    out: Event = {k: o[k] for k in (*_COMMON, *_EXTRA[kind]) if k in o and _allowed(o[k])}
    if o["type"] == "completion-withheld" and o.get("reason") in WITHHELD_REASONS:
        out["reason"] = o["reason"]
    out["type"] = o["type"]
    if not isinstance(out.get("ts"), (int, float)):
        out["ts"] = int(time.time() * 1000)
    return out


def append_events(path: Path, batch: object) -> int:
    events = [e for e in (sanitize(x) for x in (batch if isinstance(batch, list) else [])) if e]
    if not events:
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write("".join(json.dumps(e, ensure_ascii=False, separators=(",", ":")) + "\n" for e in events))
    return len(events)


def read_events(path: Path) -> list[Event]:
    if not path.exists():
        return []
    out: list[Event] = []
    for line in path.read_text("utf-8").split("\n"):
        if not line:
            continue
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if isinstance(e, dict):
            out.append(e)
    return out


def _percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    return values[min(len(values) - 1, math.ceil(p / 100 * len(values)) - 1)]


def _number(v: object) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def summarize(events: list[Event]) -> dict[str, Any]:
    def count(t: str) -> int:
        return sum(1 for e in events if e.get("type") == t)

    shown, accepted = count("completion-shown"), count("completion-accepted")
    autocorrects, reverts = count("autocorrect"), count("revert")
    latencies = sorted(e["latencyMs"] for e in events if e.get("type") == "completion-shown" and _number(e.get("latencyMs")))
    polish_shown = sum(1 for e in events if e.get("type") == "polish-shown" and (e.get("changes") or 0) > 0)
    polish_latencies = sorted(e["latencyMs"] for e in events if e.get("type") == "polish-shown" and _number(e.get("latencyMs")))
    polish_accepted = count("polish-accepted")

    def tally(key: str) -> dict[str, int]:
        acc: dict[str, int] = {}
        for e in events:
            k = e.get(key)
            k = "—" if k is None else str(k)
            acc[k] = acc.get(k, 0) + 1
        return acc

    return {
        "total": len(events),
        "completion": {
            "shown": shown,
            "accepted": accepted,
            "dismissed": count("completion-dismissed"),
            "withheld": {
                r: sum(1 for e in events if e.get("type") == "completion-withheld" and e.get("reason") == r) for r in WITHHELD_REASONS
            },
            "acceptanceRate": accepted / shown if shown else None,
            "latencyP50": _percentile(latencies, 50),
            "latencyP95": _percentile(latencies, 95),
        },
        "autocorrect": {"count": autocorrects, "reverts": reverts, "revertRate": reverts / autocorrects if autocorrects else None},
        "spelling": spelling_by_lang(events),
        "polish": {
            "shownWithChanges": polish_shown,
            "accepted": polish_accepted,
            "acceptanceRate": polish_accepted / polish_shown if polish_shown else None,
            "latencyP50": _percentile(polish_latencies, 50),
        },
        "byType": tally("type"),
        "byLang": tally("lang"),
    }


def _type_of(e: Event, lang: str) -> str:
    if e.get("original") and e.get("replacement"):
        c = classify(e["original"], e["replacement"], lang)  # type: ignore[arg-type]
        return c["type"] if c else "unclassified"
    return "unclassified"


def spelling_by_lang(events: list[Event]) -> dict[str, dict[str, Any]]:
    """Per-language spelling figures, classified with the benchmark's error-type taxonomy."""
    out: dict[str, dict[str, Any]] = {}
    for e in events:
        lang = e.get("lang")
        if lang not in ("en", "ar") or e.get("type") not in _SPELLING_RATES:
            continue
        s = out.setdefault(
            lang,
            {"autocorrects": 0, "reverts": 0, "revertRate": None, "accepts": 0, "ignores": 0, "ignoreShare": None, "errorTypes": {}, "revertsByType": {}},
        )
        kind = _type_of(e, lang)

        def by_type() -> dict[str, Any]:
            return s["revertsByType"].setdefault(kind, {"autocorrects": 0, "reverts": 0, "revertRate": None})

        t = e["type"]
        if t == "autocorrect":
            s["autocorrects"] += 1
            by_type()["autocorrects"] += 1
            s["errorTypes"][kind] = s["errorTypes"].get(kind, 0) + 1
        elif t == "accept":
            s["accepts"] += 1
            s["errorTypes"][kind] = s["errorTypes"].get(kind, 0) + 1
        elif t == "revert":
            # A revert carries the auto-correction's original and replacement, so it has the same type.
            s["reverts"] += 1
            by_type()["reverts"] += 1
        elif t == "ignore":
            s["ignores"] += 1
    for s in out.values():
        s["revertRate"] = s["reverts"] / s["autocorrects"] if s["autocorrects"] else None
        judged = s["accepts"] + s["ignores"]
        s["ignoreShare"] = s["ignores"] / judged if judged else None
        for t in s["revertsByType"].values():
            t["revertRate"] = t["reverts"] / t["autocorrects"] if t["autocorrects"] else None
    return out


def _pct(r: float | None) -> str:
    # JavaScript's Math.round (half up), not Python's round (half to even).
    return "—" if r is None else f"{math.floor(r * 100 + 0.5)}%"


def _num(v: float) -> str:
    return str(int(v)) if isinstance(v, float) and v.is_integer() else str(v)


def _ms(v: float | None) -> str:
    return "—" if v is None else f"{_num(v)} ms"


def _esc(s: str) -> str:
    return _html_escape(s, quote=False).replace('"', "&quot;")


def render_summary(s: dict[str, Any], extra: str = "") -> str:
    """The /summary page; `extra` is HTML placed after the spelling section (the dictionary candidates)."""
    def rows(o: dict[str, int]) -> str:
        return "".join(f"<tr><td>{_esc(k)}</td><td>{v}</td></tr>" for k, v in o.items())

    c, a, p = s["completion"], s["autocorrect"], s["polish"]
    withheld = " · ".join(f"{r} {n}" for r, n in c["withheld"].items())
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Assistance telemetry</title>
<style>body{{font-family:system-ui,sans-serif;margin:16px;color:#1c2430;background:#f6f7f9}}table{{border-collapse:collapse;margin:8px 0 16px}}td,th{{border:1px solid #d5dae1;padding:4px 10px;text-align:left}}h2{{font-size:1rem;margin-top:20px}}.k{{font-size:1.6rem;font-weight:600}}.grid{{display:flex;gap:24px;flex-wrap:wrap}}.grid div{{background:#fff;border:1px solid #d5dae1;border-radius:8px;padding:10px 14px}}
@media (prefers-color-scheme: dark){{body{{background:#14181e;color:#e4e8ee}}.grid div{{background:#1c222b;border-color:#333c48}}td,th{{border-color:#333c48}}}}</style></head><body>
<h1>Assistance telemetry</h1><p>{s["total"]} events (local dev log; no conversation text is recorded).</p>
<div class="grid">
<div>Completion acceptance<div class="k">{_pct(c["acceptanceRate"])}</div>{c["accepted"]} of {c["shown"]} shown</div>
<div>Completion latency<div class="k">{_ms(c["latencyP50"])}</div>p50 · p95 {_ms(c["latencyP95"])}</div>
<div>Completions withheld<div class="k">{sum(c["withheld"].values())}</div>{withheld} · next to {c["shown"]} shown</div>
<div>Auto-correct revert rate<div class="k">{_pct(a["revertRate"])}</div>{a["reverts"]} of {a["count"]}</div>
<div>Polish acceptance<div class="k">{_pct(p["acceptanceRate"])}</div>{p["accepted"]} of {p["shownWithChanges"]} previews · p50 {_ms(p["latencyP50"])}</div>
</div>
{_render_spelling(s["spelling"])}
{extra}
<h2>By event type</h2><table><tr><th>Type</th><th>Count</th></tr>{rows(s["byType"])}</table>
<h2>By language</h2><table><tr><th>Language</th><th>Count</th></tr>{rows(s["byLang"])}</table>
</body></html>"""


def _render_spelling(spelling: dict[str, dict[str, Any]]) -> str:
    if not spelling:
        return ""
    rows = "".join(
        f"<tr><td>{lang}</td><td>{s['autocorrects']}</td><td>{s['reverts']}</td><td>{_pct(s['revertRate'])}</td>"
        f"<td>{s['accepts']}</td><td>{s['ignores']}</td><td>{_pct(s['ignoreShare'])}</td></tr>"
        for lang, s in spelling.items()
    )
    types = ""
    for lang, s in spelling.items():
        body = ""
        for t in sorted({*s["errorTypes"], *s["revertsByType"]}):
            r = s["revertsByType"].get(t)
            body += (
                f"<tr><td>{_esc(t)}</td><td>{s['errorTypes'].get(t, 0)}</td>"
                f"<td>{r['autocorrects'] if r else 0}</td><td>{_pct(r['revertRate'] if r else None)}</td></tr>"
            )
        types += (
            f"<h3>{lang}: error types in the field</h3><table><tr><th>Error type</th><th>Corrections (accepted + automatic)</th>"
            f"<th>Auto-corrections</th><th>Reverted</th></tr>{body}</table>"
        )
    return f"""<h2>Spelling in the field</h2>
<p>Field counterparts of the offline benchmark (npm run eval): the revert rate approximates 1 − auto-replace precision (a lower bound, since not every wrong fix is reverted); the ignore share approximates the false-flag rate; the error types compare with the benchmark's error-type distribution.</p>
<table><tr><th>Language</th><th>Auto-corrections</th><th>Reverts</th><th>Revert rate</th><th>Suggestions accepted</th><th>Ignored</th><th>Ignore share</th></tr>{rows}</table>{types}"""
