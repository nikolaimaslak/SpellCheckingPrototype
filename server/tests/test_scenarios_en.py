"""
Every English or language-neutral scenario of the completion-service,
polish-service and assist-service specs, one test each, registered under the
scenario's name. The specs are read as they will be after the in-flight
changes are archived: each change's ADDED, MODIFIED and REMOVED requirements
are applied to the main spec.

A scenario counts as English or language-neutral when its text has no Arabic.
Arabic and mixed Arabic/English scenarios are covered by a separate change;
test_every_english_scenario_has_a_test fails when an English scenario has no test.
"""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Callable
from pathlib import Path

import litellm
import pytest

from assist.complete import CompletionDeps, complete
from assist.lm import build_lm
from assist.programs import ContinueText, build_programs
from assist.retrieval import load_library
from assist.settings import load_dotenv, load_settings, select_model
from tests.helpers import client, fake_client

REPO = Path(__file__).resolve().parents[2]
CAPABILITIES = ("completion-service", "polish-service", "assist-service")
ARABIC = re.compile("[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]")

SCENARIOS: dict[tuple[str, str], Callable[..., None]] = {}


def scenario(capability: str, name: str):
    def register(fn: Callable[..., None]) -> Callable[..., None]:
        SCENARIOS[(capability, name)] = fn
        return fn

    return register


Requirements = dict[str, list[tuple[str, str]]]


def _requirements(text: str) -> Requirements:
    """Requirement name → its scenarios as (name, body), in order."""
    out: Requirements = {}
    for block in re.split(r"^### Requirement: ", text, flags=re.M)[1:]:
        name, body = block.split("\n", 1)[0].strip(), block.split("\n## ", 1)[0]
        out[name] = [(sc.split("\n", 1)[0].strip(), sc) for sc in re.split(r"^#### Scenario: ", body, flags=re.M)[1:]]
    return out


def merged_spec(capability: str) -> Requirements:
    """The main spec with every in-flight change's delta for the capability applied."""
    main = REPO / "openspec" / "specs" / capability / "spec.md"
    reqs = _requirements(main.read_text("utf-8")) if main.exists() else {}
    for delta in sorted((REPO / "openspec" / "changes").glob(f"*/specs/{capability}/spec.md")):
        for section in re.split(r"^## ", delta.read_text("utf-8"), flags=re.M)[1:]:
            kind, body = section.split(" ", 1)[0], section
            for name, scenarios in _requirements(body).items():
                if kind == "REMOVED":
                    reqs.pop(name, None)
                elif kind in ("ADDED", "MODIFIED"):
                    reqs[name] = scenarios
    return reqs


def english_scenarios() -> set[tuple[str, str]]:
    return {
        (capability, name)
        for capability in CAPABILITIES
        for scenarios in merged_spec(capability).values()
        for name, body in scenarios
        if not ARABIC.search(body)
    }


def test_every_english_scenario_has_a_test():
    missing = sorted(english_scenarios() - set(SCENARIOS))
    assert not missing, "English scenarios without a test: " + "; ".join(f"{c}: {n}" for c, n in missing)


def test_every_test_names_a_current_english_scenario():
    stale = sorted(set(SCENARIOS) - english_scenarios())
    assert not stale, "Tests of scenarios no longer in the specs: " + "; ".join(f"{c}: {n}" for c, n in stale)


# ---------------------------------------------------------------------------
# helpers


def answer(continuation: str) -> str:
    return json.dumps({"continuation": continuation}, ensure_ascii=False)


def ask(tmp_path, scripted, raw, prefix, **body):
    scripted.answer(raw)
    return client(tmp_path).post("/v1/complete", json={"prefix": prefix, **body}).json()


def shown(tmp_path, scripted, raw, prefix, **body) -> str:
    return ask(tmp_path, scripted, raw, prefix, **body)["completion"]


def polish_with(tmp_path, scripted, out, text):
    scripted.answer(json.dumps({"polished": out}, ensure_ascii=False))
    return client(tmp_path).post("/v1/polish", json={"text": text}).json()


def log(tmp_path):
    f = tmp_path / "telemetry" / "events.jsonl"
    return f.read_text("utf-8") if f.exists() else ""


# ---------------------------------------------------------------------------
# completion-service: endpoint contract


@scenario("completion-service", "Successful completion")
def _(tmp_path):
    res = fake_client(tmp_path).post(
        "/v1/complete",
        json={"prefix": "Thank you for contacting us, your request", "transcript": [{"role": "customer", "text": "When will my request be processed?"}]},
    ).json()
    assert res["completion"] and res["lang"] == "en" and res["model"] == "fake" and res["latencyMs"] >= 0


@scenario("completion-service", "Nothing useful to add")
def _(tmp_path, scripted):
    for raw in (answer(""), "not json at all"):
        scripted.answer(raw)
        res = client(tmp_path).post("/v1/complete", json={"prefix": "you could have be"})
        assert res.status_code == 200 and res.json()["completion"] == ""


@scenario("completion-service", "Structured edit in the reply")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, answer("a, I can help you."), "Before jumping into Ollam")
    assert res["completion"] == "a, I can help you."
    assert res["edit"] == {"typed": "Ollam", "word": "Ollama", "rest": ", I can help you."}


@scenario("completion-service", "Edit after a finished word")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, answer(" will be processed soon."), "Thank you, your request")
    assert res["edit"] == {"typed": "request", "word": "request", "rest": " will be processed soon."}


@scenario("completion-service", "Edit after a space")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, answer("will be processed soon."), "Thank you, your request ")
    assert res["edit"] == {"typed": "", "word": "", "rest": "will be processed soon."}


# ---------------------------------------------------------------------------
# completion-service: context assembly

PENSION = [{"role": "customer", "text": "Can you check the status of my pension contribution records?"}]


@scenario("completion-service", "Canned response steers wording")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, answer(""), "Your contribution", transcript=PENSION)
    assert "en-contrib-status" in res["sources"]
    canned = next(r.text for r in load_library() if r.id == "en-contrib-status")
    sent = scripted.user_message
    assert canned in sent.split("[[ ## approved_responses ## ]]", 1)[1].split("[[ ##", 1)[0]


@scenario("completion-service", "Sources disabled")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, answer(""), "Your contribution", transcript=PENSION, sources={"canned": False})
    assert res["sources"] == []
    assert "[[ ## approved_responses ## ]]\n[]" in scripted.user_message


RETIREMENT = [{"role": "customer", "text": "Am I eligible for early retirement? I have 26 years of contributions."}]


@scenario("completion-service", "Knowledge base used on a strong match")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, answer(""), "Your early retirement application", transcript=RETIREMENT)
    assert any(s.startswith("kb:en-early-retirement#") for s in res["sources"])
    assert "Early retirement eligibility:" in scripted.user_message


@scenario("completion-service", "Knowledge base skipped on a weak match")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, answer(""), "Good morning", transcript=[{"role": "customer", "text": "Hello, good morning"}])
    assert not any(s.startswith("kb:") for s in res["sources"])
    assert "[[ ## knowledge_base ## ]]\n[]" in scripted.user_message


@scenario("completion-service", "Knowledge base disabled")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, answer(""), "Your early retirement application", transcript=RETIREMENT, sources={"kb": False})
    assert not any(s.startswith("kb:") for s in res["sources"])
    assert "[[ ## knowledge_base ## ]]\n[]" in scripted.user_message


@scenario("completion-service", "Same retrieval as before")
def _(tmp_path, scripted):
    # Identifiers and order the previous server's retrieval returned for these requests (checked against it when ported).
    cases = [
        ("Can you check the status of my contribution records?", "Your contribution", ["en-contrib-status"]),
        ("what is the weather in Paris", "Hello", []),
    ]
    for customer, prefix, first in cases:
        res = ask(tmp_path, scripted, answer(""), prefix, transcript=[{"role": "customer", "text": customer}])
        assert res["sources"][: len(first)] == first
        if not first:
            assert res["sources"] == []


@scenario("completion-service", "Full conversation by default")
def _(tmp_path, scripted):
    turns = [{"role": "customer" if i % 2 == 0 else "agent", "text": f"turn {i}"} for i in range(12)]
    ask(tmp_path, scripted, answer(""), "Thank you ", transcript=turns)
    sent = scripted.user_message
    assert all(f'"turn {i}"' in sent for i in range(12)) and sent.index('"turn 0"') < sent.index('"turn 11"')


@scenario("completion-service", "Conversation limited by setting")
def _(tmp_path, scripted):
    turns = [{"role": "customer" if i % 2 == 0 else "agent", "text": f"turn {i}"} for i in range(12)]
    scripted.answer(answer(""))
    client(tmp_path, {"GEMINI_API_KEY": "k", "COMPLETION_MAX_TURNS": "6"}).post("/v1/complete", json={"prefix": "Thank you ", "transcript": turns})
    sent = scripted.user_message
    assert all(f'"turn {i}"' in sent for i in range(6, 12)) and not any(f'"turn {i}"' in sent for i in range(6))
    assert sent.index('"turn 6"') < sent.index('"turn 11"')


@scenario("completion-service", "Stable fields first")
def _():
    assert list(ContinueText.input_fields) == ["approved_responses", "knowledge_base", "conversation", "agent_text"]


@scenario("completion-service", "Instructions under the default setting")
def _():
    text = ContinueText.instructions
    assert "only as they appear in `conversation`, `approved_responses` or `knowledge_base`; never invent them" in text
    for banned in ("Do not include any number", "never use names", "do not mention dates"):
        assert banned not in text


@scenario("completion-service", "Instructions explain unfinished words")
def _():
    text = ContinueText.instructions
    assert "`continuation` is appended to `agent_text` exactly as you write it, with nothing added in between" in text
    for rule, example in (
        ("ends in the middle of a word: start with the missing letters of that word, with no space", '"Your request is being proce" → "ssed today."'),
        ("ends with a complete word: start with a space", '"Your request" → " has been received."'),
        ("ends with a space: start directly with the next word, with no space", '"Your request " → "has been received."'),
        ("ends with punctuation: start with a space, then the next word", '"Thank you," → " we have received your request."'),
    ):
        assert rule in text and example in text
    assert text.count("→") == 8  # each rule has an Arabic example too


@scenario("completion-service", "Instructions forbid repetition")
def _():
    text = ContinueText.instructions
    assert "Never repeat any part of `agent_text`." in text
    assert list(ContinueText.output_fields) == ["continuation"]


@scenario("completion-service", "Whole word repeated by the model")
def _(tmp_path, scripted):
    assert shown(tmp_path, scripted, answer("been easily confused."), "…you could have be") == "en easily confused."


# ---------------------------------------------------------------------------
# completion-service: model call


@scenario("completion-service", "Key missing")
def _(tmp_path):
    h = client(tmp_path, {}).get("/health").json()
    assert (h["model"], h["external"]) == ("fake", False)


@scenario("completion-service", "Key present in auto mode")
def _(tmp_path):
    h = client(tmp_path, {"GEMINI_API_KEY": "k"}).get("/health").json()
    assert (h["model"], h["mode"], h["external"]) == ("gemini-3.5-flash-lite", "auto", True)


@scenario("completion-service", "Gemini forced without a key")
def _(tmp_path):
    c = client(tmp_path, {"COMPLETION_MODEL": "gemini"})
    res = c.post("/v1/complete", json={"prefix": "Thank you, your request"})
    assert res.status_code == 503 and "unavailable" in res.json()["error"]
    assert c.post("/v1/events", json=[{"type": "accept", "ts": 1}]).json() == {"stored": 1}


@scenario("completion-service", "Upstream failure or timeout")
def _(tmp_path, scripted):
    scripted.answer(litellm.exceptions.APIError(status_code=500, message="boom", llm_provider="gemini", model="m"))
    res = client(tmp_path).post("/v1/complete", json={"prefix": "Thank you, your request"})
    assert res.status_code == 502 and res.json()["error"]
    scripted.answer(litellm.exceptions.Timeout(message="slow", model="m", llm_provider="gemini"))
    res = client(tmp_path).post("/v1/complete", json={"prefix": "Thank you, your request"})
    assert res.status_code == 504 and res.json()["error"]


@scenario("completion-service", "Health reports the safety setting")
def _(tmp_path, scripted):
    c = client(tmp_path, {"GEMINI_API_KEY": "k", "COMPLETION_SOURCED_FIGURES": "on"})
    assert "sourcedFigures" not in c.get("/health").json()
    scripted.answer(answer(" will be processed within 3 working days."))
    res = c.post("/v1/complete", json={"prefix": "Thank you, your request"}).json()
    assert res["completion"] == " will be processed within 3 working days." and "withheld" not in res


@scenario("completion-service", "Structured completion call")
def _(tmp_path, scripted):
    ask(tmp_path, scripted, answer(" ok."), "Thank you, your request")
    sent = scripted.calls[0]
    assert sent["response_format"].model_json_schema()["required"] == ["continuation"]
    assert "stop" not in sent


@scenario("completion-service", "Local model without code change")
def _(tmp_path, scripted):
    c = client(tmp_path, {"COMPLETION_MODEL": "ollama_chat/qwen3:8b"})
    scripted.answer(answer("ssed yet."), answer("م طلبك."))
    assert c.post("/v1/complete", json={"prefix": "It hasn't been proce"}).json()["completion"] == "ssed yet."
    assert c.post("/v1/complete", json={"prefix": "تم استلا"}).json()["completion"] == "م طلبك."
    assert all(call["model"] == "ollama_chat/qwen3:8b" for call in scripted.calls)


# ---------------------------------------------------------------------------
# completion-service: continuation assembly


@scenario("completion-service", "Completing an unfinished word")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, answer("ssed yet, but it is under review."), "It hasn't been proce")
    assert res["completion"] == "ssed yet, but it is under review." and res["edit"]["word"] == "processed"


@scenario("completion-service", "Continuing after a finished word")
def _(tmp_path, scripted):
    assert shown(tmp_path, scripted, answer(" will be processed soon."), "Thank you, your request") == " will be processed soon."


@scenario("completion-service", "Next word after a space")
def _(tmp_path, scripted):
    assert shown(tmp_path, scripted, answer("will be processed soon."), "Thank you, your request ") == "will be processed soon."


@scenario("completion-service", "Leading space after a space removed")
def _(tmp_path, scripted):
    assert shown(tmp_path, scripted, answer(" will be processed soon."), "Thank you, your request ") == "will be processed soon."


@scenario("completion-service", "Space added after punctuation")
def _(tmp_path, scripted):
    assert shown(tmp_path, scripted, answer("today if possible."), "Please upload the form,") == " today if possible."


@scenario("completion-service", "Model rewrites the unfinished word")
def _(tmp_path, scripted):
    assert shown(tmp_path, scripted, answer("Processed yet."), "It hasn't been proce") == "ssed yet."


@scenario("completion-service", "Model repeats the prefix")
def _(tmp_path, scripted):
    assert shown(tmp_path, scripted, answer("your request will be processed soon."), "Thank you, your request ") == "will be processed soon."


@scenario("completion-service", "Multiple sentences")
def _(tmp_path, scripted):
    assert shown(tmp_path, scripted, answer(" will be processed. Anything else?"), "Thank you, your request") == " will be processed."


@scenario("completion-service", "Wrong language")
def _(tmp_path, scripted):
    assert shown(tmp_path, scripted, answer(" and will be processed."), "تم استلام طلبك") == ""


@scenario("completion-service", "Unknown unfinished word")
def _(tmp_path, scripted):
    assert shown(tmp_path, scripted, answer("r app now."), "Please use the Abshe") == "r app now."


@scenario("completion-service", "Name from the conversation completed")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, answer("a, I can help you."), "Before jumping into Ollam", transcript=[{"role": "customer", "text": "How does Ollama work?"}])
    assert res["completion"] == "a, I can help you." and "withheld" not in res


@scenario("completion-service", "Join shown as the model wrote it")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, answer("ils soon."), "I will send you the detai")
    assert res["completion"] == "ils soon." and res["edit"]["word"] == "detaiils" and "withheld" not in res


@scenario("completion-service", "Nothing to add")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, answer(""), "Thank you, your request")
    assert res["completion"] == "" and "withheld" not in res


@scenario("completion-service", "Unparseable output")
def _(tmp_path, scripted):
    for raw in ("I cannot help with that.", '{"word": "request", "rest": " ok."}', '{"text": " ok."}'):
        res = ask(tmp_path, scripted, raw, "Thank you, your request")
        assert (res["completion"], res["withheld"]) == ("", "format")


@scenario("completion-service", "JSON wrapped in text")
def _(tmp_path, scripted):
    for raw in ('Sure! {"continuation": " will be processed soon."}', '```json\n{"continuation": " will be processed soon."}\n```'):
        assert shown(tmp_path, scripted, raw, "Thank you, your request") == " will be processed soon."


@scenario("completion-service", "Extra fields ignored")
def _(tmp_path, scripted):
    raw = '{"continuation": " will be processed soon.", "confidence": 0.9}'
    assert shown(tmp_path, scripted, raw, "Thank you, your request") == " will be processed soon."


@scenario("completion-service", "Wrong field type")
def _(tmp_path, scripted):
    for raw in ('{"continuation": 5}', '{"continuation": null}'):
        res = ask(tmp_path, scripted, raw, "Your order")
        assert (res["completion"], res["withheld"]) == ("", "format")


@scenario("completion-service", "Figures and dates returned")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, answer(" will be processed within 3 working days."), "Thank you, your request")
    assert res["completion"] == " will be processed within 3 working days." and "withheld" not in res


@scenario("completion-service", "Identifiers kept whole")
def _(tmp_path, scripted):
    assert shown(tmp_path, scripted, answer(" see www.gosi.gov.sa for details. Anything else?"), "Thank you,") == " see www.gosi.gov.sa for details."


@scenario("completion-service", "Name and identifier from the conversation returned")
def _(tmp_path, scripted):
    turns = [{"role": "customer", "text": "Hello, this is Noura, my email is noura@example.com"}]
    res = ask(tmp_path, scripted, answer(" Noura, we will write to noura@example.com."), "Thank you,", transcript=turns)
    assert res["completion"] == " Noura, we will write to noura@example.com." and "withheld" not in res


# ---------------------------------------------------------------------------
# polish-service


@scenario("polish-service", "Corrections returned")
def _(tmp_path):
    res = fake_client(tmp_path).post("/v1/polish", json={"text": "He go to the office yesterday and buyed a pen."}).json()
    assert (res["changed"], res["lang"]) == (True, "en") and res["polished"] != "He go to the office yesterday and buyed a pen."


@scenario("polish-service", "Too long")
def _(tmp_path):
    assert fake_client(tmp_path).post("/v1/polish", json={"text": "x" * 4001}).status_code == 400


@scenario("polish-service", "English draft")
def _(tmp_path):
    res = fake_client(tmp_path).post("/v1/polish", json={"text": "I has a question and I recieved no answer."}).json()
    assert res["polished"] == "I have a question and I received no answer." and res["lang"] == "en"


@scenario("polish-service", "Arabic draft")
def _(tmp_path):
    res = fake_client(tmp_path).post("/v1/polish", json={"text": "تم استلام هذه الطلب وسيتم معالجته."}).json()
    assert (res["polished"], res["lang"]) == ("تم استلام هذا الطلب وسيتم معالجته.", "ar")


@scenario("polish-service", "Fenced answer")
def _(tmp_path, scripted):
    assert polish_with(tmp_path, scripted, "```\nHe went home.\n```", "He go home.")["polished"] == "He went home."
    assert polish_with(tmp_path, scripted, '"He went home."', "He go home.")["polished"] == "He went home."


@scenario("polish-service", "Trailing line break kept")
def _(tmp_path, scripted):
    assert polish_with(tmp_path, scripted, "He went to the office.", "He go to the office.\n")["polished"] == "He went to the office.\n"


@scenario("polish-service", "Substitution field preserved")
def _(tmp_path, scripted):
    text = "Dear $(user.firstName), your request is ready."
    res = polish_with(tmp_path, scripted, "Dear user, your request is ready.", text)
    assert (res["polished"], res["changed"]) == (text, False) and res["reason"]


@scenario("polish-service", "Rewrite rejected")
def _(tmp_path, scripted):
    text = "He go to the office yesterday and buyed a pen for the meeting."
    for out in ("He went.", text + " " + text):
        res = polish_with(tmp_path, scripted, out, text)
        assert (res["polished"], res["changed"]) == (text, False) and res["reason"]


@scenario("polish-service", "No key")
def _(tmp_path):
    assert client(tmp_path, {"COMPLETION_MODEL": "gemini"}).post("/v1/polish", json={"text": "hello there"}).status_code == 503


# ---------------------------------------------------------------------------
# assist-service


@scenario("assist-service", "Loopback only")
def _():
    from assist.__main__ import uvicorn_config

    config = uvicorn_config(load_settings({"COMPLETION_MODEL": "fake"}))
    assert (config.host, config.port) == ("127.0.0.1", 5175)


@scenario("assist-service", "Invalid JSON")
def _(tmp_path):
    res = fake_client(tmp_path).post("/v1/complete", content=b'{"prefix":')
    assert (res.status_code, res.json()) == (400, {"error": "bad request"})


@scenario("assist-service", "Body too large")
def _(tmp_path, scripted):
    res = client(tmp_path).post("/v1/polish", content=json.dumps({"text": "x" * 100 * 1024}).encode())
    assert res.status_code == 400 and scripted.calls == []


@scenario("assist-service", "Validation error keeps the contract")
def _(tmp_path):
    res = fake_client(tmp_path).post("/v1/complete", json={"prefix": 42})
    assert (res.status_code, res.json()) == (400, {"error": "prefix is required"})


@scenario("assist-service", "Cross-origin preflight")
def _(tmp_path):
    res = fake_client(tmp_path).options("/v1/complete", headers={"origin": "https://agent.example.com"})
    assert res.status_code == 204
    assert res.headers["access-control-allow-origin"] == "*" and res.headers["access-control-allow-private-network"] == "true"


@scenario("assist-service", "Environment wins over .env")
def _(tmp_path):
    f = tmp_path / ".env"
    f.write_text("COMPLETION_MODEL=gemini\n", "utf-8")
    env = {"COMPLETION_MODEL": "fake"}
    load_dotenv(f, env)
    assert select_model(env)[0].name == "fake"


@scenario("assist-service", "Completion outputs are typed")
def _(tmp_path, scripted):
    from assist.lm import build_lm, running
    from assist.programs import CompletionProgram

    scripted.answer(answer(" ok."))
    lm = build_lm(select_model({"GEMINI_API_KEY": "k"})[0], cache=False)

    async def go():
        with running(lm):
            return await CompletionProgram().acall(agent_text="Thank you, your request", conversation=[], approved_responses=[], knowledge_base=[])

    p = asyncio.run(go())
    assert isinstance(p.continuation, str) and p.continuation == " ok."


@scenario("assist-service", "Unparseable completion answer")
def _(tmp_path, scripted):
    scripted.answer("Sure! here you go")
    res = client(tmp_path).post("/v1/complete", json={"prefix": "Thank you, your request"})
    assert res.status_code == 200 and (res.json()["completion"], res.json()["withheld"]) == ("", "format")


@scenario("assist-service", "Wrapped answer accepted")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, 'Here you go: {"continuation": "Anything else?"}', "Thank you. ")
    assert res["completion"] == "Anything else?"


@scenario("assist-service", "Number not converted")
def _(tmp_path, scripted):
    scripted.answer('{"polished": 42}')
    res = client(tmp_path).post("/v1/polish", json={"text": "He go home."})
    assert res.status_code == 200 and (res.json()["polished"], res.json()["changed"]) == ("He go home.", False) and res.json()["reason"]


@scenario("assist-service", "Unparseable polish answer")
def _(tmp_path, scripted):
    scripted.answer('{"text": "He went home."}')
    res = client(tmp_path).post("/v1/polish", json={"text": "He go home."}).json()
    assert (res["polished"], res["changed"]) == ("He go home.", False) and res["reason"]


@scenario("assist-service", "Default without a key")
def _(tmp_path):
    assert client(tmp_path, {}).get("/health").json() == {"ok": True, "model": "fake", "mode": "auto", "external": False, "cache": False, "capture": "off"}


@scenario("assist-service", "Default with a key")
def _(tmp_path):
    h = client(tmp_path, {"GEMINI_API_KEY": "k"}).get("/health").json()
    assert h["model"] == "gemini-3.5-flash-lite" and h["external"] is True


@scenario("assist-service", "Local model by id")
def _(tmp_path, scripted):
    c = client(tmp_path, {"COMPLETION_MODEL": "ollama_chat/qwen3:8b"})
    h = c.get("/health").json()
    assert (h["model"], h["external"]) == ("ollama_chat/qwen3:8b", False)
    scripted.answer(answer(" ok."), json.dumps({"polished": "He went home."}))
    c.post("/v1/complete", json={"prefix": "Thank you, your request"})
    c.post("/v1/polish", json={"text": "He go home."})
    assert [call["model"] for call in scripted.calls] == ["ollama_chat/qwen3:8b"] * 2


@scenario("assist-service", "Model on a remote endpoint")
def _(tmp_path):
    h = client(tmp_path, {"COMPLETION_MODEL": "hosted_vllm/some-model", "COMPLETION_API_BASE": "https://llm.example.com/v1"}).get("/health").json()
    assert h["external"] is True


@scenario("assist-service", "Invalid turn limit")
def _(tmp_path, scripted):
    for raw in ("0", "all"):
        s = load_settings({"COMPLETION_MAX_TURNS": raw})
        assert s.max_turns is None and any("COMPLETION_MAX_TURNS" in w for w in s.warnings)
    turns = [{"role": "customer", "text": f"turn {i}"} for i in range(12)]
    scripted.answer(answer(""))
    client(tmp_path, {"GEMINI_API_KEY": "k", "COMPLETION_MAX_TURNS": "all"}).post("/v1/complete", json={"prefix": "Hi ", "transcript": turns})
    assert all(f'"turn {i}"' in scripted.user_message for i in range(12))


@scenario("assist-service", "Unknown value")
def _(tmp_path):
    s = load_settings({"COMPLETION_MODEL": "gpt"})
    assert s.model.mode == "auto" and any("unknown COMPLETION_MODEL" in w for w in s.warnings)


@scenario("assist-service", "Completion timeout")
def _(scripted):
    assert CompletionDeps.__dataclass_fields__["timeout"].default == 2.0
    scripted.answer(answer(" ok."))
    scripted.delay = 0.3
    program, _ = build_programs(None, fake=False)
    deps = CompletionDeps(program, build_lm(select_model({"GEMINI_API_KEY": "k"})[0], False), True, "x", load_library(), timeout=0.05)
    status, _body = asyncio.run(complete({"prefix": "Thank you, your request"}, deps))
    assert status == 504 and len(scripted.calls) == 1


@scenario("assist-service", "Provider error")
def _(tmp_path, scripted):
    scripted.answer(litellm.exceptions.AuthenticationError(message='{"error": "bad key test-key for request Thank you"}', model="m", llm_provider="gemini"))
    res = client(tmp_path).post("/v1/complete", json={"prefix": "Thank you, your request"})
    assert res.status_code == 502 and "test-key" not in res.text and "bad key" not in res.text


@scenario("assist-service", "Structured output unparseable")
def _(tmp_path, scripted):
    res = ask(tmp_path, scripted, '{"continuation": []}', "Thank you, your request")
    assert (res["completion"], res["withheld"]) == ("", "format") and len(scripted.calls) == 1


@scenario("assist-service", "Structured output rejected")
def _(tmp_path, scripted):
    scripted.answer(litellm.exceptions.BadRequestError(message="response_format is not supported", model="m", llm_provider="gemini"))
    res = client(tmp_path).post("/v1/complete", json={"prefix": "Thank you, your request"})
    assert res.status_code == 502 and len(scripted.calls) == 1


@scenario("assist-service", "Cache off by default")
def _(tmp_path, scripted):
    c = client(tmp_path)
    scripted.answer(answer(" ok."), answer(" ok."))
    for _ in range(2):
        c.post("/v1/complete", json={"prefix": "Thank you, your request"})
    assert len(scripted.calls) == 2
    assert not (tmp_path / "llm-cache").exists()


@scenario("assist-service", "Cache on")
def _(tmp_path, scripted):
    c = client(tmp_path, {"GEMINI_API_KEY": "k", "ASSIST_LLM_CACHE": "on"})
    scripted.answer(answer(" ok."), answer(" ok."))
    first = c.post("/v1/complete", json={"prefix": "Thank you, your request"}).json()
    second = c.post("/v1/complete", json={"prefix": "Thank you, your request"}).json()
    assert first["completion"] == second["completion"] == " ok."
    assert len(scripted.calls) == 1
    assert any((tmp_path / "llm-cache").rglob("*"))
    assert "/.cache/" in (REPO / ".gitignore").read_text("utf-8").split()


@scenario("assist-service", "English completion offline")
def _(tmp_path):
    from assist.programs import fake_completion

    source = "Your request has been received and will be processed within 3 working days."
    assert fake_completion("Your request has been rec", source) == "eived and will be processed within 3 working days."


@scenario("assist-service", "English continuation after a space offline")
def _(tmp_path):
    from assist.programs import fake_completion

    source = "Your request has been received and will be processed within 3 working days."
    assert fake_completion("Thank you, your request ", source) == "has been received and will be processed within 3 working days."


@scenario("assist-service", "English polish offline")
def _(tmp_path):
    res = fake_client(tmp_path).post("/v1/polish", json={"text": "He go to the office and buyed a pen."}).json()
    assert res["polished"] == "He went to the office and bought a pen."


# ---------------------------------------------------------------------------
# Runs every registered scenario (defined last, once the registry is full).


@pytest.mark.parametrize("key", sorted(SCENARIOS), ids=[f"{c}: {n}" for c, n in sorted(SCENARIOS)])
def test_scenario(key, request):
    fn = SCENARIOS[key]
    names = fn.__code__.co_varnames[: fn.__code__.co_argcount]
    fn(*(request.getfixturevalue(n) for n in names))
