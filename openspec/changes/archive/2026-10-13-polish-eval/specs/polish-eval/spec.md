# Spec Delta

## Purpose

Measuring grammar polish, whose quality depends on the model and its prompt: a local, gitignored eval that imports sentence pairs (a draft with errors and its reference correction) from GEC datasets, runs them through the polish program with its safety checks, and reports how close the corrections come to the references.

## ADDED Requirements

### Requirement: Local polish workspace
The polish eval SHALL read and write only under `eval/local/polish/`, which version control ignores:
- `sources/` holds input files (a path anywhere else is also accepted);
- `sets/<name>.jsonl` holds imported test sets, with `<name>.meta.json` recording the input, the options and the counts;
- `runs/<timestamp>-<set>-<model>/` holds each run's raw answers (`samples.jsonl`), `report.md` and `report.json`.

The tool MUST create these folders when they're missing, MUST NOT write anywhere else in the repository, and MUST NOT write the API key into any file. Imported data and reports contain the datasets' text and are never committed.

When the selected model sends text outside the machine, the run MUST print a one-line reminder that the set's text leaves the machine before it starts.

#### Scenario: Workspace ignored
- **WHEN** a set is imported and run
- **THEN** every file the tool created is under `eval/local/polish/`, and `git status` shows none of them

#### Scenario: External model reminder
- **WHEN** a run starts with Gemini selected
- **THEN** it prints that the set's text is sent outside the machine, then runs

### Requirement: Importing GEC sentence pairs
`npm run eval:polish:build -- <csv> --name <set>` SHALL import a CSV file of sentence pairs into a test set, reading UTF-8 with or without a byte-order mark. It MUST recognize these layouts by their header:
- `Ungrammatical Statement`, `Standard English` and `Error Type` (the Grammar Correction dataset);
- `original_text`, `corrected_text` and `primary_error_type` (the College Level English Writing dataset).

Any other header MUST fail with a message listing the columns found, unless the columns are named with `--source-column`, `--target-column` and optionally `--type-column`.

Rows are imported as is:
- every row and every error type is kept, and the draft and reference texts are not edited (leading list numbers, punctuation and pairs whose reference equals the draft stay);
- a row with an empty draft or reference is skipped and counted;
- rows with an identical draft and reference are one case, with a `count` of how many rows they stand for.

Each case MUST hold:
- an `id` and the set name;
- `source` (the draft) and `target` (the reference correction);
- `errorType` (`unknown` when the layout has none);
- `lang`: `en` or `ar` by the script with more letters, or `mixed` when the source has both Arabic and Latin letters;
- `count` and the first source row number.

`--limit N` keeps N cases, chosen with a seeded random generator (`--seed`, default 1), so the same input and options always give the same set. The build MUST print the rows read, the rows skipped, the cases written, and the cases by error type and language. A set with no cases MUST fail with a message saying why.

#### Scenario: Grammar Correction layout
- **WHEN** a CSV with the columns `Serial Number`, `Error Type`, `Ungrammatical Statement` and `Standard English` holds the row "Verb Tense Errors", "He go to the office yesterday.", "He went to the office yesterday."
- **THEN** one case is written with that source and target, `errorType` "Verb Tense Errors" and `lang` "en"

#### Scenario: College writing layout with duplicates
- **WHEN** a CSV with `original_text`, `corrected_text` and `primary_error_type` holds the same pair in 200 rows
- **THEN** one case is written with `count` 200

#### Scenario: Text kept as is
- **WHEN** a row's draft is "31. I has a question." and its reference is "31. I have a question."
- **THEN** the case's source and target keep "31. "

#### Scenario: Pair needing no change
- **WHEN** a row's draft and reference are both "Can you help me with this problem?"
- **THEN** a case is written whose target equals its source

#### Scenario: Arabic and mixed rows
- **WHEN** a CSV with named columns holds the Arabic row "هذه الطلب قيد المراجعة." → "هذا الطلب قيد المراجعة." and the mixed row "يرجى تحديث بياناتك عبر Absher" → itself
- **THEN** the first case has `lang` "ar" and the second `lang` "mixed"

#### Scenario: Unknown layout
- **WHEN** a CSV's header is `text,fixed` and no column options are given
- **THEN** the build fails, listing the columns `text` and `fixed`

#### Scenario: Deterministic subset
- **WHEN** the same input is imported twice with `--limit 50 --seed 1`
- **THEN** the two sets are identical

### Requirement: Evaluation run
`npm run eval:polish -- --set <name>` SHALL run every case of the set `--samples` times (default 1) through the server's polish program in process, with:
- the model the server's settings select;
- the LLM cache off, whatever `.env` says;
- the same output cleaning and safety checks as `POST /v1/polish`, so a rejected correction counts as returning the draft, with its reason;
- at most `--concurrency` requests in flight (default 4).

A request that fails or times out MUST count as an error and not stop the run. The run MUST refuse the offline test model unless `--allow-fake` is given. Before starting it MUST print the number of requests. Each sample MUST be written to `samples.jsonl` with the case id, the returned text, whether it changed, the rejection reason or error, and the latency.

#### Scenario: English correction
- **WHEN** a set holding "He go to the office yesterday." → "He went to the office yesterday." is run with the offline test model and `--allow-fake`
- **THEN** the sample's returned text is "He went to the office yesterday." and it is marked changed

#### Scenario: Arabic correction
- **WHEN** a set holding "هذه الطلب قيد المراجعة." → "هذا الطلب قيد المراجعة." is run with the offline test model and `--allow-fake`
- **THEN** the sample's returned text is "هذا الطلب قيد المراجعة."

#### Scenario: Safety rejection counted
- **WHEN** the model's answer for a draft holding "REF-20491" drops the reference code
- **THEN** the sample returns the draft unchanged with the reason `protected-changed`

#### Scenario: Errors counted
- **WHEN** some requests time out
- **THEN** the run finishes, and the report counts them as errors

#### Scenario: Offline model refused
- **WHEN** the run starts with the offline test model and no `--allow-fake`
- **THEN** it exits with a message saying a live model is needed

### Requirement: Metrics and report
Each run SHALL write `report.md` and `report.json`. Texts are compared as tokens: runs of letters, digits and combining marks, and single punctuation characters, with whitespace ignored and letter case kept. An edit is a change between the source's tokens and another text's tokens, found by aligning the two token sequences; the reference's edits are the gold edits and the returned text's edits are the system edits.

Each sample gets one outcome:
- `exact`: the returned tokens equal the reference's;
- `missed`: the reference changes the source, but the returned text doesn't;
- `different`: the reference changes the source, and the returned text changes it differently;
- `kept`: the reference equals the source, and so does the returned text;
- `over-edited`: the reference equals the source, but the returned text changes it;
- `rejected`: the safety checks returned the draft (also counted in `missed` or `kept`, so the safety check's cost stays visible);
- `error`: the request failed or timed out.

For each error type, each language (`en`, `ar`, `mixed`) and overall, the report MUST give:
- the number of cases and of rows they stand for;
- the share of each outcome, over samples;
- edit precision (system edits that are gold edits ÷ system edits), recall (gold edits made ÷ gold edits) and F0.5, summed over samples;
- the rejection reasons and their counts;
- latency p50 and p95, for information.

Error types are listed in the order of the input, each in its own row, so types that ask for rewrites can be read separately from the overall figure. Every sample counts once: duplicate rows (`count`) don't weight the figures. The report MUST then list up to 30 samples each of `missed`, `different` and `over-edited`, and every rejection, with the error type, the source, the reference and the returned text.

#### Scenario: Exact correction
- **WHEN** the source is "He go to the office.", the reference "He went to the office." and the returned text "He went to the office."
- **THEN** the outcome is `exact`, with one system edit that matches the one gold edit

#### Scenario: Missed correction
- **WHEN** the source is "She have completed her homework.", the reference "She has completed her homework." and the returned text equals the source
- **THEN** the outcome is `missed`, with recall 0 for that sample and no system edits

#### Scenario: Over-edit of a correct sentence
- **WHEN** the source and reference are "Can you help me with this problem?" and the returned text is "Could you help me with this problem?"
- **THEN** the outcome is `over-edited`, and the sample is listed under over-edits

#### Scenario: Partly right
- **WHEN** the source is "He go to the store and buyed a pen.", the reference "He went to the store and bought a pen." and the returned text "He went to the store and buyed a pen."
- **THEN** the outcome is `different`, with precision 1 and recall 0.5 for that sample

#### Scenario: Arabic edit matched
- **WHEN** the source is "تم استلام طلبك و سيتم مراجعتة.", the reference "تم استلام طلبك وسيتم مراجعته." and the returned text equals the reference
- **THEN** the outcome is `exact`

#### Scenario: Whitespace ignored, case kept
- **WHEN** the reference is "Thank you, the payment was sent." and the returned text is "Thank you ,the payment was sent." or "thank you, the payment was sent."
- **THEN** the first is `exact` and the second is not

#### Scenario: Error types reported separately
- **WHEN** a set holds cases of the types "Spelling Mistakes" and "Tautology"
- **THEN** the report has a row for each type, and an overall row over both
