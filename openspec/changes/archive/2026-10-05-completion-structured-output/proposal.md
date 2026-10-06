# Proposal

## Why

Mid-word suggestions keep failing at the seam between the agent's unfinished word and the model's continuation:
- **Before today:** "proce" got " ssed" (a stray space).
- **With Gemini:** "be" got "n" ("ben", a dropped letter).
- **With the browser's dictionary check:** "Ollam" → "Ollama" was withheld, because "Ollama" isn't in the dictionary.

The cause is the contract, not the fixes. The model receives a prompt that ends in the middle of a word and must answer with raw characters. Models work in tokens, so they guess fragments badly. The server then has to guess whether to join or add a space. The prompt even contradicts itself ("no repetition" next to "start by writing that whole word").

The model's own words are reliable; the free-text seam is not. So the fix is a structured contract:
- the model writes the **whole** current word and the rest separately;
- the server checks, with plain string comparison, that the completed word extends what the agent typed;
- the API reply describes the edit explicitly.

No dictionary or join heuristics are needed. Prompt optimization (DSPy/Ax) can come later on top of this contract if it proves useful.

Serves **PER #60145** (auto-complete), formal Req 3.1, 3.3 and 3.4, **Phase 3**.

## What Changes

- **Structured model output** (server ↔ LLM): the completion task asks for JSON `{ "word": string, "rest": string }`:
  - `word` is the word the agent is typing, written in full ("Ollama" for "Ollam"), or empty when the agent's text ends with whitespace or punctuation;
  - `rest` is everything after it, starting with its own space or punctuation.

  The Gemini call uses a response schema (`responseMimeType: application/json`), so the model must return that shape. The offline test model returns the same shape.
- **The server validates and builds the suggestion:**
  - **Typed part:** the prefix's trailing letters ("Ollam"), or empty.
  - **Validation:** with a typed part, `word` must start with it (letter case ignored for the comparison) and be longer, or equal when `rest` is non-empty. Otherwise the suggestion is withheld for `format`, as is unparseable output.
  - **Suggestion:** the rest of `word` after the typed part, plus `rest`. It still goes through the existing checks: one sentence, 20 words, script, and the safety filter.
- **Structured API reply:** the reply keeps `completion` (the text to show after the caret) and adds `edit: { typed, word, rest }` whenever a completion is returned. The client keeps using `completion`, so other hosts and tests can read the edit without re-deriving it.
- **The prompt is rewritten for the structured task,** which removes the contradictory unfinished-word line.
- **Removed:**
  - the browser's first-word dictionary check (`checkWord` and `word-check.ts`);
  - the server's join-or-space heuristics and the vocabulary lookup in post-processing. The structure makes them unnecessary.
- **Telemetry:** a new withheld reason `format` (malformed or non-extending model output), counted on `/summary`. `spelling` stays accepted, so the spec keeps its scenarios, but no client sends it anymore.
- **Measurement:** about 20 made-up prefixes (mid-word and whole-word, English and Arabic, including "be", "proce" and "Ollam") through Gemini, recording correctness and latency p50/p95 before and after. That shows the real cost of the structured output, and gives a first latency data point for SV's question 2.
- **Docs:** `src/completion/README.md`, `docs/TESTING.md` (T4.17 and the T8.1 reasons) and the gap analysis.

## Non-goals

- DSPy or Ax, and prompt optimization: a possible later change on top of this contract.
- Changing when suggestions are requested, or the ghost-text display (still append-only).
- Letting the model edit the agent's earlier words. Any `word` that doesn't extend the typed part is withheld, never applied.
- Grammar polish, which keeps its own free-text call.

No new dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `completion-service`:
  - "Completion endpoint contract": the reply's `edit` field;
  - "Context assembly": the instructions for the structured task;
  - "Model call": the response schema;
  - "Output post-processing": structured validation replaces the join-or-space rule, with the new `format` reason.
- `inline-completion`: **removes** "Suggestion word check".
- `assist-telemetry`: "What is recorded" and "Summary page" (`format` instead of `spelling`).

## Impact

- **Tier 2:**
  - `server/models/gemini.ts` (`responseSchema` option);
  - `server/models/fake.ts` (returns the structured shape for completion);
  - `server/types.ts` (`GenerationOptions.responseSchema`, `CompleteReply.edit`, the `format` reason);
  - `server/prompt.ts`;
  - `server/complete.ts` (parse, validate, build);
  - `server/postprocess.ts` (the join heuristics are removed; the sentence, length and script checks stay);
  - `server/telemetry.ts`.
- **Tier 1:** `src/completion/controller.ts` (the check is removed), `src/completion/word-check.ts` (deleted), `src/demo/main.ts` (the wiring is removed).
- **Tests:** server and completion tests are updated, plus a measurement script under `scripts/` or `eval/`, run manually against Gemini.
