# Proposal

## Why

Grammar polish has no benchmark: choosing between Gemini, Gemma 3 12B and the Qwen3 models, or judging a prompt change, rests on a handful of hand-typed drafts and the capture log. Two English GEC datasets are already on disk (`../GEC-data/Grammar Correction.csv`, 2,018 pairs; `../GEC2/College_Level_English_Writing_Dataset.csv`, 15,000 rows), so a local eval that runs them through the real polish program gives a first measurable comparison now.

Serves PER #60254 (grammar is the secondary goal of auto-correct), delivery phase 4 (on-demand grammar polish). It is infrastructure: no product behavior changes.

## What Changes

- **New local polish eval**, alongside the completion eval and built the same way (Python, `server/assist_eval/`, gitignored workspace `eval/local/polish/`):
  - `npm run eval:polish:build -- <csv> --name <set>` imports a GEC CSV into a test set. It reads both on-disk layouts **as is**: every row and error type is kept, and the text is not edited (list numbers like "31. " and pairs with no change stay). The only transformation: exact duplicate pairs are collapsed into one case with a count, because GEC2's 15,000 rows hold only 78 distinct pairs.
  - `npm run eval:polish -- --set <set>` runs every case through the server's polish program in process (selected model, cache off), with the same safety checks the endpoint applies.
  - A report per run: exact match with the reference, edit precision / recall / F0.5 against the reference's word edits, pairs left unchanged when they needed a fix, edits made to pairs that needed none, safety rejections by reason, errors, latency; all by error type and overall, with examples.
- Docs: `docs/POLISH-EVAL.md`, the CLAUDE.md commands table, `.gitignore` coverage confirmed for `eval/local/`.

Assumptions taken from "GEC data as is" (to revisit after the first runs):
- No filtering of error types that ask for rewrites polish is told not to make (tautology, idioms, slang, abbreviations, register). They are reported in their own rows, so their effect on the overall figure is visible rather than hidden.
- No correction of the references, though some are wrong (GEC2 changes singular "their" to "his or her" and completes sentence fragments with invented content). The report shows the examples.
- The synthetic customer-service section (Arabic, mixed text, protected tokens, line breaks) is a later change.

## Non-goals

- No gate, baseline or committed results, like the completion eval.
- No Arabic or mixed-text dataset in this change: both datasets are English. The tool itself handles Arabic and mixed text (tested with synthetic fixtures), so an Arabic set can be added later without changes.
- No cleaning, curation or redistribution of the GEC datasets. They stay outside the repository and are never committed.
- No change to the polish program, its prompt, the safety checks, or the model selection (a separate polish model setting is a later change).
- No ERRANT-style linguistic edit classification: edits are word-level alignments, so the figures are approximate and for comparing runs.

## Capabilities

### New Capabilities
- `polish-eval`: the local polish eval: importing GEC sentence-pair CSVs into test sets, running them through the polish program, and the report's metrics.

### Modified Capabilities
<!-- None: the polish service, its program and the completion eval are unchanged. -->

## Impact

- **Code:** new modules in `server/assist_eval/` (polish import, run, metrics, report) and a `polish` command group in its CLI; tests in `server/tests/eval/`. Reuses `assist.polish.polish` and the completion eval's settings handling unchanged.
- **Commands:** `eval:polish:build` and `eval:polish` in `package.json`.
- **Dependencies:** none new (Python standard library `csv` and `difflib`).
- **Data and licensing:** the two datasets have **unknown licenses** (the downloaded zips hold only the CSVs). Until their source and terms are known, sets built from them are local and evaluation-only, like QALB. Running them through Gemini sends their text to Google; the run prints the usual reminder, and whether that is acceptable for these datasets is an open question.
- **Workspace:** `eval/local/polish/{sources,sets,runs}`, under the already-ignored `eval/local/`.
