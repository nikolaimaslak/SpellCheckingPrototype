# Proposal

## Why

Production completion will run on a **local LLM**, a requirement stated by the product owner on 2026-10-05. Its purpose is to let generation **use customer data**: the interaction and customer history, the entire current conversation, and the company's internal knowledge base. A useful suggestion will often contain exactly those details: the customer's name, a case number, an email address, a date or an amount.

The completion safety filter (formal Req 3.7, change `completion-safety-filter`) does the opposite. It withholds every suggestion that contains:
- a figure;
- a date or timeline;
- an email or link;
- any word from the customer's messages that isn't in the approved library.

In testing it mostly blocked harmless suggestions. In a replay of a tester's chat, 9 of 33 Gemini answers were withheld for customer words like "policy", "loss" and "see", and none contained PII. It also forces the model to write around the facts the agent needs.

So the filter is removed entirely, along with its prompt restrictions and the `COMPLETION_SOURCED_FIGURES` setting. Whether production suggestions may contain customer PII, and how Req 3.7 should be restated, is a question for SV. Until SV answers, development continues on **synthetic data only**: the model receives the full original content (conversation, canned responses, KB) without redaction, and suggestions are returned unfiltered.

Serves **PER #60145** (auto-complete), formal Req 3.1 (grounded in the conversation, KB and canned responses) and Req 3.7 (pending SV), **Phase 3**.

## What Changes

- **Safety filter removed (Tier 2):**
  - `server/safety.ts` is deleted, with its figure, date, identifier and conversation checks;
  - `complete.ts` returns the assembled suggestion as is;
  - the only remaining reason to withhold is `format` (model output the server can't use).
- **The setting is removed:**
  - `COMPLETION_SOURCED_FIGURES` is ignored;
  - `/health` no longer reports it;
  - `.env.example`, the README and CLAUDE.md drop it.
- **The prompt no longer forbids details:**
  - the lines banning numbers, amounts, dates, time periods, reference numbers, emails, links and names are replaced by one grounding line: state facts, figures, dates and identifiers only as given in the conversation, canned responses or knowledge base, and invent nothing;
  - the sources line ("don't invent policies") stays.
- **Reply and telemetry:**
  - replies carry `withheld` only for `format`;
  - telemetry keeps accepting the old reasons (`figure`, `date`, `identifier`, `conversation`, `spelling`), so older log lines still count on `/summary`.
- **Docs:**
  - `docs/TESTING.md`: T4.14 and T4.15 ("3 working days" withheld, then shown with `allow`) become one scenario where the figure is shown; T4.16 (names withheld) is rewritten; T8.1 and the known limitations are updated;
  - `src/completion/README.md`;
  - the gap analysis (Req 3.7: removed, pending SV);
  - `docs/requirements/sv-questions-2026-10-05.md`: the PII question.

## Non-goals

- Adding customer or interaction history as a context source. The prototype has none; that's a later change.
- Switching the prototype to a local LLM. Gemini stays the dev stand-in, for synthetic data only, and the yellow banner stays.
- Polish's own safety checks (`server/polish.ts`: protected content, length, line breaks). That's a different feature, unchanged.
- Auto-correct's protection of customer words from auto-replacement (Req 4.2.2). That's a Tier 1 feature, unchanged.
- A grounding check (withholding details that aren't in the sources). It was considered and deferred until SV answers the PII question.

No new dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `completion-service`:
  - "Context assembly": the instructions no longer forbid details, and ask for grounding instead;
  - "Model call": `/health` drops the sourced-figures setting;
  - "Output post-processing" is **removed** and replaced by **added** "Output assembly", which keeps the structured assembly, format and shape rules, without the safety filter.
- `assist-telemetry`: "What is recorded": the old withheld reasons are accepted for older logs only.

## Impact

- **Tier 2:**
  - `server/safety.ts` (deleted);
  - `server/complete.ts`;
  - `server/prompt.ts`;
  - `server/types.ts`;
  - `server/main.ts` (`/health`, the `onWithheld` wiring stays for `format`);
  - `server/model-select.ts` (`sourcedFigures` removed);
  - `server/telemetry.ts` (comment and label).
- **Tests:**
  - `test/server/safety.test.ts` (deleted);
  - `complete.test.ts`, `prompt.test.ts`, `model-select.test.ts` and `telemetry.test.ts`, updated.
- **Config and docs:** `.env.example`, `README.md`, `CLAUDE.md`, `docs/TESTING.md`, `src/completion/README.md`, the gap analysis and the SV questions.
- **Tier 1:** no change.
