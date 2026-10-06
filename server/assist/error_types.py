"""The spelling error classifier, ported from eval/error-types.ts for the telemetry summary.

Only `classify` and what it needs are ported; the misspelling inserter stays in
TypeScript with the spelling benchmark. test/fixtures/error-types.json is
checked against both copies, so they can't drift apart.

Edits are named from the misspelling's point of view: `delete` means the
misspelling lacks a letter of the intended word, `insert` that it has an
extra one.
"""

from __future__ import annotations

from typing import Literal, TypedDict

import regex

Lang = Literal["en", "ar"]


class Classification(TypedDict):
    type: str
    # Each edit: op (sub|ins|del|swap), type, at (code-point index in the intended
    # word after removing Arabic marks), from and to (the letters on each side).
    edits: list[dict]


# Tashkeel and tatweel, as in src/spell/arabic.ts.
_MARKS = regex.compile("[ً-ٰٟۖ-ۭـ]")
_ARABIC = regex.compile(r"\p{Script=Arabic}")
_LATIN = regex.compile(r"\p{Script=Latin}")
_BOUNDARY = regex.compile("[\\s\\-‐]")


def strip_marks(word: str) -> str:
    return _MARKS.sub("", word)


def _script_of(word: str) -> Lang | None:
    if _ARABIC.search(word):
        return None if _LATIN.search(word) else "ar"
    return "en" if _LATIN.search(word) else None


def _pairs(*groups: list[str]) -> frozenset[str]:
    return frozenset(a + b for g in groups for a in g for b in g if a != b)


# Hamza seat confusions: alef forms, waw/yaa seats, and the bare hamza against a seated one.
HAMZA = _pairs(["ا", "أ", "إ", "آ"], ["ؤ", "و"], ["ئ", "ي"], ["ئ", "ى"], ["ء", "ؤ"], ["ء", "ئ"], ["ء", "أ"], ["ء", "إ"])
# Letters carrying a hamza: dropping or adding one is a hamza error too ("مسول" for "مسؤول").
HAMZA_LETTERS = frozenset(["ء", "أ", "إ", "آ", "ؤ", "ئ"])
TA_MARBUTA = _pairs(["ة", "ه"])
ALEF_MAQSURA = _pairs(["ى", "ي"])
EMPHATIC = _pairs(["ض", "ظ"], ["ذ", "ز"], ["ص", "س"], ["ط", "ت"])
# Letters sharing a shape (rasm) that differ only in their dots.
DOT_GROUPS = [
    ["ب", "ت", "ث", "ن", "ي"],
    ["ج", "ح", "خ"],
    ["د", "ذ"],
    ["ر", "ز"],
    ["س", "ش"],
    ["ص", "ض"],
    ["ط", "ظ"],
    ["ع", "غ"],
    ["ف", "ق"],
]
DOTS = _pairs(*DOT_GROUPS)
CONFUSIONS = {"hamza": HAMZA, "ta-marbuta": TA_MARBUTA, "alef-maqsura": ALEF_MAQSURA, "emphatic": EMPHATIC, "dots": DOTS}


def _neighbour_map(rows: list[list[str | None]]) -> dict[str, set[str]]:
    """Neighbours on a staggered layout: c±1 in the row, c and c+1 above, c-1 and c below."""

    def at(r: int, c: int) -> str | None:
        if r < 0 or r >= len(rows) or c < 0 or c >= len(rows[r]):
            return None
        return rows[r][c]

    out: dict[str, set[str]] = {}
    for r, row in enumerate(rows):
        for c, key in enumerate(row):
            if not key:
                continue
            near = [at(r, c - 1), at(r, c + 1), at(r - 1, c), at(r - 1, c + 1), at(r + 1, c - 1), at(r + 1, c)]
            out[key] = {k for k in near if k}
    return out


KEYBOARD: dict[Lang, dict[str, set[str]]] = {
    "en": _neighbour_map([list("qwertyuiop"), list("asdfghjkl"), list("zxcvbnm")]),
    # Arabic 101: Q-row, A-row, Z-row; the B key types the لا ligature.
    "ar": _neighbour_map(
        [
            ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "د"],
            ["ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط"],
            ["ئ", "ء", "ؤ", "ر", None, "ى", "ة", "و", "ز", "ظ"],
        ]
    ),
}


def _is_neighbour(lang: Lang, a: str, b: str) -> bool:
    return b.lower() in KEYBOARD[lang].get(a.lower(), set())


def substitution_type(lang: Lang, a: str, b: str) -> str:
    """The type of substituting intended letter a with b, by the documented precedence."""
    if lang == "en" and a != b and a.lower() == b.lower():
        return "case"
    if lang == "ar":
        for t in ("hamza", "ta-marbuta", "alef-maqsura", "emphatic", "dots"):
            if a + b in CONFUSIONS[t]:
                return t
    return "keyboard-sub" if _is_neighbour(lang, a, b) else "substitute"


def _insertion_type(lang: Lang, c: str, prev: str | None, nxt: str | None) -> str:
    if lang == "ar":
        return "hamza" if c in HAMZA_LETTERS else "insert"
    return "double" if c in (prev, nxt) else "insert"


def _deletion_type(lang: Lang, c: str, prev: str | None, nxt: str | None) -> str:
    if lang == "ar":
        return "hamza" if c in HAMZA_LETTERS else "delete"
    return "undouble" if c in (prev, nxt) else "delete"


def _edit_script(s: list[str], t: list[str]) -> list[dict]:
    """Minimal OSA edit script turning s (intended) into t (misspelling)."""
    d = [[j if i == 0 else i if j == 0 else 0 for j in range(len(t) + 1)] for i in range(len(s) + 1)]
    for i in range(1, len(s) + 1):
        for j in range(1, len(t) + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (0 if s[i - 1] == t[j - 1] else 1))
            if i > 1 and j > 1 and s[i - 1] == t[j - 2] and s[i - 2] == t[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    # Walk back, preferring match, then swap, substitution, deletion, insertion:
    # a fixed order keeps the script (and so the types) deterministic.
    edits: list[dict] = []
    i, j = len(s), len(t)
    while i > 0 or j > 0:
        if i > 0 and j > 0 and s[i - 1] == t[j - 1] and d[i][j] == d[i - 1][j - 1]:
            i -= 1
            j -= 1
        elif (
            i > 1
            and j > 1
            and s[i - 1] == t[j - 2]
            and s[i - 2] == t[j - 1]
            and s[i - 1] != s[i - 2]
            and d[i][j] == d[i - 2][j - 2] + 1
        ):
            edits.append({"op": "swap", "at": i - 2, "from": s[i - 2] + s[i - 1], "to": t[j - 2] + t[j - 1]})
            i -= 2
            j -= 2
        elif i > 0 and j > 0 and d[i][j] == d[i - 1][j - 1] + 1:
            edits.append({"op": "sub", "at": i - 1, "from": s[i - 1], "to": t[j - 1]})
            i -= 1
            j -= 1
        elif i > 0 and d[i][j] == d[i - 1][j] + 1:
            edits.append({"op": "del", "at": i - 1, "from": s[i - 1], "to": ""})
            i -= 1
        else:
            edits.append({"op": "ins", "at": i, "from": "", "to": t[j - 1]})
            j -= 1
    edits.reverse()
    return edits


def _at(s: list[str], i: int) -> str | None:
    """s[i] as JavaScript reads it: undefined (None) outside the list, never from the end."""
    return s[i] if 0 <= i < len(s) else None


def classify(misspelled: str, intended: str, lang: Lang) -> Classification | None:
    """
    Classifies a misspelling against its intended word. Returns None when the
    two are the same once Arabic marks are removed, or are in different scripts.
    """
    m = strip_marks(misspelled)
    w = strip_marks(intended)
    if m == w:
        return None
    sm = _script_of(_BOUNDARY.sub("", m))
    sw = _script_of(_BOUNDARY.sub("", w))
    if not sm or sm != sw:
        return None
    if len(_BOUNDARY.findall(m)) != len(_BOUNDARY.findall(w)):
        return {"type": "boundary", "edits": []}

    s, t = list(w), list(m)
    edits = []
    for e in _edit_script(s, t):
        at = e["at"]
        if e["op"] == "swap":
            kind = "transpose"
        elif e["op"] == "sub":
            kind = substitution_type(lang, e["from"], e["to"])
        elif e["op"] == "del":
            kind = _deletion_type(lang, e["from"], _at(s, at - 1), _at(s, at + 1))
        else:
            # Neighbours of the extra letter in the misspelling: the intended letters on either side.
            kind = _insertion_type(lang, e["to"], _at(s, at - 1), _at(s, at))
        edits.append({**e, "type": kind})
    return {"type": edits[0]["type"] if len(edits) == 1 else "multi", "edits": edits}
