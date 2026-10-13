# Replacing Hunspell with SWEET for Arabic: analysis

October 12, 2026 · Change: `openspec/changes/archive/2026-10-12-sweet-vs-hunspell-analysis/` · Background: [Arabic GEC research notes](arabic-gec-research-notes.md)

**Recommendation: don't replace Hunspell (option 1, plus option 4 for grammar).** Keep Hunspell as the Tier 1 spelling engine for both languages, and leave Arabic grammar to the existing polish program on the production local LLM. SWEET in the browser would cost about 70–140 times today's Tier 1 download and several times its memory. It would also take hundreds of milliseconds per sentence on CPU-only desktops and fit poorly with the per-word underlines, popover and auto-correct. Its weights can't be used commercially today either. SWEET is worth revisiting only as a server-side pass (option 3), and only if a measured comparison shows it beats the local LLM's polish on Arabic and its weights become licensable.

Figures are marked **[measured]** (in this repo, with the source), **[paper]** (from a cited paper or the research notes) or **[estimate]** (derived here, with the derivation).

## The options

1. **Keep Hunspell** (today). Improve Arabic with misspellings lists, the REP table and custom words.
2. **Replace Arabic Hunspell with SWEET in the browser.** An ONNX model in the spell worker, with WebGPU and a WASM fallback. English stays on Hunspell.
3. **Hybrid.** Hunspell stays Tier 1 for underlines, suggestions and auto-correct. SWEET runs on the server (Tier 2) on typing pause or Polish, for context errors and to re-rank Hunspell's Arabic suggestions.
4. **Hunspell plus the local LLM.** Tier 1 unchanged; Arabic grammar is left to the existing polish program (`POST /v1/polish`) on the production local LLM.

## Today: Hunspell

**Download** [measured: `src/spell/wasm/`, `public/dicts/`, `dist/assets/`; gzipped with `gzip -9`]

| Piece | Raw | Gzipped |
|---|---|---|
| `hunspell.wasm` (engine) | 448 KB | 152 KB |
| `hunspell.mjs` (loader) | 64 KB | 18 KB |
| Spell worker bundle | 44 KB | 16 KB |
| English dictionary (`en.aff` + `en.dic`) | 555 KB | 192 KB |
| Arabic dictionary (`ar.aff` + `ar.dic`) | 7.3 MB | 1.5 MB |
| **Total** | **8.4 MB** | **1.9 MB** |

**Memory and load time** [measured: Node 25 on the development Mac, loading the committed WASM and both dictionaries; process RSS before and after each load. The browser worker will differ somewhat.]

| | Load time | Memory added |
|---|---|---|
| English | ~40 ms | ~18 MB |
| Arabic | ~390 ms | ~27 MB |

The load happens once per session in the worker, so typing is never blocked.

**Quality and speed** [measured: `eval/baseline.json`, build 2b27ab2, October 5, 2026; `npm run eval`]

| | English | Arabic |
|---|---|---|
| Intended word is the top suggestion (correction@1) | 72% | 39% |
| Intended word in the top five (correction@5) | 91% | 69% |
| Correct words flagged (false flags) | 0.33% | 0.12% |
| Check latency, p95 per word | 0.011 ms | 0.026 ms |
| Suggestion latency, p95 per word | 26 ms | 129 ms |

The Arabic weakness is uneven. Correction@1 for Arabic hamza errors is 85% and for ta marbuta 95%, but for dotting errors 47%, insertions 38%, deletions 5% and substitutions 2% (`byType` in the baseline).

Detection recall is 100% in both languages, but only because every test misspelling is a non-word by construction (`docs/EVALUATION.md`). Real-word errors such as "هذه الطلب" (wrong demonstrative for a masculine noun) are invisible to Hunspell and aren't measured.

## SWEET in the browser: cost

SWEET is AraBERTv02 (about 135M parameters [paper]) with a tagging head. The best setup is a cascade of two models: one for non-punctuation edits, run twice, then one for punctuation [paper: Alhafni & Habash 2025].

**Download**

| Setup | fp32 | int8 |
|---|---|---|
| One model | ~540 MB | ~135 MB |
| Cascade (two models) | ~1.08 GB | ~270 MB |
| Shared encoder + two heads (needs retraining) | ~540 MB | ~135 MB |

[estimate: 135M parameters × 4 bytes (fp32) or 1 byte (int8), per the research notes; not measured on exported files. About 49M of the parameters are the 64K-entry vocabulary embedding.]

Against today's 1.9 MB, the int8 cascade is about 140 times larger, and one int8 model about 70 times.

**Memory once loaded** [estimate]: about 150–200 MB steady per int8 model in ONNX Runtime Web (WASM), with a peak near 300 MB while the session is created. Derivation: 135 MB of weights, plus a transient copy of the model buffer during session creation, plus about 20 MB of runtime. Activations for a 128-subword sentence are a few MB (12 layers × 128 × 768 floats). The cascade holds two models: about 300–400 MB steady. That's on top of Hunspell's ~18 MB for English, which stays. Today's total is ~45 MB.

**Latency per sentence** [estimate from the research notes: a BERT-base forward pass takes tens of ms on WebGPU and about 100–300 ms on a laptop CPU with WASM; not measured]

| Backend | Per pass | Cascade (3 passes) |
|---|---|---|
| WebGPU | ~20–50 ms | ~60–150 ms |
| WASM, laptop CPU | ~100–300 ms | ~0.3–0.9 s |

Compare with 0.026 ms per Arabic word check and 129 ms per suggestion list today. A cascade on CPU is slower than a suggestion list, and it runs per sentence, on every change to the sentence.

**First use** [estimate]: 270 MB over a 50 Mbit/s office link is about 45 s, before the model compiles. Later sessions read it from the browser cache, if the cache survives.

**Agent-desktop assumptions (unknown for GOSI):**
- Contact-centre agents often work on virtual desktops (VDI) or thin clients with no GPU, which means the WASM figures apply.
- Non-persistent VDI profiles clear the browser cache at logoff, so the full download would repeat every session.
- Many agent desktops run a softphone and several business apps alongside the browser, so a few hundred MB more is a real cost.

Settle these with GOSI's desktop specification before any browser option is pursued.

## Pluses and minuses

| | 1. Keep Hunspell | 2. SWEET in browser | 3. Hybrid (SWEET on server) | 4. Hunspell + local LLM |
|---|---|---|---|---|
| Non-word spelling errors | Detects all; Arabic correction@1 39% | Corrects in context; unmeasured on agent text | Hunspell detects; SWEET could re-rank Arabic suggestions | As option 1 |
| Real-word and grammar errors | None | Yes (QALB-2014: 80.5 F0.5 [paper]) | Yes, on pause or Polish | Yes, through Polish; Arabic quality unmeasured |
| Download | 1.9 MB | +135–270 MB | none added | none added |
| Memory on the agent's machine | ~45 MB | +300–400 MB (cascade) | none added | none added |
| Latency per keystroke | 0.03 ms check | 0.3–0.9 s per sentence on CPU | none on keystroke; server CPU per sentence, unmeasured | none on keystroke; LLM call on Polish |
| Fit with underlines, popover, auto-correct | Built for it | Poor: one rewrite per sentence, no ranked list; needs a new confidence rule | Good: Hunspell keeps them; SWEET adds a layer | Good: unchanged; Polish has its own preview |
| Custom dictionary | Yes | No (needs masking or post-filtering) | Hunspell yes; SWEET needs masking | Yes; polish safety checks protect tokens |
| English | Covered | Still Hunspell: two engines | Covered by Hunspell | Covered |
| Licensing | MPL 1.1, product-safe | Weights research-only / non-commercial | Same as option 2 | Depends on the local LLM's license |
| Engineering effort | Small (lists, REP, custom words) | Large: ONNX export, JS port of `rewrite()` (~200–300 lines), new composer integration, confidence rule | Medium: server runner, span adapter, precedence with Hunspell | None to start; prompt and eval work |
| Maintenance | Dictionary and lists | Re-ship hundreds of MB per model update | Server-side model updates | Prompt and model updates |

## Constraints check

| Constraint | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| No browser extensions | Compliant | Compliant (page code) | Compliant | Compliant |
| Tier 1 without network | Compliant | With conditions: the model must be a same-origin static asset; 135–270 MB strains "static asset" | Compliant: SWEET is Tier 2, our own service, on pause or explicit action | Compliant |
| Engine work in the worker | Compliant | With conditions: ONNX in the worker; WebGPU in workers depends on the browser | Compliant | Compliant |
| No decorations in the editable DOM | Compliant | Compliant, if edits become highlights | Compliant, same | Compliant (Polish preview is outside the editor) |
| One undo path | Compliant | Compliant, if edits go through the transaction path | Compliant, same | Compliant (Polish already does) |
| No GPL/LGPL; licensing clear | Compliant | **In conflict:** QALB research-only, ZAEBUC CC BY-NC-SA 4.0 | **In conflict:** same | With conditions: the local LLM's license |
| English first | Compliant | With conditions: English stays on Hunspell | Compliant | Compliant |
| Arabic first-class | Compliant; ranking weak | Compliant; mixed Arabic/English text untested | Compliant; mixed text untested | Compliant; quality unmeasured |

## Recommendation and triggers

**Chosen: option 1 for spelling, option 4 for grammar.** Keep Hunspell in Tier 1 for both languages. Improve its Arabic ranking with our own sources: misspellings lists, the REP table, custom words, and error types from `npm run telemetry:spelling`. Leave Arabic real-word and grammar errors to the polish program on the local LLM.

Option 2 is rejected on browser cost, fit and licensing. It should not be revisited unless all three triggers below that concern it fire.

| Trigger (measurable) | What it changes | Follow-up change |
|---|---|---|
| A commercial QALB/ZAEBUC license is granted, or we have our own annotated Arabic corpus of several thousand sentences | Removes the licensing conflict for options 2 and 3 | A SWEET-vs-polish eval on agent-style Arabic |
| That eval shows SWEET's Arabic edit F0.5 at least 10 points above the local LLM's polish, at a comparable false-alarm rate | Makes option 3 worth building | A server-side SWEET pass on pause or Polish, with precedence over Hunspell |
| GOSI desktops are confirmed to have WebGPU and persistent browser caches, and an int8 prototype measures under 150 MB download and under 100 ms per sentence | Reopens option 2 | An in-browser cost prototype |
| Arabic correction@1 stays under 50% after list and REP improvements | Shows Hunspell's ranking, not its coverage, is the bottleneck | A suggestion re-ranker (context or frequency based) in Tier 1 |
