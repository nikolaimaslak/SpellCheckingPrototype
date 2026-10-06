# Proposal

## Why

Completion quality depends on a model, and the model's answers vary from run to run. The tests we have don't check the model at all:
- **Unit tests** cover the deterministic parts: assembly, the shape rules, the controller in jsdom, and the offline fake model.
- **`scripts/measure-completion.ts`** sends 20 cases to a live server, one sample each, with no baseline and no pass or fail.

So whether real suggestions are any good is only found out by hand. Today's testers found several problems that no test would have caught:
- `format` withholds after a finished word;
- a model fragment getting through ("comp" + "uted");
- the safety filter blocking harmless suggestions;
- emails cut at their ".";
- an invented "5 working days".

A prompt change can silently fix one case and break three others.

We need completion testing that is **reliable**, so that a failure means a real regression, and **stable**, so that the same code gives the same verdict. It must also keep working when the production model changes to a local LLM.

Serves **PER #60145** (auto-complete), formal Req 3.1–3.5, **Phase 3**. Infrastructure for every later completion change, such as the typed-word hint and prompt tuning.

## What Changes

Two layers on top of the existing unit tests, plus two assembly fixes for the defects the first recordings exposed:

- **A completion case dataset** (`eval/completion/cases.jsonl`, about 60 made-up cases):
  - **Content:** off-domain, generic chat in English, Arabic and mixed Arabic/English, including the testers' own examples (Leibniz, RL).
  - **What each case has:** a prefix, an optional conversation, and expectations:
    - the word at the seam, when one is unambiguous ("pati" → "patience");
    - whether a suggestion is expected;
    - details that must not be invented.
  - **Categories:** mid-word, finished word, after punctuation, after a space, a new sentence, and details in the conversation (emails, numbers).
- **Recorded replays (deterministic, offline, in `npm test`):**
  - Real model answers for every case are recorded once and committed. Each recording is keyed by a hash of the model name, the instructions, the prompt and the generation options.
  - A Vitest suite replays them through the real `/v1/complete` pipeline and checks two things:
    - the output still matches what was recorded (a snapshot of the reply);
    - invariants hold: no broken seam, the same script, one sentence, the edit consistent with the completion.
  - **When the prompt changes,** the hashes no longer match, and the suite fails with a "re-record" message instead of passing on a stale answer.
- **A live benchmark with a regression gate:** `npm run eval:completion`, plus `--check`, `--baseline` and `--record`.
  - **How it runs:** it runs every case N times (default 5) against the configured model at production settings, in process, through the same pipeline.
  - **What it measures:**
    - shown rate;
    - `format` rate;
    - seam correctness;
    - spacing errors;
    - invented details (digits, emails or links not present in the prefix, the conversation or the sources sent);
    - stability across samples (shown agreement, distinct completions);
    - latency p50/p95.
  - **The gate:**
    - criteria live in `eval/completion/criteria.json` and the baseline in `eval/completion/baseline.json`;
    - `--check` exits 1 on a regression beyond each criterion's tolerance, and the tolerances allow for sampling noise;
    - stability and latency are judged against thresholds only, never against the baseline.
  - **Reports** go to `eval/reports/completion-latest.{md,json}`, which are gitignored.
  - **Any model:** it works with any `CompletionModel`, so the future local LLM gets the same benchmark and baseline format.
- **Assembly fixes (Tier 2,** found by the first Gemini recordings, which the replay invariants rejected):
  - **the word is whole:** when `word` is non-empty, `rest` must be empty or start with whitespace or punctuation; otherwise the answer is withheld as `format`. This stops a repeated fragment ("depa" + "rtmentrtment"), a fragment kept as the word ("التفا" + "اصيل" = "التفااصيل") and a split-off Arabic suffix ("مساعدة" + "ك" = "مساعدةك");
  - **no double space:** when the prefix ends in whitespace, the suggestion's leading whitespace is removed.
- **Docs:**
  - a new `docs/COMPLETION-EVAL.md` (how to run, re-record, read the report, update the baseline);
  - CLAUDE.md's command table;
  - `scripts/measure-completion.ts` is removed, because the benchmark supersedes it.

## Non-goals

- **Browser end-to-end tests** (Playwright). They were considered, and left for later.
- **GOSI-domain cases.** The dataset is generic and off-domain by choice. GOSI scenarios stay in the existing unit tests and the tester guide.
- **Judging suggestion quality with a model** (LLM-as-judge), and human ratings.
- **Detecting invented names.** Only digits, emails and links count as checkable details; names are a known gap.
- **Fixing the problems the benchmark finds,** such as the typed-word hint. Those are separate changes, measured with this tool.
- **Running the live benchmark in CI.** It needs a key and costs API calls; it runs manually or on a schedule.

No new dependency.

## Capabilities

### New Capabilities

- `completion-eval`: the case dataset, recorded replays, the live benchmark with metrics, criteria, baseline and regression gate, and the report.

### Modified Capabilities

- `completion-service`: "Output assembly" gains the whole-word rule for `rest`, and the removal of leading whitespace after a prefix that ends in whitespace.

## Impact

- **New:**
  - `eval/completion/`: the dataset, recording and replay models, metrics, gate, report, criteria and baseline, and recordings per model;
  - `eval/cli/completion.ts`;
  - `test/eval/completion-replay.test.ts`;
  - `docs/COMPLETION-EVAL.md`;
  - the npm scripts `eval:completion`, `eval:completion:check`, `eval:completion:baseline` and `eval:completion:record`.
- **Removed:** `scripts/measure-completion.ts`.
- **Tier 2 code:** `server/postprocess.ts` (`assemble`: the two fixes) and its tests. Otherwise `server/` is imported by the eval, not modified.
- **Data:** all cases and recordings are made-up text. The recordings hold Gemini's answers to synthetic prompts only.
