"""Importing GEC sentence-pair CSVs (a draft with errors and its reference correction) into polish test sets, as is."""

from __future__ import annotations

import csv
import json
import random
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from .cases import language, resolve_input
from .paths import POLISH_WORKSPACE, set_path

# Known layouts, recognized by their header: (source, target, error type).
LAYOUTS = {
    "grammar-correction": ("Ungrammatical Statement", "Standard English", "Error Type"),
    "college-writing": ("original_text", "corrected_text", "primary_error_type"),
}


@dataclass(frozen=True)
class PolishCase:
    id: str
    set: str
    lang: str
    errorType: str
    source: str
    target: str
    count: int
    row: int


@dataclass
class Imported:
    cases: list[PolishCase]
    rows: int
    skipped: int
    layout: str


class LayoutError(ValueError):
    pass


def _columns(header: list[str], source: str | None, target: str | None, kind: str | None) -> tuple[str, str, str | None, str]:
    if source or target:
        if not (source and target):
            raise LayoutError("--source-column and --target-column go together")
        missing = [c for c in (source, target, kind) if c and c not in header]
        if missing:
            raise LayoutError(f"columns not found: {', '.join(missing)}; the file has: {', '.join(header)}")
        return source, target, kind, "columns"
    for name, (s, t, k) in LAYOUTS.items():
        if s in header and t in header:
            return s, t, k if k in header else None, name
    raise LayoutError(f"unknown layout; the file has the columns: {', '.join(header)} (name them with --source-column and --target-column)")


def read_pairs(path: Path, set_name: str, source: str | None = None, target: str | None = None, kind: str | None = None) -> Imported:
    """Every row kept and its text unedited; identical (source, target) pairs become one case with a count."""
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        header = [h.strip() for h in reader.fieldnames or []]
        reader.fieldnames = header
        s, t, k, layout = _columns(header, source, target, kind)
        first: dict[tuple[str, str], tuple[int, str]] = {}
        counts: Counter[tuple[str, str]] = Counter()
        rows = skipped = 0
        for n, row in enumerate(reader, start=2):  # row 1 is the header
            rows += 1
            src, tgt = row.get(s) or "", row.get(t) or ""
            if not src.strip() or not tgt.strip():
                skipped += 1
                continue
            key = (src, tgt)
            counts[key] += 1
            first.setdefault(key, (n, (row.get(k) or "").strip() or "unknown" if k else "unknown"))
    cases = [
        PolishCase(f"{set_name}:{n}", set_name, language(src), error_type, src, tgt, counts[(src, tgt)], n)
        for (src, tgt), (n, error_type) in first.items()
    ]
    return Imported(cases, rows, skipped, layout)


def subset(cases: list[PolishCase], limit: int, seed: int) -> list[PolishCase]:
    """A seeded sample, kept in input order."""
    if limit >= len(cases):
        return cases
    keep = set(random.Random(seed).sample(range(len(cases)), limit))
    return [c for i, c in enumerate(cases) if i in keep]


def write_cases(cases: list[PolishCase], path: Path) -> None:
    path.write_text("".join(json.dumps(asdict(c), ensure_ascii=False) + "\n" for c in cases), "utf-8")


def read_cases(path: Path) -> list[PolishCase]:
    return [PolishCase(**json.loads(line)) for line in path.read_text("utf-8").splitlines() if line.strip()]


def build_command(args, root: Path = POLISH_WORKSPACE) -> int:
    path = resolve_input(args.input, root)
    if not path.exists():
        print(f"✖ input not found: {args.input} (looked in the current folder and {root / 'sources'})")
        return 1
    try:
        imported = read_pairs(path, args.name, args.source_column, args.target_column, args.type_column)
    except LayoutError as err:
        print(f"✖ {err}")
        return 1
    cases = imported.cases if args.limit is None else subset(imported.cases, args.limit, args.seed)
    if not cases:
        print(f"✖ no cases: {imported.rows} rows read, {imported.skipped} skipped with an empty draft or reference")
        return 1
    out = set_path(args.name, root)
    write_cases(cases, out)
    meta = {
        "input": path.name, "layout": imported.layout, "rows": imported.rows, "skipped": imported.skipped, "distinct": len(imported.cases),
        "limit": args.limit, "seed": args.seed, "cases": len(cases), "built": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    out.with_suffix(".meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", "utf-8")
    by_type, by_lang = Counter(c.errorType for c in cases), Counter(c.lang for c in cases)
    unchanged = sum(c.source == c.target for c in cases)
    print(f"{imported.rows} rows read ({imported.layout}), {imported.skipped} skipped, {len(imported.cases)} distinct pairs; {len(cases)} cases → {out}")
    print(f"  {unchanged} cases need no change")
    print("  by language: " + ", ".join(f"{k} {by_lang[k]}" for k in ("en", "ar", "mixed") if by_lang[k]))
    print("  by error type: " + ", ".join(f"{k} {v}" for k, v in by_type.items()))
    return 0
