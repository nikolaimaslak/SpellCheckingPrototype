# Design

## Context

- The completion eval (`server/assist_eval/`, spec `completion-eval`) already runs the server's program in process: it loads the server's settings with the cache forced off, builds the program and the `dspy.LM`, calls the endpoint function directly, and writes `samples.jsonl`, `report.md` and `report.json` under a gitignored workspace. The polish eval follows the same shape so both tools read alike.
- `assist.polish.polish(data, deps)` (Tier 2, server) does everything a polish request does: language, the typed `PolishDraft` program, output cleaning, and the safety checks (`protected-changed`, `length-changed`, `line-breaks-changed`). Calling it unchanged means the eval measures what the Polish button would show.
- The datasets (see proposal) are short English single sentences: GEC-data has 2,018 pairs over 36 error types; GEC2 has 15,000 rows but 78 distinct pairs. Both are outside the repository (`../GEC-data/`, `../GEC2/`), with unknown licenses.
- Everything here is Tier 2 tooling (server-side Python, run from the command line). Nothing touches the browser, the editable DOM, undo or RTL layout.

## Goals / Non-Goals

**Goals:**
- Compare models and prompt changes on the same sets, with figures per error type.
- Keep the import faithful to the files (as is), so the data's own problems stay visible in the report.

**Non-Goals:**
- A linguistic edit classifier (ERRANT) or an M2 file: the figures compare runs; they aren't comparable with published GEC scores.
- A gate or a baseline.

## Decisions

**1. A `polish` subcommand group in the existing `assist_eval` package, not a new package.**
`python -m assist_eval polish-build …` / `polish-run …`, exposed as `npm run eval:polish:build` and `npm run eval:polish`. It reuses `eval_settings` (cache off), the `.env` handling, the external-model reminder and the run-directory naming. Workspace paths become parameterized (`completion` / `polish`) in `paths.py`.
*Alternative:* a separate `polish_eval` package. Rejected: it would duplicate the settings, model checks and run plumbing.

**2. Import by header detection, with column options as the escape hatch.**
The two known layouts are recognized by their column names; anything else fails with the columns found, or uses `--source-column/--target-column/--type-column`. Python's `csv` module reads quoted fields with commas and line breaks; `utf-8-sig` handles the byte-order mark both files start with.
*Alternative:* per-dataset converters. Rejected: two dictionaries of column names are enough.

**3. Duplicates collapsed, figures unweighted.**
GEC2 repeats each pair 145–244 times with unrelated metadata. Sending 15,000 requests for 78 pairs would cost ~190× the time and measure nothing more, and weighting by `count` would let the most repeated pairs dominate. Each distinct pair is one case; `count` is kept for the report's row totals.
*Alternative:* keep every row. Rejected for cost; the user asked for the data as is, and collapsing exact duplicates changes no pair's text.

**4. Token alignment with `difflib` for edits.**
Tokens are runs of `[\p{L}\p{N}\p{M}]` and single punctuation characters (the `regex` module, already a server dependency), so Arabic words with diacritics stay whole and whitespace differences ("you ,the") don't count. `SequenceMatcher(autojunk=False)` aligns source→reference and source→output; each non-equal opcode is an edit `(start, end, replacement tokens)` in source positions. An edit matches when all three are equal. Precision, recall and F0.5 are summed over samples (true positives, system edits, gold edits), as M2 does.
*Alternative:* ERRANT. Rejected: a spaCy model dependency, English only, and heavier than a comparison needs. *Alternative:* character-level diff. Rejected: one wrong letter would split into several edits and misstate recall.

**5. Outcomes from tokens, rejections from the reply.**
`exact`/`missed`/`different`/`kept`/`over-edited` come from comparing token sequences; `rejected` comes from the reply's `reason` and is counted alongside, so a correction the safety check discarded shows up both as a miss and as the check's cost. Errors (HTTP 502/504, exceptions) are their own outcome and are excluded from precision and recall.

**6. Defaults: 1 sample, concurrency 4.**
Polish runs at temperature 0.2 and answers are nearly deterministic; the GPU benchmark showed 10/10 and 9/10 identical repeats. One sample keeps a 1,000-case run at ~10–20 minutes on a local model. For a single local GPU, the docs recommend `--concurrency 1`, since Ollama queues parallel requests and the 4-second timeout would then turn into errors.

**7. Subsets for quick runs: `--limit` with a seed at build time.**
A seeded sample (`random.Random(seed).sample`, kept in input order) makes a 200-case smoke set reproducible. It is a separate set name, so a full set is never silently cut.

## Risks / Trade-offs

- [The references contain mistakes and rewrites polish is told not to make] → Per-error-type rows and the example lists make it visible; filtering is a later, explicit decision.
- [Exact match understates quality when several corrections are valid] → Precision and recall give partial credit; the examples show the alternatives.
- [Unknown dataset licenses] → Sets and reports stay in the gitignored workspace; the docs say not to commit them or send them to hosted models until the licenses are known.
- [Local GPU timeouts at concurrency > 1] → Documented; errors are counted, not hidden.
- [English-only data] → The tool and its tests cover Arabic and mixed text; the report's language columns show which languages a set actually has.

## Open Questions

- Where the two datasets came from and their licenses (the user will confirm); this decides whether they may be sent to Gemini, not how the tool works.
