"""Input parsing: chat text (role-labelled turns) or plain text (agent messages only)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import regex

from assist.programs import Turn

_LABEL = regex.compile(r"^\s*(customer|agent|العميل|الموظف)\s*:\s*(.*)$", regex.IGNORECASE)
_ROLES = {"customer": "customer", "العميل": "customer", "agent": "agent", "الموظف": "agent"}
_SENTENCE_END = regex.compile(r"(?<=[.!?؟])\s+")


@dataclass
class Conversation:
    turns: list[Turn] = field(default_factory=list)


@dataclass
class Parsed:
    conversations: list[Conversation]
    warnings: list[str]


def _normalize(text: str) -> str:
    return regex.sub(r"\r\n?", "\n", text)


def parse_chat(text: str) -> Parsed:
    """Turns start with `Customer:` / `Agent:` (or `العميل:` / `الموظف:`); unlabelled lines continue the turn; `---` ends a conversation; `#` lines are comments."""
    conversations: list[Conversation] = []
    warnings: list[str] = []
    current = Conversation()
    role: str | None = None
    lines: list[str] = []

    def close_turn() -> None:
        nonlocal role, lines
        if role and "\n".join(lines).strip():
            current.turns.append(Turn(role=role, text="\n".join(lines).strip()))
        role, lines = None, []

    def close_conversation() -> None:
        nonlocal current
        close_turn()
        if current.turns:
            conversations.append(current)
        current = Conversation()

    for number, line in enumerate(_normalize(text).split("\n"), start=1):
        if line.strip().startswith("#"):
            continue
        if line.strip() == "---":
            close_conversation()
            continue
        label = _LABEL.match(line)
        if label:
            close_turn()
            role, lines = _ROLES[label.group(1).lower()], [label.group(2)]
        elif line.strip():
            if role is None:
                warnings.append(f"line {number}: text before the first role label, skipped")
            else:
                lines.append(line.strip())
    close_conversation()
    return Parsed(conversations, warnings)


def parse_plain(text: str, split: str = "paragraphs") -> Parsed:
    """Every paragraph (or, with split="sentences", every sentence) is an agent message with no conversation."""
    paragraphs = [p.strip() for p in regex.split(r"\n\s*\n", _normalize(text)) if p.strip()]
    messages = [s.strip() for p in paragraphs for s in (_SENTENCE_END.split(p) if split == "sentences" else [p]) if s.strip()]
    return Parsed([Conversation([Turn(role="agent", text=m)]) for m in messages], [])


def read_input(path: Path, plain: bool = False, split: str = "paragraphs") -> Parsed:
    text = path.read_text("utf-8")
    return parse_plain(text, split) if plain else parse_chat(text)
