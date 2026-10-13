# Tasks

## 1. Analysis document

- [x] 1.1 Create `docs/sweet-vs-hunspell-analysis.md` with a one-paragraph answer at the top (recommendation and the main reason) and a section per option from the proposal. Verify the four options are present and the top paragraph names one of them.
- [x] 1.2 Write the "Today: Hunspell" section from figures measured in this repo: download sizes (`src/spell/wasm/`, `public/dicts/`, raw and gzipped), memory and load time per language, and the Arabic and English figures from `eval/baseline.json` (correction@1, correction@5, false flags, check and suggest latency). Verify every number names its source file or the command that produced it.
- [x] 1.3 Write the "SWEET in the browser" cost section: download (int8 and fp32, one model and cascade), memory once loaded, latency per sentence on WebGPU and WASM, and the agent-desktop hardware assumptions. Label each figure as measured, from a paper, or estimated, and show how estimates were derived. Verify no unlabeled figure remains.
- [x] 1.4 Write the pluses-and-minuses table: each option against quality (non-word, real-word and grammar errors), browser pressure, latency per keystroke, fit with underlines, popover, auto-correct and custom dictionary, English coverage, licensing, engineering effort and maintenance. Verify every cell is filled, or says "unknown" with what would settle it.
- [x] 1.5 Write the constraints check: each option against the hard constraints (no extensions, Tier 1 without network, worker-only engine work, no DOM decorations, one undo path, licensing, English first, Arabic first-class). Verify each option is marked as compliant, compliant with conditions, or in conflict, with the reason.
- [x] 1.6 Write the recommendation and its triggers: the chosen option, what would change it (for example a commercial QALB license, measured browser cost, or the local LLM's Arabic polish quality), and the follow-up change each trigger would start. Verify each trigger names a measurable condition.

## 2. Research notes

- [x] 2.1 Add a "Review comments" section to the end of `docs/arabic-gec-research-notes.md`, leaving the original text unchanged. Carry the 15 comments from the review doc, each with a pointer to the section and sentence it concerns. Mark each mistake in place with a short note linking to its comment, without correcting it: the starting point (two DSPy programs, existing spelling and completion evals), Gemini dev-only with a local LLM in production, "suits an extension" (extensions are forbidden), the STAGEET date (August 2026), the unsupported CPU latency, and the benchmark figures to re-check. Verify each of the 15 comments appears once and each in-place note resolves to its comment.
- [x] 2.2 Link the notes and the analysis both ways, then commit the notes. Verify `git log -- docs/arabic-gec-research-notes.md` shows the commit and the original sections are unchanged apart from the in-place notes.

## 3. Review

- [x] 3.1 Add the analysis to CLAUDE.md's reading list and check it renders with Arabic examples readable right to left. Verify `git status` shows only the two docs and CLAUDE.md changed, then ask the user to review the recommendation.
