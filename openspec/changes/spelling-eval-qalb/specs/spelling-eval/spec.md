# Spec Delta

## ADDED Requirements

### Requirement: Importing ARETA-tagged corpora
The eval SHALL provide a command that converts an ARETA-tagged alignment file into a private dataset. The input has one `source ⇥ target ⇥ tag` line per aligned word after a `SOURCE ⇥ TARGET` header, with sentences separated by blank lines; a source or target may hold several space-separated words, or be empty.

Each sentence becomes one message, whose text is its source words joined by single spaces. Words are labelled by tag:
- `UC`: no label (gold correct);
- a tag made only of `REPLACE_O…` parts (one or more joined by `+`), with a single source word and a single target word: gold `misspelled`, with the target as the intended word;
- any other tag, or an orthographic tag on a multi-word source or target: gold `unscored` on every source word;
- an empty source (an insertion): nothing.

A label on a word the project's tokenizer produces no word for at all (a one-letter word, a token with digits) MUST be dropped and counted: the composer never checks that word, so it can't be measured. Every remaining label MUST line up with a word the tokenizer produces. A sentence where one doesn't (a labelled word the tokenizer splits) is skipped and counted, never written with misaligned labels.

The command MUST take `--name`, the input path, `--source` (a provenance line), `--license` (the license name) and `--license-file` (the corpus license text), and MAY take `--limit N` (first N sentences). It writes `eval/datasets/private/<name>.jsonl` and copies the license file next to it. It also adds or replaces the dataset's entry in the private `MANIFEST.json`, with source, license, the converter's version and options, and the hash. It prints counts of messages, gold correct, misspelled and unscored words, dropped labels and skipped sentences. It MUST refuse to write outside `eval/datasets/private/`, and it MUST fail without writing anything when `--license-file` is missing or unreadable.

#### Scenario: Orthographic edit
- **WHEN** a sentence has the lines "ليضهر ⇥ ليظهر ⇥ REPLACE_OR" and "أنه ⇥ أنه ⇥ UC"
- **THEN** "ليضهر" is labelled misspelled with intended "ليظهر", and "أنه" has no label

#### Scenario: Combined orthographic tags
- **WHEN** a line is "انشاء ⇥ إنشاء ⇥ REPLACE_OH+REPLACE_OM"
- **THEN** "انشاء" is labelled misspelled with intended "إنشاء"

#### Scenario: Grammar edit unscored
- **WHEN** a line is "مسلمون ⇥ مسلمين ⇥ REPLACE_XC" or "يحب ⇥ تحب ⇥ REPLACE_XG"
- **THEN** the source word is labelled unscored

#### Scenario: Merge and split
- **WHEN** a line is "التصر فات ⇥ التصرفات ⇥ MERGE" and another is "لوكان ⇥ لو كان ⇥ SPLIT"
- **THEN** "التصر", "فات" and "لوكان" are each labelled unscored

#### Scenario: Insertion
- **WHEN** a line has an empty source and the tag `INSERT_XM`
- **THEN** it adds no word to the message and no label

#### Scenario: Mixed text
- **WHEN** a sentence holds the Latin word "Facebook" tagged `UC` among Arabic words
- **THEN** "Facebook" has no label and is evaluated as a correct English word

#### Scenario: Label doesn't align
- **WHEN** a labelled source word is split by the project's tokenizer into two words
- **THEN** that sentence is skipped and counted, and the other sentences are written

#### Scenario: Word the tokenizer doesn't check
- **WHEN** a sentence has the line "أ ⇥ (empty) ⇥ DELETE_XM", and "أ" is a one-letter word the tokenizer produces no word for
- **THEN** its label is dropped and counted, and the sentence is written

#### Scenario: No license file
- **WHEN** the command runs without a readable `--license-file`
- **THEN** it fails, writes no dataset and leaves the manifest unchanged

## MODIFIED Requirements

### Requirement: Word outcomes
Every token in a dataset message SHALL get exactly one outcome against its gold label:
- **Gold correct:** `untouched` (neither flagged nor changed), `false-flag` (flagged, not changed) or `corruption` (auto-replaced).
- **Gold misspelled, not detected:** `missed`.
- **Gold misspelled, detected:** carries the 1-based rank of the intended word among the system's corrections (the auto-replacement counts as rank 1, otherwise the suggestion order), or none. It also records whether it was auto-replaced:
  - `fixed` (auto-replaced with the intended word);
  - `wrong-fix` (auto-replaced with another word);
  - `flagged` (not auto-replaced).
- **Gold excluded** (URL, email, token with digits, substitution field): `excluded` when the pipeline neither checks nor changes any part of it, otherwise `exclusion-leak`. A replacement made while typing inside an excluded span is an `exclusion-leak`; one inside a gold-correct word is a `corruption`.
- **Gold unscored** (a word the data marks as edited for reasons other than spelling): `unscored`, recording whether it was flagged or auto-replaced. It counts in no metric. A replacement made while typing inside an unscored word is part of that word's `unscored` outcome, not a `corruption`.

Every gold misspelling MUST also record whether it is a **real-word** misspelling: the spelling engine accepts the typed word, so it can only be detected by other means, such as a misspellings list.

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

#### Scenario: English unscored word
- **WHEN** "go" in "He go to the office" is labelled unscored and the pipeline leaves it alone
- **THEN** its outcome is `unscored`, and it counts as neither correct nor misspelled

#### Scenario: Arabic unscored word changed
- **WHEN** "هذه" in "هذه الطلب" is labelled unscored and the pipeline auto-replaces it
- **THEN** its outcome is `unscored`, recorded as changed, and no `corruption` is counted

#### Scenario: English real-word misspelling
- **WHEN** "form" is labelled misspelled with intended "from", and the engine accepts "form"
- **THEN** its outcome is `missed`, and it is marked real-word

#### Scenario: Arabic real-word misspelling
- **WHEN** "ان" is labelled misspelled with intended "أن", and the engine accepts "ان"
- **THEN** it is marked real-word, whatever its outcome

#### Scenario: Mixed message
- **WHEN** a message holds the English non-word "recieve" and the Arabic real-word misspelling "ان", both labelled misspelled
- **THEN** "recieve" is a non-word misspelling and "ان" a real-word one, each in its own language's figures

### Requirement: Metrics
The report SHALL compute, per language, per dataset and per error type, in three layers.

**Detection:**
- **detection recall:** detected misspellings ÷ gold-misspelled tokens;
- **non-word detection recall** and **real-word detection recall:** the same ratio over non-word and over real-word gold misspellings, with each kind's count;
- **false-flag rate:** (`false-flag` + `corruption`) ÷ gold-correct tokens;
- **detection precision:** detected misspellings ÷ all flagged or auto-replaced tokens, not counting `unscored` tokens.

**Correction** (whether the system arrives at the intended word, applied or offered):
- **correction accuracy@1** and **@5:** gold-misspelled tokens whose intended word is ranked 1 (or 1–5) ÷ gold-misspelled tokens;
- the same ratios over detected misspellings only.

**Auto-replace:**
- **auto-replace precision:** `fixed` ÷ (`fixed` + `wrong-fix` + `corruption`);
- **auto-replace coverage:** `fixed` ÷ gold-misspelled tokens;
- **corruption rate:** `corruption` per 10,000 gold-correct tokens, with its 95% upper bound;
- **by source:** auto-replace precision and coverage, and the counts of `fixed`, `wrong-fix` and `corruption`, for each source of the replacement: `list` (a known misspelling), `case` (the case-only fix) and `neighbor` (the single-neighbor rule).

**Also reported:**
- exclusion leaks;
- engine latency p50 and p95 for the correctness check and for corrections;
- unscored tokens: how many, how many flagged and how many auto-replaced.

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

#### Scenario: Real-word recall
- **WHEN** an Arabic dataset has 80 non-word misspellings, all detected, and 20 real-word misspellings, 2 of them detected through the misspellings list
- **THEN** detection recall is 82%, non-word detection recall is 100% over 80, and real-word detection recall is 10% over 20

#### Scenario: English unscored tokens
- **WHEN** an English dataset has 50 unscored tokens, 5 flagged and 1 auto-replaced
- **THEN** the report shows 50, 5 and 1 for unscored tokens, and the false-flag rate, detection precision and corruption rate are unchanged by them

#### Scenario: Committed data unchanged
- **WHEN** the benchmark runs on the committed datasets only, which have no real-word misspellings and no unscored tokens
- **THEN** every existing metric equals the value it had before this change, and real-word counts are 0

### Requirement: Datasets and provenance
Each dataset SHALL be one file of labelled messages. Every token carries a language and a gold label: correct, misspelled (with intended word and optional error type), excluded, or unscored. A manifest MUST record each dataset's and word list's source, license, size, hash and, for generated data, the generator version, options and seed. A dataset that is unlisted, or whose hash doesn't match, MUST be refused. The committed data MUST include:
- English and Arabic curated typo sets;
- clean in-domain agent messages in English, Arabic and mixed Arabic/English, with names, product terms, transliterations and excluded tokens;
- the English and Arabic word lists;
- inserted-error datasets generated from the clean messages.

Committed datasets MUST NOT use the `unscored` label: it exists for imported corpora whose edits go beyond spelling.

#### Scenario: Unlisted dataset
- **WHEN** a dataset file is not in the manifest
- **THEN** the run fails and names the file

#### Scenario: Label doesn't align
- **WHEN** a label's span matches no token the pipeline produces
- **THEN** the run fails, naming the dataset and the message id

#### Scenario: Unscored label in committed data
- **WHEN** a committed dataset has a label with gold `unscored`
- **THEN** the run fails, naming the dataset and the message id

### Requirement: Private datasets
Datasets in the gitignored private directory SHALL be evaluated when present, including type classification of their labelled misspellings. For them, the report MUST contain only aggregate metrics and counts (including per-type, real-word and unscored counts), never message text, words or examples. They MUST NOT be part of the committed baseline.

Data from a licensed corpus (such as QALB) MUST stay in the private directory with its license file beside it, and its manifest entry MUST name that license. No command may copy words from a private dataset into committed files, word lists, misspellings lists or dictionaries.

#### Scenario: Pilot export
- **WHEN** a private dataset of real agent messages with labelled misspellings is present
- **THEN** its metrics and its error-type distribution appear in the report under its name, and no word from it appears anywhere in the report

#### Scenario: No private data
- **WHEN** the private directory is empty or missing
- **THEN** the run succeeds with the committed datasets only

#### Scenario: Converted QALB set
- **WHEN** `qalb14-dev` was converted from QALB-2014 dev and the benchmark runs
- **THEN** the report shows its aggregate metrics, real-word and unscored counts under `qalb14-dev`, no word from it appears anywhere in the report, and the baseline is unchanged
