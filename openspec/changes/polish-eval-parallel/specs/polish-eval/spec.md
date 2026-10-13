# Spec Delta

## MODIFIED Requirements

### Requirement: Importing GEC sentence pairs
`npm run eval:polish:build` SHALL import sentence pairs into a test set from either input, reading UTF-8 with or without a byte-order mark:
- **a CSV file**: `npm run eval:polish:build -- <csv> --name <set>`;
- **two line-aligned plain-text files**: `npm run eval:polish:build -- <source-file> --target-file <target-file> --name <set>`, where line *n* of the target file is the reference correction of line *n* of the source file. Line endings are normalized. Files with different line counts MUST fail with both counts, writing nothing.

A CSV MUST be recognized by its header as one of these layouts:
- `Ungrammatical Statement`, `Standard English` and `Error Type` (the Grammar Correction dataset);
- `original_text`, `corrected_text` and `primary_error_type` (the College Level English Writing dataset).

Any other header MUST fail with a message listing the columns found, unless the columns are named with `--source-column`, `--target-column` and optionally `--type-column`.

Rows (CSV rows or line pairs) are imported as is:
- every row and every error type is kept, and the draft and reference texts are not edited (leading list numbers, punctuation and pairs whose reference equals the draft stay);
- a row with an empty draft or reference is skipped and counted;
- rows with an identical draft and reference are one case, with a `count` of how many rows they stand for.

Each case MUST hold:
- an `id` and the set name;
- `source` (the draft) and `target` (the reference correction);
- `errorType`: from the CSV's type column; otherwise the value of `--type`, default `unknown`;
- `lang`: `en` or `ar` by the script with more letters, or `mixed` when the source has both Arabic and Latin letters;
- `count` and the first source row number (the CSV row, or the line number).

`--local-only` marks the set as never to be sent outside the machine; the mark is recorded in the set's metadata.

`--limit N` keeps N cases, chosen with a seeded random generator (`--seed`, default 1), so the same input and options always give the same set. The build MUST print the rows read, the rows skipped, the cases written, the cases by error type and language, and whether the set is local-only. A set with no cases MUST fail with a message saying why.

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

#### Scenario: English parallel files
- **WHEN** the source file holds "He go to the office yesterday." and "I has a question." on lines 1 and 2, and the target file holds "He went to the office yesterday." and "I have a question."
- **THEN** two cases are written, pairing line 1 with line 1 and line 2 with line 2, with `errorType` "unknown" and rows 1 and 2

#### Scenario: Arabic parallel files with a type
- **WHEN** the source file holds "تم استلام طلبك و سيتم مراجعتة خلال ثلاثة ايام." and the target file holds "تم استلام طلبك وسيتم مراجعته خلال ثلاثة أيام.", imported with `--type qalb14`
- **THEN** one case is written with `lang` "ar", `errorType` "qalb14" and the texts unchanged

#### Scenario: Mixed parallel line
- **WHEN** a source line is "أرجو تحديث تطبيق Absher ثم ارسال الطلب" and its target "أرجو تحديث تطبيق Absher ثم إرسال الطلب"
- **THEN** the case has `lang` "mixed"

#### Scenario: Line counts differ
- **WHEN** the source file has 1,017 lines and the target file 1,016
- **THEN** the build fails, naming both counts, and no set is written

#### Scenario: Empty line pair skipped
- **WHEN** line 3 of the source file is empty
- **THEN** that pair is skipped and counted, and the other lines keep their own line numbers

#### Scenario: Local-only mark
- **WHEN** a set is imported with `--local-only`
- **THEN** its metadata records it as local-only, and the build prints that it is

### Requirement: Evaluation run
`npm run eval:polish -- --set <name>` SHALL run every case of the set `--samples` times (default 1) through the server's polish program in process, with:
- the model the server's settings select;
- the LLM cache off, whatever `.env` says;
- the same output cleaning and safety checks as `POST /v1/polish`, so a rejected correction counts as returning the draft, with its reason;
- at most `--concurrency` requests in flight (default 4).

A request that fails or times out MUST count as an error and not stop the run. The run MUST refuse the offline test model unless `--allow-fake` is given. A set marked local-only MUST be refused, before any request and without creating a run folder, when the selected model sends text outside the machine; the message MUST name the set and the model. Before starting the run MUST print the number of requests. Each sample MUST be written to `samples.jsonl` with the case id, the returned text, whether it changed, the rejection reason or error, and the latency.

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

#### Scenario: Local-only set refused on a hosted model
- **WHEN** a set imported with `--local-only` is run with Gemini selected
- **THEN** the run exits before any request, naming the set and the model, and no run folder is created

#### Scenario: Local-only set on a local model
- **WHEN** a set imported with `--local-only` is run with `COMPLETION_MODEL=ollama_chat/gemma3:12b` and `COMPLETION_API_BASE=http://127.0.0.1:11434`
- **THEN** the run proceeds
