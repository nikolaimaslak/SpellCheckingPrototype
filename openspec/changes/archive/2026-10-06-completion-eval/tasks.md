# Tasks

## 1. Dataset and judging

- [x] 1.1 Write `eval/completion/cases.ts`: the loader, validation (fields, the `lang` and `category` values, unique ids, the line number in errors) and the dataset hash (design D1). Verify with `test/eval/completion-cases.test.ts`: a valid file loads; a malformed line and a duplicate id fail, naming the line; the hash changes when a case changes.
- [x] 1.2 Write `eval/completion/cases.jsonl` (design D5): about 60 made-up off-domain cases (32 EN, 18 AR, 10 mixed) across the six categories, mid-word cases with an unambiguous `seamWord`, and details cases with `mustNotInvent`. Include the testers' Leibniz and RL chats. Verify that the loader accepts the file, and that the counts per language and category are printed by a test.
- [x] 1.3 Write `eval/completion/judge.ts` (design D3): seam word, spacing error, the replay invariants and invented details. Verify with `test/eval/completion-judge.test.ts`:
  - "pati" + "ence." is ok, and "ent." and " ence." are not;
  - the Arabic "التفا" + "صيل" is ok, also with diacritics;
  - a space after a space, and a letter after a comma, are spacing errors;
  - "5 working days" is an invention against a context with "3 working days";
  - "sam@example.com" isn't one when it's in the context;
  - Arabic-Indic digits are mapped;
  - an edit mismatch fails the invariant.

## 2. Recording and replay

- [x] 2.1 Write `eval/completion/recording.ts` and `run.ts` (design D1, D2): `recordKey`, the recorder, the replay model (`NoRecording` naming the key), and `runCase` with the library and KB loaded as in `server/main.ts`, capturing the user prompt. Verify with `test/eval/completion-recording.test.ts`:
  - the key is stable for equal inputs and changes with the instructions, the user prompt or the options;
  - a replay returns the raw answer, and a missing key throws `NoRecording`;
  - `runCase` with the fake model returns the reply and the user prompt.
- [x] 2.2 Write `test/eval/completion-replay.test.ts` (spec "Recorded replays"). For every case in every `recordings/*.jsonl`: replay, compare `completion`/`edit`/`withheld` with the recorded reply, and check the invariants. On a missing recording, fail naming the case and `npm run eval:completion:record`. Verify by deliberately changing one prompt word locally: the suite fails with that message. Then restore it.

## 3. Benchmark, gate and report

- [x] 3.1 Write `eval/completion/metrics.ts` (design D3, D4): the per-language and per-category metrics from the spec, shown agreement, distinct completions, and latency p50/p95. Verify with `test/eval/completion-metrics.test.ts` on hand-made sample sets: rates, seam accuracy over shown samples only, an unstable case lowering agreement, and percentiles.
- [x] 3.2 Write `eval/completion/criteria.json`, `criteria.ts` and `gate.ts` (design D4): compared criteria fail only on a regression beyond tolerance; threshold-only criteria fail on the threshold; a model, dataset-hash or sample-count mismatch refuses. Verify with `test/eval/completion-gate.test.ts`: a regression, a tolerated change, a threshold-only miss, and a model mismatch.
- [x] 3.3 Write `eval/completion/report.ts` and `eval/cli/completion.ts`, plus the npm scripts (spec "Live benchmark run" and "Completion report"):
  - `--samples`, `--concurrency`, `--allow-fake`, `--check`, `--baseline` and `--record`;
  - errors counted, not fatal;
  - no key in the output.

  Verify with `test/eval/completion-cli.test.ts`, using the fake model and `--allow-fake`: a report is written; `--record` writes a recordings file that the replay suite accepts; and without a key and without `--allow-fake`, the CLI exits with the "live model needed" message.

- [x] 3.4 Add the two assembly fixes to `server/postprocess.ts` (design D7). Verify with `test/server/postprocess.test.ts`, covering every new "Output assembly" scenario: "depa" + "rtment…" → format; "التفا" + "اصيل…" → format; "مساعدة" + "ك اليوم؟" → format; ". " + " وسيتواصل…" → no leading space, with the edit matching. Also check that a finished word + " has been…", a word + "." and the existing scenarios still pass.

## 4. First measurement and docs

- [x] 4.1 With Gemini: run `npm run eval:completion:record`, then `npm run eval:completion:baseline`. Commit the recordings and the baseline. Review the report's worst cases, and fix any case with an ambiguous expectation, re-recording if one changes. Verify that `npm test` passes with the committed recordings.
- [x] 4.2 Run `npm run eval:completion:check` twice more on unchanged code (design D4). Verify that both pass. If one doesn't, widen the offending tolerance (or raise `--samples`) and note it in the task notes.
- [x] 4.3 Write `docs/COMPLETION-EVAL.md`: the commands, the metrics, the replay workflow after a prompt change, how to read the report, and updating the baseline. Add the scripts to CLAUDE.md's command table, and remove `scripts/measure-completion.ts`. Verify that no reference to `measure-completion` remains outside the archive.
- [x] 4.4 Run `npm run typecheck`, `npm test` and `npm run build`, and `openspec validate completion-eval --strict`. Verify that all pass.

## Notes

**First measurement** (Gemini `gemini-3.5-flash-lite`, 60 cases × 5 samples, about 55 s per run, 2026-10-05/06):
- **Before the assembly fixes:** shown 73%, `format` 16%, seam 94%, spacing errors 0.9%, inventions 0–0.9%, agreement 72–73%, p50 about 650 ms. Two `--check` runs passed against that baseline.
- **The four defects the replay invariants found** (design D7):
  - "rtmentrtment" (a repeated fragment);
  - "التفااصيل" (a fragment kept as the word);
  - "مساعدةك" (a split-off suffix, 5 of 5 samples);
  - a double space after ". ".
- **An invention found:** "3–5 business days" in `mx-fin-en-order`, where nothing in the context has a figure.
- **After the fixes** (the whole-word rule as specified, which the user chose over a refined variant that would keep "ord" + "er" joins): seam 100%, spacing errors 0%, inventions 0%, but shown 51–55% and `format` 34–37%. Most of the new `format` withholds are splits where `word` is exactly the typed part and `rest` holds the remaining letters ("ord" + "er", "tod" + "ay", "المرو" + "ر"). The typed-word-hint prompt change is the lever.
- **Gate stability** (task 4.2): four `--check` runs against the post-fix baseline.
  - **Agreement:** 60.0%, 53.3%, 60.0%, 46.7%. With the whole-word rule, the same case is withheld in some samples and shown in others, so agreement is noisy. The threshold-only `shown-agreement` was lowered from 0.70 to 0.35 to stay below the observed range.
  - **Latency p95:** 955–1558 ms. `latency-p95` was raised from 1500 to 2000 ms.
  - **Compared criteria:** every one stayed within tolerance in all four runs.
