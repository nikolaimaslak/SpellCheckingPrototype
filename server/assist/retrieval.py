"""Lexical retrieval over the canned responses and the knowledge base (BM25-lite)."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Generic, Literal, NamedTuple, Protocol, Sequence, TypeVar

import regex

Lang = Literal["en", "ar"]

# Retrieval-only normalization (not spelling): fold Arabic diacritics, tatweel,
# alef/hamza forms, taa marbuta and alef maqsura so lexical matching tolerates
# the variants agents and customers actually type.
_MARKS = regex.compile("[ً-ٰٟۖ-ۭـ]")
_ALEF = regex.compile("[أإآٱ]")


def normalize(text: str) -> str:
    text = _MARKS.sub("", text.lower())
    return _ALEF.sub("ا", text).replace("ة", "ه").replace("ى", "ي")


STOP = frozenset(
    [
        # English function words and conversational filler
        "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "are", "was", "were", "be", "been", "has", "have",
        "had", "do", "does", "did", "my", "your", "our", "me", "i", "you", "we", "it", "its", "this", "that", "these", "those",
        "will", "would", "can", "could", "should", "may", "with", "from", "by", "at", "as", "if", "up", "so", "not", "no",
        "please", "check", "what", "how", "when", "where", "which", "any", "all", "about", "there", "here", "thank", "thanks",
        # Arabic particles, pronouns and filler (normalized forms)
        "من", "في", "على", "عن", "الي", "او", "و", "ان", "هل", "ما", "لا", "هذا", "هذه", "ذلك", "التي", "الذي", "مع", "كان",
        "انا", "انت", "هو", "هي", "نحن", "لي", "لك", "يرجي", "ممكن", "اريد", "شكرا",
    ]
)  # fmt: skip

_TOKEN = regex.compile(r"[\p{L}\p{N}]+")
# Arabic attaches the article and conjunctions; match on a light stem too.
_STEM = regex.compile(r"^(وال|بال|كال|فال|لل|ال)(?=\p{L}{3})")


def tokens(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(normalize(text)) if len(t) > 1 and t not in STOP]


def stem(token: str) -> str:
    return _STEM.sub("", token, count=1)


class Rankable(Protocol):
    @property
    def id(self) -> str: ...
    @property
    def text(self) -> str: ...


T = TypeVar("T", bound=Rankable)


class Hit(NamedTuple, Generic[T]):
    item: T
    score: float


@dataclass(frozen=True)
class CannedResponse:
    id: str
    lang: Lang
    text: str


@dataclass(frozen=True)
class KbPassage:
    id: str
    lang: Lang
    text: str


def rank(items: Sequence[T], queries: Sequence[tuple[str, float]], k: int, threshold: float) -> list[Hit[T]]:
    """BM25-lite over a small collection with weighted queries. Embeddings can replace this behind the same signature."""
    docs = [(item, [stem(t) for t in tokens(item.text)]) for item in items]
    avg = sum(len(terms) for _, terms in docs) / max(len(docs), 1)
    df: dict[str, int] = {}
    for _, terms in docs:
        for t in set(terms):
            df[t] = df.get(t, 0) + 1

    def idf(t: str) -> float:
        n = df.get(t, 0)
        return math.log(1 + (len(docs) - n + 0.5) / (n + 0.5))

    query = [(stem(t), w) for text, w in queries for t in tokens(text)]
    hits: list[Hit[T]] = []
    for item, terms in docs:
        score = 0.0
        for q, w in query:
            tf = terms.count(q)
            if not tf:
                continue
            score += w * idf(q) * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (len(terms) / avg))))
        if score >= threshold:
            hits.append(Hit(item, score))
    return sorted(hits, key=lambda h: -h.score)[:k]


def retrieve(library: Sequence[CannedResponse], customer: str, prefix: str, k: int = 3, threshold: float = 0.5) -> list[Hit[CannedResponse]]:
    """Canned responses: the customer's last message weighs 1.0, the agent's prefix 0.5."""
    return rank(library, [(customer, 1.0), (prefix, 0.5)], k, threshold)


_SENTENCE = regex.compile(r"[^.!?؟]+[.!?؟]?")


def kb_passages(articles: Sequence[dict]) -> list[KbPassage]:
    """Splits articles into passages of up to two sentences, each prefixed with its title."""
    out: list[KbPassage] = []
    for a in articles:
        sentences = [s.strip() for s in _SENTENCE.findall(a["body"]) if s.strip()]
        for i in range(0, len(sentences), 2):
            out.append(KbPassage(id=f"kb:{a['id']}#{i // 2}", lang=a["lang"], text=f"{a['title']}: {' '.join(sentences[i : i + 2])}"))
    return out


# Minimum score for a knowledge base passage. Calibrated by tests/test_kb.py:
# clear questions about an article pass, greetings and off-topic messages don't.
# A weak match is worse than none, so this is deliberately high.
KB_THRESHOLD = 4.0


def retrieve_kb(passages: Sequence[KbPassage], customer: str, k: int = 2, threshold: float = KB_THRESHOLD) -> list[Hit[KbPassage]]:
    """Knowledge base passages: only the customer's last message, and only strong matches."""
    return rank(passages, [(customer, 1.0)], k, threshold)


DATA = Path(__file__).resolve().parent.parent / "data"


def load_library(path: Path = DATA / "canned.json") -> list[CannedResponse]:
    return [CannedResponse(id=r["id"], lang=r["lang"], text=r["text"]) for r in json.loads(path.read_text("utf-8"))["responses"]]


def load_kb(path: Path = DATA / "kb.json") -> list[KbPassage]:
    return kb_passages(json.loads(path.read_text("utf-8"))["articles"])
