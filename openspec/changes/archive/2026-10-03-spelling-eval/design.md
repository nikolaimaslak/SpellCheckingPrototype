# Design

## Context

The quality decisions in Tier 1 are made in four places:
- `src/tokenizer`: words, exclusions and per-word language;
- `src/spell/handler.ts`: correctness, with Arabic diacritics and tatweel stripped, and suggestions;
- the custom-dictionary `add` request;
- `src/autocorrect/confidence.ts` (`decide`).

`src/composer/attach.ts` wires them together:
1. build a `TextMap` from the DOM;
2. `tokenize`;
3. filter by enabled language, readiness and the ignore list;
4. `check`;
5. on a typed boundary, `suggest` and then `decide`.

Three facts about the codebase shape the runtime choice:
- `src/` uses extensionless relative imports, so plain Node can't load it the way it loads `scripts/*.ts`.
- `src/` uses only erasable TypeScript syntax, so Node's type stripping handles it once imports resolve.
- The tokenizer needs DOM `Range`s.

The real-engine tests already load Hunspell WASM and both dictionaries in Node through `createHandler`. KI-1 documents that `suggest()` is time-limited and therefore unstable under load.

`server/` runs directly under Node and must not import `src/`.

**Tiers:** everything here is dev tooling at the config / build level. Nothing ships to the browser (Tier 1). The only Tier 2 change is the telemetry summary page. The change doesn't touch undo, the editable DOM or the RTL composer layout. The only RTL concern is how Arabic words display in the Markdown report.

## Goals / Non-Goals

**Goals:**
- Give the same answer as the composer for the same text, configuration and dictionaries.
- Make each tool (word lists, inserter, classifier, benchmark) usable on its own, on any text.
- Run the committed benchmark in under about 2 minutes on a laptop.
- Make every number traceable to a message, a dataset manifest entry and an error type.

**Non-Goals:**
- Simulating keystroke timing or the DOM event flow. The boundary-trigger rules are covered by existing unit tests.
- Measuring worker round-trip or page latency. Engine latency is measured in-process.

## Decisions

### D1. Eval commands are Node scripts with a small resolve hook
`eval/register.ts` calls `module.registerHooks` (Node ≥ 23.5; we run 25) to resolve extensionless relative specifiers to `.ts`. Each command runs as `node --import ./eval/register.ts eval/cli/<command>.ts`:

| Command | Does |
|---|---|
| `eval` | Run the benchmark and write reports |
| `eval:check` | `eval` plus the gate; exits non-zero on regression |
| `eval:baseline` | Write the baseline |
| `eval:words` | Build word lists |
| `eval:inject` | Insert misspellings |

The pipeline creates a jsdom window and exposes the globals the tokenizer needs. Unit tests for the eval modules live in `test/eval/` and run in `npm test`. The full benchmark doesn't.

*Why:* the inserter and word-list builder are real command-line tools, with arguments, files and exit codes, and they need the engine (real-word discard, correctness filter). One mechanism serves all five commands, and it adds no dependency.
*Alternatives:*
- **Vitest with a separate config:** fine for a gate, awkward for argument-taking tools.
- **`tsx` / `vite-node`:** a new dependency.
- **Adding `.ts` extensions throughout `src/`:** a large unrelated change.

### D2. One pipeline module that mirrors the composer, in typing order
`eval/pipeline.ts` takes a message and a configuration (languages, custom words). It mirrors `attach.ts` as if the message were typed from start to end:
- **Auto-replacement:** at each boundary character (the `trigger.ts` rules: one whitespace or punctuation character, at most 3 separator characters after the word), the pipeline tokenizes the text typed so far and takes the word that boundary completes. It then runs `check`, `suggest` and `decide`, skipping custom words as `completedAt` does.
- **Underlines:** decided on the finished text with `check`, plus `suggest` for latency and ranking.
- **Transient replacements:** a replacement of a completed word that is not a word of the finished text is returned separately. The parity test found the case: in "info@gosi.gov.sa", the "." after "gosi" completes "gosi" before the email pattern matches, and the composer replaces it with "gosh" (KI-2).
- **Message end:** a message without a final boundary gets one, which is the worst case for corruption.

The pipeline returns per-token `{ word, start, end, lang, flagged, suggestions, replacement, checkMs, suggestMs }` plus the transient replacements.

*Why:* evaluating only the finished text would miss replacements that happen mid-typing, which are exactly the kind of corruption the gate exists to catch.
*Risk of drift* from `attach.ts`. Mitigation: a parity test types messages character by character into `attach()`, backed by the real engine through the spell service, and requires the same replacements (including transient ones) and the same underlines.

### D3. Shared error-type module
`eval/error-types.ts` is dependency-free and written in erasable syntax. It holds:
- the taxonomy;
- the English QWERTY and Arabic 101 keyboard neighbour maps;
- the Arabic confusion sets (hamza forms, ة/ه, ى/ي, emphatic pairs, dot groups by letter shape);
- `classify(misspelled, intended, lang)`;
- the per-type `apply(word, type, rng)` used by the inserter.

`server/telemetry.ts` imports it as `../eval/error-types.ts`. That keeps one taxonomy for offline and field data without the server importing `src/`.

**How `classify` works:**
1. Compute the optimal-string-alignment edit script (insert, delete, substitute, adjacent transpose) after removing diacritics and tatweel from both words.
2. If the words differ in a space or hyphen, the type is `boundary`.
3. If there's more than one edit, the type is `multi`, with each edit typed.
4. Otherwise, type the single edit using this precedence:
   1. `case` (English);
   2. `hamza` → `ta-marbuta` → `alef-maqsura` → `emphatic` → `dots` (Arabic);
   3. `transpose`;
   4. `double` / `undouble` (the inserted or deleted letter equals its neighbour);
   5. `keyboard-sub` (neighbouring keys);
   6. `substitute`, `insert`, `delete`.

The insert and delete types are named from the misspelling's point of view: `delete` means the misspelling lacks a letter.

`apply` produces only edits that `classify` maps back to the same type. A property test enforces this round trip over the committed word lists, for every type and with many seeds.

*Alternative:* letting the inserter label types without a classifier. That fails the goal of estimating types for data we didn't generate (curated, public, private, field).

### D4. Correct text and word lists
**Clean messages** (`clean-en`, `clean-ar`, `clean-mixed`, at least 5,000 words per language):
- **Sources:** `server/data/canned.json`, `server/data/kb.json`, and new synthetic agent messages (drafting with the hosted model is allowed for synthetic data).
- **Content:** greetings, pensions, contributions, registration, Absher/Musaned, names, `$(...)` fields, case numbers, URLs.
- **Review:** a person reviews every message before its labels are trusted, and the manifest's `source` records the review.

**Word-list builder** (`eval:words`):
1. Run the input through the pipeline.
2. Keep tokens that aren't excluded, are a single script and are accepted by the engine.
3. Strip Arabic diacritics and tatweel.
4. Count, and sort by count and then by word.

It writes TSV (`word`, `count`, `lang`) and prints the rejected counts by reason. `words-en.tsv` and `words-ar.tsv` are committed, built from the clean messages.

Public frequency lists, which would give broader coverage, are only reviewed for licensing here (D10).

### D5. Misspelling inserter
`eval/inject.ts` (library) and `eval/cli/inject.ts` (command) take:
- input: `.txt` (one message per line), `.jsonl` (a dataset, whose existing labels are kept) or `.tsv` (a word list);
- `--lang`, `--types` (default: all types for the language), `--rate` (default 0.08, sentence modes);
- `--per-word` (matrix mode, word lists);
- `--seed`, `--out`.

It uses an in-repo mulberry32 random generator and a stable iteration order. A word isn't eligible if it's excluded, has fewer than 2 letters, is in the custom dictionary or is already misspelled. In sentence mode it picks eligible words at the given rate and a type at random among the selected types that apply. A variant the engine accepts is discarded as a real-word error and counted by type, then up to 3 other positions or types are tried.

It writes labelled JSONL and a sidecar `.meta.json` with options, seed, generator version and counts (inserted, discarded, not applicable per type). Its output for the committed data goes into the manifest.

### D6. Data format and manifest
**Datasets** are `.jsonl` files of `{ id, text, labels: [{ start, word, gold: 'correct' | 'misspelled' | 'excluded', intended?, type? }], customWords? }`:
- Tokens without a label default to `correct`, so a clean set lists only its excluded spans.
- Labels are aligned with pipeline tokens by `start` offset. A mismatch fails the run with the message id.

**Word lists** are `.tsv`.

**`eval/datasets/MANIFEST.json`** lists every committed file with kind (`typos` | `clean` | `injected` | `wordlist` | `public`), language, source, license, sha256 and generator metadata.

**Private data** lives in `eval/datasets/private/` with its own gitignored `MANIFEST.json`.

**`eval/datasets/MANIFEST.md`** holds the human-readable provenance and the license review.

### D7. Outcomes, metrics, matrix and correction types
Outcomes and formulas are as in the spec, in three layers: detection, correction and auto-replace. The **system's ranked corrections** for a detected token are the auto-replacement, if there is one, followed by the remaining suggestions in order, without duplicates. Correction accuracy is then independent of whether the auto-replace mode is on.

- **Matrix:** for each language, `eval/benchmark.ts` runs the inserter in per-word mode over the committed word list with a fixed seed. It does this in memory at benchmark time, so it isn't a committed file. It then evaluates each variant as a one-word message.
- **Correction types:** `classify(typed, topCorrection)` for each detected token. The error-type × correction-type table is computed from labelled misspellings. Corruptions and wrong fixes list their correction type.
- **Criteria:** `eval/criteria.json` holds, per language and metric, `{ threshold, direction, tolerance, gate? }`. The thresholds are provisional; the first baseline calibrates them, and changing one later is a spec change.
- **Latency:** `performance.now()` around each handler call, after a warm-up.

### D8. Stability under load
Each dataset and matrix is evaluated three times. It's then evaluated once more while `os.availableParallelism()` `worker_threads` busy-loop. Each token's tuple (`flagged`, rank-1 correction, `replacement`) is compared across all four runs. The metrics and the gate use the result that at least two of the three unloaded runs agree on, so KI-1 shows up as instability rather than as random gate failures.

### D9. Reports and privacy
`eval/reports/latest.json` and `latest.md` are gitignored. The Markdown report has:
1. the criteria summary per language (✅/❌, with the 95% upper bound next to the corruption rate);
2. the three metric layers per dataset;
3. the error-type distribution per dataset;
4. the matrices;
5. the correction-type tables;
6. example lists (corruptions, wrong fixes, leaks, unstable tokens; at most 50 each), with Arabic in `<bdi>`.

Private datasets are reduced to aggregates, including per-type counts, before the writer is called. The writer never receives their tokens, and a test enforces this.

### D10. Field metrics through the telemetry summary
`autocorrect`, `revert`, `accept` and `ignore` events already carry `lang`, and spelling events carry the original and replacement word (allowlisted, at most 64 characters). `summarize` classifies `autocorrect` and `accept` pairs with `classify`. It matches each `revert` to its auto-correction type by its pair. Per language, it reports the type distribution and the revert rate per type, next to the revert rate and ignore share.

Labels on the page tie each figure to its offline counterpart. `docs/EVALUATION.md` explains the biases:
- reverts undercount wrong fixes;
- accepts reflect only flagged words that agents bothered to fix;
- `ignore` events have no intended word, so they have no type.

No new events and no text beyond today's allowlist are added.

### D11. License review
The license review covers:
- **English typos:** the Birkbeck corpus, the Wikipedia misspellings lists (CC BY-SA, so a committed copy needs attribution and share-alike) and the GitHub Typo Corpus;
- **Arabic error corpora:** QALB, ZAEBUC;
- **Public word-frequency lists** for English and Arabic.

Each gets a verdict (commit / local-only / reject) and a reason in `MANIFEST.md`. Import scripts are follow-up work, only for sources that pass.

## Risks / Trade-offs

- **[Synthetic text and errors aren't agent text]**: the inserter follows our model, not real agents. → Curated, inserted and matrix results are reported separately. The classifier lets real data (private pilot, field telemetry) show the actual type distribution, which can then be used to weight the inserter's types.
- **[Classifier ambiguity]**: a single edit can fit several types; for example "ي"→"ى" could be `dots` or `alef-maqsura`. → A fixed, documented precedence. `multi` keeps the individual edits. The round-trip test pins the behavior.
- **[Small clean sets can't prove 1 in 10,000]**: zero corruptions in 5,000 words only shows the rate is below about 6 in 10,000 (95% upper bound). → The report prints that bound. The gate uses counts. The default-on decision needs the private pilot set.
- **[Pipeline drift from the composer]** → Parity test (D2).
- **[Resolve hook fragility]**: `module.registerHooks` is a recent Node API. → `npm run demo` already checks the Node version. The hook is about 20 lines with its own test, and the fallback is `tsx`.
- **[Gold-label mistakes]** show up as corruptions or misses. → Examples show gold labels, and fixes to data change the manifest hash, so they're visible in review.
- **[Dictionary updates move the baseline]** → Re-baselining is an explicit, reviewed command.

## Migration Plan

Additive. `corpus.test.ts` stays as the fast unit guard. After the first baseline is committed, KI-1 and the next confidence-rule or misspellings-list change cite `npm run eval:check` and the error-type matrix as their acceptance evidence. Rolling back means deleting `eval/`, the scripts and the summary additions.

## Open Questions

- Can GOSI supply anonymized agent messages with corrected versions for a private dataset? This doesn't affect what's built here, because the private slot and classifier work either way.
- Should `eval:check` run in CI once CI exists?
