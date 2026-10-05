# Proposal

## Why

The formal requirements name "teh" → "the" as *the* example of a high-confidence auto-replace (Req 4.2). Req 4.2.3 says that confidence comes from "a maintained autocorrect dictionary of common misspellings or a correction confidence score exceeding a configurable threshold". The prototype has neither:
- "teh" is never auto-replaced: it's below the 4-letter minimum and has 9 dictionary words one edit away.
- Since `autocorrect-reliability`, Arabic auto-replace covers only about 7% of typos. The most frequent Arabic slips, such as "اذا" → "إذا" and "الى" → "إلى", have many dictionary neighbors, so the rule leaves them as suggestions. On the 20-word Arabic typo corpus, nothing is auto-fixed.
- There's no admin control over how aggressive auto-replace is.

A curated list of known slips, each with exactly one plausible fix, brings back the common cases without loosening the general rule.

Serves **PER #60254** (auto-correct), formal Req 4.2 and 4.2.3, **Phase 2**.

## What Changes

- **Misspellings list.** A curated list per language of common typing slips, each mapping to exactly one fix:
  - **English: our own list**, about 300 entries drafted for this project (no third-party source).
  - **Arabic: AyaSpell's whole-word replacements** ("اذا" → "إذا", "الى" → "إلى", "فى" → "في", …), taken from the bundled `ar.aff` (MPL 1.1, already used and noticed), **plus our own entries**, about 100, mostly a missing hamza on frequent words ("انا" → "أنا", "اريد" → "أريد").
  - Both drafts need a **human review** before testers see them (fluent Arabic for the Arabic list), recorded as KI-5 until done.
- **Every entry is checked automatically** against the engine and dictionaries:
  - the typo is rejected and the fix is accepted, in the same script;
  - English typos have at least 3 letters;
  - for an Arabic entry, no *other* hamza or alef form of the typo is a dictionary word. For example, "ان" is excluded because both "أن" and "إن" are words.
  - no British/American variant pairs, and nothing in the custom dictionary.
- **Auto-replace uses the list first.** A misspelled word on the list is replaced by its fix even when it's short or has several dictionary neighbors. The list overrides only that ambiguity and the minimum length. The other guards still hold: all caps, ignore list, custom dictionary, the held-word trigger, and revert. The fix keeps a leading capital ("Teh" → "The").
- **The list's fix comes first among the popover's suggestions**, in every mode. So in `suggest` mode "teh" offers "the" first.
- **Admin setting "Auto-replace confidence"** (Req 4.2.3's configurable threshold, as two deterministic levels):
  - `list`: only misspellings on the list;
  - `list-and-rule`: the list, plus the case-only fix and the single-neighbor rule. This is the **default**, so behavior only widens.

  It's part of the admin policy, the demo settings panel and the presets. It only matters in `auto` mode.
- **Eval:** each auto-replacement records its source (`list`, `case` or `neighbor`), and the report breaks auto-replace precision and coverage down by source. A new baseline is committed.
- **Docs:** `docs/TESTING.md` gains scenarios (teh, Teh, اذا, الى, and the `list` setting), and "teh" moves from "must not change" to "changes". KI-5 (list review) is added to `docs/known-issues.md`. The gap analysis is updated.

## Non-goals

- Third-party English lists. The LibreOffice autocorrect table could be added later, once its data license is confirmed: the file has no header and is probably MPL 2.0. Wikipedia's list (CC BY-SA) and codespell (GPL / CC BY-SA) are excluded by the licensing rule.
- Agent-added list entries, per-tenant list editing in the admin UI, or a list larger than a few hundred entries per language.
- Phrase-level or multi-word corrections ("alot" → "a lot"), symbol and emoji replacement, and capitalizing a lone "i".
- Names, British spellings and Backspace-to-revert. Those belong to `autocorrect-revert-backspace-and-names` and a dictionary decision for SV.
- Telemetry by source. Events stay as they are.

No new third-party dependency. The AyaSpell entries come from the dictionary that is already vendored under MPL 1.1 (`dicts/ar/NOTICE`).

## Capabilities

### New Capabilities

- `misspellings-list`: the curated per-language lists, their sources and provenance, and the automatic checks every entry must pass.

### Modified Capabilities

- `auto-correct`: the confidence decision checks the list first, then (at the `list-and-rule` level) the case fix and the single-neighbor rule. "teh" is no longer a "left alone" example. The list's fix leads the suggestions.
- `assist-policy`: the admin policy gains the auto-replace confidence level.
- `demo-harness`: the settings panel shows the new setting.
- `spelling-eval`: auto-replacements record their source, and the report breaks down by it.
- `tester-kit`: tester guide scenarios for the list and the setting.

## Impact

- **Tier 1 code:**
  - new `src/autocorrect/misspellings.ts` with list data files under `src/autocorrect/lists/`;
  - `src/autocorrect/confidence.ts` (list first, confidence level);
  - `src/composer/attach.ts` (passes the level, puts the list fix first in the popover);
  - `src/policy/index.ts`;
  - `src/demo/settings.ts`, `index.html`.
- **Eval:** `eval/pipeline.ts`, `eval/outcomes.ts`, `eval/types.ts`, `eval/metrics.ts`, `eval/report.ts`, and a new `eval/baseline.json`.
- **Tests:** a list validation test on the real engine, plus `test/autocorrect/*`, `test/composer/*`, `test/policy/*`, `test/demo/*` and `test/eval/*`.
- **Bundle size:** a few KB of list data in the page bundle. No network, no worker change.
- **Eval caveat:** the curated `typos-*` datasets contain classic misspellings by construction, so the list will overlap with them and inflate coverage there. The by-source breakdown and the generated `injected-*` sets and matrix keep this visible.
