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
