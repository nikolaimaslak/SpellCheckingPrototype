from assist.settings import ROOT
from assist_eval.sources import parse_chat, parse_plain, read_input


def roles(conv):
    return [(t.role, t.text) for t in conv.turns]


def test_english_chat():
    p = parse_chat("Customer: My request is stuck.\nAgent: Thank you for waiting, your request has been received.\n")
    assert [roles(c) for c in p.conversations] == [[("customer", "My request is stuck."), ("agent", "Thank you for waiting, your request has been received.")]]


def test_arabic_labels():
    p = parse_chat("العميل: متى سيتم معالجة طلبي؟\nالموظف: شكراً لانتظارك، تم استلام طلبك.\n")
    assert [roles(c) for c in p.conversations] == [[("customer", "متى سيتم معالجة طلبي؟"), ("agent", "شكراً لانتظارك، تم استلام طلبك.")]]


def test_mixed_language_turns_and_continued_lines():
    p = parse_chat("Agent: أهلاً، سأساعدك في your Absher account\nوسأرسل لك رابط الـ reset.\n")
    assert roles(p.conversations[0]) == [("agent", "أهلاً، سأساعدك في your Absher account\nوسأرسل لك رابط الـ reset.")]


def test_conversations_separated():
    p = parse_chat("Customer: one\nAgent: two\n---\nCustomer: three\nAgent: four\n")
    assert [len(c.turns) for c in p.conversations] == [2, 2]
    assert p.conversations[1].turns[0].text == "three"


def test_labels_case_insensitive_spaces_and_comments():
    p = parse_chat("# a comment\nCUSTOMER : hello\n  agent:hi there\r\n")
    assert roles(p.conversations[0]) == [("customer", "hello"), ("agent", "hi there")]


def test_text_before_the_first_label_is_reported_and_skipped():
    p = parse_chat("stray line\n\nCustomer: hello\n")
    assert p.warnings == ["line 1: text before the first role label, skipped"]
    assert roles(p.conversations[0]) == [("customer", "hello")]


def test_plain_text_by_sentences():
    p = parse_plain("Thank you for waiting. Your request has been received.", split="sentences")
    assert [roles(c) for c in p.conversations] == [[("agent", "Thank you for waiting.")], [("agent", "Your request has been received.")]]


def test_plain_text_by_paragraph_and_arabic_question_mark():
    p = parse_plain("هل تريد معرفة حالة طلبك؟ يمكنني المساعدة.\n\nSecond paragraph here.")
    assert [c.turns[0].text for c in p.conversations] == ["هل تريد معرفة حالة طلبك؟ يمكنني المساعدة.", "Second paragraph here."]
    assert len(parse_plain("هل تريد معرفة حالة طلبك؟ يمكنني المساعدة.", split="sentences").conversations) == 2


def test_the_committed_example_parses():
    p = read_input(ROOT / "eval" / "completion" / "examples" / "chat-example.txt")
    assert p.warnings == []
    assert [len(c.turns) for c in p.conversations] == [5, 4, 2]
    assert "\n" in p.conversations[2].turns[1].text
