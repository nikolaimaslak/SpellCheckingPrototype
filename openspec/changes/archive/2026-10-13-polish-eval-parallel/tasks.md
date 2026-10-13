# Tasks

## 1. Import

- [x] 1.1 Factor the skipping, collapsing, `lang` and id assignment out of `read_pairs` into one shared step in `server/assist_eval/polish_cases.py`, and give the CSV path `--type` as the fallback error type; verify the existing import tests still pass and a new test shows `--type` fills in for a CSV without a type column while a type column wins
- [x] 1.2 Add `read_parallel` (UTF-8 with or without BOM, line endings normalized, a final newline not counted as a line, line numbers from 1, line-count mismatch fails with both counts) and the `--target-file` and `--type` options in `__main__.py`; verify with pytest covering the English, Arabic-with-type and mixed parallel scenarios, the line-count mismatch (nothing written), the empty-line skip with line numbers kept, and duplicates collapsing with `--limit` determinism
- [x] 1.3 Add `--local-only` to the build: record `localOnly` in `<set>.meta.json` and print it in the summary; verify with pytest that the metadata carries the mark and the summary says so

## 2. Run

- [x] 2.1 Refuse a local-only set in `polish_run.run_command` when the selected model is external, before building dependencies or creating the run folder, naming the set and the model; verify with pytest that Gemini is refused (no run folder, no model call), a loopback `ollama_chat` model is allowed past the check, and a set without metadata runs as before

## 3. Documentation

- [x] 3.1 Update `docs/POLISH-EVAL.md` (parallel-file input, `--type`, `--local-only`, a QALB-2014 section: which files, the command, local models only, licensing, what to expect from news-comment text) and the CLAUDE.md `eval:polish:build` row; verify the documented QALB command runs as written with `--limit 20` and the offline test model, and that running it with `COMPLETION_MODEL=gemini` is refused

## 4. Integration

- [x] 4.1 Run `npm test` and `npm run typecheck`; verify both pass
- [x] 4.2 Import QALB-2014 dev (`--local-only --type qalb14`) and a seeded 200-line subset, check the printed counts (1,017 lines, none skipped), and run the subset on Gemma 3 12B, Qwen3 4B Instruct and Qwen3 8B through the tunnel with `--concurrency 1`; verify the three reports are complete and summarize the figures for the user
