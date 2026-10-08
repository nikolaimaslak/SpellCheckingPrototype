"""The language model behind the programs: built from the settings, run without retries, history or (by default) cache."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Iterator
from pathlib import Path
from typing import Literal

import dspy
import litellm
from dspy.utils.exceptions import AdapterParseError

from .programs import ADAPTER
from .settings import ROOT, ModelChoice

CACHE_DIR = ROOT / ".cache" / "llm"
TEMPERATURE = 0.2

# Nothing that could print or keep a prompt: LiteLLM's debug output and usage
# telemetry are off, and the libraries log errors only (their messages can
# echo request details).
litellm.telemetry = False
litellm.suppress_debug_info = True
for name in ("LiteLLM", "LiteLLM Proxy", "LiteLLM Router", "litellm", "dspy", "httpx"):
    logging.getLogger(name).setLevel(logging.CRITICAL)


def configure_cache(on: bool, directory: Path = CACHE_DIR) -> None:
    """DSPy's request cache is process-wide. Off: no memory or disk cache at all. On: both, on disk under .cache/llm/."""
    if on:
        dspy.configure_cache(enable_disk_cache=True, enable_memory_cache=True, disk_cache_dir=str(directory))
    else:
        dspy.configure_cache(enable_disk_cache=False, enable_memory_cache=False)


def build_lm(choice: ModelChoice, cache: bool) -> dspy.LM | None:
    """The LM for a real model; None for the offline test model or when no model is available."""
    if choice.lm_id in (None, "fake"):
        return None
    kwargs: dict[str, object] = {}
    if choice.api_base:
        kwargs["api_base"] = choice.api_base
    if choice.api_key:
        kwargs["api_key"] = choice.api_key
    return dspy.LM(
        choice.lm_id,
        engine="litellm",
        temperature=TEMPERATURE,
        max_tokens=64,
        cache=cache,
        num_retries=0,
        # The smallest reasoning effort; providers without the parameter drop it rather than fail.
        reasoning_effort="minimal",
        drop_params=True,
        **kwargs,
    )


@contextlib.contextmanager
def running(lm: dspy.LM | None) -> Iterator[None]:
    """Per-request DSPy context: this LM, the typed JSON adapter, and no history or usage tracking."""
    with dspy.context(lm=lm, adapter=ADAPTER, disable_history=True, track_usage=False):
        yield


Failure = Literal["timeout", "format", "failed"]


def classify_error(err: BaseException) -> Failure:
    """Timeout → 504, unusable output → format, anything else → 502. The exception's text is never used."""
    seen: set[int] = set()
    e: BaseException | None = err
    while e is not None and id(e) not in seen:
        seen.add(id(e))
        if isinstance(e, (asyncio.TimeoutError, TimeoutError, litellm.exceptions.Timeout)):
            return "timeout"
        if isinstance(e, AdapterParseError):
            return "format"
        e = e.__cause__ or e.__context__
    return "failed"


def raw_from_error(err: BaseException) -> str | None:
    """The model's text carried by a parse error, if any (for the capture log)."""
    seen: set[int] = set()
    e: BaseException | None = err
    while e is not None and id(e) not in seen:
        seen.add(id(e))
        if isinstance(e, AdapterParseError):
            return getattr(e, "lm_response", None)
        e = e.__cause__ or e.__context__
    return None
