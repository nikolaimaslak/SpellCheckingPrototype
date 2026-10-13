# Evaluating spell check and auto-correct

For inline completion, see `docs/COMPLETION-EVAL.md`.

The `eval/` tooling measures how well the Tier 1 spelling layer **detects** misspellings, **corrects** them (the intended word as the top correction or among the first five, whether applied automatically or offered), and how safely it **auto-replaces**. It also estimates **which types** of spelling error occur and which types of correction the system makes. Spec: `openspec/specs/spelling-eval/` (after archive; until then `openspec/changes/spelling-eval/`).

Everything runs locally on the committed WASM engine and dictionaries. No server or model key is needed.

## Commands

| Command | What it does |
|---|---|
| `npm run eval` | Runs the benchmark and writes `eval/reports/latest.md` and `latest.json` (gitignored). Takes a few minutes; `-- --quick` skips the run under CPU load |
| `npm run eval:check` | The same, then compares with `eval/baseline.json`. Exits 1 on a regression and prints each one |
| `npm run eval:baseline` | The same, then rewrites `eval/baseline.json`. Review the diff in the change that updates it |
| `npm run eval:words -- <in.txt\|in.jsonl>... --out words.tsv [--lang en\|ar]` | Builds a frequency-ranked list of correct words from correct text |
| `npm run eval:inject -- <in.txt\|in.jsonl\|words.tsv> --lang en\|ar\|en,ar --out out.jsonl [--types hamza,dots] [--rate 0.08] [--per-word] [--seed 1]` | Inserts labelled misspellings of chosen types. Writes `out.meta.json` with the options and counts |
| `npm run eval:build` | Compiles the hand-marked sources in `eval/datasets/src/` into JSONL datasets |
| `npm run eval:manifest [-- --write]` | Re-hashes the datasets and reports changed, missing or unlisted files |

Don't run other heavy work (tests, builds) while the benchmark runs. CPU load changes the order of Hunspell's time-limited suggestions, which shows up as suggestion instability, and it slows down the latency figures. Auto-replace decisions don't depend on load (the deterministic one-edit rule).

## What is measured

Every word of every message gets one **outcome** against its gold label:

| Gold | Outcomes |
|---|---|
| correct | `untouched`, `false-flag` (underlined), `corruption` (auto-replaced) |
| misspelled | `missed` (not flagged); if detected, the rank of the intended word among the system's corrections, plus `fixed`, `wrong-fix` or `flagged` (not changed) |
| excluded (URL, email, digits, `$(…)`) | `excluded`, or `exclusion-leak` if any part was checked or changed |
| unscored (private and imported data only) | `unscored`, recording whether it was underlined or changed; it counts in no rate |

A misspelling the engine accepts as a dictionary word is marked **real-word** ("form" for "from", "ان" for "أن"). Hunspell can't flag those, so they are reported separately from non-word misspellings.

**Unscored** marks a word that imported data (such as QALB, below) edits for reasons other than spelling: grammar, word choice, merged or split words. Counting it as correct would turn every underline on it into a false flag, and counting it as misspelled would demand a grammar fix from a spell checker. Committed datasets can't use it, so the run refuses one that does.

The system's corrections are the auto-replacement first, then the suggestions in order. Comparison ignores Arabic diacritics and tatweel, but hamza counts.

The benchmark mirrors the composer **in typing order**, using the composer's own trigger functions (`src/autocorrect/trigger.ts`). Auto-replacement is decided on the text typed so far, for:
- the word each typed boundary completes;
- a word completed by `.` `@` `:` or `/`, which is held until the next typed whitespace and dropped if it has become part of an address.

This catches replacements that happen mid-typing. Such a replacement inside a finished address is an `exclusion-leak` (KI-2, before the hold: "gosi" becoming "gosh" as the "." of "info@gosi.gov.sa" is typed). A message that doesn't end in whitespace is evaluated as if a space were typed after it. Underlines are decided on the finished text. A parity test (`test/eval/parity.test.ts`) holds the pipeline to the composer's decisions.

**Metrics, in three layers:**
- **Detection**
  - recall: detected ÷ misspellings;
  - non-word and real-word recall: the same, over each kind, with the number of real-word misspellings (shown as "Non-word / real-word recall (real words)", or "–" when there are none);
  - false-flag rate: (false flags + corruptions) ÷ correct words;
  - precision.
- **Correction**
  - accuracy@1 and @5: misspellings whose intended word ranks 1, or 1–5, ÷ all misspellings;
  - the same over detected misspellings only.
- **Auto-replace**
  - precision: fixed ÷ all automatic changes;
  - coverage: fixed ÷ misspellings;
  - corruption rate per 10,000 correct words, with its 95% upper bound.
  - **by source:** the same precision and coverage, with counts, for each rule that made the change: `list` (a known misspelling from the curated lists in `src/autocorrect/lists/`), `case` (the case-only fix) and `neighbor` (the single-neighbor rule).
- **Also reported:**
  - exclusion leaks;
  - unscored words: how many, how many underlined and how many auto-replaced (a table appears only when a dataset has them);
  - engine latency p95: correctness check, correction (suggestions) and, for information, the auto-replace decision (the worker's neighbors request);
  - **decision instability**: tokens whose flag or auto-replacement differs between the three normal runs and one run under CPU load. Gated at 0;
  - **suggestion instability**: tokens with the same decision in every run whose top suggestion differs. Reported without a threshold; it comes from Hunspell's time-limited `suggest()`, which only the popover uses.

## Acceptance criteria

`eval/criteria.json` holds the thresholds. They're **provisional**, set before the first measurement; the first baseline calibrates them, and any change is a spec change.

| Criterion | English | Arabic |
|---|---|---|
| 🔒 Corruption rate, clean text | ≤ 1 / 10,000 | ≤ 1 / 10,000 |
| 🔒 Auto-replace precision | ≥ 99% | ≥ 99% |
| Detection recall | ≥ 90% | ≥ 80% |
| False-flag rate, clean text | ≤ 2% | ≤ 5% |
| Correction@5 / @1 | ≥ 90% / 70% | ≥ 80% / 60% |
| Exclusion leaks, decision instability | 0 | 0 |
| Latency p95: check / correction | ≤ 5 / 100 ms | ≤ 5 / 100 ms |

🔒 marks the gate for turning auto-replace on by default (formal requirement Req 2.5). Auto-replace coverage, suggestion instability and per-type figures are reported without thresholds, because precision takes priority over recall.

**Why these values:**
- **Corruption:** changing a correct word unseen is the worst outcome, so it's held to 1 in 10,000.
- **Auto-replace precision:** a wrong automatic change costs more than a missed one.
- **Arabic recall and correction thresholds:** these are lower, reflecting Hunspell's weaker Arabic morphology.
- **Latency:** the composer checks on a 150 ms debounce, so engine calls must leave headroom.

**List overlap caution:** the curated `typos-*` datasets contain classic misspellings by construction ("seperate", "recieve"), and so do the misspellings lists. Coverage on those sets overstates what the list does for real agent text. The "Auto-replace by source" table shows the list's share. The generated `injected-*` sets and the error-type matrix, whose typos are random edits, are the fairer measure.

**Statistical caution:** about 5,000 clean words per language can only show a corruption rate below about 6 in 10,000 when none are seen. The report prints that upper bound, and the gate uses counts. Deciding to turn auto-replace on by default needs a large private pilot set.

## Error types

One taxonomy (`eval/error-types.ts`) is used by the inserter, the classifier, the reports and the telemetry summary:

| Language | Types |
|---|---|
| English | `keyboard-sub`, `substitute`, `transpose`, `delete`, `insert`, `double`, `undouble`, `case` |
| Arabic | `hamza`, `ta-marbuta` (ة/ه), `alef-maqsura` (ى/ي), `emphatic` (ض/ظ, ذ/ز, ص/س, ط/ت), `dots` (same letter shape), `keyboard-sub` (Arabic 101), `substitute`, `delete`, `insert`, `transpose` |
| Both | `multi` (several edits, each typed), `boundary` (split or merged words) |

The **classifier** works on any misspelling → intended pair, which lets it estimate types for data we didn't generate: curated typos, public corpora, private pilot data and field telemetry. It aligns the two words (optimal string alignment, after removing diacritics and tatweel), then types the single edit by precedence:
1. `case`;
2. `hamza` → `ta-marbuta` → `alef-maqsura` → `emphatic` → `dots`;
3. `transpose`;
4. `double` / `undouble`;
5. `keyboard-sub`;
6. `substitute` / `insert` / `delete`.

Edits are named from the misspelling's side: `delete` means the misspelling lacks a letter.

The **inserter** produces only variants that classify back to their type, which a property test checks. Hamza errors are restricted to where agents make them: on a letter that carries a hamza, or a bare alef at the start of a word or after the article.

The report shows:
- the error-type distribution per dataset;
- every metric by error type;
- the **error-type matrix:** the most frequent words of each word list, with one variant of every type, each evaluated alone, which shows which types the system handles;
- **correction types:** the edit the top correction makes, tabled against the error made, plus the types of corruptions and wrong fixes.

## Datasets

`eval/datasets/MANIFEST.json` lists every file with its source, license and sha256. The run refuses unlisted or changed files. `MANIFEST.md` holds the provenance notes and the license review of public corpora.

| Kind | Files | Purpose |
|---|---|---|
| clean | `clean-en`, `clean-ar`, `clean-mixed` | Correct in-domain messages, the base for corruption and false flags. Includes names, GOSI terms, transliterations and excluded tokens |
| typos | `typos-en` (155), `typos-ar` (115) | Curated non-word misspellings in carrier messages |
| injected | `injected-en`, `injected-ar` | Generated from the clean sets; the seeds are in the manifest |
| wordlist | `words-en`, `words-ar` | Correct words by frequency, used for the matrix |

All committed data is synthetic. Claude drafted the clean and typo messages, and a person still has to review them ("human review: pending" in the manifest).

**To add a dataset:**
1. Write a source in `eval/datasets/src/<name>.txt`, one message per line. Mark excluded spans as `⟦…⟧` and misspellings as `⟨typed→intended⟩`, by hand: don't derive the marks from the tokenizer's patterns.
2. Run `npm run eval:build`.
3. Add a manifest entry with source and license, then `npm run eval:manifest -- --write`.

A misspelling in a curated or inserted dataset must be a non-word: the engine rejects it. Real-word errors are counted separately, and come from imported corpora (below).

**Private data** (for example a GOSI pilot export with corrected versions) goes in the gitignored `eval/datasets/private/` with its own `MANIFEST.json`. It's evaluated with everything else, but the report contains only its aggregates and per-type counts, never words. It's never part of the baseline.

### Importing QALB (ARETA-tagged corpora)

The QALB corpus (Arabic writer errors with gold corrections) comes with CAMeL Lab's [arabic-gec](https://github.com/CAMeL-Lab/arabic-gec) release, aligned word by word and tagged with ARETA error types. `npm run eval:qalb` turns one of those files into a private dataset:

```
npm run eval:qalb -- ../arabic-gec/data/areta_tags/wo_camelira/qalb14/qalb14_dev.areta+.nopnx.txt \
  --name qalb14-dev --source "QALB-2014 dev, CAMeL-Lab/arabic-gec" \
  --license "QALB 0.9.1: internal research and evaluation only" \
  --license-file ../arabic-gec/data/gec/QALB-0.9.1-Dec03-2021-SharedTasks/LICENSE.txt [--limit N]
```

It writes `eval/datasets/private/<name>.jsonl`, copies the license to `<name>.LICENSE.txt` and adds the dataset to the private `MANIFEST.json`. Each sentence becomes one message (its source words, without punctuation: the `nopnx` files), labelled by tag:

| ARETA tag | Label |
|---|---|
| `UC` (unchanged) | none: gold correct |
| only `REPLACE_O…` parts (hamza, ta marbuta, alif maqsura, characters), one word to one word | misspelled, the correction as intended word |
| anything else: grammar (`X…`), morphology, word choice (`S…`), `MERGE`, `SPLIT`, `DELETE`, `UNK` | unscored |
| empty source (an insertion) | nothing |

A label on a word the tokenizer never checks (one-letter words, tokens with digits) is dropped and counted. A sentence with a labelled word the tokenizer splits is skipped and counted. QALB-2014 dev gives 1,017 messages: about 38,600 correct, 7,200 misspelled and 2,800 unscored words, with 924 labels dropped and none skipped. It adds several minutes to `npm run eval`; use `--limit` for a quick run.

**License rules (read before running it):**
- QALB is licensed for internal research and evaluation only. It may not be redistributed or modified, and its notice must stay with internal copies. The converted file is an internal, evaluation-only copy with the notice beside it. **Pending:** legal confirmation that reformatting counts as evaluation use and not as a prohibited modification.
- The data stays in the gitignored `eval/datasets/private/` and is never committed. Reports show only its aggregates.
- Nothing from it may feed misspellings lists, the REP table, word lists or dictionaries. It tells us what to fix; the fixes come from our own sources.
- ZAEBUC (in the same release) is CC BY-NC-SA 4.0. Don't convert it until its non-commercial terms are cleared for our use.
- QALB is news comments, not agent chat. Read its figures as the error mix of real writers, not as a measure of GOSI text.

## Offline and field metrics

`npm run server` → `/summary` shows the field counterparts, from telemetry events (no new events, no text beyond the existing allowlist):

| Field | Offline counterpart | Bias |
|---|---|---|
| Revert rate, per language and per auto-correction type | 1 − auto-replace precision | A lower bound: agents don't revert every wrong fix, and some reverts undo correct fixes |
| Ignore share: ignores ÷ (accepts + ignores) | False-flag rate | Only words the agent acted on; ignored words have no intended form, so they have no type |
| Error types of accepted suggestions and auto-corrections | Error-type distribution | Covers only misspellings that were flagged and fixed; misses are invisible in the field |

When real field data shows a different type mix from the synthetic data, weight the inserter's types (`--types`) to match.

## Baseline

`eval/baseline.json` records the criterion values, corruption and wrong-fix counts and identities, exclusion leaks, and per-type figures. `eval:check` fails when:
- corruptions or wrong fixes increase in either language (the new ones are named);
- exclusion leaks increase;
- a criterion metric gets worse than its tolerance.

Per-type changes are printed but never fail the gate.

### First baseline (October 3, 2026, build 0.1.0 · d09914b)

Committed synthetic data only; Claude drafted the data and human review is pending. The thresholds are provisional.

| Criterion | English | Arabic |
|---|---|---|
| 🔒 Corruption rate, clean text (per 10,000) | 11.5 ❌ (95% ≤ 25) | 2.0 ❌ (95% ≤ 11) |
| 🔒 Auto-replace precision | 93.6% ❌ | 83.5% ❌ |
| Detection recall | 100% ✅ | 100% ✅ |
| False-flag rate, clean text | 0.33% ✅ | 0.12% ✅ |
| Correction@5 | 91.1% ✅ | 68.6% ❌ |
| Correction@1 | 67.6% ❌ | 36.1% ❌ |
| Exclusion leaks (both languages) | 17 ❌ | |
| Instability (tokens) | 0–1 | 7–11 ❌ |
| Correction latency p95 | 26–31 ms ✅ | 124–136 ms ❌ |

**What the numbers say:**
- **Auto-replace isn't ready to be on by default.** Both gate criteria fail.
  - **English corruptions:** names ("Fatimah" → "Fatima", "Noura" → "Nora", "Harbi" → "Harbin") and British spellings ("labour" → "labor", "cancelled" → "canceled"; the dictionary is en-US). This is formal requirement Req 4.2.2 on names, plus a dictionary choice.
  - **Arabic precision:** pulled down by wrong fixes, mostly corrections that insert or change a hamza or alef maqsura in the wrong word.
- **Exclusion leaks are all KI-2.** An email address or URL typed by hand is changed mid-typing ("gosi" → "gosh", "https" → "HTTP").
- **The matrix found KI-3.** A stray capital inside a word ("thiS") gets replaced with a different word ("thin").
- **Arabic correction is the weak layer:**
  - Correction@1 is 36% overall.
  - The `delete`, `substitute` and `keyboard-sub` rows are lowest (top-5 of 13–65%).
  - `ta-marbuta`, `alef-maqsura` and `hamza` are handled well.
  - English `transpose`, `double` and `insert` are strong; `substitute` and `delete` are weakest.
- **Arabic suggestions are slow and unstable.** They take about 130 ms (p95), and 7–11 Arabic decisions change between runs or under load (KI-1). Several are auto-replacements that appear or disappear.
- **Detection recall of 100% is an artefact.** Every misspelling in the committed data is a non-word by construction, so Hunspell always flags it. Real-word errors and real agent data will lower it; the QALB import below measures both.

### Baseline after `autocorrect-reliability` (October 5, 2026)

Same data and thresholds. Auto-replace now uses the deterministic one-edit rule, the case-only fix and held words (KI-1, KI-2 and KI-3 resolved).

| Criterion | English | Arabic |
|---|---|---|
| 🔒 Corruption rate, clean text (per 10,000) | 11.5 ❌ (unchanged: names, British spellings) | 2.0 ❌ (unchanged: ميجابايت) |
| 🔒 Auto-replace precision | 95.3% ❌ (was 93.6%) | 91.2% ❌ (was 83.5%) |
| Wrong fixes of real typos | 1 (was 3) | 1 (was 11) |
| Auto-replace coverage | 46.0% (was 38.0%) | 6.5% (was 13.9%) |
| Correction@1 | 71.6% ✅ (was 67.6%) | 36.1% ❌ |
| Exclusion leaks (both languages) | 0 ✅ (was 17) | |
| Decision instability | 0 ✅ | 0 ✅ (was 7–13) |
| Decision latency p95 (informational) | 8 ms | 25 ms |

The remaining gap to the 🔒 gate is the clean-text corruptions: names (planned change `autocorrect-revert-backspace-and-names`) and British spellings (a dictionary question for SV). The single wrong fixes are "contaction" → "contraction" and "ارقاف" → "القاف". Arabic auto-replace is deliberately conservative: most Arabic typos have several dictionary words one edit away, so they stay suggestions.

### Baseline after `autocorrect-misspellings-list` (October 5, 2026)

The curated misspellings lists come first, then the case-only fix and the single-neighbor rule. The lists are 350 EN and 84 AR entries, with human review still pending (KI-5).

| Criterion | English | Arabic |
|---|---|---|
| 🔒 Corruption rate, clean text (per 10,000) | 11.5 ❌ (unchanged) | 2.0 ❌ (unchanged) |
| 🔒 Auto-replace precision | 95.7% ❌ (was 95.3%) | 94.9% ❌ (was 91.2%) |
| Auto-replace coverage | 50.0% (was 46.0%) | 11.8% (was 6.5%) |
| Correction@1 | 72.1% ✅ (was 71.6%) | 38.8% ❌ (was 36.1%) |
| Decision instability | 0 ✅ | 0 ✅ |

By source, the lists made 58 English and 25 Arabic fixes with no wrong fix and no corruption. Every remaining corruption and wrong fix comes from the single-neighbor rule. Arabic `hamza` coverage in the matrix went from 7% to 44%. Remember the overlap caution above: some of the list's English gain on the curated `typos-en` set comes from classic misspellings that both contain.

### Baseline after `autocorrect-revert-backspace-and-names` (October 5, 2026)

Capitalized words in mid-sentence are no longer auto-replaced (Req 4.2.2). Conversation words aren't exercised here: dataset messages carry no conversation.

| Criterion | English | Arabic |
|---|---|---|
| 🔒 Corruption rate, clean text (per 10,000) | 7.6 ❌ (was 11.5) | 2.0 ❌ (unchanged) |
| 🔒 Auto-replace precision | 96.9% ❌ (was 95.7%) | 94.9% ❌ (unchanged) |
| Auto-replace coverage | 49.8% (was 50.0%) | 11.8% (unchanged) |
| Decision instability | 0 ✅ | 0 ✅ |

The names "Fatimah" ("Ms. Fatimah") and "Harbi" ("Al-Harbi") are no longer corrupted. The remaining English corruptions are the British spellings "labour" and "cancelled" (an en-US vs. en-GB decision) and "Noura" at the start of a sentence. In the composer, "Noura" is protected when the customer wrote it, but here it isn't, because dataset messages have no conversation.
