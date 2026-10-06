"""Cutting agent messages into completion cases, with the agent's real text as the truth."""

from __future__ import annotations

import json
import random
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import regex

from .paths import WORKSPACE, set_path, workspace
from .sources import Conversation, read_input

CATEGORIES = ("mid-word", "end-of-word", "after-space", "after-punctuation")
_WORD = regex.compile(r"[\p{L}\p{N}\p{M}]")
_PUNCT = frozenset(",:;.!?؟،")
_SENTENCE_BREAK = regex.compile(r"[.!?؟]\s+")
_SENTENCE_END = regex.compile(r"[.!?؟](?=\s|\Z)")
_WORDS = regex.compile(r"[\p{L}\p{N}]+")
_ARABIC = regex.compile(r"\p{Script=Arabic}")
_LATIN = regex.compile(r"\p{Script=Latin}")


@dataclass(frozen=True)
class Case:
    id: str
    set: str
    lang: str
    category: str
    prefix: str
    transcript: list[dict]
    truth: str
    truthWord: str | None
    source: dict


def _is_word(ch: str) -> bool:
    return bool(_WORD.match(ch))


def language(text: str) -> str:
    ar, la = bool(_ARABIC.search(text)), bool(_LATIN.search(text))
    return "mixed" if ar and la else "ar" if ar else "en"


def _category(text: str, i: int) -> str | None:
    """The category of a cut between text[i-1] and text[i], or None."""
    before, after = text[i - 1], text[i]
    if _is_word(before):
        if _is_word(after):
            start = i
            while start > 0 and _is_word(text[start - 1]):
                start -= 1
            return "mid-word" if i - start >= 2 else None
        if after.isspace() or after in _PUNCT:
            return "end-of-word"
        return None
    if before.isspace():
        return "after-space" if i >= 2 and _is_word(text[i - 2]) and not after.isspace() else None
    if before in _PUNCT and after.isspace():
        return "after-punctuation"
    return None


def _eligible(text: str, i: int) -> bool:
    """At least 3 words in the sentence typed so far, and some text after the cut."""
    breaks = list(_SENTENCE_BREAK.finditer(text[:i]))
    sentence = text[:i][breaks[-1].end() :] if breaks else text[:i]
    return len(_WORDS.findall(sentence)) >= 3 and bool(text[i:].strip())


def _truth(text: str, i: int) -> str:
    end = _SENTENCE_END.search(text, i + 1 if i < len(text) and text[i] in ".!?؟" else i)
    return text[i : end.end()] if end else text[i:]


def _truth_word(text: str, i: int, category: str) -> str | None:
    if category not in ("mid-word", "end-of-word"):
        return None
    start, end = i, i
    while start > 0 and _is_word(text[start - 1]):
        start -= 1
    while category == "mid-word" and end < len(text) and _is_word(text[end]):
        end += 1
    return text[start:end]


def cuts(text: str) -> dict[str, list[int]]:
    """Eligible cut offsets per category."""
    out: dict[str, list[int]] = {c: [] for c in CATEGORIES}
    for i in range(1, len(text)):
        category = _category(text, i)
        if category and _eligible(text, i):
            out[category].append(i)
    return out


def make_cases(conversations: list[Conversation], set_name: str, source: str, per_category: int = 1, seed: int = 1) -> list[Case]:
    cases: list[Case] = []
    for c, conv in enumerate(conversations):
        for m, turn in enumerate(conv.turns):
            if turn.role != "agent":
                continue
            transcript = [{"role": t.role, "text": t.text} for t in conv.turns[:m]]
            rng = random.Random(f"{seed}:{source}:{c}:{m}")
            chosen = []
            for category, offsets in cuts(turn.text).items():
                chosen += [(i, category) for i in sorted(rng.sample(offsets, min(per_category, len(offsets))))]
            for i, category in sorted(chosen):
                cases.append(
                    Case(
                        id=f"{set_name}:{c}:{m}:{category}:{i}",
                        set=set_name,
                        lang=language(turn.text),
                        category=category,
                        prefix=turn.text[:i],
                        transcript=transcript,
                        truth=_truth(turn.text, i),
                        truthWord=_truth_word(turn.text, i, category),
                        source={"file": source, "conversation": c, "message": m, "offset": i},
                    )
                )
    return cases


def write_set(cases: list[Case], path: Path) -> None:
    path.write_text("".join(json.dumps(asdict(case), ensure_ascii=False) + "\n" for case in cases), "utf-8")


def read_set(path: Path) -> list[Case]:
    return [Case(**json.loads(line)) for line in path.read_text("utf-8").splitlines() if line.strip()]


def resolve_input(name: str, root: Path = WORKSPACE) -> Path:
    path = Path(name)
    return path if path.exists() else workspace(root) / "sources" / name


def build_command(args, root: Path = WORKSPACE) -> int:
    path = resolve_input(args.input, root)
    if not path.exists():
        print(f"✖ input not found: {args.input} (looked in the current folder and {root / 'sources'})")
        return 1
    parsed = read_input(path, plain=args.plain, split=args.split)
    for warning in parsed.warnings:
        print(f"warning: {warning}")
    cases = make_cases(parsed.conversations, args.name, path.name, args.per_category, args.seed)
    if args.limit is not None:
        cases = cases[: args.limit]
    if not cases:
        agents = sum(t.role == "agent" for c in parsed.conversations for t in c.turns)
        print(f"✖ no cases: {agents} agent messages read, none with a cut after at least 3 typed words of a sentence")
        return 1
    out = set_path(args.name, root)
    write_set(cases, out)
    meta = {"input": path.name, "plain": args.plain, "split": args.split, "perCategory": args.per_category, "seed": args.seed, "limit": args.limit, "cases": len(cases), "built": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    out.with_suffix(".meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", "utf-8")
    by_lang, by_cat = Counter(c.lang for c in cases), Counter(c.category for c in cases)
    print(f"{len(cases)} cases → {out}")
    print("  by language: " + ", ".join(f"{k} {by_lang[k]}" for k in ("en", "ar", "mixed") if by_lang[k]))
    print("  by category: " + ", ".join(f"{k} {by_cat[k]}" for k in CATEGORIES if by_cat[k]))
    return 0
