"""The typed DSPy programs: the only way the service calls a language model.

Every program runs through TypedJSONAdapter (never ChatAdapter) so a model
answer is read as JSON: lenient in form, strict in type. The offline test
model swaps each program's predictor for a deterministic one that reads the
same typed fields.
"""

from __future__ import annotations

from typing import Any, Literal

import dspy
import json_repair
import pydantic
import regex
from dspy.adapters import JSONAdapter
from dspy.utils.exceptions import AdapterParseError

# ---------------------------------------------------------------------------
# Adapter


def _json_object(completion: str) -> Any:
    """The JSON value DSPy's JSONAdapter would read: the whole answer, or else the first {...} in it."""
    fields = json_repair.loads(completion)
    if not isinstance(fields, dict):
        match = regex.search(r"\{(?:[^{}]|(?R))*\}", completion, regex.DOTALL)
        if match:
            fields = json_repair.loads(match.group(0))
    return fields


class TypedJSONAdapter(JSONAdapter):
    """
    JSONAdapter whose parse keeps DSPy's leniency in form (JSON inside prose or
    a fence, a cut-off object, extra fields) but not its type conversion: a
    declared str output must be a string in the model's own answer, so 5 never
    becomes "5" and null never becomes "None".
    """

    def parse(self, signature: type[dspy.Signature], completion: str) -> dict[str, Any]:
        fields = _json_object(completion)
        if isinstance(fields, dict):
            for name, field in signature.output_fields.items():
                if name in fields and field.annotation is str and not isinstance(fields[name], str):
                    raise AdapterParseError(
                        adapter_name=type(self).__name__,
                        signature=signature,
                        lm_response=completion,
                        message=f"Field {name} is not a string.",
                    )
        return super().parse(signature, completion)


ADAPTER = TypedJSONAdapter()

# ---------------------------------------------------------------------------
# Completion


class Turn(pydantic.BaseModel):
    role: Literal["customer", "agent"]
    text: str


class ContinueText(dspy.Signature):
    """You continue the text a contact-center agent is typing to a customer.
    `continuation` is appended to `agent_text` exactly as you write it, with nothing added in between, so it must start exactly where `agent_text` stops:
    - `agent_text` ends in the middle of a word: start with the missing letters of that word, with no space. "Your request is being proce" → "ssed today." and "تم استلا" → "م طلبك."
    - `agent_text` ends with a complete word: start with a space, or with punctuation that belongs right after the word. "Your request" → " has been received." and "تم استلام طلبك" → " وسيتم معالجته قريباً."
    - `agent_text` ends with a space: start directly with the next word, with no space. "Your request " → "has been received." and "تم استلام " → "طلبك."
    - `agent_text` ends with punctuation: start with a space, then the next word. "Thank you," → " we have received your request." and "شكراً لك،" → " تم استلام طلبك."
    After a space or punctuation, including a colon that introduces what follows, the agent is waiting for the next words: suggest them. Return an empty `continuation` only when no continuation fits the conversation at all.
    Never repeat any part of `agent_text`.
    Write at most one sentence, in the same language and script as `agent_text` (Arabic or English).
    Prefer the wording of `approved_responses` when they fit. Use `knowledge_base` only for facts it states. Do not invent policies that are not in the approved responses, the knowledge base or the conversation.
    Use names, numbers, amounts, dates, time periods, reference numbers, email addresses and links only as they appear in `conversation`, `approved_responses` or `knowledge_base`; never invent them."""

    # Stable inputs first, the changing agent text last, so consecutive requests share a prompt prefix.
    approved_responses: list[str] = dspy.InputField(desc="Approved wording for this kind of reply; may be empty.")
    knowledge_base: list[str] = dspy.InputField(desc='Knowledge base facts as "Title: passage"; may be empty.')
    conversation: list[Turn] = dspy.InputField(desc="The conversation so far, oldest turn first; may be empty.")
    agent_text: str = dspy.InputField(desc="What the agent has typed so far, up to the caret, exactly as typed.")
    continuation: str = dspy.OutputField(desc="The text that goes right after agent_text, starting exactly where it stops.")


class CompletionProgram(dspy.Module):
    """Predicts the continuation of the agent's text from the context sent."""

    def __init__(self, max_turns: int | None = None):
        super().__init__()
        self.max_turns = max_turns
        self.predict = dspy.Predict(ContinueText)

    async def aforward(
        self,
        agent_text: str,
        conversation: list[Turn],
        approved_responses: list[str],
        knowledge_base: list[str],
        config: dict[str, Any] | None = None,
    ) -> dspy.Prediction:
        turns = conversation[-self.max_turns :] if self.max_turns else conversation
        return await self.predict.acall(
            approved_responses=approved_responses,
            knowledge_base=knowledge_base,
            conversation=turns,
            agent_text=agent_text,
            config=config or {},
        )


# ---------------------------------------------------------------------------
# Polish


class PolishDraft(dspy.Signature):
    """You correct grammar, spelling and punctuation in a message a contact-center agent wrote to a customer.
    Fix only errors. Keep the meaning, tone, wording and line breaks. Do not rephrase, shorten, expand or translate.
    Keep the language of the message (Arabic or English).
    Keep every placeholder like $(user.firstName), every URL, email address, number and reference code exactly as written.
    Put only the corrected message in `polished`, with no quotes, notes or explanation."""

    draft: str = dspy.InputField(desc="The agent's message.")
    polished: str = dspy.OutputField(desc="The corrected message.")


class PolishProgram(dspy.Module):
    """Minimal grammar and spelling correction of the agent's draft."""

    def __init__(self):
        super().__init__()
        self.predict = dspy.Predict(PolishDraft)

    async def aforward(self, draft: str, config: dict[str, Any] | None = None) -> dspy.Prediction:
        return await self.predict.acall(draft=draft, config=config or {})


# ---------------------------------------------------------------------------
# Offline test model: deterministic predictors on the same typed fields

# Deterministic "grammar fixes" for offline polish tests and UI checks.
POLISH_FIXES: list[tuple[regex.Pattern[str], str]] = [
    (regex.compile(r"\bHe go\b"), "He went"),
    (regex.compile(r"\bbuyed\b"), "bought"),
    (regex.compile(r"\bI has\b"), "I have"),
    (regex.compile(r"\brecieve"), "receive"),
    (regex.compile(r"هذه الطلب"), "هذا الطلب"),
    (regex.compile(r"الموظفين الجديد\b"), "الموظفين الجدد"),
]

_WORD = regex.compile(r"[\p{L}\p{N}\p{M}]")
_TYPED = regex.compile(r"[\p{L}\p{N}\p{M}]+\Z")
_WORDS = regex.compile(r"[\p{L}\p{N}\p{M}]+")
_ENDS_SPACE = regex.compile(r"\s\Z")


def _word_start(text: str, fragment: str) -> int:
    """Index of fragment at the start of a word of text, ignoring case; -1 if absent."""
    lower, f = text.lower(), fragment.lower()
    i = lower.find(f)
    while i >= 0:
        if i == 0 or not _WORD.match(text[i - 1]):
            return i
        i = lower.find(f, i + 1)
    return -1


def fake_completion(agent_text: str, source: str) -> str:
    """
    The continuation of agent_text taken from source, where its unfinished
    word (or, after a space or punctuation, its last word) appears: the rest
    of that word, then the rest of source. Unmatched, the unfinished word is
    taken as finished and source follows after a space.
    """
    m = _TYPED.search(agent_text)
    typed = m.group(0) if m else ""
    words = _WORDS.findall(agent_text)
    anchor = typed or (words[-1] if words else "")
    at = _word_start(source, anchor) if anchor else -1
    end = at + len(anchor)
    while at >= 0 and end < len(source) and _WORD.match(source[end]):
        end += 1
    if typed:
        if at >= 0:
            return source[at + len(typed) : end] + source[end:]
        return f" {source}" if source else ""
    rest = source[end:] if at >= 0 else source
    return rest.lstrip() if _ENDS_SPACE.search(agent_text) else rest


class FakeCompletePredict:
    """Continues the agent's text from the first approved response (or knowledge base passage) sent."""

    async def acall(self, *, approved_responses: list[str], knowledge_base: list[str], conversation: list[Turn], agent_text: str, config: dict | None = None) -> dspy.Prediction:
        source = approved_responses[0] if approved_responses else (knowledge_base[0].split(": ", 1)[-1] if knowledge_base else "")
        return dspy.Prediction(continuation=fake_completion(agent_text, source))


class FakePolishPredict:
    """Applies the fixed English and Arabic grammar fixes."""

    async def acall(self, *, draft: str, config: dict | None = None) -> dspy.Prediction:
        polished = draft
        for pattern, fix in POLISH_FIXES:
            polished = pattern.sub(fix, polished)
        return dspy.Prediction(polished=polished)


def build_programs(max_turns: int | None, fake: bool) -> tuple[CompletionProgram, PolishProgram]:
    completion, polish = CompletionProgram(max_turns), PolishProgram()
    if fake:
        completion.predict = FakeCompletePredict()  # type: ignore[assignment]
        polish.predict = FakePolishPredict()  # type: ignore[assignment]
    return completion, polish
