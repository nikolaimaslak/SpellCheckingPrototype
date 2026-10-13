# Tasks

## 1. Workspace and CLI

- [x] 1.1 Parameterize `server/assist_eval/paths.py` by eval kind (`completion`, `polish`) so the polish workspace is `eval/local/polish/{sources,sets,runs}`; verify the existing completion eval tests still pass and a new test shows the polish folders are created under `eval/local/polish/`
- [x] 1.2 Add the `polish-build` and `polish-run` subcommands to `assist_eval/__main__.py` and the `eval:polish:build` / `eval:polish` scripts to `package.json`; verify `npm run eval:polish:build -- --help` and `npm run eval:polish -- --help` print the options

## 2. Import

- [x] 2.1 Implement the CSV import in `server/assist_eval/polish_cases.py`: header detection for both layouts, `--source-column/--target-column/--type-column`, `utf-8-sig`, skipping and counting empty rows, collapsing identical pairs with `count`, `lang` (`en`/`ar`/`mixed`), seeded `--limit`, `<name>.jsonl` and `<name>.meta.json`, and the printed summary; verify with pytest on small synthetic CSV fixtures covering every Importing scenario (both layouts, duplicates, list numbers kept, unchanged pair, Arabic and mixed rows, unknown header, deterministic subset, empty set)
- [x] 2.2 Import both real files into the local workspace (`gec-data` and `gec2`) and verify the printed counts: 2,018 rows and 2,016 or fewer cases for GEC-data; 15,000 rows and 78 cases for GEC2

## 3. Metrics

- [x] 3.1 Implement tokenization, edit extraction, per-sample outcomes and precision/recall/F0.5 in `server/assist_eval/polish_metrics.py`; verify with pytest covering every Metrics scenario (exact, missed, over-edited, partly right with precision 1 and recall 0.5, Arabic edit, whitespace ignored and case kept, error types separate) and that errors are excluded from precision and recall

## 4. Run and report

- [x] 4.1 Implement the run in `server/assist_eval/polish_run.py`: settings with the cache off, the offline-model refusal without `--allow-fake`, the external-model reminder, the request count, `assist.polish.polish` called in process with `--samples` and `--concurrency`, errors counted, `samples.jsonl` written as it goes; verify with pytest using the offline test model (English and Arabic fixes, `--allow-fake` refusal) and a stub program for a timeout and for a `protected-changed` rejection
- [x] 4.2 Implement `report.md` / `report.json` in `server/assist_eval/polish_report.py`: settings, tables by error type (input order), language and overall, outcome shares, precision/recall/F0.5, rejection reasons, latency p50/p95, and the example lists; verify with pytest on a hand-built sample list that the figures and example lists match
- [x] 4.3 Check that nothing the tool writes shows in `git status` after an import and a fake run; verify by running both and checking `git status --short`

## 5. Documentation

- [x] 5.1 Write `docs/POLISH-EVAL.md` (workspace, input layouts, as-is import and duplicates, commands and options, `--concurrency 1` for a single local GPU, outcomes and metrics, reading the per-type rows, dataset licensing and the hosted-model rule) and link it from CLAUDE.md's reading list and Commands table; verify the documented commands run as written on the `gec2` set with `--allow-fake`

## 6. Integration

- [x] 6.1 Run `npm test` and `npm run typecheck`; verify both pass
- [x] 6.2 Run `eval:polish` on the `gec2` set (78 cases) and on a seeded 200-case `gec-data` subset with one local model through the tunnel; verify the reports are complete and record the headline figures in the change notes for the user
