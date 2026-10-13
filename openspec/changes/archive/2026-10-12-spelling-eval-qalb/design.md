# Design

## Context

See proposal.md for why. Current state that shapes the approach:

- The spelling eval runs in Node through `eval/register.ts`. The pipeline (`eval/pipeline.ts`) tokenizes each message with the composer's own tokenizer (`src/tokenizer`, which works on a DOM `TextMap`, in jsdom) and checks it with the committed WASM engine.
- Labels (`eval/types.ts`) are `correct | misspelled | excluded`. Unlabelled words are gold correct. `eval/outcomes.ts` fails the run when a label doesn't line up with a tokenizer word.
- `TokenResult.flagged` is the engine's correctness check, after custom words. So "the engine accepts the typed word" is `!flagged`, available for every token at no extra cost.
- Private datasets (`eval/datasets/private/`, gitignored, own `MANIFEST.json`) load with kind `private`, are left out of criteria (`scopeOf` in `benchmark.ts` returns null), and are reported as aggregates only.
- Inserted datasets discard real-word errors (`inject.ts`), and curated ones are non-words by rule. So no committed misspelling is a real word, and no committed label is unscored.
- The ARETA files (`../arabic-gec/data/areta_tags/wo_camelira/<set>/<set>_{dev,test}.areta+.nopnx.txt`): a `SOURCE⇥TARGET` header, `source⇥target⇥tag` lines, blank lines between sentences (1,017 in QALB-2014 dev), no punctuation (the `nopnx` version). MERGE sources and SPLIT targets hold several space-separated words. INSERT lines have an empty source, DELETE lines an empty target.

Everything here is evaluation tooling in Node. Nothing runs in Tier 1 or Tier 2, and nothing touches the editable DOM, undo or RTL layout in the page. The converter uses jsdom only to run the tokenizer.

## Goals / Non-Goals

**Goals:**
- Real Arabic writer errors measured with the existing pipeline and metrics, with zero change to committed results.
- Licensed data that can't leak: it stays private, is reported as aggregates only, and never feeds anything that ships.

**Non-Goals:**
- Making the converter general beyond ARETA's format (M2 and other formats are out).
- Speeding up the benchmark for large private sets.

## Decisions

### 1. Read the `nopnx` ARETA files, not the raw JSON pairs
The ARETA files already align source and target word by word and type each edit. That is exactly the split between spelling (`REPLACE_O…`) and everything else. Re-aligning `{raw, cor}` ourselves would duplicate CAMeL's aligner and lose the tags. The `nopnx` version drops punctuation edits, which are not words and can't be spelling labels.
- *Trade-off:* the message text has no punctuation, so it reads less naturally. Punctuation doesn't affect word-level spell checking, except the auto-correct trigger on `.`, which these sets then don't exercise. That is acceptable for a spelling-recall set.

### 2. Orthographic means every `+`-joined part starts with `REPLACE_O`, on a one-word-to-one-word line
`REPLACE_OH+REPLACE_OM` is still a pure spelling error. `REPLACE_OH+REPLACE_XC` mixes spelling with a case ending, and its intended word would penalize the engine for not fixing grammar, so it is unscored. Multi-word sources or targets (MERGE, SPLIT, multi-word replacements) can't be a single-word misspelling, so they are unscored too.
- *Alternative:* classify with our own classifier and ignore ARETA tags. Rejected: our classifier types a pair it is told is a misspelling; it can't tell spelling from grammar.

### 3. `unscored` is a fourth gold label with its own outcome
A word with a grammar edit must not count as correct, or every flag on it would be a false flag. It must not count as misspelled either, because its intended word isn't a spelling fix. Dropping the label would make it correct by default, which is wrong. So `unscored` gets an outcome of its own that every metric skips, with counts reported for information. Transient replacements typed inside an unscored word also go to that word's outcome, not to `corruption`.

Committed datasets must not use it, so the curated sets can't hide difficult words. `loadAll` checks this for non-private datasets.

### 4. Real-word is a flag on the outcome, decided by the engine at run time
`realWord = gold misspelled && !flagged`. Deciding at run time, not at conversion, means the flag follows the dictionary and custom words of the run being measured. Existing metrics keep their definitions. Non-word and real-word recall are added beside them, so nothing in the baseline moves; a test asserts that on the committed data (spec: Committed data unchanged).
- *Alternative:* exclude real-word errors from detection recall. Rejected: that hides the gap the data is meant to show.

### 5. Alignment check by running the tokenizer during conversion
The converter builds each message, tokenizes it the same way the pipeline does (jsdom `TextMap`, `tokenize`), and checks every label's start and word. A label on a word the tokenizer produces no word for (one-letter words, which the tokenizer ignores, and tokens with digits) is dropped and counted: the composer never checks it. A sentence with a label the tokenizer splits is skipped and counted. So the benchmark's own alignment check never fails on converted data.
- *Why drop rather than skip:* on the first 200 QALB-2014 dev sentences, skipping lost 61 (30%), every one because of a label on a word with no token (167 labels; 0 split). Dropping keeps those sentences, and loses nothing measurable. To avoid two copies, the tokenizing helper is shared with the pipeline.

### 6. Manifest and license handling in the converter
The converter writes `<name>.jsonl`, copies the license file to `<name>.LICENSE.txt` and upserts the entry in the private `MANIFEST.json`. The entry records `kind`, `lang: "ar"`, `source`, `license`, `sha256`, `generator` with the command, version, `from` and options, and no seed. It writes the dataset to a temp file and renames it, so a failure leaves neither a partial dataset nor a manifest entry. `verify()` only hashes `.jsonl` and `.tsv` files, so the copied `.txt` license doesn't trip the unlisted-file check.

### 7. CLI
`npm run eval:qalb -- <areta-file> --name qalb14-dev --source "QALB-2014 dev, arabic-gec release" --license "QALB research and evaluation only" --license-file ../arabic-gec/data/gec/QALB-0.9.1-Dec03-2021-SharedTasks/LICENSE.txt [--limit N]`, in `eval/cli/qalb.ts`, using the existing `parseArgs`.

## Risks / Trade-offs

- [Reformatting QALB may count as the "modification" its license forbids] → Evaluation-only internal copy with the notice beside it; the docs flag it for legal confirmation before the converter is run on shared machines.
- [The tokenizer splits some QALB words differently (clitics with digits, Latin fragments), so sentences are skipped] → Skipped counts are printed and reported; a test with real sample lines checks the skip rate stays low (under 5% on the first 200 sentences, checked in task 3.4).
- [About 49,000 more words make `npm run eval` several minutes slower] → `--limit` for quick runs; private sets are optional and never part of `eval:check` thresholds.
- [QALB is news comments, not agent chat: its error mix and vocabulary differ] → Reported under its own dataset name, never pooled into the gated criteria; the docs say so.
- [The report leaks words through examples] → Existing private-data rule: aggregates only. A test asserts no word from a private set appears in the readable or JSON report.
- [ARETA mis-tags some edits] → Accepted; it is the corpus authors' tagging. Unscored counts make the scale visible.

## Migration Plan

No migration. Existing datasets and the baseline are unchanged. To roll back, revert the change; private converted files are local and can be deleted.

## Open Questions

- Should a later change add per-ARETA-tag counts to private reports, to cross-check our classifier against the corpus's own typing? This doesn't change this change's specs or tasks.
