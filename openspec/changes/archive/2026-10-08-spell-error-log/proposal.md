# Proposal

## Why

The next stage is populating the dictionaries from real use: the custom dictionary and the English and Arabic misspellings lists. That needs **every spelling error recorded**. Today only what the agent *does* about an error is logged: accept, ignore, auto-correct and revert. A word that's underlined and then simply left in the message leaves no trace, and there's no count of how often each word is flagged. Words left misspelled are exactly what the custom dictionary needs: names, product terms and jargon the agent knows are right.

Serves **PER #60254** (auto-correct), Req 4.2.3 (maintained misspellings dictionary), 4.2.4 (custom dictionary) and 11 (reporting), **Phase 2**.

## What Changes

- **New `flag` event:** every word the spell checker underlines is recorded once per message, with its language and the word. Auto-replaced words are already recorded as `autocorrect` events, so together every detected error is logged.
- **`accept` events gain** the chosen suggestion's position (`rank`) and the number of suggestions offered (`offered`).
- **New `unresolved` event:** when the message is sent or cleared (the composer empties), every word still underlined is recorded once, with its language and the word: words left misspelled and not corrected.
- **The telemetry allowlist** accepts `flag` and `unresolved`, and `rank`/`offered` on `accept`.
- **A spelling error report** (`npm run telemetry:spelling`, plus a section on `/summary`), per language:
  - every recorded error word with its counts: flagged, accepted, left unresolved, ignored, auto-corrected, reverted, sessions;
  - **custom dictionary candidates:** words left misspelled (unresolved or ignored) in several sessions and rarely accepted;
  - **misspellings list candidates:** a typed word that agents fix to the same word (from a suggestion) across several sessions;
  - **removal candidates:** auto-corrections that agents often revert.

  The report suggests only; nothing is added to any list automatically.

## Non-goals

- Recording LLM requests and responses: a separate change.
- Detecting errors the spell checker doesn't flag, or how a flagged word was fixed by typing (dropped: only words left misspelled matter for the dictionaries).
- Telling a sent message from a cleared composer: both empty the composer, and both count as "left" (the layer has no send hook).
- Changing the lists themselves, or the review process (KI-5).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `auto-correct`: **Assistance events** adds the `flag` and `unresolved` events, and `rank`/`offered` on `accept`.
- `assist-telemetry`:
  - **Event batching** and **What is recorded** cover the new event and fields;
  - an added requirement, **Spelling error report**.

## Impact

- **Code:**
  - `src/composer/attach.ts` (emit `flag`, `unresolved`, `rank`/`offered`);
  - `server/assist/telemetry.py` (allowlist, report);
  - a new `server/assist/spelling_report.py` CLI;
  - an npm script.
- **Data:** single words, as `accept`/`ignore` already store. A flagged word can be a person's name. Words with digits, emails and URLs are never flagged, so they're never recorded. The log stays local (`telemetry/`, gitignored).
- **Dependencies:** none.
