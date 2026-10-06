import json
from argparse import Namespace

from assist.settings import ROOT
from assist_eval.cases import Case, build_command
from assist_eval.metrics import compute, fold, spacing_error, word_completion_ok
from assist_eval.run import Sample, run_command


def case(category, prefix, truth, word=None, lang="en", cid="c"):
    return Case(id=cid, set="s", lang=lang, category=category, prefix=prefix, transcript=[], truth=truth, truthWord=word, source={})


def sample(completion, edit=None, withheld=None, error=None, cid="c"):
    return Sample(case=cid, sample=0, completion=completion, edit=edit, withheld=withheld, error=error, latencyMs=100)


def test_wrong_arabic_join_reported():
    c = case("mid-word", "شكراً على صبرك، سأرسل لك التفا", "صيل قريباً.", "التفاصيل", lang="ar")
    s = sample("اصيل قريباً.", {"typed": "التفا", "word": "التفااصيل", "rest": " قريباً."})
    assert word_completion_ok(c, s) is False
    m = compute([c], [s])
    assert m["languages"]["ar"]["wordCompletion"] == 0.0
    assert m["failures"]["wordCompletion"] == [(c, s)]


def test_correct_join_with_diacritics_and_case():
    assert fold("المُرور") == fold("المرور") and fold("Records") == "records"
    c = case("mid-word", "Your contribution rec", "ords are up to date.", "records")
    assert word_completion_ok(c, sample("ords are up to date.", {"typed": "rec", "word": "records", "rest": " are up to date."})) is True


def test_finished_word_kept():
    c = case("end-of-word", "Your request", " has been received.", "request")
    assert word_completion_ok(c, sample(" has been received.", {"typed": "request", "word": "request", "rest": " has been received."})) is True
    assert word_completion_ok(c, sample("s are received.", {"typed": "request", "word": "requests", "rest": " are received."})) is False


def test_spacing_error_counted():
    assert spacing_error(case("after-punctuation", "Thank you,", " we have."), sample("we have received your request.")) is True
    assert spacing_error(case("after-punctuation", "Thank you,", " we have."), sample(" we have received your request.")) is False
    assert spacing_error(case("after-space", "Your request ", "has."), sample(" has been received.")) is True
    assert spacing_error(case("after-space", "شكراً لك، تم ", "استلام."), sample("استلام طلبك.")) is False
    assert spacing_error(case("mid-word", "Your req", "uest", "request"), sample("")) is None


def test_rates_by_language_and_category():
    cases = [case("mid-word", "Your req", "uest.", "request", cid="a"), case("after-space", "تم استلام ", "طلبك.", lang="ar", cid="b")]
    samples = [
        sample("uest.", {"typed": "req", "word": "request", "rest": "."}, cid="a"),
        sample("", withheld="format", cid="a"),
        sample("", error="HTTP 504: completion model timed out", cid="b"),
        sample("طلبك.", {"typed": "", "word": "", "rest": "طلبك."}, cid="b"),
    ]
    m = compute(cases, samples)
    a = m["languages"]["all"]
    assert (a["samples"], a["shown"], a["withheld"], a["errors"]) == (4, 0.5, 0.25, 0.25)
    assert m["categories"]["mid-word"]["wordCompletion"] == 1.0
    assert m["categories"]["after-space"]["spacingErrors"] == 0.0
    assert m["languages"]["ar"]["shown"] == 0.5
    assert m["latencyP50"] == 100


def test_end_to_end_with_the_offline_model(tmp_path):
    args = Namespace(input=str(ROOT / "eval" / "completion" / "examples" / "chat-example.txt"), name="ex", plain=False, split="paragraphs", per_category=1, seed=1, limit=None)
    assert build_command(args, root=tmp_path) == 0
    assert run_command(Namespace(set="ex", samples=2, concurrency=4, allow_fake=True), root=tmp_path, env={}) == 0
    (run_dir,) = (tmp_path / "runs").iterdir()
    data = json.loads((run_dir / "report.json").read_text("utf-8"))
    assert data["settings"]["seed"] == 1 and data["settings"]["model"] == "fake"
    a = data["languages"]["all"]
    assert a["samples"] == 23 * 2
    assert sum(data["languages"][lang]["samples"] for lang in ("en", "ar", "mixed")) == a["samples"]
    assert sum(data["categories"][c]["samples"] for c in data["categories"]) == a["samples"]
    assert a["errors"] == 0.0 and a["withheld"] == 0.0
    md = (run_dir / "report.md").read_text("utf-8")
    assert "## By language" in md and "## Wrong word completions" in md and "## Spacing errors" in md
