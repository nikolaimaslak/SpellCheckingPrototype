import pytest

from assist.postprocess import Edit, derive_edit, finalize, finalize_explained, join, join_explained


def shown(prefix: str, continuation: str) -> str:
    out = join(prefix, continuation)
    e = derive_edit(prefix, out)
    assert out == e.word[len(e.typed) :] + e.rest  # the edit always describes the completion
    return out


class TestJoin:
    """Continuation assembly: spacing that is never ambiguous, the rewritten word dropped, the model's join kept."""

    @pytest.mark.parametrize(
        ("prefix", "continuation", "expected"),
        [
            # mid-word: the model's join is kept
            ("It hasn't been proce", "ssed yet, but it is under review.", "ssed yet, but it is under review."),
            ("Please use the Abshe", "r app now.", "r app now."),
            ("Before jumping into Ollam", "a, I can help you.", "a, I can help you."),
            ("I will send you the detai", "ils soon.", "ils soon."),  # a wrong join is shown as written
            # after a finished word: kept as written
            ("Thank you, your request", " will be processed soon.", " will be processed soon."),
            # after a space: no leading space
            ("Thank you, your request ", "will be processed soon.", "will be processed soon."),
            ("Thank you, your request ", " will be processed soon.", "will be processed soon."),
            ("Your refund was approved. ", "  Anything else?", "Anything else?"),
            # after punctuation: one space
            ("Please upload the form,", "today if possible.", " today if possible."),
            ("Please upload the form,", " today if possible.", " today if possible."),
            ("Please upload the form.", "..", ""),
            # the unfinished word written again from its start
            ("It hasn't been proce", "Processed yet.", "ssed yet."),
            ("If it weren't for the arcane name you could have be", "been easily confused.", "en easily confused."),
            # restated tail
            ("Thank you, your request ", "your request will be processed soon.", "will be processed soon."),
            ("Thank you,", " Thank you, your request is received.", " your request is received."),
            # Arabic and mixed
            ("تم استلا", "م طلبك وسيتم معالجته", "م طلبك وسيتم معالجته"),
            ("أهلاً، سأساعدك في فتح حساب", "ك.", "ك."),
            ("شكراً على صبرك، سأرسل لك التفا", "اصيل قريباً.", "اصيل قريباً."),  # shown as written
            ("تم فتح ticket جديد. ", " وسيتواصل معك المختصون قريباً.", "وسيتواصل معك المختصون قريباً."),
            ("شكراً لك،", "تم استلام طلبك.", " تم استلام طلبك."),
            ("مرحبا، your Absher acc", "ount is locked.", "ount is locked."),
        ],
    )
    def test_join(self, prefix, continuation, expected):
        assert shown(prefix, continuation) == expected

    def test_nothing_to_add(self):
        assert shown("Thank you, your request", "") == ""

    def test_only_the_first_line(self):
        assert shown("Your request ", "will be processed\nThanks") == "will be processed"

    def test_letters_outside_the_bmp(self):
        # Python slices code points where JavaScript sliced UTF-16 units; typed and the join count alike.
        assert shown("Thanks 👍 see 𝐀b", "c now.") == "c now."


class TestDeriveEdit:
    def test_join(self):
        assert derive_edit("It hasn't been proce", "ssed yet.") == Edit("proce", "processed", " yet.")

    def test_after_a_finished_word(self):
        assert derive_edit("Thank you, your request", " will be processed soon.") == Edit("request", "request", " will be processed soon.")

    def test_after_a_space_or_punctuation(self):
        assert derive_edit("Thank you, your request ", "will be processed soon.") == Edit("", "", "will be processed soon.")
        assert derive_edit("Thank you,", " we got it.") == Edit("", "", " we got it.")

    def test_arabic(self):
        assert derive_edit("تم استلا", "م طلبك.") == Edit("استلا", "استلام", " طلبك.")
        assert derive_edit("أهلاً، سأساعدك في فتح حساب", "ك.") == Edit("حساب", "حسابك", ".")


class TestFinalize:
    @pytest.mark.parametrize(
        ("prefix", "completion", "expected"),
        [
            ("Thank you, your request", " will be processed. Anything else?", " will be processed."),  # cuts after the first sentence
            ("Your request ", "will be processed\nThanks", "will be processed"),  # cuts at a newline
            ("Thank you, your request ", "your request will be processed.", "will be processed."),  # removes a restated prefix tail
            ("Thank you,", " Thank you, your request is received.", " your request is received."),  # restated tail after punctuation
            ("هل تريد ", "معرفة حالة طلبك؟ يمكنني المساعدة", "معرفة حالة طلبك؟"),  # Arabic question mark terminates
            ("تم استلا", "م طلبك وسيتم معالجته.", "م طلبك وسيتم معالجته."),  # keeps a mid-word join
        ],
    )
    def test_cases(self, prefix, completion, expected):
        assert finalize(prefix, completion) == expected

    def test_caps_at_20_words(self):
        rest = " " + " ".join(f"w{i}" for i in range(30))
        out = shown("Your request", rest)
        assert out.startswith(" w0")
        assert len(out.split()) == 20

    def test_rejects_the_wrong_script(self):
        assert shown("تم استلام طلبك", " and will be processed.") == ""
        assert shown("Your request ", "سيتم معالجته.") == ""

    def test_keeps_emails_links_and_decimals_whole_when_cutting_to_one_sentence(self):
        assert finalize("Thank you,", " we will write to noura@example.com. Anything else?") == " we will write to noura@example.com."
        assert finalize("Thank you,", " see www.gosi.gov.sa for details.") == " see www.gosi.gov.sa for details."
        assert finalize("The rate is", " 2.5 percent. Thanks") == " 2.5 percent."
        assert finalize("هل تريد ", "معرفة حالة طلبك؟ يمكنني المساعدة") == "معرفة حالة طلبك؟"

    def test_ignores_emails_and_links_in_the_script_check(self):
        assert finalize("شكراً، سنرسل التحديث إلى", " noura@example.com.") == " noura@example.com."
        assert finalize("يرجى زيارة", " www.gosi.gov.sa للمزيد.") == " www.gosi.gov.sa للمزيد."
        assert finalize("شكراً، سنرسل التحديث إلى", " noura@example.com and more.") == ""

    def test_returns_empty_for_nothing_useful(self):
        assert finalize("Your request", "") == ""
        assert finalize("Your request", " ...  ") == ""

    def test_terminator_before_a_final_newline_is_javascript_end_of_text(self):
        # JavaScript's $ doesn't match before a trailing newline; the port keeps that.
        assert finalize("The rate is", " 2.5 percent.") == " 2.5 percent."


class TestIssueReasons:
    """join_explained / finalize_explained: the reason for every repair or rejection (llm-capture)."""

    @pytest.mark.parametrize(
        ("prefix", "continuation", "shown", "reasons"),
        [
            # spec scenarios
            ("It hasn't been proce", "Processed yet.", "ssed yet.", ["rewrote-word"]),
            ("Thank you, your request ", " will be processed. Anything else?", "will be processed.", ["space-after-space", "multi-sentence"]),
            ("تم استلام طلبك", " and will be processed.", "", ["wrong-script"]),
            ("شكراً، سأرسل الرابط to your email,", "today.", " today.", ["missing-space"]),
            ("Thank you, your request", " will be processed soon.", " will be processed soon.", []),
            # the other reasons
            ("Your request ", "will be processed\nThanks for waiting", "will be processed", ["multi-line"]),
            ("Thank you, your request ", "your request will be processed.", "will be processed.", ["restated-prefix"]),
            ("Your request", " " + " ".join(f"w{i}" for i in range(30)), " " + " ".join(f"w{i}" for i in range(20)), ["too-long"]),
            ("Please upload the form.", "..", "", ["nothing-left"]),
            ("تم استلا", "م طلبك وسيتم معالجته. شكراً لك", "م طلبك وسيتم معالجته.", ["multi-sentence"]),
            ("Your request", "", "", []),
        ],
    )
    def test_reasons(self, prefix, continuation, shown, reasons):
        assert join_explained(prefix, continuation) == (shown, reasons)
        assert join(prefix, continuation) == shown

    def test_finalize_wrapper_unchanged(self):
        assert finalize_explained("Thank you,", " see www.gosi.gov.sa for details. Anything else?") == (" see www.gosi.gov.sa for details.", ["multi-sentence"])
