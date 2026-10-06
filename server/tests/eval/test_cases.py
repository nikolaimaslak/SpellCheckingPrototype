import json
from argparse import Namespace

from assist.programs import Turn
from assist.settings import ROOT
from assist_eval.cases import build_command, cuts, make_cases, read_set
from assist_eval.sources import Conversation, read_input

EXAMPLE = ROOT / "eval" / "completion" / "examples" / "chat-example.txt"


def conv(*agent_messages, customer="Hello"):
    return [Conversation([Turn(role="customer", text=customer), *(Turn(role="agent", text=m) for m in agent_messages)])]


def at(text, category, prefix):
    """The cut offset where text[:i] == prefix, asserted to be eligible in that category."""
    i = len(prefix)
    assert text[:i] == prefix
    assert i in cuts(text)[category], (category, prefix)
    return i


def case_at(text, category, prefix):
    i = at(text, category, prefix)
    cases = make_cases(conv(text), "t", "src", per_category=100)
    return next(c for c in cases if c.category == category and c.source["offset"] == i)


def test_mid_word_case():
    c = case_at("Your contribution records are up to date.", "mid-word", "Your contribution rec")
    assert (c.prefix, c.truthWord, c.truth, c.lang) == ("Your contribution rec", "records", "ords are up to date.", "en")
    assert c.transcript == [{"role": "customer", "text": "Hello"}]


def test_arabic_mid_word_case():
    c = case_at("شكراً لتواصلك معنا، تم استلام طلبك.", "mid-word", "شكراً لتواصلك معنا، تم استلا")
    assert (c.truthWord, c.lang, c.truth) == ("استلام", "ar", "م طلبك.")


def test_each_category_lands_where_defined():
    text = "Thank you for waiting, your request has been received. We will call you."
    assert case_at(text, "end-of-word", "Thank you for waiting").truthWord == "waiting"
    assert case_at(text, "after-punctuation", "Thank you for waiting,").truth == " your request has been received."
    assert case_at(text, "after-space", "Thank you for waiting, your ").truth == "request has been received."
    assert case_at(text, "after-punctuation", "Thank you for waiting, your request has been received.").truth == " We will call you."
    ar = "شكراً لانتظارك يا أخي، سجل الاشتراكات محدث."
    assert case_at(ar, "after-punctuation", "شكراً لانتظارك يا أخي،").truth == " سجل الاشتراكات محدث."
    assert case_at(ar, "end-of-word", "شكراً لانتظارك يا أخي، سجل").truthWord == "سجل"
    mixed = "أهلاً، سأساعدك في فتح your Absher account اليوم."
    c = case_at(mixed, "mid-word", "أهلاً، سأساعدك في فتح your Abs")
    assert (c.truthWord, c.lang) == ("Absher", "mixed")


def test_too_little_typed():
    text = "Hi Noura. Your request has been received and is under review."
    found = cuts(text)
    assert all(i > len("Hi Noura.") for offsets in found.values() for i in offsets)


def test_no_cut_after_the_end_or_inside_decimals_and_links():
    text = "The rate is 2.5 percent, see www.gosi.gov.sa today."
    offsets = {i for o in cuts(text).values() for i in o}
    assert text.index("2.5") + 2 not in offsets  # after "2."
    assert text.index("gosi.") + 5 not in offsets  # after "gosi."
    assert len(text) not in offsets


def test_mid_word_needs_two_typed_letters():
    text = "Thank you for your patience today."
    assert len("Thank you for your p") not in cuts(text)["mid-word"]
    assert len("Thank you for your pa") in cuts(text)["mid-word"]


def test_deterministic_and_seeded():
    parsed = read_input(EXAMPLE)
    a = make_cases(parsed.conversations, "ex", "chat-example.txt", seed=1)
    b = make_cases(parsed.conversations, "ex", "chat-example.txt", seed=1)
    c = make_cases(parsed.conversations, "ex", "chat-example.txt", seed=7)
    assert a == b
    assert a != c


def test_per_category_and_only_agent_messages():
    text = "Thank you for waiting, your request has been received and will be processed soon."
    one = make_cases(conv(text), "t", "src", per_category=1)
    assert sorted(c.category for c in one) == ["after-punctuation", "after-space", "end-of-word", "mid-word"]
    assert len(make_cases(conv(text), "t", "src", per_category=3)) == 3 + 3 + 3 + 1  # one comma in the message
    assert make_cases([Conversation([Turn(role="customer", text=text)])], "t", "src") == []


def test_build_command_writes_the_set_and_fails_on_no_cases(tmp_path, capsys):
    args = Namespace(input=str(EXAMPLE), name="example", plain=False, split="paragraphs", per_category=1, seed=1, limit=None)
    assert build_command(args, root=tmp_path) == 0
    cases = read_set(tmp_path / "sets" / "example.jsonl")
    assert len(cases) == 23 and {c.lang for c in cases} == {"en", "ar", "mixed"}
    assert "by category:" in capsys.readouterr().out
    json.loads((tmp_path / "sets" / "example.jsonl").read_text("utf-8").splitlines()[0])  # one JSON object per line

    (tmp_path / "short.txt").write_text("Agent: Hi.\n", "utf-8")
    args = Namespace(input=str(tmp_path / "short.txt"), name="short", plain=False, split="paragraphs", per_category=1, seed=1, limit=None)
    assert build_command(args, root=tmp_path) == 1
    assert "no cases" in capsys.readouterr().out


def test_build_command_limit_and_sources_folder(tmp_path):
    (tmp_path / "sources").mkdir(parents=True)
    (tmp_path / "sources" / "notes.txt").write_text("Thank you for waiting. Your request has been received and is under review.", "utf-8")
    args = Namespace(input="notes.txt", name="notes", plain=True, split="sentences", per_category=1, seed=1, limit=2)
    assert build_command(args, root=tmp_path) == 0
    assert len(read_set(tmp_path / "sets" / "notes.jsonl")) == 2
