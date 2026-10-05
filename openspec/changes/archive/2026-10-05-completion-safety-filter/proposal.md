# Proposal

## Why

Formal Req 3.7 says completions shall contain **no PII, identifiers, amounts, dates or timelines**. The prototype contradicts it:
- The prompt (`server/prompt.ts`) only forbids figures that are *not* in the sources, so the model may repeat "within 3 working days" or "25 years" from a canned response or KB article.
- `server/postprocess.ts` has no filter at all.
- The demo's flagship suggestion is one of these: "…will be processed within 3 working days". The Arabic canned response even writes the number as a word ("خلال ثلاثة أيام عمل"), so a digit check alone would miss it.
- Nothing stops a customer's name from being echoed into a suggestion.

Whether figures that are taken verbatim from approved KB or canned text are acceptable is SV's open question 3 (`docs/requirements/sv-questions-2026-10-05.md`). Until SV answers, the service follows Req 3.7 as written, with a switch for the alternative.

Serves **PER #60145** (auto-complete), formal Req 3.7, **Phase 3/4**.

## What Changes

- **A deterministic safety filter on the completion server** (Tier 2), after the existing post-processing. A completion is **dropped entirely** (an empty reply, so no ghost text) when it contains:
  - **figures:** any digit (Western or Arabic-Indic), English or Arabic number words ("three", "ثلاثة", including with Arabic clitics such as "بثلاثة"), currency ("SAR", "riyal", "ريال", "$", "﷼") or percentages;
  - **dates and timelines:** month names (English; Arabic Gregorian, Levantine and Hijri), weekday names, "tomorrow"/"yesterday"/"غداً"/"أمس", and a time unit paired with a relative word ("within a few days", "next week", "خلال أسبوع", "الشهر القادم");
  - **identifiers:** email addresses and URLs;
  - **conversation words:** a word from the customer's messages that is neither in the agent's prefix nor anywhere in the approved library (all canned responses and KB articles). This catches names copied from the conversation in both languages.
- **A server setting** `COMPLETION_SOURCED_FIGURES`:
  - `block` (default): Req 3.7 as written;
  - `allow`: figures, dates and timelines pass when the whole completion appears verbatim in an approved canned response or KB passage sent with this request.

  Identifiers and conversation words are always blocked. `/health` reports the setting.
- **The prompt forbids figures, dates, timelines, identifiers and names,** unless the setting allows sourced figures, in which case it says "only verbatim from the approved texts". The prompt reduces drops; the filter is the guarantee.
- **The reason is reported, never the text.** The reply carries `withheld: 'figure' | 'date' | 'identifier' | 'conversation'` when a completion is dropped. The server logs a `completion-withheld` event with only that reason, and `/summary` shows withheld counts by reason, so over-blocking is visible.
- **Docs:** `docs/TESTING.md` T4.2 (with the default setting, the canned "3 working days" suggestion is withheld) plus a scenario for the setting, `.env.example`, `README.md` and `CLAUDE.md` for the new env var, and the gap analysis.

## Non-goals

- Truncating a completion before the forbidden part (decided: drop the whole completion).
- Named-entity recognition, name lists, or a dictionary on the server. Conversation words stand in for names.
- Filtering on the client. The server is the only path to the model, so a client can't bypass the filter.
- Grammar polish output (`/v1/polish`), which already has its own protected-content checks.
- Measuring the false-drop rate on live model traffic. The new summary counts make it observable during tests.

No new dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `completion-service`:
  - "Context assembly": the instructions now forbid figures, dates, timelines, identifiers and names, with the sourced-figures exception;
  - "Output post-processing": the safety filter, the drop rule and the `withheld` reason;
  - "Model call": `/health` reports the setting.
- `assist-telemetry`: "What is recorded" gains the server-written `completion-withheld` event (reason only), and "Summary page" shows withheld counts by reason.

## Impact

- **Tier 2 code:**
  - new `server/safety.ts` (pure filter, with English and Arabic word data inline, because the server doesn't import `src/`);
  - `server/complete.ts` (applies the filter and returns the reason);
  - `server/prompt.ts`;
  - `server/main.ts` (env var, `/health`, logs the withheld event);
  - `server/telemetry.ts` (new event type, allowlisted `reason` enum, summary).
- **Tests:** a new `test/server/safety.test.ts`, plus `test/server/complete.test.ts`, `prompt.test.ts` and `telemetry.test.ts`.
- **Client:** no change. An empty completion already shows nothing.
- **Demo:** with the default setting and the offline model, the "3 working days" canned suggestion no longer appears. `COMPLETION_SOURCED_FIGURES=allow` brings it back.
