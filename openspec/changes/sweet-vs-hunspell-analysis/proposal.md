# Proposal

## Why

The initial idea behind the Arabic GEC research was to replace Hunspell with SWEET (Alhafni & Habash, ACL 2025), a context-aware Arabic edit tagger. Hunspell picks the right Arabic correction poorly: in the spelling benchmark (`eval/baseline.json`) the intended word is the top suggestion only 39% of the time (69% in the top five), against 72% and 91% for English. It also can't see real-word errors such as "هذه الطلب". But SWEET is a 135M-parameter model, and moving it into the browser puts heavy pressure on the agent's machine. Before committing to either direction, we need a written analysis of the idea's pluses and minuses and a recommendation.

Serves PER #60254 (spelling first, grammar secondary; Arabic + English). Decision work for delivery phases 1–2 (Tier 1 spelling engine) and 4 (grammar polish). No product behavior changes.

## What Changes

- A written analysis, `docs/sweet-vs-hunspell-analysis.md`, of replacing Hunspell with SWEET for Arabic. It compares the options below against the project's constraints and ends with a recommendation and the conditions that would change it.
- The research notes (`docs/arabic-gec-research-notes.md`) are committed with their original text unchanged, plus a review section with the comments and a pointer to each mistake, and linked from the analysis.
- No code, specs, dependencies or data are added.

### Options the analysis compares

1. **Keep Hunspell** (today), improving Arabic through misspellings lists, the REP table and custom words.
2. **Replace Arabic Hunspell with SWEET in the browser** (ONNX, WebGPU with WASM fallback); English stays on Hunspell.
3. **Hybrid:** Hunspell stays Tier 1 for underlines, suggestions and auto-correct; SWEET runs server-side (Tier 2) on typing pause or Polish, for context errors and to re-rank Hunspell's Arabic suggestions.
4. **Hunspell plus the local LLM:** Tier 1 unchanged; Arabic grammar left to the existing polish program on the production local LLM.

### Pluses of SWEET over Hunspell (to be weighed in the analysis)

- Uses sentence context: catches real-word, agreement and word-form errors that a dictionary can't.
- Handles clitics and affixes, a known Hunspell weakness for Arabic.
- One model corrects spelling, spacing, punctuation and grammar.
- Leads single systems on QALB-2014 (80.5 F0.5 for the cascade); learned from data rather than a hand-maintained dictionary.
- Runs on CPU; MIT code with public weights.

### Minuses (to be weighed in the analysis)

- **Browser pressure:**
  - Download: about 135 MB int8 for one model, 270 MB for the cascade (estimates), against 1.9 MB gzipped for today's whole Tier 1 (engine plus both dictionaries; 1.5 MB of it Arabic).
  - Memory: hundreds of MB once loaded (to be estimated), against about 45 MB for Hunspell with both languages.
  - Latency: about 100–300 ms per pass on WASM and three passes per sentence, against about 0.03 ms per Arabic word check and 130 ms per suggestion list today.
  - WebGPU is not guaranteed on agent desktops, and low-end and virtual desktops would be hit hardest.
- **Fit with the composer:**
  - SWEET outputs one rewritten sentence, not a ranked suggestion list for the popover.
  - It works per sentence, not per word as typed.
  - The auto-correct confidence rule, misspellings lists and custom dictionary are built on Hunspell, and SWEET has no custom dictionary.
- **Arabic only:** English still needs Hunspell, so the product would run two engines.
- **Licensing:** the pretrained weights are trained on QALB (research-only) and ZAEBUC (CC BY-NC-SA 4.0). Commercial use needs a license, or our own training data.
- **Engineering:** the edit-application code must be ported to JavaScript (about 200–300 lines) and validated. Model updates mean re-shipping hundreds of MB.

## Non-goals

- No implementation, prototype, benchmark run or new dependency. Figures not already measured in this repo are labeled as estimates from the papers and notes.
- No licensing decision. The analysis records the license status and what each option needs.
- No change to Tier 1 or Tier 2 behavior, specs or tests.
- Other languages: English, and the languages in the research notes, are out of scope beyond noting that English stays on Hunspell.

## Capabilities

### New Capabilities

(none: analysis only, `skip_specs: true`)

### Modified Capabilities

(none)

## Impact

- **Docs:** new `docs/sweet-vs-hunspell-analysis.md`; `docs/arabic-gec-research-notes.md` committed with review comments and pointers to its mistakes.
- **Code, APIs, dependencies, data:** none.
- **Follow-ups:** the recommendation may lead to a separate change. Depending on the outcome, that could be a SWEET-vs-polish eval, an in-browser cost prototype, a SWEET server pass, or Hunspell list improvements.
