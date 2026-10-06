# completion-eval Specification

## Purpose

Reliable and stable testing of inline completion, whose quality depends on a model that answers differently from run to run: a dataset of made-up completion cases, real model answers recorded and replayed offline in the unit tests, and a live benchmark with metrics, criteria, a baseline and a regression gate that works with any completion model.

## Requirements

### Requirement: Completion case dataset
The project SHALL keep a completion case dataset in `eval/completion/cases.jsonl`: about 60 made-up cases of off-domain, generic chat, at least 15 in Arabic and at least 8 mixing Arabic and English. Each case MUST have:
- a unique `id`;
- a `lang` (`en`, `ar` or `mixed`);
- a `category`: `mid-word`, `finished-word`, `after-punctuation`, `after-space`, `new-sentence` or `details`;
- the agent's `prefix`;
- an optional `transcript` of `{ role, text }` turns;
- optional expectations:
  - `seamWord`: the word the agent is typing, as it must read after the suggestion, compared ignoring letter case and Arabic diacritics;
  - `expectShown` (default true);
  - `mustNotInvent`: details that must not appear unless present in the context.

Every case MUST use synthetic text only. A malformed line or a duplicate `id` MUST fail loading with the line number.

#### Scenario: Mid-word case
- **WHEN** a case has the prefix "Thank you for your pati" and `seamWord` "patience"
- **THEN** a suggestion "ence." is judged a correct seam, and "ent." or " ence." is not

#### Scenario: Arabic mid-word case
- **WHEN** a case has the prefix "شكراً على صبرك، سأرسل لك التفا" and `seamWord` "التفاصيل"
- **THEN** a suggestion starting "صيل" is judged a correct seam, and a diacritic on the suggestion doesn't change the verdict

#### Scenario: Mixed-language case
- **WHEN** a case has an Arabic prefix and a conversation that mixes Arabic with English terms
- **THEN** it loads with `lang` "mixed" and is reported in its own column

#### Scenario: Malformed dataset
- **WHEN** a line isn't valid JSON or repeats an `id`
- **THEN** loading fails, naming the line

### Requirement: Recorded replays
The project SHALL keep recorded model answers for every case in `eval/completion/recordings/<model>.jsonl`. Each record has:
- a key: a SHA-256 of the model name, the instructions, the user prompt and the generation options;
- the raw model answer;
- the reply that the completion service produced from it at record time (`completion`, `edit`, `withheld`).

A Vitest suite SHALL run every case through the completion service with a replay model that answers from the recordings, offline. It MUST check, for each case:
- the reply equals the recorded reply;
- the invariants hold:
  - a shown completion keeps the case's `seamWord`, when one is set;
  - it has no space-after-space or missing space at the seam;
  - its script matches the prefix's script;
  - it is at most one sentence;
  - it satisfies `completion = word.slice(typed.length) + rest` for its `edit`.

When no recording matches a case's key, the suite MUST fail with a message naming the case and the command that re-records, never skip the case or fall back to a live model.

#### Scenario: Replay passes offline
- **WHEN** `npm test` runs without a network connection or API key
- **THEN** every case replays from its recording and its checks pass

#### Scenario: Prompt changed
- **WHEN** the completion instructions change and the recordings weren't refreshed
- **THEN** the replay suite fails, naming the cases without a matching recording and `npm run eval:completion:record`

#### Scenario: Pipeline change visible
- **WHEN** a change to post-processing alters the reply produced from a recorded answer
- **THEN** the replay suite fails for that case and shows the recorded and new replies

#### Scenario: Arabic replay
- **WHEN** an Arabic mid-word case is replayed
- **THEN** its seam, script and edit invariants are checked like an English case

### Requirement: Live benchmark run
`npm run eval:completion` SHALL run every case `--samples` times (default 5) through the completion service with the model chosen by the same selection as the server (`COMPLETION_MODEL`, `GEMINI_API_KEY`) at production settings, with at most `--concurrency` requests in flight (default 4). It MUST refuse to run with the offline test model unless `--allow-fake` is given. `--record` MUST also write the first sample of every case as its recording, replacing that model's recordings file. A request that fails or times out MUST count as `error` and not stop the run.

#### Scenario: Default run
- **WHEN** `npm run eval:completion` runs with a Gemini key
- **THEN** every case is sampled 5 times, and a report is written to `eval/reports/completion-latest.md` and `.json`

#### Scenario: Re-record
- **WHEN** `npm run eval:completion:record` runs
- **THEN** `eval/completion/recordings/<model>.jsonl` holds one recording per case, and the replay suite passes

#### Scenario: No model
- **WHEN** it runs without a key and without `--allow-fake`
- **THEN** it exits with a message saying a live model is needed

### Requirement: Completion metrics
For each language column (`en`, `ar`, `mixed`, `all`) and category, the benchmark SHALL report over all samples:
- **shown rate:** non-empty completions ÷ samples;
- **format rate:** `withheld: "format"` ÷ samples;
- **error rate:** failed or timed-out requests ÷ samples;
- **seam accuracy:** over shown samples of cases with a `seamWord`, the share whose seam word matches;
- **spacing error rate:** over shown samples, the share with a space after a prefix ending in whitespace, or with a letter joined to a prefix that ends in punctuation;
- **invention rate:** over shown samples, the share containing a digit sequence, an email address or a link that doesn't occur in the prefix, the transcript or the sources sent, plus any `mustNotInvent` detail absent from the context;
- **shown agreement:** the share of cases whose samples all agree on shown or not shown;
- **distinct completions per case:** the mean;
- **latency:** p50 and p95, from request to reply.

#### Scenario: Invented figure
- **WHEN** the conversation says "3 working days" and a sample shows " within 5 working days."
- **THEN** that sample counts as an invention

#### Scenario: Detail from the conversation
- **WHEN** the customer wrote "my email is sam@example.com" and a sample shows " we will write to sam@example.com."
- **THEN** that sample doesn't count as an invention

#### Scenario: Unstable case
- **WHEN** 3 of 5 samples of a case are shown and 2 are withheld for `format`
- **THEN** the case lowers shown agreement and is listed among the unstable cases in the report

### Requirement: Completion criteria and gate
The benchmark SHALL read its criteria from `eval/completion/criteria.json`. Each criterion has:
- an `id`, a `metric`, a language column and a category (or `all`);
- a `threshold` and a `direction` (`min` or `max`);
- a `tolerance`;
- `compare` (false for stability and latency, which are judged against the threshold only).

`--baseline` MUST write `eval/completion/baseline.json`, holding the model name, the dataset hash, the sample count and each criterion's value. `--check` MUST exit 1, listing each regression, when any compared criterion is worse than its baseline value by more than its tolerance, or when a threshold-only criterion misses its threshold. It MUST refuse to compare against a baseline for a different model or dataset hash, saying which differs. Tolerances MUST be large enough that two runs of unchanged code pass `--check` against each other.

#### Scenario: Regression caught
- **WHEN** a prompt change lowers the seam accuracy beyond its tolerance
- **THEN** `npm run eval:completion:check` exits 1 and names the criterion with its baseline and new values

#### Scenario: Noise tolerated
- **WHEN** the benchmark runs twice on unchanged code with the same model
- **THEN** both runs pass `--check` against the same baseline

#### Scenario: Baseline for another model
- **WHEN** `--check` runs with a different model than the baseline's
- **THEN** it exits 1, saying the baseline was made with another model

### Requirement: Completion report
The report SHALL show:
- the run settings: model, sample count, dataset hash, date;
- every criterion with its value, threshold, baseline value and verdict;
- the metrics per language and category;
- the cases with the lowest seam accuracy and shown agreement, with one example completion each;
- every invention, with the case and the invented detail.

It MUST NOT contain any API key. Completion text MAY appear in the report, because the dataset is synthetic.

#### Scenario: Report lists problem cases
- **WHEN** the run has cases with format withholds and inventions
- **THEN** the report lists those cases with an example completion and the invented detail
