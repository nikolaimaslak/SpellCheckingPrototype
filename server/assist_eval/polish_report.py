"""report.md and report.json for a polish run."""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from .polish_cases import PolishCase
from .polish_metrics import LANGS, Scored, compute, score
from .polish_run import PolishSample
from .report import Report

MAX_EXAMPLES = 30
COLUMNS = [("Cases", "cases", "n"), ("Rows", "rows", "n"), ("Exact", "exact", "%"), ("Missed", "missed", "%"), ("Different", "different", "%"),
           ("Kept", "kept", "%"), ("Over-edited", "over-edited", "%"), ("Rejected", "rejected", "%"), ("Errors", "error", "%"),
           ("P", "precision", "f"), ("R", "recall", "f"), ("F0.5", "f05", "f"), ("p50 ms", "latencyP50", "n")]


def _cell(value, kind: str) -> str:
    if value is None:
        return "—"
    return str(value) if kind == "n" else f"{value:.1%}" if kind == "%" else f"{value:.2f}"


def _table(label: str, rows: dict[str, dict]) -> str:
    head = f"| {label} | " + " | ".join(c for c, _, _ in COLUMNS) + " |\n|---|" + "---:|" * len(COLUMNS) + "\n"
    return head + "".join(f"| {name} | " + " | ".join(_cell(r[k], kind) for _, k, kind in COLUMNS) + " |\n" for name, r in rows.items() if r["samples"])


def _text(t: str | None) -> str:
    return "—" if t is None else repr(t).replace("|", "\\|")


def _examples(items: list[tuple[PolishCase, PolishSample]], with_reason: bool = False, limit: int | None = MAX_EXAMPLES) -> str:
    if not items:
        return "None.\n"
    shown = items if limit is None else items[:limit]
    head = "| Type | Source | Reference | Returned |" + (" Reason |" if with_reason else "") + "\n|---|---|---|---|" + ("---|" if with_reason else "") + "\n"
    rows = "".join(
        f"| {c.errorType} | {_text(c.source)} | {_text(c.target)} | {_text(s.polished)} |" + (f" {s.reason} |" if with_reason else "") + "\n" for c, s in shown
    )
    more = len(items) - len(shown)
    return head + rows + (f"\n…and {more} more.\n" if more > 0 else "")


def write_report(out: Path, cases: list[PolishCase], samples: list[PolishSample], info: dict) -> Report:
    by_id = {c.id: c for c in cases}
    order = {c.id: i for i, c in enumerate(cases)}
    samples = sorted(samples, key=lambda s: (order[s.case], s.sample))
    scored: list[tuple[PolishCase, PolishSample, Scored]] = [(by_id[s.case], s, score(by_id[s.case], s.polished, s.reason)) for s in samples]
    m = compute([(c, sc, s.latencyMs) for c, s, sc in scored])
    pick = lambda outcome: [(c, s) for c, s, sc in scored if sc.outcome == outcome]  # noqa: E731
    rejections = [(c, s) for c, s, sc in scored if sc.rejected]
    reasons = Counter(s.reason for _, s in rejections)
    date = datetime.now(timezone.utc).isoformat(timespec="seconds")
    data = {
        "settings": {**info, "date": date, "cases": len(cases)},
        "languages": m["languages"],
        "types": m["types"],
        "rejectionReasons": dict(reasons),
        "samples": [{"case": c.id, "errorType": c.errorType, "outcome": sc.outcome, "rejected": sc.rejected, "source": c.source, "target": c.target, "returned": s.polished, "reason": s.reason, "error": s.error} for c, s, sc in scored],
    }
    (out / "report.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    s = info
    md = (
        f"# Polish eval: {s['set']}\n\n"
        f"Model **{s['model']}** · {len(cases)} cases × {s['samples']} samples · input `{s.get('input')}` · {date} · {s.get('seconds')} s\n\n"
        "LLM cache off; the endpoint's output cleaning and safety checks applied. Local report: it contains the set's text.\n\n"
        "Outcomes: **exact** = the reference's tokens; **missed** = needed a fix, returned unchanged; **different** = changed, but not as the reference; "
        "**kept** = needed no fix and left alone; **over-edited** = needed no fix but changed; **rejected** = the safety check returned the draft (also counted as missed or kept). "
        "P / R / F0.5 = word-level edits against the reference's (approximate; for comparing runs). Every case counts once; Rows = dataset rows it stands for.\n\n"
        "## By language\n\n" + _table("Language", {k: m["languages"][k] for k in LANGS})
        + "\n## By error type\n\n" + _table("Error type", m["types"])
        + f"\nLatency p50 {m['languages']['all']['latencyP50']} ms · p95 {m['languages']['all']['latencyP95']} ms (for information).\n\n"
        + f"## Rejections ({len(rejections)})\n\n" + ("".join(f"- {r}: {n}\n" for r, n in reasons.most_common()) + "\n" if reasons else "") + _examples(rejections, True, None)
        + f"\n## Missed ({len(pick('missed'))})\n\n" + _examples(pick("missed"))
        + f"\n## Different ({len(pick('different'))})\n\n" + _examples(pick("different"))
        + f"\n## Over-edited ({len(pick('over-edited'))})\n\n" + _examples(pick("over-edited"))
    )
    (out / "report.md").write_text(md, "utf-8")
    a = m["languages"]["all"]
    summary = (
        f"exact {_cell(a['exact'], '%')} · missed {_cell(a['missed'], '%')} · different {_cell(a['different'], '%')} · kept {_cell(a['kept'], '%')} · "
        f"over-edited {_cell(a['over-edited'], '%')} · rejected {_cell(a['rejected'], '%')} · errors {_cell(a['error'], '%')} · "
        f"P {_cell(a['precision'], 'f')} R {_cell(a['recall'], 'f')} F0.5 {_cell(a['f05'], 'f')} · p50 {a['latencyP50']} ms"
    )
    return Report(summary, data)
