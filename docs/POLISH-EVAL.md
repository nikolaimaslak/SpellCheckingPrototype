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

Three datasets are known to work: two English GEC CSVs, and QALB-2014 for Arabic.

| Dataset | File | Rows | Cases | Notes |
|---|---|---|---|---|
| GEC-data | `../GEC-data/Grammar Correction.csv` | 2,018 | 2,016 | 36 error types; about half are rewrites polish is told not to make (tautology, idioms, slang, register, abbreviations); 68 pairs need no change; 200 rows start with a list number |
| GEC2 | `../GEC2/College_Level_English_Writing_Dataset.csv` | 15,000 | 78 | Each pair repeated 145–244 times with unrelated metadata; some references invent content (sentence fragments) or change singular "their" |

**The two CSVs' licenses are unknown.** Treat them as local and evaluation only: never committed, no word lists or dictionaries built from them. Running them on Gemini was accepted for model comparison (October 2026); prefer a local model (`docs/REMOTE-OLLAMA.md`).

### QALB-2014 (Arabic)

QALB-2014's shared-task release comes with line-aligned text files: the text as written and its correction, one sentence-sized chunk of an Al Jazeera news comment per line (dev: 1,017 lines, about 300 characters each, up to 550). In `../arabic-gec/data/gec/QALB-0.9.1-Dec03-2021-SharedTasks/data/2014/`:

| Split | Source file | Target file |
|---|---|---|
| Dev | `dev/QALB-2014-L1-Dev.sent.no_ids` | `dev/QALB-2014-L1-Dev.cor.no_ids` |
| Test | `test/QALB-2014-L1-Test.sent.no_ids` | `test/QALB-2014-L1-Test.cor.no_ids` |

Use the `.no_ids` files (the others start each line with a document id) with punctuation and diacritics kept (not `.nopnx` or `.dediac`): polish is asked to fix punctuation too.

```sh
Q=../arabic-gec/data/gec/QALB-0.9.1-Dec03-2021-SharedTasks/data/2014/dev
npm run eval:polish:build -- $Q/QALB-2014-L1-Dev.sent.no_ids --target-file $Q/QALB-2014-L1-Dev.cor.no_ids --name qalb14-dev --type qalb14 --local-only
npm run eval:polish:build -- $Q/QALB-2014-L1-Dev.sent.no_ids --target-file $Q/QALB-2014-L1-Dev.cor.no_ids --name qalb14-dev-200 --type qalb14 --local-only --limit 200
```

- **Licensing:** QALB is licensed for internal research and evaluation only, with no redistribution or modification. Always import it with **`--local-only`**: runs of the set on a model that sends text outside the machine (Gemini, or an API base that isn't a loopback address) are then refused. Never commit the set or its reports, and don't build word lists from it. The set file holds the same text in the eval's format; whether that counts as a modification is the open question also noted for the spelling import (`docs/EVALUATION.md`).
- **What to expect:** these are native speakers' informal comments, with far more errors per line than an agent's draft (several misspellings per line plus punctuation). Exact matches are rare, some correct answers trip the safety check's length limit (listed under Rejections), and QALB normalizes some spellings a careful polish may leave alone. Read it as a measure of Arabic correction ability, not of expected agent results.
- **No error types:** every case gets the `--type` value, so the report has one type row.

## Importing a set

```sh
npm run eval:polish:build -- "../GEC-data/Grammar Correction.csv" --name gec-data
npm run eval:polish:build -- ../GEC2/College_Level_English_Writing_Dataset.csv --name gec2
npm run eval:polish:build -- "../GEC-data/Grammar Correction.csv" --name gec-data-200 --limit 200
```

- **Inputs:** a CSV, or two line-aligned text files: the source file, and `--target-file` with the reference corrections (line *n* corrects line *n*). Different line counts fail with both counts; line endings and a byte-order mark are handled.
- **CSV layouts:** recognized by the header: `Ungrammatical Statement` / `Standard English` / `Error Type` (GEC-data), or `original_text` / `corrected_text` / `primary_error_type` (GEC2). For any other CSV, name the columns: `--source-column`, `--target-column` and optionally `--type-column`. Without them, an unknown header fails and lists the columns found.
- **As is:** every row and error type is kept, and the text isn't edited. List numbers ("31. "), and pairs whose reference equals the draft, stay. A row with an empty draft or reference is skipped and counted.
- **Duplicates:** identical pairs become one case with a `count`. That's what turns GEC2's 15,000 rows into 78 cases. Every case counts once in the figures.
- **`--limit N`** keeps N cases, chosen with `--seed` (default 1), in input order. The same input and options always give the same set.
- **Language:** each case is `en`, `ar` or `mixed` (both Arabic and Latin letters), so Arabic input works the same way.
- **`--type T`:** the error type for cases whose input has none (parallel files, or a CSV without a type column); default `unknown`.
- **`--local-only`:** stored with the set; running it on a model that sends text outside the machine is refused before any request. Use it for every licensed corpus.

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
- **Arabic only from QALB-2014** (news comments), and no mixed-text data. A synthetic customer-service set (Arabic, mixed text, protected tokens, line breaks) is planned separately.
- **Not comparable with published GEC scores** (M2/ERRANT).
