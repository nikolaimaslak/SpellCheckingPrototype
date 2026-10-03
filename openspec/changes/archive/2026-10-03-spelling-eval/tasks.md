# Tasks

## 1. Scaffolding

- [x] 1.1 Add `eval/register.ts` (a `module.registerHooks` resolver that maps extensionless relative imports to `.ts`) and an `eval/cli/` entry convention. Add the `eval`, `eval:check`, `eval:baseline`, `eval:words` and `eval:inject` scripts (`node --import ./eval/register.ts eval/cli/<name>.ts`) and gitignore `eval/reports/` and `eval/datasets/private/`. Verify with `test/eval/register.test.ts`, which spawns Node to import `src/autocorrect/confidence.ts` through the hook, and check that `npm test` still passes.

## 2. Error-type taxonomy and classifier

- [x] 2.1 Create `eval/error-types.ts` (dependency-free, erasable syntax) with the taxonomy, the QWERTY and Arabic 101 neighbour maps, and the Arabic confusion sets (hamza forms, ة/ه, ى/ي, emphatic pairs, dot groups). Verify with unit tests that every type listed in the spec exists for its language and that the confusion sets are symmetric where the spec says ↔.
- [x] 2.2 Implement `classify(misspelled, intended, lang)`: OSA edit script after removing diacritics and tatweel, `boundary` and `multi` handling, and the design D3 precedence. Verify with unit tests covering the spec scenarios ("اذا"→"إذا" `hamza`, "المساعده"→"المساعدة" `ta-marbuta`, "teh"→"the" `transpose`, "acomodate"→"accommodate" `multi` with two `undouble`), plus one case per type, and mixed-language pairs returning no type.
- [x] 2.3 Implement `apply(word, type, rng)` for each single-edit type, and a mulberry32 generator. Verify with a property test: for every type, many seeds and sample English and Arabic words, `classify(apply(w, t), w) === t`, or `apply` reports the type as not applicable.

## 3. Pipeline and outcomes

- [x] 3.1 Implement `eval/pipeline.ts` (a jsdom window, `buildTextMap`, `tokenize` with no caret, the composer's filters, handler `load`/`add`/`check`/`suggest`, then `decide`). Verify with `test/eval/pipeline.test.ts`: "please seperate them", "النضام" and "رقم النضام هو paymnet" give the expected flags, suggestions and replacements, and "CS-104233", "١٢٣٤٥" and "$(user.firstName)" are excluded.
- [x] 3.2 Add a parity test running 10 English, Arabic and mixed messages through `attach()` (with `test/composer/fakes.ts`, every word completed by a typed space) and through the pipeline. Verify they agree on flags and auto-replacements.
- [x] 3.3 Implement label alignment and outcome classification (`eval/outcomes.ts`): ranked corrections (the auto-replacement first, then the suggestions, without duplicates), rank of the intended word with diacritics and tatweel ignored and hamza kept, and the `fixed` / `wrong-fix` / `flagged` / `missed` / `false-flag` / `corruption` / `excluded` / `exclusion-leak` outcomes. Verify with unit tests for every outcome scenario in the spec and for an alignment failure that names the message id.

## 4. Correct text and word lists

- [x] 4.1 Implement the word-list builder (`eval/words.ts` and `eval/cli/words.ts`). Input is `.txt` or `.jsonl`; output is TSV `word`, `count`, `lang`, with rejected counts by reason. Verify with unit tests for the spec scenarios: "request" counted twice with "CS-104233" absent, "مَرْحَبًا" and "مرحبا" merged into "مرحبا" ×2, and "النضام" rejected by the engine.
- [x] 4.2 Write the clean datasets `clean-en`, `clean-ar` and `clean-mixed` (≥ 5,000 words per language) from the canned responses, the KB and new synthetic messages, labelling every excluded span. Have a person review them, and record the review in the manifest `source`. Write them as marked sources (`eval/datasets/src/*.txt`, excluded spans wrapped in ⟦…⟧ by hand, independently of the tokenizer's patterns) and build the JSONL with `eval/build-datasets.ts`. Verify that every label aligns. Review every word the engine flags: a real typo in the data gets fixed; a correct word stays, because it's exactly what the false-flag rate measures. The human review is moved to a follow-up (docs/known-issues.md, KI-4).
- [x] 4.3 Generate `words-en.tsv` and `words-ar.tsv` from the clean datasets with `npm run eval:words`. Verify that the command runs as documented and that the lists are non-empty and sorted.

## 5. Misspelling inserter

- [x] 5.1 Implement `eval/inject.ts`: eligibility rules, sentence mode at a given rate, per-word mode, type selection, real-word discard with up to 3 retries, per-type counts, labelled JSONL output and a sidecar `.meta.json`. Verify with unit tests for the spec scenarios: reproducible output, selected Arabic type `ta-marbuta`, per-word counts and not-applicable counts, "from"→"form" discarded, and the mixed message with "GOSI" untouched.
- [x] 5.2 Add `eval/cli/inject.ts` with `--lang`, `--types`, `--rate`, `--per-word`, `--seed` and `--out`, reading `.txt`, `.jsonl` or `.tsv`. Verify by running it twice on `clean-ar.jsonl` with the same seed and checking that the outputs are byte-identical (a test spawns the command).

## 6. Datasets and manifest

- [x] 6.1 Implement dataset and manifest loading (`eval/datasets.ts`): sha256 checks, refusing unlisted files, and a separate gitignored manifest for `private/`. Verify with unit tests that an unlisted file or a hash mismatch fails and names the file, and that private files load as kind `private`.
- [x] 6.2 Create the curated typo sets `typos-en.jsonl` (≥ 150) and `typos-ar.jsonl` (≥ 100), seeded from `test/autocorrect/corpus.test.ts` plus GOSI-domain slips, each inside a carrier message. Verify that the manifest check and label alignment pass.
- [x] 6.3 Generate `injected-en.jsonl` and `injected-ar.jsonl` from the clean sets with recorded seeds and options, and register them, together with the word lists and clean sets, in `MANIFEST.json`. Verify that regenerating with the recorded options reproduces the committed files.
- [x] 6.4 Do the license review (Birkbeck, the Wikipedia misspellings lists, the GitHub Typo Corpus, QALB, ZAEBUC, and English and Arabic public word-frequency lists) and record each verdict and reason in `eval/datasets/MANIFEST.md`. Verify that every candidate has a source URL and a verdict.

## 7. Metrics, matrix, correction types, criteria and report

- [x] 7.1 Implement `eval/metrics.ts` with the detection, correction and auto-replace layers, the corruption 95% upper bound, exclusion leaks, latency p50/p95, and grouping by language, dataset and error type (using `classify` when a label has no type). Verify with unit tests reproducing the spec's "Rates computed" and "Type breakdown on unlabelled data" scenarios.
- [x] 7.2 Implement the error-type matrix (per-word insertion over the word list in memory, with a fixed seed; each variant a one-word message). Verify with a test on a small word list that every type has a row with the spec's columns and that a weak type doesn't affect other rows.
- [x] 7.3 Implement correction types: `classify(typed, topCorrection)` for detected tokens, the error-type × correction-type table, and the types of corruptions and wrong fixes. Verify with unit tests for the "Off-diagonal correction" and "Corruption type" scenarios.
- [x] 7.4 Add `eval/criteria.json` with the provisional thresholds, directions, tolerances and gate flags, and a validating loader. Verify with unit tests for "Criterion fails" and "Thresholds changed".
- [x] 7.5 Implement the report writer (`latest.json`, `latest.md`) with the sections in design D9, Arabic in `<bdi>`, and private datasets reduced to aggregates before writing. Verify with unit tests that the "Corruption listed" example appears with its correction type, and that no token from a private dataset appears in either file.

## 8. Benchmark, stability and gate

- [x] 8.1 Implement `eval/benchmark.ts` and `eval/cli/eval.ts`: engine warm-up, three unloaded runs plus one loaded run (`worker_threads` busy loops), majority results, instability with examples, and the reports. Verify that `npm run eval` writes both reports covering every committed dataset, the matrices and the criteria, with the completion server stopped and `GEMINI_API_KEY` unset.
- [x] 8.2 Implement the gate in `eval:check`: compare with `eval/baseline.json`, fail on any increase in corruptions or wrong fixes, any exclusion leak, or a criterion metric beyond tolerance; print per-type changes without failing. Implement `eval:baseline`. Verify with unit tests of the comparison covering "New corruption", "Within tolerance" and "Per-type drop".
- [x] 8.3 Run the first baseline and commit `eval/baseline.json`. Record the measured values against the provisional criteria, including the expected KI-1 instability and the weakest Arabic error types, in `docs/EVALUATION.md`. Verify that `npm run eval:check` passes on an unchanged tree.

## 9. Field metrics

- [x] 9.1 Extend `summarize` and `renderSummary` in `server/telemetry.ts` (importing `../eval/error-types.ts`) with per-language revert rates, accept and ignore counts and ignore share, the field error-type distribution, and the revert rate per auto-correction type, each labelled with its offline counterpart. Verify with `test/server/telemetry.test.ts` cases for "Revert rate per language", "Ignore share" and "Field error types", and check that the existing scenarios still pass and `npm run server` starts.

## 10. Documentation

- [x] 10.1 Write `docs/EVALUATION.md`: the three metric layers and the criteria with their rationale, the taxonomy and classifier precedence, the word-list builder and inserter with examples, how to run and read `eval` / `eval:check` / `eval:baseline`, how to add a dataset (format, manifest, review, private data), and how field metrics relate to offline ones and their biases. Verify that every documented command runs as written.
- [x] 10.2 Update `CLAUDE.md` (commands and the `eval/` layout, including that `server/` imports `eval/error-types.ts`) and `docs/known-issues.md` (KI-1 exit criterion: instability 0 in `npm run eval`). Verify that the paths and commands they mention exist.

## 11. Integration check

- [x] 11.1 Run `npm run typecheck`, `npm test` and `npm run eval:check` on a clean tree. Then make a deliberately harmful local edit (lower `MIN_LETTERS.en` to 2) and confirm `eval:check` fails, naming the new corruptions or wrong fixes. Revert the edit afterwards.
