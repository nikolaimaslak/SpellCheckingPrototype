# spelling-eval Specification

## Purpose

Tooling to evaluate spell checking in Arabic and English. It provides correct text and word lists, inserts misspellings of chosen types, measures how well misspellings are detected and corrected and when corrections are applied automatically, and estimates which types of spelling errors occur and which types of correction the system makes.

## Requirements

### Requirement: Benchmark run
`npm run eval` SHALL run every dataset through the same Tier 1 pipeline the composer uses: tokenization with exclusions and per-word language routing, the Hunspell engine with the committed dictionaries, the dataset's custom dictionary, and the auto-replace confidence rule. Auto-replacement MUST be decided in typing order, as in the composer:
- for the word each typed boundary completes, on the text typed so far;
- holding a word completed by `.`, `@`, `:` or `/` until the next typed whitespace, with the same trigger rules as the composer.

Underlines MUST be decided on the finished message. A message that doesn't end in whitespace MUST be evaluated as if a space were typed after it. It MUST use only local files (the committed WASM, the provisioned dictionaries and the datasets), and MUST NOT need the completion server or a model key.

#### Scenario: No server and no key
- **WHEN** `npm run eval` is run with the completion server stopped and `GEMINI_API_KEY` unset
- **THEN** every committed dataset is evaluated and a report is written

#### Scenario: Same pipeline as the composer
- **WHEN** a dataset message contains "please seperate them" in English
- **THEN** the benchmark records "seperate" as flagged, corrected to "separate", and auto-replaced, as the composer in `auto` mode would

#### Scenario: Mixed message
- **WHEN** a dataset message is "رقم النضام هو paymnet"
- **THEN** "النضام" is evaluated against Arabic and "paymnet" against English, each with its own outcome

#### Scenario: Word replaced while typing
- **WHEN** a word is auto-replaced while the message is typed, but that word is not a word of the finished message (it ends up inside an excluded span)
- **THEN** the benchmark records that replacement as an exclusion leak, with its message

#### Scenario: Address typed in order
- **WHEN** a dataset message is "You can also email us at info@gosi.gov.sa with your request."
- **THEN** no exclusion leak is recorded, because "gosi" is held at the "." and the finished address is excluded

#### Scenario: Message ending in a full stop
- **WHEN** a dataset message is "Please seperate."
- **THEN** "seperate" is held at the "." and decided at the space added after the message, so it is recorded as auto-replaced

### Requirement: Correct word lists
`npm run eval:words` SHALL build a frequency-ranked word list (word, count, language) from correct text: plain text with one message per line, or a dataset. A word MUST be listed only if the pipeline would check it and accepts it as correct. Excluded tokens, mixed-script tokens and misspelled words MUST be left out, and the report MUST say how many were left out and why. Arabic words MUST be counted under their written form with diacritics and tatweel removed. Word lists for English and Arabic built from the clean in-domain text MUST be committed and listed in the manifest.

#### Scenario: English list
- **WHEN** the builder runs on "Thank you for your request. Your request CS-104233 is approved."
- **THEN** the list contains "request" with count 2, and doesn't contain "CS-104233"

#### Scenario: Arabic forms merged
- **WHEN** the input contains "مَرْحَبًا" and "مرحبا"
- **THEN** the list contains "مرحبا" once with count 2

#### Scenario: Misspelled input word
- **WHEN** the input contains "النضام"
- **THEN** it is left out of the list and counted as rejected by the engine

### Requirement: Error-type taxonomy and classification
A single error-type taxonomy SHALL be shared by the misspelling inserter, the reports and the telemetry summary:
- **English:** `keyboard-sub`, `substitute`, `transpose`, `delete`, `insert`, `double`, `undouble`, `case`.
- **Arabic:**
  - `hamza` (ا أ إ آ interchanged, ؤ↔و, ئ↔ي/ى, a hamza letter ء أ إ آ ؤ ئ dropped or added, as in "مسول" for "مسؤول");
  - `ta-marbuta` (ة↔ه);
  - `alef-maqsura` (ى↔ي);
  - `emphatic` (ض↔ظ, ذ↔ز, ص↔س, ط↔ت);
  - `dots` (letters sharing a shape that differ only in dots);
  - `keyboard-sub`, `substitute`, `delete`, `insert`, `transpose`.
- **Any language:** `multi` (more than one edit; it carries the list of individual edits) and `boundary` (the intended form has a space or hyphen the misspelling lacks, or the other way round).

A classifier SHALL assign a type to any misspelling→intended pair from its minimal edit, applying a documented precedence (specific Arabic types before `dots`, `dots` before `keyboard-sub`, `keyboard-sub` before `substitute`). For every type except `multi` and `boundary`, classifying an inserted error MUST return the type that was inserted.

#### Scenario: Hamza
- **WHEN** the pair "اذا"→"إذا" is classified
- **THEN** its type is `hamza`

#### Scenario: Ta marbuta
- **WHEN** the pair "المساعده"→"المساعدة" is classified
- **THEN** its type is `ta-marbuta`

#### Scenario: English transposition
- **WHEN** the pair "teh"→"the" is classified
- **THEN** its type is `transpose`

#### Scenario: Two edits
- **WHEN** the pair "acomodate"→"accommodate" is classified
- **THEN** its type is `multi`, with two `undouble` edits (a missing "c" and a missing "m")

#### Scenario: Round trip
- **WHEN** the inserter applies any single-edit type to a word and the result is classified against the original
- **THEN** the classified type equals the inserted type

### Requirement: Misspelling inserter
`npm run eval:inject` SHALL insert misspellings into correct input and write a labelled dataset. Inputs: plain text (one message per line), a dataset or a word list. Options: error types, rate (share of eligible words), per-word mode (one variant of each selected type for every word), and seed. Excluded tokens, words shorter than 2 letters and custom-dictionary words MUST never be selected. Every inserted error MUST be labelled with the intended word and its type. An error that produces a word the engine accepts as correct (a real-word error) MUST be discarded and counted by type. The same input, options and seed MUST produce a byte-identical output.

#### Scenario: Reproducible
- **WHEN** the inserter runs twice with the same input, options and seed
- **THEN** both outputs are byte-identical

#### Scenario: Selected Arabic type
- **WHEN** the inserter runs on Arabic text with type `ta-marbuta` and reaches "المساعدة"
- **THEN** the output contains "المساعده", labelled misspelled with intended word "المساعدة" and type `ta-marbuta`

#### Scenario: Per-word mode
- **WHEN** the inserter runs on a word list of 100 Arabic words in per-word mode with types `hamza` and `dots`
- **THEN** each word gets at most one `hamza` variant and one `dots` variant, and a word with no applicable position for a type gets none of that type and is counted

#### Scenario: Real-word error discarded
- **WHEN** an insertion would turn "from" into "form"
- **THEN** that variant is not written, and the real-word count for its type goes up

#### Scenario: Mixed text
- **WHEN** the inserter runs on "رقم الطلب في نظام GOSI هو" with English and Arabic types selected
- **THEN** errors are inserted into Arabic words only with Arabic types, "GOSI" (custom dictionary) is never changed, and the message keeps its other words

### Requirement: Word outcomes
Every token in a dataset message SHALL get exactly one outcome against its gold label:
- **Gold correct:** `untouched` (neither flagged nor changed), `false-flag` (flagged, not changed) or `corruption` (auto-replaced).
- **Gold misspelled, not detected:** `missed`.
- **Gold misspelled, detected:** carries the 1-based rank of the intended word among the system's corrections (the auto-replacement counts as rank 1, otherwise the suggestion order), or none. It also records whether it was auto-replaced:
  - `fixed` (auto-replaced with the intended word);
  - `wrong-fix` (auto-replaced with another word);
  - `flagged` (not auto-replaced).
- **Gold excluded** (URL, email, token with digits, substitution field): `excluded` when the pipeline neither checks nor changes any part of it, otherwise `exclusion-leak`. A replacement made while typing inside an excluded span is an `exclusion-leak`; one inside a gold-correct word is a `corruption`.

Comparison with the intended word MUST ignore Arabic diacritics and tatweel, and MUST NOT fold hamza or alef variants.

#### Scenario: Correct word changed
- **WHEN** the gold-correct word "Absher" is auto-replaced
- **THEN** its outcome is `corruption`

#### Scenario: Detected and correctly suggested
- **WHEN** the gold misspelling "recieve" (intended "receive") is flagged with suggestions ["receive", "relieve"] and not auto-replaced
- **THEN** its outcome is `flagged` with rank 1

#### Scenario: Wrong Arabic fix
- **WHEN** the gold misspelling "التامينات" (intended "التأمينات") is auto-replaced with another word
- **THEN** its outcome is `wrong-fix`, and the intended word's rank is not 1

#### Scenario: Hamza is significant
- **WHEN** the intended word is "إذا" and the pipeline auto-replaces "اذا" with "إذا"
- **THEN** the outcome is `fixed`, and replacing it with "أذا" would be `wrong-fix`

#### Scenario: Excluded token
- **WHEN** a message contains "CS-104233" or "١٢٣٤٥" labelled excluded
- **THEN** each has outcome `excluded`

#### Scenario: Email corrupted while typing
- **WHEN** "info@gosi.gov.sa" is labelled excluded and "gosi" is replaced while typing
- **THEN** the email's outcome is `exclusion-leak`

### Requirement: Metrics
The report SHALL compute, per language, per dataset and per error type, in three layers.

**Detection:**
- **detection recall:** detected misspellings ÷ gold-misspelled tokens;
- **false-flag rate:** (`false-flag` + `corruption`) ÷ gold-correct tokens;
- **detection precision:** detected misspellings ÷ all flagged or auto-replaced tokens.

**Correction** (whether the system arrives at the intended word, applied or offered):
- **correction accuracy@1** and **@5:** gold-misspelled tokens whose intended word is ranked 1 (or 1–5) ÷ gold-misspelled tokens;
- the same ratios over detected misspellings only.

**Auto-replace:**
- **auto-replace precision:** `fixed` ÷ (`fixed` + `wrong-fix` + `corruption`);
- **auto-replace coverage:** `fixed` ÷ gold-misspelled tokens;
- **corruption rate:** `corruption` per 10,000 gold-correct tokens, with its 95% upper bound;
- **by source:** auto-replace precision and coverage, and the counts of `fixed`, `wrong-fix` and `corruption`, for each source of the replacement: `list` (a known misspelling), `case` (the case-only fix) and `neighbor` (the single-neighbor rule).

**Also reported:** exclusion leaks, and engine latency p50 and p95 for the correctness check and for corrections.

Error type comes from the label, or from the classifier when the label has none.

#### Scenario: Rates computed
- **WHEN** an English dataset has 10,000 gold-correct tokens with 20 false flags and 2 corruptions, and 100 misspellings of which 95 are detected, 80 have the intended word ranked 1, 90 have it in the top 5, 40 are `fixed` and 1 is a `wrong-fix`
- **THEN** detection recall is 95%, the false-flag rate is 0.22%, correction accuracy@1 is 80% and @5 is 90%, auto-replace precision is 40 ÷ 43, coverage is 40%, and the corruption rate is 2 per 10,000

#### Scenario: Type breakdown on unlabelled data
- **WHEN** a curated typo set has no type labels
- **THEN** the report still breaks every metric down by type, using the classifier

#### Scenario: Breakdown by source
- **WHEN** an English dataset has 30 `fixed` tokens from the list, 20 `fixed` and 1 `wrong-fix` from the single-neighbor rule, and 2 `corruption` from the list
- **THEN** the report shows list precision 30 ÷ 32 and neighbor precision 20 ÷ 21, with each source's counts

### Requirement: Error-type matrix
For each language, the benchmark SHALL evaluate the committed word list in per-word mode across every error type of that language. Each variant is evaluated as a single word followed by a typed boundary. It MUST produce a matrix with one row per error type and these columns:
- variants generated;
- real-word discards;
- detection recall;
- correction accuracy@1 and @5;
- auto-replace coverage;
- wrong fixes.

#### Scenario: Arabic matrix
- **WHEN** the Arabic matrix is produced
- **THEN** it has separate rows for `hamza`, `ta-marbuta`, `alef-maqsura`, `emphatic`, `dots`, `keyboard-sub`, `substitute`, `delete`, `insert` and `transpose`, each with its own figures

#### Scenario: Weak type visible
- **WHEN** the engine rarely ranks the intended word first for `dots` errors
- **THEN** the `dots` row shows a correction accuracy@1 lower than the other rows, without affecting their figures

### Requirement: Correction types
For every detected misspelling, the report SHALL classify the edit the system's top correction makes, from the typed word to the auto-replacement or first suggestion. It MUST show:
- the distribution of correction types per language;
- a table of error type (rows) against correction type (columns), where a correction of the intended word sits on the diagonal;
- the correction types of corruptions, and of wrong fixes.

#### Scenario: Off-diagonal correction
- **WHEN** a `dots` error is corrected by a `hamza` edit to a different word
- **THEN** it appears in the `dots` row under the `hamza` column, outside the diagonal

#### Scenario: Corruption type
- **WHEN** the correct word "Absher" is auto-replaced with a word one letter different
- **THEN** the corruption is listed with its correction type

### Requirement: Acceptance criteria
A committed criteria file SHALL set a threshold, direction and regression tolerance per language for each metric, and the report MUST mark each criterion pass or fail. The initial (provisional) thresholds are:

| Metric | English | Arabic |
|---|---|---|
| Corruption rate on clean in-domain text | ≤ 1 per 10,000 | ≤ 1 per 10,000 |
| Auto-replace precision | ≥ 99% | ≥ 99% |
| Detection recall | ≥ 90% | ≥ 80% |
| False-flag rate on clean in-domain text | ≤ 2% | ≤ 5% |
| Correction accuracy@5 | ≥ 90% | ≥ 80% |
| Correction accuracy@1 | ≥ 70% | ≥ 60% |
| Exclusion leaks | 0 | 0 |
| Decision instability | 0 | 0 |
| Correctness-check latency p95 | ≤ 5 ms | ≤ 5 ms |
| Correction latency p95 | ≤ 100 ms | ≤ 100 ms |

Auto-replace coverage, suggestion instability and per-type figures MUST be reported without thresholds. Corruption rate and auto-replace precision MUST be labelled as the gate for enabling auto-replace by default.

#### Scenario: Criterion fails
- **WHEN** Arabic detection recall is 74%
- **THEN** the report marks the Arabic detection-recall criterion as failed and shows the threshold next to the value

#### Scenario: Thresholds changed
- **WHEN** the criteria file changes a threshold
- **THEN** the next report uses the new threshold, and the measured values are unaffected

#### Scenario: Suggestion instability has no threshold
- **WHEN** the top suggestion of a flagged word differs in the run under CPU load
- **THEN** the report shows the suggestion-instability count, and no criterion fails because of it

### Requirement: Decision stability
The benchmark SHALL evaluate each dataset three times, plus once while other threads load the CPU. It MUST report two counts, each with examples:
- **decision instability**: tokens whose flag or auto-replace decision differs between any two runs;
- **suggestion instability**: tokens whose decision is the same in every run, but whose top-ranked correction differs between any two runs.

Every other metric MUST use, for each token, the result that at least two of the three unloaded runs agree on.

#### Scenario: Stable under load
- **WHEN** the confidence rule is deterministic
- **THEN** decision instability is 0 for every dataset, in English and Arabic

#### Scenario: Load changes a decision
- **WHEN** under CPU load an ambiguous English or Arabic word becomes an auto-replacement
- **THEN** that token counts toward decision instability, and the report lists it with its outcome in each run

#### Scenario: Load changes only the top suggestion
- **WHEN** a misspelled Arabic word gets the same flag and auto-replace decision in every run, but under CPU load its top suggestion differs
- **THEN** it counts toward suggestion instability, not decision instability

### Requirement: Datasets and provenance
Each dataset SHALL be one file of labelled messages. Every token carries a language and a gold label: correct, misspelled (with intended word and optional error type), or excluded. A manifest MUST record each dataset's and word list's source, license, size, hash and, for generated data, the generator version, options and seed. A dataset that is unlisted, or whose hash doesn't match, MUST be refused. The committed data MUST include:
- English and Arabic curated typo sets;
- clean in-domain agent messages in English, Arabic and mixed Arabic/English, with names, product terms, transliterations and excluded tokens;
- the English and Arabic word lists;
- inserted-error datasets generated from the clean messages.

#### Scenario: Unlisted dataset
- **WHEN** a dataset file is not in the manifest
- **THEN** the run fails and names the file

#### Scenario: Label doesn't align
- **WHEN** a label's span matches no token the pipeline produces
- **THEN** the run fails, naming the dataset and the message id

### Requirement: Private datasets
Datasets in the gitignored private directory SHALL be evaluated when present, including type classification of their labelled misspellings. For them, the report MUST contain only aggregate metrics and counts (including per-type counts), never message text, words or examples. They MUST NOT be part of the committed baseline.

#### Scenario: Pilot export
- **WHEN** a private dataset of real agent messages with labelled misspellings is present
- **THEN** its metrics and its error-type distribution appear in the report under its name, and no word from it appears anywhere in the report

#### Scenario: No private data
- **WHEN** the private directory is empty or missing
- **THEN** the run succeeds with the committed datasets only

### Requirement: Report
Each run SHALL write a machine-readable report and a human-readable report containing:
- the build identity (version and commit);
- the metrics per language, dataset and error type;
- each criterion's pass or fail;
- the error-type distribution of each dataset;
- the error-type matrices;
- the correction-type tables;
- every corruption, wrong fix, exclusion leak and unstable token from committed datasets, with its message context.

Arabic words in the readable report MUST display in their correct direction.

#### Scenario: Corruption listed
- **WHEN** a clean message "Your Musaned request is approved" has "Musaned" auto-replaced
- **THEN** the readable report lists that corruption with the original word, the replacement, its correction type and the message

### Requirement: Regression gate
`npm run eval:check` SHALL compare a run with the committed baseline and fail when:
- the number of corruptions or wrong fixes increases for any language;
- the number of exclusion leaks increases;
- any criterion metric gets worse than the baseline by more than its tolerance.

It MUST print every regression. Per-type figures MUST be compared and printed, but MUST NOT fail the gate. Criteria whose values vary with machine load (decision instability and latency) MUST be judged against their thresholds in the report, but MUST NOT be compared with the baseline. Updating the baseline MUST be an explicit command whose output is reviewed in the change that updates it.

#### Scenario: New corruption
- **WHEN** a change causes one more Arabic corruption than the baseline
- **THEN** `eval:check` fails, naming the word and the dataset

#### Scenario: Within tolerance
- **WHEN** English correction accuracy@5 drops by less than its tolerance and nothing else gets worse
- **THEN** `eval:check` passes

#### Scenario: Load-dependent values
- **WHEN** a run on a busier machine measures more unstable tokens and a higher suggestion latency than the baseline, and nothing else changed
- **THEN** `eval:check` passes, and the report still marks those criteria against their thresholds

#### Scenario: Per-type drop
- **WHEN** Arabic `dots` correction accuracy@1 drops but every criterion metric holds
- **THEN** `eval:check` passes and prints the per-type drop
