# Proposal

## Why

Every Arabic misspelling in the spelling eval is synthetic or hand-curated, and all are non-words by construction. So Arabic detection recall reads 100%, and real-writer errors, the real-word ones especially, are never measured. The QALB corpus in `../arabic-gec` gives thousands of real Arabic writer errors with gold corrections and ARETA error tags per word. For example, QALB-2014 dev has 48,814 words, 10,004 of them edited, including 4,789 hamza errors. Its license allows internal research and evaluation, which is exactly a private, never-committed eval dataset. Using it requires two eval features we don't have: a way to leave grammar-edited words out of scoring, and a separate count of real-word misspellings.

Serves PER #60254, delivery phases 1–2 (spell check and auto-correct quality). Evaluation tooling only; no product behavior changes.

## What Changes

- **Converter:** a new command, `npm run eval:qalb`, turns an ARETA-tagged alignment file from `../arabic-gec` (for example `data/areta_tags/wo_camelira/qalb14/qalb14_dev.areta+.nopnx.txt`) into a private spelling-eval dataset in `eval/datasets/private/`. It maps the tags as follows:
  - unchanged words (`UC`) stay gold correct;
  - single-word orthographic edits (`REPLACE_O*` only: hamza, ta marbuta, alif maqsura, character errors) become gold misspelled, with the correction as the intended word;
  - every other edited word (grammar, morphology, word choice, merges, splits, deletions, unknown) becomes **unscored**.

  It writes the private manifest entry with source and license and copies the corpus license file next to the data.
- **Unscored label:** a new gold label, `unscored`, for words the eval must not count as correct or misspelled. Such words get no outcome in any metric. The report only counts how many there were and how many the pipeline flagged or changed.
- **Real-word misspellings reported separately:** a gold misspelling the engine accepts as a dictionary word is marked real-word. The report adds non-word and real-word detection recall and counts beside the existing overall figures. The existing metrics' definitions don't change. Committed datasets contain only non-words, so the baseline and the gate are unaffected.
- **Docs:** `docs/EVALUATION.md` describes the converter, the licensing rules for private corpora and the new label. The rule "Real-word errors are out of scope" becomes "Real-word errors are counted separately."

## Non-goals

- Nothing from QALB or ZAEBUC is committed, put in the baseline, or used to build misspellings lists, the REP table, word lists or dictionaries. It is evaluation only.
- ZAEBUC (CC BY-NC-SA 4.0) is not converted until its non-commercial terms are cleared. The converter reads the ARETA format generally, but the docs and the default path name QALB only.
- No grammar or GEC scoring: unscored words are left out, not evaluated.
- No change to auto-correct, the engine, the misspellings lists or the criteria thresholds.
- No breakdown by ARETA tag in the report. Error types come from the existing classifier, as for all data.
- No English corpus: ZAEBUC's English essays are left for later.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities
- `spelling-eval`: the dataset label set gains `unscored`; word outcomes and metrics gain the real-word distinction; datasets and private datasets gain the ARETA import with license handling. The existing private-data privacy rules apply to the imported sets.

## Impact

- **Code:** `eval/types.ts` (the `unscored` gold, a real-word flag on outcomes), `eval/outcomes.ts`, `eval/metrics.ts`, `eval/report.ts` (new figures), a new `eval/qalb.ts` (ARETA reader and mapping) with a CLI, `eval/cli/qalb.ts`, and the `eval:qalb` npm script. Tests in `test/eval/`.
- **Data:** none committed. Converted sets and the copied license live in the gitignored `eval/datasets/private/` with its own `MANIFEST.json`.
- **Dependencies:** none. The converter reads the local `../arabic-gec` checkout (MIT code; QALB data under its own research and evaluation license).
- **Licensing:** QALB allows internal research and evaluation, forbids redistribution and modification, and requires its notice on internal copies. The converted file is a reformatted internal copy, used only for evaluation, with the notice beside it. Legal should confirm that reformatting counts as evaluation use and not as a prohibited modification. Until then, the docs flag it.
- **Runtime:** QALB-2014 dev adds about 49,000 words to a benchmark run, several minutes more. The converter takes `--limit` for quick runs.
