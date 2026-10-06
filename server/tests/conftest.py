"""Shared test doubles. No test touches the network."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

import litellm
import pytest

from assist.lm import configure_cache


@dataclass
class ScriptedModel:
    """
    Stands in for the provider behind LiteLLM: each call records what DSPy sent
    and answers with the next scripted raw output (a string), or raises the
    next scripted exception. The real dspy.LM, adapter and LiteLLM response
    handling all run; only the HTTP request is replaced by LiteLLM's mock.
    """

    answers: list[Any] = field(default_factory=list)
    calls: list[dict[str, Any]] = field(default_factory=list)
    delay: float = 0.0

    def answer(self, *items: Any) -> ScriptedModel:
        self.answers.extend(items)
        return self

    @property
    def user_message(self) -> str:
        return self.calls[-1]["messages"][-1]["content"]


@pytest.fixture
def scripted(monkeypatch: pytest.MonkeyPatch) -> Iterator[ScriptedModel]:
    model = ScriptedModel()
    original = litellm.acompletion

    async def acompletion(**kwargs: Any) -> Any:
        model.calls.append(kwargs)
        if model.delay:
            import asyncio

            await asyncio.sleep(model.delay)
        item = model.answers.pop(0) if model.answers else '{"continuation": ""}'
        if isinstance(item, BaseException):
            raise item
        return await original(**{**kwargs, "mock_response": item})

    monkeypatch.setattr(litellm, "acompletion", acompletion)
    yield model


@pytest.fixture(autouse=True)
def cache_off() -> Iterator[None]:
    """Every test starts with the default: no LLM cache in memory or on disk."""
    configure_cache(False)
    yield
    configure_cache(False)
