# Evaluating grammar polish

The local polish eval imports sentence pairs (a draft with errors and its reference correction) from GEC datasets, runs every draft through the real polish code, and reports how close the corrections come to the references. Spec: `openspec/specs/polish-eval/`.

Like the completion eval (`docs/COMPLETION-EVAL.md`), it is infrastructure: there's no gate, baseline or committed results. Compare reports by eye, for example one model against another, or before and after a prompt change.

## The workspace

Everything the tool reads and writes is under `eval/local/polish/`, which git ignores:

| Folder | Holds |
|---|---|
| `sources/` | Your input files (optional: a path anywhere also works) |
| `sets/<name>.jsonl` | Imported test sets, with `<name>.meta.json` (input, layout, row counts, options) |
| `runs/<time>-<set>-<model>/` | `samples.jsonl` (every answer), `report.md` and `report.json` |

Sets and reports contain the datasets' text. **Never commit them.**

## Datasets and licensing

Two English GEC datasets are known to work:

| Dataset | File | Rows | Cases | Notes |
|---|---|---|---|---|
| GEC-data | `../GEC-data/Grammar Correction.csv` | 2,018 | 2,016 | 36 error types; about half are rewrites polish is told not to make (tautology, idioms, slang, register, abbreviations); 68 pairs need no change; 200 rows start with a list number |
| GEC2 | `../GEC2/College_Level_English_Writing_Dataset.csv` | 15,000 | 78 | Each pair repeated 145–244 times with unrelated metadata; some references invent content (sentence fragments) or change singular "their" |

**Their licenses are unknown.** Until the source and terms are confirmed, treat them like QALB: local, evaluation only, never committed, no word lists or dictionaries built from them, and **don't run them through a hosted model** (Gemini). Use a local model (`docs/REMOTE-OLLAMA.md`).

## Importing a set

```sh
npm run eval:polish:build -- "../GEC-data/Grammar Correction.csv" --name gec-data
npm run eval:polish:build -- ../GEC2/College_Level_English_Writing_Dataset.csv --name gec2
npm run eval:polish:build -- "../GEC-data/Grammar Correction.csv" --name gec-data-200 --limit 200
```

- **Layouts:** recognized by the header: `Ungrammatical Statement` / `Standard English` / `Error Type` (GEC-data), or `original_text` / `corrected_text` / `primary_error_type` (GEC2). For any other CSV, name the columns: `--source-column`, `--target-column` and optionally `--type-column`. Without them, an unknown header fails and lists the columns found.
- **As is:** every row and error type is kept, and the text isn't edited. List numbers ("31. "), and pairs whose reference equals the draft, stay. A row with an empty draft or reference is skipped and counted.
- **Duplicates:** identical pairs become one case with a `count`. That's what turns GEC2's 15,000 rows into 78 cases. Every case counts once in the figures.
- **`--limit N`** keeps N cases, chosen with `--seed` (default 1), in input order. The same input and options always give the same set.
- **Language:** each case is `en`, `ar` or `mixed` (both Arabic and Latin letters), so an Arabic CSV works the same way.

## Running a set

```sh
npm run eval:polish -- --set gec2 --concurrency 1
npm run eval:polish -- --set gec-data-200 --concurrency 1
```

- **Path:** the same polish code as `POST /v1/polish`, called in process: the model, the output cleaning and the safety checks (`protected-changed`, `length-changed`, `line-breaks-changed`). No server needs to be running.
- **Model:** the one the server would use (`COMPLETION_MODEL`, `COMPLETION_API_BASE`, `GEMINI_API_KEY` from `.env` or the environment). For example `COMPLETION_MODEL=ollama_chat/gemma3:12b COMPLETION_API_BASE=http://127.0.0.1:11434`.
- **Cache:** off, whatever `.env` says.
- **Options:** `--samples N` (default 1: polish answers barely vary) and `--concurrency N` (default 4). **Use `--concurrency 1` for a single local GPU:** Ollama queues parallel requests, and the 4-second polish timeout then turns waiting into errors.
- **Errors:** failed and timed-out requests count as errors and don't stop the run.
- **Offline test model:** refused unless you pass `--allow-fake`, which is only for testing the tool.
- **Time:** about one request per second on a local GPU, so the full GEC-data set (2,016 cases) takes about 30–45 minutes; start with `gec2` or a `--limit 200` set.

## The report

`report.md` (and `report.json`, with the same figures and every sample) shows the settings, then a table by language and a table by error type, in the input's order. Each sample gets one outcome:

| Outcome | Meaning |
|---|---|
| Exact | The returned text has the reference's tokens |
| Missed | The draft needed a fix, and came back unchanged |
| Different | The draft needed a fix, and was changed, but not as the reference |
| Kept | The draft needed no fix, and was left alone |
| Over-edited | The draft needed no fix, but was changed |
| Rejected | The safety checks returned the draft; also counted as Missed or Kept, so the check's cost is visible |
| Errors | The request failed or timed out |

- **Tokens:** words (letters, digits and combining marks, so Arabic diacritics stay in their word) and single punctuation characters. Whitespace is ignored ("you ,the" equals "you, the"); letter case counts.
- **P / R / F0.5:** word-level edits from the draft to the returned text, matched against the edits from the draft to the reference. Precision: the share of the model's edits that the reference also makes. Recall: the share of the reference's edits the model made. F0.5 weighs precision twice, as GEC does. These are alignment-based approximations for comparing runs, not ERRANT scores.
- **Rows:** how many dataset rows the cases stand for.
- Latency p50 and p95 are shown for information.

The report then lists every rejection with its reason, and up to 30 samples each of Missed, Different and Over-edited, with the error type, draft, reference and returned text.

**Reading it:**
- Read the per-type rows, not only the overall figure. Types that ask for rewrites (Tautology, Clichés, Mixed Metaphors/Idioms, Slang, Inappropriate Register, Abbreviation Errors, Passive Voice Overuse) should mostly come out as **Missed**: polish is told to fix grammar, spelling and punctuation only, so a high Exact there means the model rewrites more than it should.
- **Different** isn't always wrong: another valid correction counts as Different. Check the examples.
- Some references are themselves wrong. Read the examples before trusting a low figure for a type.

## Not covered

- **No gate or baseline**, and no committed results.
- **No Arabic or mixed-text data yet:** both datasets are English. A synthetic customer-service set (Arabic, mixed text, protected tokens, line breaks) is planned separately.
- **Not comparable with published GEC scores** (M2/ERRANT).
