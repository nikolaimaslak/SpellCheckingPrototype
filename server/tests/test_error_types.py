import json
from pathlib import Path

import pytest

from assist.error_types import classify

FIXTURE = Path(__file__).resolve().parents[2] / "test" / "fixtures" / "error-types.json"
cases = json.loads(FIXTURE.read_text("utf-8"))["cases"]


def test_fixture_covers_english_arabic_multi_boundary_and_unclassifiable():
    types = {c["expected"]["type"] if c["expected"] else None for c in cases}
    assert {"transpose", "double", "case", "hamza", "ta-marbuta", "dots", "multi", "boundary", None} <= types


@pytest.mark.parametrize("case", cases, ids=[f"{c['misspelled']}→{c['intended']}({c['lang']})" for c in cases])
def test_matches_the_typescript_classifier(case):
    assert classify(case["misspelled"], case["intended"], case["lang"]) == case["expected"]
