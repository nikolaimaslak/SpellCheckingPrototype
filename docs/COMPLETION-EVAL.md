# Evaluating inline completion

Completion quality depends on a model whose answers vary from run to run. Testing is therefore split into three layers. Spec: `openspec/specs/completion-eval/`.

| Layer | What it answers | Model | Deterministic | Runs in |
|---|---|---|---|---|
| Unit tests (`test/server/`, `test/completion/`) | Does each function do what it says? | the offline fake model or fixed answers | yes | `npm test` |
| **Recorded replays** (`test/eval/completion-replay.test.ts`) | Given **real** model answers, does today's server still produce the same suggestions, and are they well-formed? | recorded answers, offline | yes | `npm test` |
| **Live benchmark** (`npm run eval:completion`) | Is model + prompt + server good, and did it get worse? | live model, several samples per case | statistical, with tolerances | manually or on a schedule |

All cases and recordings are made-up text. The live benchmark sends them to the configured model (Gemini today), so only synthetic text may ever go into the dataset.

## Commands

| Command | What it does |
|---|---|
| `npm run eval:completion` | Runs every case 5 times (`-- --samples N`, `--concurrency N`) against the model the server would use (`COMPLETION_MODEL`, `GEMINI_API_KEY` from `.env` or the environment). Writes `eval/reports/completion-latest.md` and `.json` (gitignored). About a minute with Gemini |
| `npm run eval:completion:check` | The same, then compares with `eval/completion/baseline.json`. Exits 1 on a regression, and lists each one |
| `npm run eval:completion:baseline` | The same, then rewrites the baseline. Review the diff in the change that updates it |
| `npm run eval:completion:record` | The same, then rewrites `eval/completion/recordings/<model>.jsonl` from the first answered sample of each case (the replay suite's input) |

The benchmark refuses to run with the offline fake model unless `--allow-fake` is given, which is only for testing the tool itself.

## The dataset

`eval/completion/cases.jsonl` holds one case per line, about 60 of them: off-domain, generic chat in English, Arabic and mixed Arabic/English. Each case has:
- `id`;
- `lang` (`en`, `ar` or `mixed`);
- `category`: `mid-word`, `finished-word`, `after-punctuation`, `after-space`, `new-sentence` or `details`;
- `prefix`, the agent's text so far;
- an optional `transcript`;
- optional expectations:
  - `seamWord`: the word being typed, as it must read after the suggestion. Mid-word cases need one with a single plausible completion;
  - `mustNotInvent`: details that may only appear if the context has them;
  - `expectShown`.

Editing the file changes its hash: the baseline then refuses to compare until it's rewritten.

## What is measured

Each sample goes through the real `/v1/complete` handler (`server/complete.ts`), with the server's canned responses and knowledge base. The figures are reported per language column (en, ar, mixed, all) and per category:

| Metric | Meaning |
|---|---|
| Shown | Samples with a non-empty suggestion |
| Withheld: format | Model output the server couldn't use (`withheld: "format"`) |
| Errors | Failed or timed-out requests |
| Seam word correct | Of the shown samples of cases with a `seamWord`: the word at the caret reads as expected (letter case and Arabic diacritics ignored) |
| Spacing errors | Of the shown samples: a space after a prefix that ends in whitespace, or a letter joined to a prefix that ends in punctuation |
| Invented details | Of the shown samples: a digit run, an email or a link not present in what the model was given (the prefix, the conversation and the sources sent), or a `mustNotInvent` string |
| Shown agreement | Cases whose samples all agree on shown or not shown |
| Distinct completions per case | The mean number of different suggestions over the samples |
| Latency p50 / p95 | From request to reply, in process |

The report also lists:
- the cases with wrong seam words, with an example of each;
- the unstable cases (shown in some samples only);
- the cases that were never shown;
- every invented detail.

Names aren't checked for invention.

## The gate

`eval/completion/criteria.json` sets each criterion's threshold, direction and tolerance:
- **Compared criteria** (seam, spacing, inventions, `format`, shown): `--check` fails when one is worse than its baseline value by more than its tolerance. Their threshold verdict is reported but doesn't fail the gate, so a known weakness doesn't block every run.
- **Threshold-only criteria** (errors, shown agreement, latency p95, marked `"compare": false`): these vary with load and sampling, so they're judged against their threshold alone.
- **A different setup is refused:** `--check` won't compare against a baseline made with another model, dataset or sample count.

The tolerances were checked against real runs: repeated runs on unchanged code pass against each other. Agreement and latency vary the most (see the task notes of the `completion-eval` change).

## Recorded replays

`eval/completion/recordings/<model>.jsonl` holds one line per case: the record key, the model's raw answer, and the reply the server made from it. The key is a SHA-256 of:
- the model name;
- the instructions;
- the full user prompt (conversation, retrieved sources, prefix);
- the generation options.

The replay suite runs every case through the server with a replay model that answers only from exact keys. It checks that:
- the reply equals the recorded one;
- the invariants hold:
  - the seam word, when the case has one;
  - no spacing error;
  - the `edit` describes the completion;
  - at most one sentence;
  - the script matches the prefix.

### Workflows

- **Changed server code** (assembly, retrieval):
  - `npm test`. A changed reply fails with the recorded and new replies side by side.
  - If the change is intended, run `npm run eval:completion:record`, review the recordings diff, and commit it.
- **Changed prompt, data or model:** every replay fails with "the prompt changed since it was recorded".
  - Run `npm run eval:completion:record`, then `npm run eval:completion:check` to see whether quality moved.
  - If it's accepted, run `npm run eval:completion:baseline`, and commit the recordings and the baseline together.
- **New model** (the production local LLM): run `:record` and `:baseline` once with it selected. Its recordings and baseline are stored under its own name, and the replay suite tests every recorded model.

A replay never falls back to a live model, and a missing recording is a failure, never a skip.
