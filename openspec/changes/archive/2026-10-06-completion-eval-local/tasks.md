# Tasks

## 1. Scaffolding

- [x] 1.1 Add `/eval/local/` to `.gitignore`. Create the `server/assist_eval/` package with `paths.py` (`eval/local/completion/{sources,sets,runs}`, created on demand) and list it in `server/pyproject.toml`. Add the `eval:completion:build` and `eval:completion` npm scripts. Verify:
  - `uv run --project server --locked python -m assist_eval --help` prints the `build` and `run` commands;
  - a file created under `eval/local/completion/` doesn't show in `git status`.

## 2. Inputs and cases

- [x] 2.1 Write `sources.py`, covering chat text with English and Arabic labels, continued lines, `---`, `#` comments and the warning for text before the first label, plus plain text by paragraph or `--split sentences` (design 2). Add `eval/completion/examples/chat-example.txt`: synthetic English, Arabic and mixed conversations. Verify with `server/tests/eval/test_sources.py`, covering every "Input formats" scenario: English chat, Arabic labels, mixed turns with continued lines, separated conversations, and plain text by sentences.
- [x] 2.2 Write `cases.py`, covering the candidate cuts in the four categories, the 3-word and text-follows rules, seeded selection per message, `truth`, `truthWord`, `lang`, `id`, `source`, `--per-category` and `--limit` (design 3). The build command writes `sets/<name>.jsonl` and prints counts by language and category, and fails when there are no cases. Verify with `server/tests/eval/test_cases.py`, covering every "Case generation" scenario: the English and Arabic mid-word cases, too little typed, and determinism. Also check that each category's cut lands where its definition says, in English, Arabic and mixed text.

## 3. Run, metrics, report

- [x] 3.1 Write `run.py`, which:
  - uses the server settings with the cache forced off;
  - passes an empty library and KB, with source flags `canned: false, kb: false, transcript: true`;
  - runs with `--samples` and `--concurrency`;
  - counts errors and timeouts without stopping;
  - refuses the offline model without `--allow-fake`;
  - prints the external-model reminder and the request count;
  - writes `samples.jsonl` (design 4).

  Verify with `server/tests/eval/test_run.py`, using the scripted LiteLLM double:
  - no request carries approved responses or KB passages, and each carries its transcript;
  - a scripted timeout counts as an error and the run finishes;
  - the offline model is refused without the flag;
  - the reminder is printed for an external model;
  - nothing is written outside the run folder.
- [x] 3.2 Write `metrics.py` and `report.py`: shown, withheld, errors, word completion, spacing errors and latency, by language and category; the example sections; `report.md` and `report.json` (design 5 and 6). Verify with `server/tests/eval/test_metrics.py`, covering every "Metrics and report" scenario (Arabic wrong join, finished word kept, spacing error counted) plus diacritic folding. Also verify an end-to-end test: build from `chat-example.txt`, run it with `--allow-fake`, and check that both reports exist and their figures add up.

## 4. Documentation and live check

- [x] 4.1 Rewrite `docs/COMPLETION-EVAL.md`:
  - the workspace;
  - both input formats, with the example file;
  - the build and run commands with their options;
  - what each metric means;
  - the no-PII rule.

  Update CLAUDE.md (the commands table, and the layout entry for `assist_eval`). Update the `completion-eval` main spec's Purpose, which still mentions retired replays and a gate, to describe the dataset and the local eval. Verify that every command in the docs runs as written.
- [x] 4.2 Live check with Gemini: build a set from `chat-example.txt`, run it with `--samples 3`, and confirm the report's figures and examples make sense. Check by eye that the word-completion failures shown are real. Note the request count, the duration and the headline figures in the change (`live-check.md`). Verify that nothing outside `eval/local/` changed (`git status`).
- [x] 4.3 Final gate: `npm test`, `npm run typecheck` and `openspec validate completion-eval-local --strict` all pass.
