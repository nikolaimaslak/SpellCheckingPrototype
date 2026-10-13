# Design

## Context

- The polish eval (`server/assist_eval/polish_*.py`, spec `polish-eval`) imports only CSV: `read_pairs` detects the layout, collapses identical pairs and returns `Imported(cases, rows, skipped, layout)`; `build_command` applies `--limit` and writes `<set>.jsonl` and `<set>.meta.json`. The run (`polish_run.run_command`) prints a reminder for external models but sends the text anyway.
- `ModelChoice.external` (`server/assist/settings.py`) already decides whether text leaves the machine: Gemini, or any model whose API base isn't a loopback address. The eval reads it through `eval_settings`.
- QALB-2014's shared-task release has line-aligned files: `QALB-2014-L1-{Train,Dev,Test}.sent.no_ids` and `.cor.no_ids` (dev: 1,017 lines each, up to 550 characters). The files with IDs (`.sent`) start each line with a document id; the `.no_ids` files don't.
- All of this is Tier 2 tooling (server-side Python, command line). Nothing touches the browser, the editable DOM, undo or RTL layout.

## Goals / Non-Goals

**Goals:**
- Import two line-aligned files with the same as-is rules, duplicates handling and subset options as a CSV.
- Make the "never send this set to a hosted model" rule a check, not a reminder.

**Non-Goals:**
- Per-sentence error types from ARETA, M2 input, or QALB-specific presets (see proposal).

## Decisions

**1. The second input is chosen by `--target-file`, not by file extension.**
With `--target-file`, the positional input is the source file and both are read as plain text; without it, the input is a CSV as before. QALB's files have no meaningful extension (`.no_ids`), so extension sniffing would guess wrong.
*Alternative:* a separate `polish-build-parallel` command. Rejected: same options, same output; one command with one extra option is simpler to document.

**2. One shared pair-collection step.**
`read_pairs` (CSV) and a new `read_parallel` produce `(row number, source, target, error type)` rows; one function does the skipping, collapsing, `lang` and ids for both, so the two inputs can't drift apart. The line number is the row number for parallel files (first line = 1); CSV rows keep their current numbering (header = row 1).
*Alternative:* duplicate the collapsing logic in the new reader. Rejected for drift.

**3. Line splitting keeps every line, including a trailing empty one only if both files have it.**
Files are read with `utf-8-sig`, `\r\n` and `\r` normalized, then split on `\n`; a single final newline doesn't count as an extra empty line. Different counts fail with both counts before anything is written. Empty pairs (either side blank) are skipped and counted, as in the CSV import.

**4. `--local-only` is a set property, checked at run time.**
The build records `"localOnly": true` in `<set>.meta.json`. `run_command` reads the metadata before building the model dependencies; if the set is local-only and `settings.model.external` is true, it prints `✖ set <name> is local-only: <model> sends text outside this machine` and exits 1, before creating the run folder. A set whose metadata is missing counts as not local-only (sets built before this change).
*Alternative:* a run-time `--local-only` flag. Rejected: the person running a set later may not know its origin; the mark has to travel with the set. *Alternative:* store the mark in every case. Rejected: it's a property of the whole set.

**5. `--type` applies only where the input has no type.**
For parallel files every case gets `--type` (default `unknown`). For a CSV, a type column wins; `--type` fills in only when the layout has none, so naming an English dataset's type is possible without a column.

## Risks / Trade-offs

- [The set file is still a reformatted copy of QALB] → It is what the eval needs to run; it stays in the gitignored workspace, and the open licensing question is the one already recorded for the spelling import (proposal, Impact).
- [A local-only set can still be sent out by hand-editing its metadata] → The check guards against mistakes, not intent; the docs state the rule.
- [Old sets lack the mark] → Only QALB needs it, and there is no QALB polish set yet.
- [QALB lines need many fixes, so the length check rejects some correct answers] → The report's rejection list shows them; documented as expected for this text.
