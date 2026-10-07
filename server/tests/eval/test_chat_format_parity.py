"""The chat format parsed alike by the eval and the demo page (test/fixtures/chat-format.json)."""

import json

import pytest

from assist.settings import ROOT
from assist_eval.sources import parse_chat

ENTRIES = json.loads((ROOT / "test" / "fixtures" / "chat-format.json").read_text("utf-8"))["entries"]


@pytest.mark.parametrize("entry", ENTRIES, ids=[e["name"] for e in ENTRIES])
def test_matches_the_shared_fixture(entry):
    parsed = parse_chat(entry["text"])
    assert [[{"role": t.role, "text": t.text} for t in c.turns] for c in parsed.conversations] == entry["conversations"]
    assert parsed.warnings == entry["warnings"]
