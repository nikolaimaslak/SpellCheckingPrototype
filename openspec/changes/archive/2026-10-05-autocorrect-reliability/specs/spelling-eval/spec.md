## MODIFIED Requirements

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
