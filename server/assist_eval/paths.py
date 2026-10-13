"""The local, gitignored eval workspaces: eval/local/<kind>/{sources,sets,runs}, kind completion or polish."""

from __future__ import annotations

from pathlib import Path

from assist.settings import ROOT

LOCAL = ROOT / "eval" / "local"
WORKSPACE = LOCAL / "completion"
POLISH_WORKSPACE = LOCAL / "polish"


def workspace(root: Path = WORKSPACE) -> Path:
    for sub in ("sources", "sets", "runs"):
        (root / sub).mkdir(parents=True, exist_ok=True)
    return root


def set_path(name: str, root: Path = WORKSPACE) -> Path:
    return workspace(root) / "sets" / f"{name}.jsonl"
