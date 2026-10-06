"""The local, gitignored eval workspace: eval/local/completion/{sources,sets,runs}."""

from __future__ import annotations

from pathlib import Path

from assist.settings import ROOT

WORKSPACE = ROOT / "eval" / "local" / "completion"


def workspace(root: Path = WORKSPACE) -> Path:
    for sub in ("sources", "sets", "runs"):
        (root / sub).mkdir(parents=True, exist_ok=True)
    return root


def set_path(name: str, root: Path = WORKSPACE) -> Path:
    return workspace(root) / "sets" / f"{name}.jsonl"
