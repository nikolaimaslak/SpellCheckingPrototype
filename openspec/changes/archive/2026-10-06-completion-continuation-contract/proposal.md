# Proposal

## Why

The completion program asks the model for two fields: `word`, the agent's current word written in full, and `rest`, what follows it. The server checks the seam by string comparison. That contract was introduced to stop broken seams ("proce" + " ssed", "be" + "n"). It moved the problem rather than solving it: the model now has to place the boundary between `word` and `rest`, and it gets that wrong too. In live testing on 2026-10-06 with Gemini:
- "happ" + "y to help…" and "h" + "appen to": a fragment given as `word`;
- "استلا" + "م طلبك…" and "حساب" + "ك.": the same in Arabic;
- after "…your request ", `word` repeated "request" and `rest` lost its leading space.

Each of these is withheld as `format`: 18–30% of all requests on the 60-case dataset. The agent sees nothing, though the model's text was right.

The agent's text should go to the model as is, and only the continuation should come back. A scratchpad experiment on the same dataset, 5 samples per case, with a single `continuation` output whose instructions spell out each case (mid-word, a finished word, after a space, after punctuation), compared:

| | `word` / `rest` | `continuation` |
|---|---:|---:|
| Shown | 76.0% | 92.3% |
| Withheld | 17.7% | 0% |
| Seam word correct | 100% | 98.0% |
| Spacing errors | 0% | 0% |
| Latency p50 | 685 ms | 640 ms |

Every case that failed today came out right, including the old "be" → "ben" bug, now "en confused with fine-tuning." The one remaining seam error is a single Arabic case: "التفا" + "اصيل" gives "التفااصيل", with the last letter doubled.

Serves **PER #60145** (auto-complete), formal Req 3.1 (natural continuations), 3.3 and 3.4, **Phase 3**.

## What Changes

- **The completion program has one output, `continuation`:** the text that goes right after the agent's text, starting exactly where it stops. The instructions state one rule per case, each with an English and an Arabic example:
  - mid-word: the missing letters, no space;
  - after a complete word: a space or punctuation first;
  - after a space: the next word, no space;
  - after punctuation: a space, then the next word.

  They also say never to repeat any part of the agent's text, and keep the existing rules on language, sources and details.
- **Server assembly becomes spacing-only:** no space after a space, one space after punctuation. The model's mid-word join and its space after a finished word are kept as written. The existing checks stay: one line, one sentence, 20 words, script, and no restating of the prefix's tail.
- **`withheld: "format"` now means unusable output only:** no JSON object, or `continuation` missing or not a string. The rules that withheld a `word` that doesn't extend what was typed, or a `rest` that continues the word, are removed. **BREAKING (behavior):** suggestions that were withheld are now shown, and the server no longer guarantees the completed first word reads correctly (see Non-goals).
- **The API reply is unchanged in shape.** `completion` is what the client shows. `edit: { typed, word, rest }` is now derived on the server: `typed` is the prefix's trailing letters, `word` is `typed` plus the continuation's leading letters when it joins, and `rest` is what follows. `completion = word.slice(typed.length) + rest` still holds, so no client change is needed.
- **The offline test model answers `continuation`** with the same canned behavior.
- **Instruction tuning for "after punctuation":** in the experiment the model answered empty more often there (70% shown, against 90% with `word`/`rest`). The instructions are revised and the comparison rerun before archiving.
- **Tests, the English scenario suite, docs** (`src/completion/README.md`, `docs/TESTING.md` T4.17) and a known-issue entry for the unchecked seam.

## Non-goals

- **No seam check against a dictionary.** A doubled or dropped letter at the join ("التفا" + "اصيل") is shown as the model wrote it. A later change may check the completed word with the browser's Hunspell, and is recorded as a known issue.
- **No change to the API shape, the client, the ghost text, undo, or polish.**
- **No prompt optimization** (DSPy optimizers) and no committed completion eval. Both remain separate changes. The comparison here is a by-hand live check, as in `dspy-assist-service`.
- **No new dependencies.**

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `completion-service`:
  - **Completion endpoint contract:** `edit` is derived from the continuation.
  - **Context assembly:** the instructions describe the `continuation` rules per case instead of `word`/`rest`.
  - **Model call:** the output is `continuation`.
  - **Output assembly:** spacing-only assembly; `format` means unusable output only; the word/rest scenarios are replaced.
- `assist-service`:
  - **Typed model interface:** completion outputs `continuation`.
  - **Model call settings:** the structured output field is `continuation`.
  - **Offline test model:** it answers `continuation`.
- `assist-telemetry`: **What is recorded:** the `format` scenario describes unusable output, not a `word` that doesn't extend what was typed.

## Impact

- **Code:**
  - `server/assist/programs.py`: the signature, the fake predictor and `fake_completion`;
  - `server/assist/postprocess.py`: `assemble` replaced by spacing-only assembly and `edit` derivation; `parse_structured` removed;
  - `server/assist/complete.py`: `build`.
- **Tests:** `server/tests/` (postprocess, programs, fake, complete, scenarios_en, lm and gemini_request field names).
- **Docs:** `src/completion/README.md`, `docs/TESTING.md`, `docs/known-issues.md`.
- **Telemetry:** fewer `format` events. The reason values are unchanged.
- **Dependencies:** none.
