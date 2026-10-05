# Proposal

## Why

Two parts of the formal requirements for auto-replace are still open.
- **Req 4.2.2: never auto-replace people's names.** Today, names are corrected like any other word, and they are the largest group of corruptions on clean English text in the benchmark: "Ms. Fatimah" → "Fatima", "Al-Harbi" → "Al-Harbin", "Noura," → "Nora". The only other remaining English corruptions are British spellings. Names are part of what keeps auto-replace from its "on by default" gate (Req 2.5).
- **Req 4.2.1: revert "with one action, for example Ctrl+Z or Backspace right after the change".** Undo and the popover's "Revert to…" work today. Backspace doesn't.

Serves **PER #60254** (auto-correct), formal Req 4.2.1 and 4.2.2, **Phase 2**.

## What Changes

- **Mid-sentence capitals are left alone.** A word with a capital first letter that isn't at the start of a sentence is never auto-replaced, by any rule (list, case fix or single neighbor). It is still underlined, with suggestions. A sentence starts:
  - at the beginning of the text;
  - after a line break;
  - after `.` `!` `?` `؟` followed by whitespace.

  A full stop after a common honorific or abbreviation (Mr, Mrs, Ms, Dr, Prof, Eng, St, e.g., i.e., etc.) does not end a sentence. So "Ms. Fatimah" and "Al-Harbi" are protected, while "Seperate" at the start of a sentence is still fixed.
- **Words from the conversation are left alone.** The host can pass the conversation so far, as it already does for completion. Any word the customer wrote is never auto-replaced in the agent's message. This catches a name at the start of a sentence ("Noura, thank you…") and Arabic names, which have no capitals. Words are compared ignoring case, and for Arabic after removing diacritics and tatweel. The demo passes its chat transcript. Without a conversation, only the capitals rule applies.
- **Backspace right after an auto-correction reverts it.** When Backspace is the very next key after a correction landed, and the caret is still right after the boundary that triggered it, Backspace restores the original word and keeps the space or punctuation. It's one undo step, works like the popover's Revert (same event, ignore list, flash removed), and the host never sees that Backspace. In any other situation Backspace deletes as usual.
- **The revert scope stays session-wide** (decided): a reverted word is neither corrected nor underlined again in the session. This meets Req 4.2.1's "same message" as a minimum. The gap analysis is updated to say this is deliberate.
- **Eval:** the pipeline applies the capitals rule (dataset messages carry no conversation). A new baseline is committed. Expected: the 4 English name corruptions with a mid-sentence capital disappear.
- **Docs:** `docs/TESTING.md` (names, conversation words, Backspace), `src/autocorrect/README.md`, `src/composer/README.md`, gap analysis.

## Non-goals

- **British spellings** ("labour", "cancelled"): a dictionary decision for SV (en-US vs. en-GB). They remain the largest group of English corruptions.
- **Name lists or named-entity recognition, and customer-profile fields** (Req 3.6.2): the prototype has no profile. The host can pass profile names as part of the conversation words once it has them.
- **Protecting conversation words from underlining.** They're only protected from auto-replace. Underlining stays the engine's decision.
- **Scoping the revert to the message** (decided against: the session-wide scope stays).
- **Backspace-to-revert after the agent typed anything else,** or with modifiers (Ctrl+Backspace deletes a word as usual).

No new dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `auto-correct`:
  - "Confidence decision" gains the mid-sentence-capital and conversation-word guards (with Arabic and mixed scenarios);
  - "Reverting an auto-correction" gains Backspace right after a correction and states that the session-wide scope is deliberate.

## Impact

- **Tier 1 code:**
  - new pure `src/autocorrect/context.ts` (sentence start, honorifics, conversation words);
  - `src/autocorrect/confidence.ts` (new guards in the decision context);
  - `src/composer/attach.ts` (computes sentence start and conversation words, Backspace revert, new `conversation` option);
  - `src/demo/main.ts` (passes the chat transcript).
- **Eval:** `eval/pipeline.ts`, and a new `eval/baseline.json`.
- **Tests:** `test/autocorrect/*`, `test/composer/*`, `test/eval/*`.
- **Docs:** `docs/TESTING.md`, `docs/EVALUATION.md` (baseline note), `src/autocorrect/README.md`, `src/composer/README.md`, `docs/requirements/gap-analysis-60145-60254.md`.
- **Privacy:** the conversation stays in the page. It is used only for an in-memory word set and never sent anywhere (Tier 1, no network).
