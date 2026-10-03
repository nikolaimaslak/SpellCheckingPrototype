# Proposal

## Why

We can't yet say how well spelling mistakes are detected and corrected, which kinds of spelling errors they handle, or whether a change made them better or worse. The only quality guard is `test/autocorrect/corpus.test.ts`: 50 isolated typos and no breakdown by error type. It never measures what matters most for auto-replace, which is how often a **correct** word gets changed. The formal requirements (`docs/requirements/60145-60254-formal-requirements.md`) want auto-replace on by default (Req 2.5), a confidence threshold (Req 4.2.3) and reporting on effectiveness (Req 11). Before we tune the confidence rule, add a misspellings list or fix KI-1, we need tooling that:
1. provides correct text and correct word lists;
2. inserts misspellings of chosen types into them;
3. measures how well misspellings are detected and corrected, and which corrections are safe to apply automatically;
4. estimates which types of spelling errors occur and which types of correction the engine makes, both in our data and in the field.

Serves **PER #60254** (auto-correct), formal Req 4.2.3 and Req 11. Cross-phase **infrastructure** for Phase 2 and later.

## What Changes

- **Correct text and word lists.**
  - Clean in-domain messages in English, Arabic and mixed, including names, GOSI terms, transliterations and excluded tokens.
  - A word-list builder, `npm run eval:words`. It turns correct text into frequency-ranked word lists, keeping only the words the pipeline checks and accepts.
- **Misspelling inserter, `npm run eval:inject`.**
  - Seeded and reusable, on plain text, datasets or word lists.
  - Error types and rate are selectable, and a per-word mode makes every error type for every word.
  - Writes labelled data.
  - Error models cover English keyboard slips and edits, and the Arabic confusions: hamza/alef, ة/ه, ى/ي, emphatics, dots and the Arabic keyboard.
- **Error-type taxonomy and classifier.**
  - One taxonomy shared by the inserter and a classifier.
  - The classifier labels any misspelling→intended pair (curated, public, private, telemetry), so error types can be estimated for data we didn't generate.
- **Measures in three layers.**
  - Every word gets an outcome:
    - correct words: *untouched*, *false flag* or *corruption* (auto-replaced);
    - misspelled words: *missed*, or detected with the rank of the intended word among the system's corrections and whether it was auto-replaced (*fixed*, *wrong fix*, *flagged*);
    - plus *excluded*.
  - **Detection:** recall, false-flag rate and precision.
  - **Correction:** accuracy@1 and @5. This asks whether the system arrives at the intended word, whether it applies it automatically or offers it as a suggestion.
  - **Auto-replace:** precision, coverage and corruption rate.
  - **Also reported:** engine latency, and decision stability across repeated and loaded runs (KI-1).
- **Error and correction types.**
  - A per-type breakdown for every dataset.
  - An **error-type matrix** (word list × error types).
  - **Correction types**: the edit the system's top correction makes for each detected misspelling, compared with the error the agent made.
- **Provisional acceptance criteria** in a committed criteria file, each marked pass or fail. Corruption and auto-replace precision are the gate for turning auto-replace on by default.
- **Benchmark, `npm run eval`.** Runs the real Tier 1 pipeline (tokenizer and exclusions, Hunspell WASM with the committed dictionaries, custom dictionary, confidence rule) using only local files, with no server or model key. Writes a JSON and a Markdown report.
- **Regression gate, `npm run eval:check`.** Compares a run with a committed baseline.
- **Datasets with provenance.** Each dataset under `eval/datasets/` is listed in a manifest with its source, license, hash and generator seed. A gitignored slot holds private real agent text, which is reported as aggregates only.
- **Field metrics.** The telemetry summary adds:
  - per-language revert rates;
  - accept and ignore figures;
  - the **error types seen in the field**, classified from the `autocorrect` and `accept` events;
  - the revert rate per correction type.
- **`docs/EVALUATION.md`.** Criteria, the tools, how to read reports, the taxonomy, and how offline and field metrics relate.

## Capabilities

### New Capabilities
- `spelling-eval`: evaluation tooling for spell check and auto-correct. It covers:
  - correct word lists;
  - the misspelling inserter;
  - error-type classification;
  - word outcomes and metrics;
  - the error-type matrix and correction types;
  - acceptance criteria;
  - datasets and provenance;
  - the report;
  - stability;
  - the baseline regression gate.

### Modified Capabilities
- `assist-telemetry`: the summary page adds per-language revert rates, suggestion accept and ignore figures, error types seen in the field, and the revert rate per correction type.

## Non-goals

- **Completion and grammar polish.** Their evaluation needs different methods and comes in a follow-up change.
- **Changing auto-correct behavior.** This change only measures it. The confidence rule, misspellings list and KI-1 fix are separate changes that this tooling will judge.
- **Committing public corpora or frequency lists** (Birkbeck, the Wikipedia misspellings lists, the GitHub Typo Corpus, QALB, public word-frequency lists). Their licenses are reviewed and recorded here; each is added later only if its license allows. Restricted data can still be used locally through the private slot.
- **Real-word errors** (a valid word used wrongly). Hunspell can't detect them. The inserter discards and counts them.
- **Word-boundary errors** (split or merged words, such as "alot"). Spelling works word by word. The classifier labels such pairs `boundary`, and they're reported but not inserted.
- **Handle time (Req 11) and flags remaining at send (Req 4.6).** Both need platform or host hooks.

## Impact

- **New:**
  - `eval/`: the commands (run by Node through a small resolve hook for `src/`'s extensionless imports), inserter, word-list builder, error-type module, benchmark, datasets, word lists, manifest, criteria, baseline, and a gitignored `reports/` and `datasets/private/`;
  - `test/eval/`: unit tests, part of `npm test`;
  - `docs/EVALUATION.md`.
- **Changed:**
  - `package.json`: `eval`, `eval:check`, `eval:baseline`, `eval:words` and `eval:inject` scripts;
  - `.gitignore`;
  - `server/telemetry.ts`: summary figures, using the shared error-type module;
  - `CLAUDE.md`;
  - `docs/known-issues.md`: KI-1 exit criterion.
- **Unchanged:** no runtime code in `src/`, so composer behavior stays the same. `npm test` stays fast because the eval suite isn't in its include pattern.
- **Dependencies:** none new. It uses `jsdom` (MIT, already a dev dependency) for the tokenizer's DOM. The seeded random generator and the resolve hook are written in-repo.
