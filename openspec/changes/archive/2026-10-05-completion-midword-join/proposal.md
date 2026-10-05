# Proposal

## Why

When the agent pauses in the middle of a word, the suggestion is shown with a wrong space. With the first scenario message in the chat, "It hasn't been proce" gets " ssed within 3 working days…", which displays as "proce ssed".

The cause is in `server/postprocess.ts`:
1. It trims the model's leading whitespace.
2. It then always adds a space when the prefix doesn't end in whitespace and the continuation starts with a letter.

That rule assumes every continuation starts a new word. Gmail-style completion (the model PER #60145 names) completes the word being typed, so mid-word suggestions are expected, and the offline model already produces them. The spec only says to add a space "when the continuation starts a new word", without saying how to tell.

We can't simply trust the model's own spacing. The existing tests capture that models often leave out the space before a new word ("your request" + "will be processed"). The service needs a deterministic way to decide between joining and spacing.

Serves **PER #60145** (auto-complete), formal Req 3.1 and 3.4, **Phase 3**.

## What Changes

- **Join or space, decided deterministically.** When the prefix ends inside a word (its last character is a letter or digit) and the continuation starts with one, the service checks these in order:
  1. **Echoed word:** the continuation repeats the unfinished word and goes on ("proce" → "processed within…"). Strip the repeated part and join: "ssed within…".
  2. **Model said "new word":** the model's raw output started with whitespace. Keep a space.
  3. **The joined word is known:** "proce" + "ssed" = "processed", which appears in the approved library, the conversation or the prefix. Join.
  4. **The unfinished part is already a known word:** "request" + "will…". Add a space, as today.
  5. **Otherwise** (an unfinished part that isn't a known word, such as a name or a term outside the library): join, because the model continued without a space.

  Without vocabulary (direct callers and existing tests), step 4 is assumed, which keeps today's behavior.
- **The prompt says how to continue a word:** if the agent's text ends in the middle of a word, start with the rest of that word, without a space; otherwise start with a space. This is in both safety-filter modes.
- **Arabic works the same way.** Words are compared with the retrieval normalization (diacritics, tatweel, alef and hamza forms), so "تم استلا" + "م طلبك" joins to "استلام".
- **Docs:** `docs/TESTING.md` gains a mid-word scenario. With the offline model and the first scenario message, "It hasn't been proce" → "ssed within 3 working days…" under `COMPLETION_SOURCED_FIGURES=allow`. Under the default, a figure-free mid-word example is used.

## Non-goals

- Changing when a suggestion is requested (the 3-word minimum, end of line).
- Correcting the agent's unfinished word (for example "proc" → "process"). The suggestion only continues it.
- Any client change. The ghost text already shows whatever the server returns, right after the caret, and typing-through works for mid-word continuations.
- A dictionary on the server. The approved library, the conversation and the prefix are the vocabulary.

No new dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `completion-service`:
  - "Output post-processing": the deterministic join-or-space rule replaces "add a leading space when the continuation starts a new word";
  - "Context assembly": the instructions tell the model how to continue an unfinished word.

## Impact

- **Tier 2 code:** `server/postprocess.ts` (the rule, with an optional vocabulary parameter), `server/complete.ts` (passes the library vocabulary plus the conversation and prefix words), `server/prompt.ts` (one instruction line).
- **Tests:** `test/server/postprocess.test.ts` (all five steps, in English and Arabic, with and without vocabulary), `test/server/complete.test.ts` (the offline-model replay of "It hasn't been proce"), `test/server/prompt.test.ts`.
- **Docs:** `docs/TESTING.md`.
