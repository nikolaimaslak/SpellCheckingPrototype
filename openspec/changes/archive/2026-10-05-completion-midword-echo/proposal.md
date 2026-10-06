# Proposal

## Why

With Gemini, "…you could have be" got the suggestion "n easily confused.", shown as "be n easily confused". Investigating showed the model itself is at fault:
- "be" + "n" is "ben", not "been". The model dropped a letter, probably because it works in tokens, not characters.
- `completion-midword-join` can't repair that. Joining gives "ben", and spacing gives "be n". Both are wrong.
- When the model instead repeats the whole word ("been easily confused."), the server's echo stripping already produces the correct "en easily confused.".

So the fix has two parts:
- ask the model for the shape it handles well (the whole word);
- never show a suggestion that would create a misspelled or stray word, whatever the model returns.

Serves **PER #60145** (auto-complete), formal Req 3.1 (suggestions that read as natural continuations) and Req 10 (fail quietly), **Phase 3**.

## What Changes

- **The prompt asks for the whole word.** The unfinished-word line becomes: "If the agent's text ends in the middle of a word, start by writing that whole word; otherwise begin with a space." The server's existing echo step strips the repeated part, so the agent sees only the rest. Models that still send a bare fragment are handled by the existing join-or-space rule.
- **The browser checks the first word before showing a suggestion** (Tier 1, using the spelling engine already loaded in the page):
  - the word the agent would end up with is checked: the unfinished word plus the fragment when the suggestion continues it, or the suggestion's first word when it starts a new one;
  - if the engine rejects that word, the suggestion isn't shown;
  - in English, a suggestion whose first word is a single letter other than "a" or "I" isn't shown either. The dictionary accepts lone letters such as "n", so this rule catches "be n…".
  - When the spelling engine isn't ready for that language, or spell checking is off, the suggestion is shown as before. The check never blocks completion.
- **Withheld suggestions are counted.** The client emits `completion-withheld` with reason `spelling` (no text). The telemetry allowlist accepts that reason, and `/summary` shows it next to the server's reasons.
- **Docs:** `src/completion/README.md` (the check) and `docs/TESTING.md` (the mid-word scenario expects no broken suggestion, and the known-limitations line).

## Non-goals

- Fixing the model's continuation (for example rewriting "n" into "en"). A broken suggestion is withheld, never repaired.
- Checking words after the first. The safety filter and the model cover the rest of the sentence. A typo deeper in a suggestion stays visible, and the agent's spell check underlines it once it's accepted.
- Server-side dictionaries.

No new dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `completion-service`: "Context assembly". The instructions ask for the whole unfinished word.
- `inline-completion`: a new requirement, "Suggestion word check", for the browser-side first-word check.
- `assist-telemetry`: "What is recorded" accepts the `spelling` reason from the client, and "Summary page" counts it.

## Impact

- **Tier 2:** `server/prompt.ts`, with one line.
- **Tier 1:**
  - `src/completion/controller.ts`: a new `checkWord` option, awaited before showing, with the caret re-validated afterwards;
  - a new pure `src/completion/word-check.ts`: computes the word to check and applies the single-letter rule;
  - `src/demo/main.ts`: passes a `checkWord` backed by the page's spell service.
- **Telemetry:** `server/telemetry.ts` (allowlist and summary), and `CompletionEvent` gains `completion-withheld`.
- **Tests:** `test/completion/*`, `test/server/prompt.test.ts`, `test/server/telemetry.test.ts`, and a real-engine test for "ben" and "n".
