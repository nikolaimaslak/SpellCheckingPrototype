"""The offline test model, ported from the former server/models/fake.ts, on the programs' typed fields."""

import asyncio

from assist.lm import running
from assist.programs import build_programs

RECEIVED = "Your request has been received and will be processed within 3 working days."


def ask(agent_text: str, approved=(RECEIVED,), kb=()) -> str:
    completion, _ = build_programs(None, fake=True)

    async def go():
        with running(None):
            return await completion.acall(agent_text=agent_text, conversation=[], approved_responses=list(approved), knowledge_base=list(kb))

    p = asyncio.run(go())
    return p.continuation


def polish(draft: str) -> str:
    _, program = build_programs(None, fake=True)

    async def go():
        with running(None):
            return await program.acall(draft=draft)

    return asyncio.run(go()).polished


class TestContinuation:
    def test_continues_from_where_the_text_stops(self):
        assert ask("Thank you, your request") == " has been received and will be processed within 3 working days."
        assert ask("It hasn't been proce") == "ssed within 3 working days."

    def test_after_a_space_or_punctuation(self):
        assert ask("Thank you, your request ") == "has been received and will be processed within 3 working days."
        assert ask("Thank you, your request,") == " has been received and will be processed within 3 working days."

    def test_completes_an_arabic_unfinished_word(self):
        assert ask("شكراً، تم استلا", approved=("تم استلام طلبك وسيتم معالجته.",)) == "م طلبك وسيتم معالجته."

    def test_falls_back_to_the_first_knowledge_base_passage(self):
        kb = ("Early retirement eligibility: Early retirement is available to members with at least 25 years of contributions.",)
        assert ask("Early retirement is avail", approved=(), kb=kb) == "able to members with at least 25 years of contributions."

    def test_unmatched_unfinished_word_is_taken_as_finished(self):
        assert ask("Hello Noura", approved=("Thanks.",)) == " Thanks."
        assert ask("Hello Noura", approved=()) == ""


class TestSpecScenarios:
    """assist-service: Offline test model."""

    def test_english_completion_offline(self):
        assert ask("Your request has been rec") == "eived and will be processed within 3 working days."

    def test_arabic_completion_offline(self):
        assert ask("تم استلا", approved=("تم استلام طلبك وسيتم معالجته خلال ثلاثة أيام عمل.",)) == "م طلبك وسيتم معالجته خلال ثلاثة أيام عمل."

    def test_english_continuation_after_a_space_offline(self):
        assert ask("Thank you, your request ") == "has been received and will be processed within 3 working days."

    def test_english_polish_offline(self):
        assert polish("He go to the office and buyed a pen.") == "He went to the office and bought a pen."

    def test_mixed_language_polish_offline(self):
        assert polish("He go to the office. هذه الطلب قيد المراجعة.") == "He went to the office. هذا الطلب قيد المراجعة."

    def test_polish_keeps_plain_text(self):
        assert polish("He go home.") == "He went home."
