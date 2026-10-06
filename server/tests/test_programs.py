import asyncio

import pytest
from dspy.utils.exceptions import AdapterParseError

from assist.lm import build_lm, running
from assist.programs import ADAPTER, ContinueText, CompletionProgram, PolishDraft, PolishProgram, TypedJSONAdapter, Turn
from assist.settings import select_model

GEMINI = select_model({"GEMINI_API_KEY": "test-key"})[0]


def run(coro):
    return asyncio.run(coro)


def complete(scripted, answer, *, max_turns=None, turns=(), **inputs):
    scripted.answer(answer)
    lm = build_lm(GEMINI, cache=False)

    async def go():
        with running(lm):
            return await CompletionProgram(max_turns).acall(
                agent_text=inputs.get("agent_text", "Thank you, your request"),
                conversation=list(turns),
                approved_responses=inputs.get("approved_responses", []),
                knowledge_base=inputs.get("knowledge_base", []),
            )

    return run(go())


def polish(scripted, answer, draft="He go home."):
    scripted.answer(answer)
    lm = build_lm(GEMINI, cache=False)

    async def go():
        with running(lm):
            return await PolishProgram().acall(draft=draft)

    return run(go())


class TestSignatures:
    def test_input_fields_are_in_stable_first_order(self):
        assert list(ContinueText.input_fields) == ["approved_responses", "knowledge_base", "conversation", "agent_text"]
        assert list(ContinueText.output_fields) == ["continuation"]
        assert ContinueText.output_fields["continuation"].annotation is str

    def test_completion_instructions_carry_the_required_rules(self):
        text = ContinueText.instructions
        # Appended directly after agent_text, one rule per ending, each with an Arabic example too.
        assert "`continuation` is appended to `agent_text` exactly as you write it" in text
        assert "ends in the middle of a word: start with the missing letters of that word, with no space" in text
        assert "ends with a complete word: start with a space" in text
        assert "ends with a space: start directly with the next word, with no space" in text
        assert "ends with punctuation: start with a space, then the next word" in text
        assert text.count("→") == 8 and "تم استلا" in text and "شكراً لك،" in text
        assert "Never repeat any part of `agent_text`." in text
        assert "`word`" not in text and "`rest`" not in text
        assert "Saudi" not in text and "organization" not in text
        # Same language and script, one sentence.
        assert "at most one sentence, in the same language and script" in text
        # Details only from the sources; no ban on details.
        assert "only as they appear in `conversation`, `approved_responses` or `knowledge_base`; never invent them" in text
        assert "Do not invent policies" in text
        for banned in ("Do not mention numbers", "never use names", "no dates"):
            assert banned not in text

    def test_polish_instructions_keep_protected_content(self):
        text = PolishDraft.instructions
        assert "Fix only errors" in text
        assert "Keep every placeholder like $(user.firstName), every URL, email address, number and reference code exactly as written" in text
        assert list(PolishDraft.output_fields) == ["polished"]

    def test_both_programs_use_the_typed_json_adapter(self, scripted):
        assert isinstance(ADAPTER, TypedJSONAdapter)
        complete(scripted, '{"continuation": " is received."}')
        polish(scripted, '{"polished": "He went home."}')
        # JSON adapter wording, and a JSON schema response format on each call.
        for call in scripted.calls:
            assert "Respond with a JSON object" in call["messages"][-1]["content"]
            assert "response_format" in call
        assert len(scripted.calls) == 2


class TestConversationLength:
    TURNS = [Turn(role="customer" if i % 2 == 0 else "agent", text=f"turn {i}") for i in range(12)]

    def test_full_conversation_by_default(self, scripted):
        complete(scripted, '{"continuation": ""}', turns=self.TURNS)
        sent = scripted.user_message
        assert all(f'"turn {i}"' in sent for i in range(12))

    def test_limited_by_setting(self, scripted):
        complete(scripted, '{"continuation": ""}', turns=self.TURNS, max_turns=6)
        sent = scripted.user_message
        assert all(f'"turn {i}"' in sent for i in range(6, 12))
        assert not any(f'"turn {i}"' in sent for i in range(6))
        assert sent.index('"turn 6"') < sent.index('"turn 11"')


class TestParsing:
    """Lenient in form, strict in type."""

    @pytest.mark.parametrize(
        "raw",
        [
            '{"continuation": " is received."}',
            'Sure! {"continuation": " is received."}',
            '```json\n{"continuation": " is received."}\n```',
            '{"continuation": " is received.", "confidence": 0.9}',
            '{"continuation": " is received."',
        ],
    )
    def test_reads_json_in_any_wrapping(self, scripted, raw):
        p = complete(scripted, raw)
        assert p.continuation == " is received."

    @pytest.mark.parametrize(
        "raw",
        [
            '{"continuation": 5}',
            '{"continuation": null}',
            '{"continuation": ["order"]}',
            '{"word": "order", "rest": " ships today."}',
            "Sure! here you go",
            "null",
        ],
    )
    def test_rejects_wrong_types_and_missing_fields(self, scripted, raw):
        with pytest.raises(AdapterParseError):
            complete(scripted, raw)
        assert len(scripted.calls) == 1  # no retry in another format

    def test_polish_number_is_not_converted(self, scripted):
        with pytest.raises(AdapterParseError):
            polish(scripted, '{"polished": 42}')
        assert len(scripted.calls) == 1
