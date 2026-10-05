## MODIFIED Requirements

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
