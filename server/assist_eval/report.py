"""report.md and report.json for a run."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .cases import CATEGORIES, Case
from .metrics import LANGS, compute
from .run import Sample

MAX_EXAMPLES = 30
ROWS = [("Samples", "samples", "n"), ("Shown", "shown", "%"), ("Withheld (format)", "withheld", "%"), ("Errors", "errors", "%"),
        ("Word completion correct", "wordCompletion", "%"), ("Spacing errors", "spacingErrors", "%")]


@dataclass
class Report:
    summary: str
    data: dict


def _cell(value, kind: str) -> str:
    if value is None:
        return "—"
    return str(value) if kind == "n" else f"{value:.1%}"


def _table(columns: dict[str, dict], names: tuple[str, ...]) -> str:
    head = "| Metric | " + " | ".join(names) + " |\n|---|" + "---:|" * len(names) + "\n"
    return head + "".join(f"| {label} | " + " | ".join(_cell(columns[n][key], kind) for n in names) + " |\n" for label, key, kind in ROWS)


def _examples(items: list[tuple[Case, Sample]]) -> str:
    if not items:
        return "None.\n"
    rows = "| Case | Prefix (end) | Suggestion | Truth |\n|---|---|---|---|\n"
    for case, sample in items[:MAX_EXAMPLES]:
        cell = lambda t: repr(t).replace("|", "\\|")  # noqa: E731
        rows += f"| `{case.id}` | {cell('…' + case.prefix[-40:])} | {cell(sample.completion[:60])} | {cell(case.truth[:60])} |\n"
    more = len(items) - MAX_EXAMPLES
    return rows + (f"\n…and {more} more.\n" if more > 0 else "")


def write_report(out: Path, cases: list[Case], samples: list[Sample], info: dict) -> Report:
    m = compute(cases, samples)
    date = datetime.now(timezone.utc).isoformat(timespec="seconds")
    data = {
        "settings": {**info, "date": date, "cases": len(cases)},
        "languages": m["languages"],
        "categories": m["categories"],
        "latencyP50": m["latencyP50"],
        "latencyP95": m["latencyP95"],
        "failures": {k: [{"case": c.id, "prefix": c.prefix, "completion": s.completion, "truth": c.truth, "truthWord": c.truthWord} for c, s in v] for k, v in m["failures"].items()},
    }
    (out / "report.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    s = info
    md = (
        f"# Completion eval: {s['set']}\n\n"
        f"Model **{s['model']}** · {len(cases)} cases × {s['samples']} samples · seed {s.get('seed')} · input `{s.get('input')}` · {date} · {s.get('seconds')} s\n\n"
        "Canned responses and the knowledge base off, conversation on, LLM cache off. Local report: it contains the set's text.\n\n"
        "## By language\n\n" + _table(m["languages"], LANGS) + "\n## By category\n\n" + _table(m["categories"], CATEGORIES)
        + f"\nLatency p50 {m['latencyP50']} ms · p95 {m['latencyP95']} ms (for information).\n\n"
        "Word completion: at mid-word cuts the completed word equals the agent's real word (case and Arabic diacritics ignored); at end-of-word cuts the suggestion doesn't join the finished word. "
        "Spacing errors: a space after a space, or a letter or digit right after punctuation.\n\n"
        f"## Wrong word completions ({len(m['failures']['wordCompletion'])})\n\n" + _examples(m["failures"]["wordCompletion"])
        + f"\n## Spacing errors ({len(m['failures']['spacing'])})\n\n" + _examples(m["failures"]["spacing"])
    )
    (out / "report.md").write_text(md, "utf-8")
    a = m["languages"]["all"]
    summary = f"shown {_cell(a['shown'], '%')} · withheld {_cell(a['withheld'], '%')} · errors {_cell(a['errors'], '%')} · word completion {_cell(a['wordCompletion'], '%')} · spacing errors {_cell(a['spacingErrors'], '%')} · p50 {m['latencyP50']} ms"
    return Report(summary, data)
