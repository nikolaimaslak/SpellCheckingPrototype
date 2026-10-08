"""Spelling error report: every recorded error word, and dictionary candidates for human review.

Usage: npm run telemetry:spelling [-- --min-sessions N]
Writes telemetry/spelling-report.md and .json from telemetry/events.jsonl.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from html import escape
from pathlib import Path
from typing import Any

from .error_types import classify
from .settings import ROOT
from .telemetry import read_events

CUSTOM_MAX_FIX_SHARE = 0.20  # custom dictionary: accepts under 20% of flags
MISSPELLING_MIN_SHARE = 0.80  # misspellings list: the top replacement is at least 80% of accepts
REMOVAL_MIN_REVERT = 0.30  # removal: reverts at least 30% of auto-corrections
NOTE = "Candidates only: every entry needs human review before it goes into a list. Nothing is added automatically."
_KINDS = ("flag", "accept", "unresolved", "ignore", "autocorrect", "revert")


def _session(e: dict) -> str:
    return str(e.get("session") or "—")


def spelling_report(events: list[dict], min_sessions: int = 3) -> dict[str, Any]:
    """Per language: every error word with its counts, and the three candidate lists."""
    words: dict[tuple[str, str], dict] = {}
    pairs: dict[tuple[str, str, str], dict] = {}
    for e in events:
        kind, lang, original = e.get("type"), e.get("lang"), e.get("original")
        if kind not in _KINDS or lang not in ("en", "ar") or not isinstance(original, str) or not original:
            continue
        w = words.setdefault(
            (lang, original),
            {"word": original, "counts": Counter(), "sessions": set(), "leftSessions": set(), "fixSessions": set(), "fixes": Counter()},
        )
        w["counts"][kind] += 1
        w["sessions"].add(_session(e))
        replacement = e.get("replacement")
        if kind in ("unresolved", "ignore"):
            w["leftSessions"].add(_session(e))
        elif kind == "accept" and isinstance(replacement, str):
            w["fixSessions"].add(_session(e))
            w["fixes"][replacement] += 1
        elif kind in ("autocorrect", "revert") and isinstance(replacement, str):
            p = pairs.setdefault((lang, original, replacement), {"autocorrect": 0, "revert": 0, "sessions": set()})
            p[kind] += 1
            if kind == "autocorrect":
                p["sessions"].add(_session(e))

    out: dict[str, Any] = {}
    for lang in ("en", "ar"):
        mine = [w for (l, _), w in words.items() if l == lang]
        if not mine and not any(l == lang for l, _, _ in pairs):
            continue
        table = sorted(
            (
                {
                    "word": w["word"],
                    "sessions": len(w["sessions"]),
                    **{k: w["counts"][k] for k in _KINDS},
                    "replacements": dict(w["fixes"].most_common()),
                }
                for w in mine
            ),
            key=lambda r: (-r["sessions"], -sum(r[k] for k in _KINDS), r["word"]),
        )
        custom, misspellings = [], []
        for w in mine:
            flags, fixes = w["counts"]["flag"], sum(w["fixes"].values())
            left = w["counts"]["unresolved"] + w["counts"]["ignore"]
            if len(w["leftSessions"]) >= min_sessions and fixes < CUSTOM_MAX_FIX_SHARE * max(flags, left):
                custom.append({"word": w["word"], "sessions": len(w["leftSessions"]), "flags": flags, "left": left, "fixes": fixes})
            if len(w["fixSessions"]) >= min_sessions and fixes:
                top, n = w["fixes"].most_common(1)[0]
                if n >= MISSPELLING_MIN_SHARE * fixes:
                    kind = classify(w["word"], top, lang)
                    misspellings.append({"word": w["word"], "fix": top, "type": kind["type"] if kind else None, "sessions": len(w["fixSessions"]), "fixes": fixes, "share": n / fixes})
        removal = [
            {"word": o, "fix": r, "sessions": len(p["sessions"]), "autocorrects": p["autocorrect"], "reverts": p["revert"], "revertRate": p["revert"] / p["autocorrect"]}
            for (l, o, r), p in pairs.items()
            if l == lang and p["autocorrect"] and len(p["sessions"]) >= min_sessions and p["revert"] >= REMOVAL_MIN_REVERT * p["autocorrect"]
        ]
        order = lambda key: (lambda r: (-r["sessions"], -r[key], r["word"]))  # noqa: E731
        out[lang] = {
            "words": table,
            "customDictionary": sorted(custom, key=order("flags")),
            "misspellings": sorted(misspellings, key=order("fixes")),
            "removal": sorted(removal, key=order("autocorrects")),
        }
    return {"minSessions": min_sessions, "note": NOTE, "languages": out}


def render_markdown(report: dict) -> str:
    lines = ["# Spelling error report", "", f"{report['note']} Minimum sessions: {report['minSessions']}.", ""]
    for lang, r in report["languages"].items():
        lines += [f"## {lang}", "", "### Custom dictionary candidates (left misspelled, rarely fixed)", ""]
        lines += ["| Word | Sessions | Flags | Left | Fixes |", "|---|---:|---:|---:|---:|"] + [
            f"| {c['word']} | {c['sessions']} | {c['flags']} | {c['left']} | {c['fixes']} |" for c in r["customDictionary"]
        ]
        lines += ["", "### Misspellings list candidates (fixed the same way across sessions)", ""]
        lines += ["| Typed | Fix | Type | Sessions | Fixes | Share |", "|---|---|---|---:|---:|---:|"] + [
            f"| {c['word']} | {c['fix']} | {c['type'] or '—'} | {c['sessions']} | {c['fixes']} | {c['share']:.0%} |" for c in r["misspellings"]
        ]
        lines += ["", "### Removal candidates (auto-corrections often reverted)", ""]
        lines += ["| Word | Fix | Sessions | Auto-corrections | Reverts | Revert rate |", "|---|---|---:|---:|---:|---:|"] + [
            f"| {c['word']} | {c['fix']} | {c['sessions']} | {c['autocorrects']} | {c['reverts']} | {c['revertRate']:.0%} |" for c in r["removal"]
        ]
        lines += ["", "### Every error word", "", "| Word | Sessions | Flag | Accept | Left | Ignore | Auto-correct | Revert | Replacements |", "|---|---:|---:|---:|---:|---:|---:|---:|---|"]
        lines += [
            f"| {w['word']} | {w['sessions']} | {w['flag']} | {w['accept']} | {w['unresolved']} | {w['ignore']} | {w['autocorrect']} | {w['revert']} | "
            + ", ".join(f"{k} ×{v}" for k, v in w["replacements"].items())
            + " |"
            for w in r["words"]
        ]
        lines.append("")
    return "\n".join(lines) + "\n"


def render_html_section(report: dict, top: int = 20) -> str:
    """The /summary section: the three candidate lists per language."""
    if not report["languages"]:
        return ""

    def table(head: list[str], rows: list[list[Any]]) -> str:
        if not rows:
            return "<p>None.</p>"
        return "<table><tr>" + "".join(f"<th>{escape(h)}</th>" for h in head) + "</tr>" + "".join(
            "<tr>" + "".join(f"<td>{escape(str(c))}</td>" for c in r) + "</tr>" for r in rows
        ) + "</table>"

    parts = [f"<h2>Dictionary candidates</h2><p>{escape(report['note'])} Minimum sessions: {report['minSessions']}. Full list: <code>npm run telemetry:spelling</code>.</p>"]
    for lang, r in report["languages"].items():
        parts.append(f"<h3>{lang}: custom dictionary</h3>" + table(["Word", "Sessions", "Flags", "Left", "Fixes"], [[c["word"], c["sessions"], c["flags"], c["left"], c["fixes"]] for c in r["customDictionary"][:top]]))
        parts.append(
            f"<h3>{lang}: misspellings list</h3>"
            + table(["Typed", "Fix", "Type", "Sessions", "Share"], [[c["word"], c["fix"], c["type"] or "—", c["sessions"], f"{c['share']:.0%}"] for c in r["misspellings"][:top]])
        )
        parts.append(
            f"<h3>{lang}: remove from the list</h3>"
            + table(["Word", "Fix", "Sessions", "Revert rate"], [[c["word"], c["fix"], c["sessions"], f"{c['revertRate']:.0%}"] for c in r["removal"][:top]])
        )
    return "".join(parts)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="spelling_report", description="Spelling error report from the telemetry log.")
    p.add_argument("--min-sessions", type=int, default=3, help="sessions a word needs to become a candidate (default 3)")
    p.add_argument("--log", type=Path, default=ROOT / "telemetry" / "events.jsonl", help="event log (default telemetry/events.jsonl)")
    p.add_argument("--out", type=Path, default=ROOT / "telemetry", help="folder for spelling-report.md and .json (default telemetry/)")
    args = p.parse_args(argv)
    report = spelling_report(read_events(args.log), args.min_sessions)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "spelling-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", "utf-8")
    (args.out / "spelling-report.md").write_text(render_markdown(report), "utf-8")
    counts = {lang: (len(r["words"]), len(r["customDictionary"]), len(r["misspellings"]), len(r["removal"])) for lang, r in report["languages"].items()}
    for lang, (n, c, m, rm) in counts.items():
        print(f"{lang}: {n} error words · candidates: custom dictionary {c}, misspellings {m}, removal {rm}")
    print(f"report → {args.out / 'spelling-report.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
