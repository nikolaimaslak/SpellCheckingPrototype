"""LLM output issues: one observation per completion or polish request, its reasons, and the opt-in capture log.

Report: npm run capture:report  (reads capture/llm.jsonl, writes capture/report.md)
"""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

# Nothing shown because of the model's output (or no answer at all).
FAILURES = frozenset(
    {"format", "timeout", "failed", "wrong-script", "nothing-left", "empty", "protected-changed", "length-changed", "line-breaks-changed"}
)
# Shown, after the server fixed the model's output.
REPAIRS = frozenset({"multi-line", "rewrote-word", "space-after-space", "missing-space", "restated-prefix", "multi-sentence", "too-long", "wrapped"})
# Neither: the model said there is nothing to add.
INFORMATIONAL = frozenset({"empty-answer"})
REASONS = FAILURES | REPAIRS | INFORMATIONAL


@dataclass
class Observation:
    endpoint: str  # "complete" or "polish"
    model: str
    lang: str | None
    reasons: list[str]
    input: dict[str, Any]
    raw: str | None  # the model's output field, or its unparseable text; None when there was no answer
    output: str  # what the reply shows
    latencyMs: int
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    ts: int = field(default_factory=lambda: int(time.time() * 1000))

    @property
    def failed(self) -> bool:
        return any(r in FAILURES for r in self.reasons)

    @property
    def repaired(self) -> bool:
        return any(r in REPAIRS for r in self.reasons)


def should_capture(mode: str, obs: Observation) -> bool:
    return mode == "all" or (mode == "errors" and (obs.failed or obs.repaired))


def append_capture(path: Path, obs: Observation) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(asdict(obs), ensure_ascii=False) + "\n")


def counter_events(obs: Observation) -> list[dict]:
    """The text-free telemetry events for one observation: one llm-request, one llm-issue per reason."""
    base = {"endpoint": obs.endpoint, "model": obs.model, "ts": obs.ts, **({"lang": obs.lang} if obs.lang else {})}
    return [{"type": "llm-request", **base}] + [{"type": "llm-issue", "reason": r, **base} for r in obs.reasons]


# ---------------------------------------------------------------------------
# Report


def read_capture(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text("utf-8").splitlines():
        try:
            out.append(json.loads(line))
        except ValueError:
            continue
    return out


def _input_end(rec: dict, n: int = 60) -> str:
    text = rec.get("input", {}).get("agent_text") or rec.get("input", {}).get("draft") or ""
    return ("…" + text[-n:]) if len(text) > n else text


def render_report(records: list[dict], examples: int = 10) -> str:
    from collections import Counter

    cell = lambda v: repr(v).replace("|", "\\|") if v is not None else "—"  # noqa: E731
    per = Counter((r.get("endpoint"), r.get("lang") or "—") for r in records)
    reasons = Counter((r.get("endpoint"), reason) for r in records for reason in r.get("reasons", []))
    lines = [
        "# LLM output issues",
        "",
        f"{len(records)} captured requests from `capture/llm.jsonl`. Contains request and answer text: keep it local.",
        "",
        "## Requests",
        "",
        "| Endpoint | Language | Requests |",
        "|---|---|---:|",
        *[f"| {e} | {l} | {n} |" for (e, l), n in sorted(per.items())],
        "",
        "## Reasons",
        "",
        "| Endpoint | Reason | Kind | Count |",
        "|---|---|---|---:|",
        *[
            f"| {e} | {r} | {'failure' if r in FAILURES else 'repair' if r in REPAIRS else 'info'} | {n} |"
            for (e, r), n in sorted(reasons.items(), key=lambda x: (x[0][0], -x[1]))
        ],
    ]
    for (endpoint, reason), n in sorted(reasons.items(), key=lambda x: (x[0][0], -x[1])):
        lines += ["", f"## {endpoint}: {reason} ({n})", "", "| Input (end) | Raw output | Shown |", "|---|---|---|"]
        for rec in [r for r in records if r.get("endpoint") == endpoint and reason in r.get("reasons", [])][:examples]:
            lines.append(f"| {cell(_input_end(rec))} | {cell((rec.get('raw') or '')[:120] if rec.get('raw') is not None else None)} | {cell((rec.get('output') or '')[:120])} |")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    import argparse

    from .settings import ROOT

    p = argparse.ArgumentParser(prog="capture", description="Report on the LLM capture log.")
    p.add_argument("--log", type=Path, default=ROOT / "capture" / "llm.jsonl", help="capture log (default capture/llm.jsonl)")
    p.add_argument("--out", type=Path, default=ROOT / "capture" / "report.md", help="report file (default capture/report.md)")
    args = p.parse_args(argv)
    records = read_capture(args.log)
    if not records:
        print(f"no captured requests in {args.log} (set ASSIST_CAPTURE=errors or all and restart the server)")
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render_report(records), "utf-8")
    print(f"{len(records)} captured requests → {args.out}")
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
