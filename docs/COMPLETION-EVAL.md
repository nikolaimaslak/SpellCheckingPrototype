# Evaluating inline completion

**Status: the live completion benchmark and the recorded replays are retired** until the completion eval is redesigned in Python, in its own change. They ran cases in process through the former Node server, and their recordings were keyed to that server's prompt text, so they can't run against the Python/DSPy server (`server/assist/`). Until the redesign lands, there is **no completion quality gate**.

What remains:

| Layer | Where | Runs in |
|---|---|---|
| Server tests: retrieval, assembly, the endpoints, the offline model, with fixed model answers | `server/tests/` (pytest) | `npm test` |
| Every English spec scenario of completion-service, polish-service and assist-service | `server/tests/test_scenarios_en.py` | `npm test` |
| The case dataset | `eval/completion/cases.jsonl`, loaded and validated by `eval/completion/cases.ts` | `npm test` (loader test) |
| The last live run on the Node server | `eval/completion/reference/node-server.md` and `.json` | reference only |

## The dataset

`eval/completion/cases.jsonl` holds one case per line, about 60 of them: made-up, off-domain, generic chat in English, Arabic and mixed Arabic/English. Each case has:
- `id`;
- `lang` (`en`, `ar` or `mixed`);
- `category`: `mid-word`, `finished-word`, `after-punctuation`, `after-space`, `new-sentence` or `details`;
- `prefix`, the agent's text so far;
- an optional `transcript`;
- optional expectations:
  - `seamWord`: the word being typed, as it must read after the suggestion. Mid-word cases need one with a single plausible completion;
  - `mustNotInvent`: details that may only appear if the context has them;
  - `expectShown`.

All cases are made-up text, because a live run sends them to the configured model.

## The reference report

`eval/completion/reference/node-server.md` is one run of the retired benchmark (5 samples per case, `gemini-3.5-flash-lite`) on the Node server, made just before it was replaced. It has every criterion's value, the metrics per language and category, and the problem cases. The redesigned eval must be compared with it.

## Checking by hand until then

Run the server with Gemini (`GEMINI_API_KEY` in `.env`) and post a few of the dataset's prefixes to `/v1/complete`, or type them in the demo. Compare the suggestions with the reference report by eye. Use made-up text only.
