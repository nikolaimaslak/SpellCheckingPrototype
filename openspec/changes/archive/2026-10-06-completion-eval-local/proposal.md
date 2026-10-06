# Proposal

## Why

There's no working completion eval. The old benchmark and recorded replays were retired with the Node server, and the comparisons this week ran from throwaway scratchpad scripts. Each prompt change needs the same check, and it should take one command, not a hand-written script.

The data should also be closer to real use. Today's 60 hand-written cases come with hand-picked expectations. Agents' own messages carry their real next words, and cutting them at different points gives as many cases as needed, with ground truth for free.

The goal is **working infrastructure** first:
- build a test set from chat samples or plain text;
- run it against the current completion program;
- read a report.

Everything stays in a local, gitignored folder, so a team member can use their own (non-PII) material.

Serves **PER #60145** (auto-complete), formal Req 3.1–3.4, **Phase 3**. It's infrastructure for every later completion change.

## What Changes

- **A local eval workspace, `eval/local/completion/`, which git ignores,** with:
  - `sources/` (your input files);
  - `sets/` (generated test sets);
  - `runs/` (raw answers and reports).

  Nothing in it is committed.
- **`npm run eval:completion:build`** turns input into a test set:
  - **Chat text** (the default): turns marked `Customer:` / `Agent:` (or `العميل:` / `الموظف:`), conversations separated by `---`.
  - **Plain text** (`--plain`): paragraphs, or optionally sentences, treated as agent messages with no conversation.
  - **Cases:** every agent message is cut at deterministic points (seeded) in four categories, each case recording the real text that followed:
    - mid-word;
    - end of word;
    - after a space;
    - after punctuation.

  The format is documented, and a committed synthetic example file shows it.
- **`npm run eval:completion`** runs a set through the real completion program, in process:
  - **Model:** the one the server would use (`COMPLETION_MODEL`, `GEMINI_API_KEY`).
  - **Context:** canned responses and the knowledge base always off, the conversation on.
  - **Settings:** LLM cache off, N samples per case, bounded concurrency.
  - **Errors and timeouts** are counted and don't stop the run.
- **Report** (`report.md` and `report.json` per run), by language and category:
  - **shown** and **withheld** (`format`), plus failed requests;
  - **word completion:** at mid-word cuts, the completed word equals the agent's real word; at end-of-word cuts, the suggestion doesn't join the finished word;
  - **spacing errors:** a space after a space, or a letter right after punctuation;
  - the failing examples.

  Latency is shown for information.
- **Tooling:**
  - a Python package (`assist_eval`) in the same `uv` project, importing the server code directly, with pytest tests;
  - docs in `docs/COMPLETION-EVAL.md`;
  - CLAUDE.md commands.

## Non-goals

- **No gate, baseline or criteria file,** and no run-to-run comparison command. The reports are compared by eye.
- **No canned responses or knowledge base in the eval.** Whether and how canned responses are used is an open product question, outside this change.
- **No optimizer coupling.** The set format isn't designed as DSPy training data.
- **No use of the committed `eval/completion/cases.jsonl`.** It stays as it is, unused by this tool.
- **No PII handling.** Inputs must be synthetic, public or redacted. The tool reminds you of this when the model is external, but doesn't scan for personal data.
- **No LLM judge,** and no metric beyond the three requested.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `completion-eval`: adds requirements for the local workspace, the input formats, case generation, the eval run, and the metrics and report. The existing "Completion case dataset" requirement is unchanged.

## Impact

- **Code:**
  - new package `server/assist_eval/` (input parsing, cutting, the run, metrics, the report and the CLI);
  - `server/pyproject.toml` packages it;
  - `package.json` gains the `eval:completion:build` and `eval:completion` scripts;
  - `.gitignore` gains `/eval/local/`.
- **Tests:** `server/tests/eval/`, using the offline test model, so no network or key is needed.
- **Docs:**
  - `docs/COMPLETION-EVAL.md` is rewritten;
  - `CLAUDE.md` commands and layout;
  - a synthetic example input, `eval/completion/examples/chat-example.txt`, in English, Arabic and mixed.
- **Dependencies:** none new.
- **Data:** runs send each case's conversation and prefix to the configured model. Inputs must contain no PII.
