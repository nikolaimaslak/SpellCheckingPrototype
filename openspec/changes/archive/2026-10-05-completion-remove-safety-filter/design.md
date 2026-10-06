# Design

## Context

Completion today (`server/complete.ts`):

```
parse { word, rest } → assemble → finalize → safetyCheck → reply
```

- **`safetyCheck`** (`server/safety.ts`) withholds the suggestion for, in order:
  - `identifier`: an email or link;
  - `conversation`: a customer word of 3+ letters that is neither in the prefix nor in the approved library;
  - `figure`: digits, number words, currencies, percentages;
  - `date`: months, weekdays, relative days, time unit + relative word.
- **With `COMPLETION_SOURCED_FIGURES=allow`**, figures and dates pass when the whole suggestion is verbatim in a source sent with the request.
- **Its inputs:**
  - `complete.ts` computes the approved-library vocabulary for it (`libraryVocabulary`);
  - `main.ts` reads the setting (`sourcedFigures()` in `model-select.ts`), passes `allowSourcedFigures`, reports it on `/health`, and logs every withheld reason through `onWithheld`.
- **The prompt** (`systemInstruction(allowSourcedFigures)`) has one line in two variants, either banning all figures, dates, identifiers and names, or allowing figures and dates only verbatim from approved texts.

## Goals / Non-Goals

**Goals:**
- A suggestion is never withheld for its content. Only unusable model output (`format`) or the shape rules (one line, one sentence, 20 words, script) yield nothing.
- The model may use, and repeat, any detail of the content sent: the conversation, canned responses and KB.
- The change removes code and configuration and adds none.

**Non-Goals:**
- A grounding check, customer history as a source, or a local model in the prototype.
- Polish's safety checks.

## Decisions

### D1. Delete the filter (Tier 2)

- Delete `server/safety.ts` and `test/server/safety.test.ts`.
- In `complete.ts`:
  - `build()` drops its `safety` callback; after `finalize`, a non-empty completion is returned with its `edit`;
  - `libraryVocabulary`, `allowSourcedFigures` and the `WithheldReason` import go;
  - `onWithheld` stays, typed `(reason: 'format', lang)`.
- `types.ts`: `CompleteReply.withheld` becomes `'format'`.

*Alternative rejected:* keeping the filter behind a setting that defaults to off. It would keep around 200 lines and a setting whose only purpose is a reading of Req 3.7 that SV hasn't confirmed. If SV wants a filter, the archived change shows the earlier one, and a grounding check would likely replace it rather than this ban.

### D2. Prompt (Tier 2)

`systemInstruction()` loses its parameter. The two variant lines are replaced by one:

> "Use names, numbers, amounts, dates, time periods, reference numbers, email addresses and links only as they appear in the conversation, the approved responses or the knowledge base; never invent them."

The policy line ("Do not invent policies that are not in the approved responses, the knowledge base or the conversation.") and the structured-output lines stay. The prompt test checks that the old ban wording is gone, and that the grounding line is present.

### D3. Setting and health (Tier 2, config)

- Delete `sourcedFigures()` from `model-select.ts`, along with its test.
- `main.ts` stops reading `COMPLETION_SOURCED_FIGURES`, and `/health` drops `sourcedFigures`.
- `.env.example`, `README.md` and `CLAUDE.md` drop the variable. A leftover value in a developer's `.env` is harmless, because nothing reads it.

### D4. Telemetry (Tier 2)

- `server/telemetry.ts` keeps all of its `WITHHELD_REASONS`, so older lines still sanitize and count.
- The comment says only `format` is written now.
- The summary label "Completions withheld (Req 3.7, format)" becomes "Completions withheld".

### D5. Docs

- **`docs/TESTING.md`:**
  - **T4.14:** "Thank you for contacting us, your request" now shows "…within 3 working days…".
  - **T4.15:** becomes a check that `/health` has no sourced-figures field, or is folded into T4.14.
  - **T4.16:** with Gemini, a suggestion may include "Noura", and nothing is counted as withheld.
  - **T8.1:** only `format` is expected.
  - **Known limitations:** the paragraph on withheld suggestions is replaced by: suggestions may contain any detail from the conversation (synthetic data only).
- **`src/completion/README.md`:** the event note.
- **The gap analysis:** the Req 3.7 row becomes "Not enforced, by decision (local LLM); pending SV".
- **`docs/requirements/sv-questions-2026-10-05.md`:** question 3 (facts in completions) is replaced by the broader PII question:
  - production uses a local LLM so that generation can use customer data (interaction history, the current conversation, the internal KB);
  - may suggestions contain such details, and should Req 3.7 be restated?
  - development continues on synthetic data with no output filter.

### Undo, editable DOM, RTL

There's no client change. Arabic suggestions go through the same assembly, and there's simply no filter after it.

## Risks / Trade-offs

- **Suggestions can contain figures, dates and identifiers the model invented.** → The prompt's grounding line asks it not to, and the agent reviews every suggestion before accepting it. A deterministic grounding check is the natural follow-up once SV answers.
- **Gemini sees the full conversation and returns its details.** → This was already the case for the input. The hosted model is dev-only, with synthetic data and the yellow banner, as before.
- **SV may require Req 3.7 as written.** → The SV message asks explicitly. Restoring a filter is a separate change, ideally the grounding variant.
