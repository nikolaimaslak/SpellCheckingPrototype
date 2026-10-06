"""Turns the model's continuation into a safe suggestion for the agent's text.

finalize and script_of are line-for-line ports of the former
server/postprocess.ts. Where Python's regex semantics differ from
JavaScript's, the JavaScript behavior is kept: `$` is `\\Z` (no match before a
final newline) and the `\\b` before links is ASCII-only.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import regex

Lang = Literal["en", "ar"]

MAX_WORDS = 20
# A sentence ends at . ! ? ؟ followed by whitespace or the end, so emails, links and decimals stay whole.
_TERMINATOR = regex.compile(r"[.!?؟](?=\s|\Z)")
# Emails and links are written in Latin letters in either language: they don't decide the script.
_IDENTIFIER = regex.compile(
    r"(?<![A-Za-z0-9_])(?:https?://|www\.)\S+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+"
)
_TYPED = regex.compile(r"[\p{L}\p{N}\p{M}]+\Z")
_WORD_START = regex.compile(r"^[\p{L}\p{N}\p{M}]")
_ALNUM_START = regex.compile(r"^[\p{L}\p{N}]")
_ALNUM = regex.compile(r"[\p{L}\p{N}]")
_ENDS_SPACE = regex.compile(r"\s\Z")
_STARTS_SPACE = regex.compile(r"^\s")
_LETTERS = regex.compile(r"[\p{L}\p{M}]+")
_ARABIC = regex.compile(r"\p{Script=Arabic}")
_LATIN = regex.compile(r"\p{Script=Latin}")
_SPACE_OR_PUNCT = regex.compile(r"[\s\p{P}]")


def script_of(text: str) -> Lang | None:
    """Script of the last word: decides the reply language and the post-processing script check."""
    words = _LETTERS.findall(text)
    last = words[-1] if words else ""
    if _ARABIC.search(last):
        return "ar"
    if _LATIN.search(last):
        return "en"
    return None


@dataclass(frozen=True)
class Edit:
    """The edit a suggestion makes: completion = word without its first len(typed) characters, then rest."""

    typed: str
    word: str
    rest: str


_LEAD = regex.compile(r"^[\p{L}\p{N}\p{M}]+")


def typed_part(prefix: str) -> str:
    """The agent's unfinished (or just finished) word: the prefix's trailing letters, digits and marks."""
    m = _TYPED.search(prefix)
    return m.group(0) if m else ""


def join(prefix: str, continuation: str) -> str:
    """
    The model's continuation → the suggestion. Only what is never ambiguous is
    adjusted: the unfinished word written again from its start is dropped
    ("proce" + "Processed yet." → "ssed yet."), there is no space after a space
    and one after punctuation. A join the model makes inside a word is kept as
    written; it is not checked against a dictionary. Then finalize's checks.
    """
    out = regex.split(r"\r?\n", continuation, maxsplit=1)[0]
    typed = typed_part(prefix)
    if typed and out[: len(typed)].lower() == typed.lower() and _WORD_START.match(out[len(typed) :]):
        out = out[len(typed) :]
    if _ENDS_SPACE.search(prefix):
        out = out.lstrip()
    elif not typed and _ALNUM_START.search(out):
        out = f" {out}"
    return finalize(prefix, out)


def derive_edit(prefix: str, completion: str) -> Edit:
    """The reply's edit: the typed word, the word it becomes, and what follows."""
    typed = typed_part(prefix)
    lead = _LEAD.match(completion) if typed else None
    if lead:
        return Edit(typed, typed + lead.group(0), completion[lead.end() :])
    return Edit(typed, typed, completion)


def finalize(prefix: str, completion: str) -> str:
    """
    Keeps a suggestion safe to show: one line, no restating of the prefix's
    tail, at most one sentence and 20 words, same script as the prefix's last
    word. Returns '' when nothing usable remains. The leading characters
    assemble produced (a join or a space) are kept.
    """
    out = regex.split(r"\r?\n", completion, maxsplit=1)[0].rstrip()

    # A new word that restates the prefix's tail ("…your request " + "your request will…").
    mid_word = bool(_TYPED.search(prefix)) and bool(_WORD_START.search(out))
    if not mid_word:
        body = out.lstrip()
        lower = body.lower()
        prefix_words = regex.split(r"\s+", prefix.strip())
        for n in range(min(len(prefix_words), 12), 0, -1):
            tail = " ".join(prefix_words[-n:]).lower()
            if lower.startswith(tail) and (len(lower) == len(tail) or _SPACE_OR_PUNCT.match(lower[len(tail)])):
                out = body[len(tail) :].lstrip()
                if not _ENDS_SPACE.search(prefix) and _ALNUM_START.search(out):
                    out = f" {out}"
                break

    end = _TERMINATOR.search(out)
    if end:
        out = out[: end.start() + 1]
    words = [w for w in regex.split(r"\s+", out) if w]
    if len(words) > MAX_WORDS:
        out = (" " if _STARTS_SPACE.search(out) else "") + " ".join(words[:MAX_WORDS])
    if not _ALNUM.search(out):
        return ""

    want = script_of(prefix)
    first = _LETTERS.search(_IDENTIFIER.sub(" ", out))
    got = script_of(first.group(0) if first else "")
    if want and got and want != got:
        return ""
    return out
