# Proposal

## Why

The benchmark shows auto-replace isn't safe to turn on by default. Precision is 93.6% (EN) and 83.5% (AR) against a 99% gate. There are 17 exclusion leaks, and 8 Arabic decisions change between runs. Three known defects cause most of this:
- **KI-1:** the confidence rule reads Hunspell's time-limited `suggest()`, so a loaded CPU makes auto-correct more aggressive.
- **KI-2:** words inside emails and URLs are auto-replaced while they're being typed ("gosi" → "gosh", "https" → "HTTP").
- **KI-3:** a stray capital is "fixed" to a different word ("oNly" → "oily").

The formal requirements want auto-replace on by default (Req 2.5) at high confidence (Req 4.2.3). The next change adds a misspellings list that makes auto-correct fire more often, so the base rule needs to be deterministic and measured first.

Serves **PER #60254** (auto-correct), formal Req 4.2.2 and 4.2.3, **Phase 2**. Closes KI-1, KI-2 and KI-3.

A read-only experiment on the eval datasets (typos and injected, 574 EN and 474 AR labelled misspellings) measured the chosen rule against today's:

| | EN coverage | EN precision | AR coverage | AR precision |
|---|---|---|---|---|
| Today (`suggest()`-based) | 38.5% | 98.6% | 16.2% | 85.7% |
| Deterministic one-edit + case fix | 46.2% | 99.6% | 6.8% | 96.9% |

The drop in Arabic coverage is deliberate: Arabic morphology gives most misspellings many dictionary words one edit away ("النضام" has 24), so they stay suggestions. We chose precision. Common Arabic slips such as "اذا" → "إذا" come back through the misspellings list in the next change.

## What Changes

- **Deterministic confidence (KI-1).** The worker lists *every* dictionary word one edit away from a misspelled word (deletion, insertion, substitution or adjacent swap, over the dictionary's `TRY` letters and the word's own letters), checking each with `spell()`. Auto-replace fires only if exactly one such word exists and the existing guards hold (length, same first letter, script, all caps, ignore list, custom dictionary). The result no longer depends on CPU load or Hunspell's ranking. Popover suggestions still come from `suggest()`. **BREAKING** (behavior): "النضام" and "اذا" are no longer auto-replaced, only underlined with the fix offered.
- **Case-only fix (KI-3).** If the only problem with an English word is the case of letters after the first ("oNly", "dOcument", "thiS"), auto-correct fixes the case and never picks a different word. When the word starts with a capital, the replacement keeps it ("LLet" → "Let").
- **Hold the decision inside addresses (KI-2).** A word completed by `.`, `@`, `:` or `/` is not decided at once. It's decided when the agent next types whitespace or a line break at the end of the same run of text, and only if the word is still a checkable word then. So "info@gosi.gov.sa " and "https://www.gosi.gov.sa " are left alone, while "please seperate. " is still corrected at the space.
- **Eval stability split.** The instability criterion counts only auto-replace and flag decisions, and is gated at 0. Changes in the popover's top suggestion are reported as "suggestion instability" without a gate, because they come from Hunspell's time-limited ranking, which this change does not alter.
- **Eval mirrors the composer.** `eval/pipeline.ts` uses the same deterministic rule and the same hold-until-whitespace trigger, via shared pure functions instead of a copy of the trigger logic. A new baseline is committed.
- **Docs.** `docs/known-issues.md` closes KI-1, KI-2 and KI-3. `docs/TESTING.md` updates T1.5, T2.4, T2.5, T3.2 and the known limitations. `src/autocorrect/README.md` describes the new rule.

## Non-goals

- **Misspellings list and "teh" → "the"** (Req 4.2): the next change, `autocorrect-misspellings-list`. It also brings back the common Arabic hamza fixes.
- **Names and British spellings.** Most remaining English corruptions on clean text are names ("Fatimah" → "Fatima", "Al-Harbi" → "Al-Harbin") and British forms ("labour" → "labor", "cancelled" → "canceled"). Names belong to `autocorrect-revert-backspace-and-names`. British spelling is a dictionary question (en-US vs. en-GB) for SV. English corruption on clean text will therefore still fail its gate after this change.
- Making popover suggestions deterministic or improving their ranking (correction@1/@5). That would need a Hunspell rebuild without time limits.
- Arabic-specific confidence rules (for example MAP/REP confusable classes). Early variants measured worse (58–81% precision).
- Backspace-to-revert, a configurable confidence threshold, the human review of datasets (KI-4).

No new third-party dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `auto-correct`: the confidence decision counts dictionary words one edit away instead of engine suggestions, adds the case-only fix, and replaces the "النضام"/"اذا" scenarios. The trigger holds words completed by `.`, `@`, `:` or `/` until the next whitespace.
- `spelling-worker`: a new one-edit neighbors request.
- `spelling-eval`: decision stability excludes the top suggestion (now reported separately, without a gate). The pipeline mirrors the hold-until-whitespace trigger.
- `tester-kit`: the tester guide's auto-correct examples and known limitations change (no more KI-1 load sensitivity; "النضام" is now a suggestion example).

## Impact

- **Tier 1 code:** `src/autocorrect/confidence.ts` (rule), `src/autocorrect/trigger.ts` (hold-until-whitespace), new `src/autocorrect/neighbors.ts` (pure variant generation), `src/spell/protocol.ts`, `handler.ts`, `service.ts` (new `neighbors` request), `src/composer/attach.ts` (held words, uses neighbors instead of suggestions for the decision).
- **Eval:** `eval/pipeline.ts`, `eval/benchmark.ts`, `eval/criteria.json`, `eval/criteria.ts`, `eval/report.ts`, and a new `eval/baseline.json`.
- **Tests:** `test/autocorrect/*`, `test/spell/handler.test.ts`, `test/composer/*`, `test/eval/*`. The corpus test can pin exact results again.
- **Docs:** `docs/known-issues.md`, `docs/TESTING.md`, `docs/EVALUATION.md`, `src/autocorrect/README.md`, `src/composer/README.md`.
- **Performance:** about 2–75 ms of `spell()` calls per completed misspelled word, in the worker. This replaces the `suggest()` call on the auto-correct path (12–180 ms). No page-thread cost.
