# Proposal

## Why

The polish eval has only English data, but Arabic is first-class. QALB-2014 (`../arabic-gec/data/gec/QALB-0.9.1-Dec03-2021-SharedTasks/data/2014/`) ships exactly what the eval needs, as two line-aligned text files: the text as written (`*.sent.no_ids`) and its correction (`*.cor.no_ids`), 1,017 pairs in dev, about 300 characters a line. The importer reads only CSV, so using QALB today needs a hand-made CSV conversion: an extra, untracked reformatted copy of a dataset whose license grants no right to modify it. Reading the two files directly removes that step. And a set built from licensed data must never be sent to a hosted model, which today only a printed reminder guards.

Serves PER #60254 (grammar is the secondary goal of auto-correct), delivery phase 4. Infrastructure: no product behavior changes.

## What Changes

- `npm run eval:polish:build -- <source-file> --target-file <target-file> --name <set>` imports two line-aligned plain-text files: line *n* of the target is the correction of line *n* of the source. Different line counts fail with both counts. Text is kept as is, as in the CSV import; empty lines are skipped and counted, identical pairs collapse with a count, and `--limit` / `--seed` work the same. Every case gets the error type given by `--type` (default `unknown`).
- `--local-only` marks a set (CSV or parallel files) as never to be sent outside the machine. Running such a set with a model that sends text outside the machine (Gemini, or a non-loopback API base) fails before any request, naming the set and the model.
- Docs: `docs/POLISH-EVAL.md` gains the parallel-file input and a QALB-2014 section (which files, `--local-only`, licensing, what to expect from news-comment text); the CLAUDE.md commands row mentions `--target-file`.

## Non-goals

- No per-sentence error types from QALB's ARETA word tags: every QALB case is one type (`--type`), so the report has no per-type breakdown for it.
- No support for QALB's M2 files or its official scorer; the eval keeps its own token metrics.
- No change to the CSV import's behavior, the run, the metrics or the report beyond the local-only refusal.
- No QALB-2015 or ZAEBUC presets: they work if they come as line-aligned files, but aren't documented or tried here.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `polish-eval`: the import requirement gains the parallel-file input and the local-only mark; the run requirement gains the refusal to send a local-only set outside the machine.

## Impact

- **Code:** `server/assist_eval/polish_cases.py` (parallel-file reader, `--type`, `--local-only` in the set's metadata), `server/assist_eval/polish_run.py` (refusal), `server/assist_eval/__main__.py` (options); tests in `server/tests/eval/test_polish_eval.py`.
- **Dependencies:** none new.
- **Data and licensing:** QALB-2014 is licensed for internal research and evaluation only, with no redistribution or modification. The importer reads the files without rewriting them; the set it writes (the same text, one JSON line per pair) stays in the gitignored workspace, like the QALB spelling set. Whether that set itself counts as a modification remains the open question already recorded for the spelling import. Reports show figures plus examples and stay local.
