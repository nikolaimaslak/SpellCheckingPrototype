# Arabic GEC: Research Notes and Implementation Options

Oct 12, 2026

> **Reviewed October 12, 2026.** The text below is unchanged; *[Review: see Rn]* marks point to the [Review comments](#review-comments) at the end. The decision on replacing Hunspell is in [Replacing Hunspell with SWEET for Arabic: analysis](sweet-vs-hunspell-analysis.md).

## Summary

For Arabic, use SWEET (Alhafni & Habash, ACL 2025) as the correction engine and keep the existing DSPy/Gemini module for explanations, rewrites and completion. *[Review: see [R3](#r3)]* SWEET matches or beats every other single Arabic system on QALB, runs on CPU, has public code and pretrained weights, and fits the existing Python-server architecture.

- **Starting point:** a prototype with Hunspell in the browser and a separate Python HTTP server running a DSPy-typed Gemini prompt that returns Smart-Compose-like suggestions. English works in manual tests; nothing is measured yet. *[Review: see [R2](#r2)]*
- **Recommended change:** add SWEET behind the same server, convert its edits into the same suggestion schema (span, replacement, confidence, category), and call the LLM only on demand.
- **Not recommended:** implementing STAGEET (no code, equal or lower accuracy) or ArbESC+ (nine systems for about one extra F0.5 point, reproducibility concerns).
- **Caveat:** all pretrained Arabic GEC weights were trained on QALB (research-only license) and/or ZAEBUC (non-commercial). Check terms before commercial use. *[Review: see [R1](#r1)]*

All scores below are F0.5 from the M2 scorer unless stated.

## Papers reviewed

### SWEET — Enhancing Text Editing for GEC: Arabic as a Case Study

Alhafni & Habash, ACL 2025 ([arXiv 2503.00985](https://arxiv.org/abs/2503.00985)). The reference Arabic edit tagger and the recommended engine.

- **Method:** GEC as sequence tagging. Each AraBERTv02 subword gets an edit label (keep `K`, delete `D`, merge `M`, replace `R_[c]`, insert `I_[c]`, append `A_[c]`); applying the labels yields the corrected text.
- **Labels learned from data:** word-level weighted-Levenshtein alignment with greedy merge/split, then character-level alignment, so no hand-designed tag set is needed.
- **Vocabulary control:** subword projection cut unique edits from 16,221 to 9,060; compression (`K*`, `D*`) and frequency pruning (threshold 10–30) shrink it further with little oracle loss.
- **Punctuation separation:** punctuation is about 40% of QALB-2014 errors. Best system = two non-punctuation passes, then one punctuation pass (80.5 on QALB-2014 test, then state of the art).
- **Other findings:** iterative decoding helps MSA but hurts dialects; LLMs (GPT-4o best) trail fine-tuned models; edit-level majority-vote ensembles reach 81.7–87.2; about 6× faster than Seq2Seq++.

### STAGEET — Stage-wise Typed Edit Tagging

Lou & Akef, arXiv 2608.28614 (July 2026). *[Review: see [R13](#r13)]* Splits correction into four ordered typed stages: spacing, orthography, morpho-lexical, punctuation. Each stage has its own label space and produces an intermediate sentence.

- **Variants:** STAGEET-MH (shared AraBERT encoder, stage adapters and heads, 135M params) and STAGEET-SEP (four independent taggers, 540M).
- **Results:** 80.1 (SEP) and 79.4 (MH) on QALB-2014 test, below SWEET's cascade (80.5). Runtime 46 s on QALB dev vs 35 s for the SWEET cascade.
- **Caveats:** the SOTA claim compares only with single-pass SWEET on dev; the orthography rules for stage assignment are not specified; no code is released.
- **Useful idea:** typed stages give interpretable categories, and the shared-encoder design can halve SWEET's in-browser size.

### ArbESC+ — Arabic Enhanced Edit Selection System Combination

Alrehili & Alhothali, [arXiv 2511.14230](https://arxiv.org/abs/2511.14230). ESC (Qorib et al., NAACL 2022) applied to nine Arabic systems: logistic regression over (system × edit type) features, plus agreement boosting, dual confidence thresholds and span-overlap suppression.

- **Results:** 82.6 on QALB-2014 test and 84.6 on QALB-2015 L1, about +0.9 and +1.7 over SWEET's 4-system ensemble, at 90–92% precision and 62–64% recall.
- **Red flags:** thresholds may have been tuned per test set; unclear what data trained the combiner; several numeric errors (an impossible F1 in Table 2, a "+9.6 points" claim mixing F0.5 and F1); broken or unverifiable citations; no code.
- **Takeaway:** edit-level combination of diverse systems reliably helps. SWEET's own `ensemble.py` gives most of the benefit with tested code.

### Retrieval-Supported Prompting in LLMs for Arabic GEC

Alrehili & Alhothali, IEEE (abstract only reviewed). Compares fixed, dynamically retrieved and hybrid few-shot exemplars drawn from a sentence-level database; reports consistent gains for retrieval, mainly on morphological and syntactic errors.

- **Missing from the abstract:** absolute scores, LLMs used, retrieval method (wording vs error similarity), test-set exclusion.
- **Assessment:** gains are relative to fixed exemplars, not to fine-tuned systems. The real advantage is adaptability: changing the database changes behavior without retraining.
- **Related work:** [Kwon et al. 2023](https://aclanthology.org/2023.arabicnlp-1.9) (GPT-4 up to 65.49 F1 on Arabic GEC); [explanation-based retrieval](https://aclanthology.org/2025.naacl-long.251.pdf) (NAACL 2025); [Encode Errors](https://arxiv.org/abs/2606.15416) (June 2026), retrieval by grammatical-error representations.

## Benchmark comparison

On QALB-2014 test, the SWEET cascade (80.5) is the best single system; only multi-system combinations score higher. Test-set F0.5 as reported by each paper. *[Review: see [R12](#r12)]*

| System | Type | QALB-2014 | QALB-2015 L1 | ZAEBUC | Source |
| --- | --- | --- | --- | --- | --- |
| ArbESC+ (9 systems) | Combination | 82.6 | 84.6 | – | [ArbESC+](https://arxiv.org/abs/2511.14230) |
| SWEET 4-ensemble (incl. GPT-4o) | Combination | 81.7 | 82.9 | 87.2 | [SWEET](https://arxiv.org/abs/2503.00985) |
| SWEET 3-ensemble | Combination | 81.3 | 81.3 | 85.9 | [SWEET](https://arxiv.org/abs/2503.00985) |
| SWEET cascade (NoPnx×2 + Pnx) | Edit tagger | 80.5 | 80.3 | 83.1 | [SWEET](https://arxiv.org/abs/2503.00985) |
| STAGEET-SEP | Edit tagger | 80.1 | – | 81.9 | [STAGEET](https://arxiv.org/abs/2608.28614) |
| Seq2Seq++ (AraBART+Morph+GED) | Seq2seq | 79.6 | 80.3 | 83.1 | [Alhafni et al. 2023](https://aclanthology.org/2023.emnlp-main.396) |
| STAGEET-MH | Edit tagger | 79.4 | – | 82.1 | [STAGEET](https://arxiv.org/abs/2608.28614) |
| GPT-4o (5-shot) | LLM prompt | 77.7 | 79.6 | 82.5 | [SWEET](https://arxiv.org/abs/2503.00985) |

Runtime on QALB-2014 dev (A100, batch 32): SWEET 11.6 s, SWEET cascade 34.8 s, STAGEET 46 s, Seq2Seq++ 218.5 s. ArbESC+ reports 65.6 on the small QALB-2015 L2 test (158 sentences).

## Code, models and data

Two CAMeL Lab repositories cover almost everything: SWEET for the corrector, arabic-gec for the data and annotation tools. Both were cloned and inspected; SWEET's edit extraction was run on test sentences and reproduced the gold corrections exactly.

| Resource | What it gives | Notes |
| --- | --- | --- |
| [CAMeL-Lab/text-editing](https://github.com/CAMeL-Lab/text-editing) (SWEET) | Alignment, edit extraction, compression, pruning, `rewrite()`, training via HF Trainer, `pred_threshold`, edit-level `ensemble.py`, M2 scorer, saved predictions | MIT. ~7,300 lines. Pins ~130 old packages (torch 1.12, transformers 4.30): install only camel-tools, editdistance, transformers, torch. Mixed import paths; `pdb.set_trace()` on reconstruction failures |
| SWEET checkpoints on [Hugging Face](https://huggingface.co/CAMeL-Lab/text-editing-qalb14-zaebuc-pnx) | `text-editing-qalb14-nopnx`/`-pnx`, `-qalb14-zaebuc-nopnx`/`-pnx`, `-coda` | Use qalb14-zaebuc for essays and learner text; coda for dialects |
| [CAMeL-Lab/arabic-gec](https://github.com/CAMeL-Lab/arabic-gec) | Full QALB-2014/2015 release v0.9.1 and ZAEBUC v1.0 in the repo (~1.9 GB), official M2 files, standalone aligner, ARETA error typing | AraBART+GED models need a forked transformers 4.22.2 and a separate environment; ARETA needs Python 3.7; exact +Morph replication needs licensed SAMA 3.1 |

**Licensing:** QALB is granted for internal research and evaluation only, with commercial licensing via CMU. ZAEBUC is CC BY-NC-SA 4.0. The code is MIT, but every pretrained Arabic GEC model discussed was trained on these datasets.

## Integration into the prototype

SWEET slots into the existing Python server as a second producer of the same suggestion schema; the DSPy/Gemini module stays for what SWEET cannot do.

1. Browser sends text to the server when the user pauses typing.
2. Server splits text into sentences (BERT limit: 512 subwords).
3. SWEET runs two non-punctuation passes, then one punctuation pass, on CPU (tens of milliseconds per sentence). *[Review: see [R11](#r11)]*
4. An adapter groups subword edits by word (`word_ids()`), compares each original word with its rewrite, and maps the result to character spans.
5. Rules assign a coarse category; low-confidence edits are dropped.
6. DSPy/Gemini is called on demand to explain non-template edits, rewrite for style, or complete text.

### Mapping SWEET output to the suggestion schema

| Field | From SWEET? | How |
| --- | --- | --- |
| Span / offsets | Yes | Subword edits grouped by word, mapped to original offsets |
| Original → replacement | Yes | Original word vs rewritten word |
| Confidence | Yes | Softmax probability of the predicted label |
| Category | Coarse | Rules on labels (below) |
| Explanation | No | Templates for common categories; LLM for the rest |
| Style rewrite / completion | No | Keep the LLM |

### Category rules on edit labels

- **Spacing:** label is only `M` (merge) or `I_[ ]` (split).
- **Punctuation:** any edit from the punctuation model, or `A_`/`R_` with a punctuation character.
- **Orthography:** `R_` between ا/أ/إ/آ, ة/ه, or ى/ي (hamza, ta marbuta, alif maqsura).
- **Grammar / word form:** everything else.

ARETA gives finer categories but is too slow for interactive use.

### Gotchas

- SWEET's MSA output separates punctuation with spaces; reattach before display.
- QALB is mostly undiacritized: test diacritized input; strip and restore if needed.
- Merge (`M`) and append (`A_`) edits change word boundaries and need special handling in the span adapter.
- QALB is news comments and ZAEBUC student essays: evaluate on 50–100 real user sentences.

## In-browser deployment

BERT-sized taggers can run in the browser via ONNX with transformers.js or onnxruntime-web (WebGPU, WebAssembly fallback); int8 SWEET is about 135 MB per model. Sizes below are estimates from parameter counts (4 bytes/param fp32, 1 byte int8), not measured files.

| Model | Params | int8 download | Notes |
| --- | --- | --- | --- |
| SWEET, one model | ~135M | ~135 MB | AraBERTv02 |
| SWEET cascade | 2 × 135M | ~270 MB | Two separate fine-tunes |
| SWEET shared encoder + 2 heads | ~135M | ~135 MB | Requires retraining (STAGEET-MH design) |
| Distilled 6-layer SWEET | ~85M | ~80–90 MB | Retraining, some accuracy loss |
| GECToR RoBERTa-base (English) | ~125M | ~125 MB | Single model, not ensemble |
| gector-ja | ~110M | ~110 MB | |
| KoBART / Spanish BART | ~125–140M | ~130–140 MB | Seq2seq: ~1 s+ per sentence on WASM |

- **Speed:** a BERT-base forward pass takes tens of ms on WebGPU and roughly 100–300 ms on WASM laptop CPU; SWEET needs three passes per sentence.
- **Size driver:** the 64K vocabulary is about 49M of AraBERTv02's 135M parameters.
- **Porting work:** the edit application (`rewrite`, merges, appends, detokenization) must be rewritten in JavaScript, about 200–300 lines. Validate it against the Python server on the dev set.
- **Checks:** compare int8 vs fp32 F0.5 on dev (rare labels may degrade); confirm the JS WordPiece tokenizer matches Python on Arabic punctuation and digits.
- **Fit:** a 135–270 MB first download suits an extension, installed app or opt-in offline mode; it is cached afterward. Phones are constrained by memory. *[Review: see [R4](#r4)]*

## Open-weight Arabic LLMs

Several Arabic-centric open models exist, but none has published QALB GEC scores; leaderboard rank (OALL) measures knowledge, not minimal-edit correction. Licenses come from secondary sources: verify on each model card.

| Family | Lab | Open sizes | License |
| --- | --- | --- | --- |
| [Jais 2](https://arxiv.org/abs/2608.13580) | Inception/G42, MBZUAI | 8B, 70B | Apache 2.0 |
| Falcon-H1-Arabic | TII | 3B, 7B, 34B | Falcon LLM License |
| Fanar | QCRI | 1-9B, 2-27B | Apache 2.0 |
| ALLaM | SDAIA/HUMAIN | 7B preview | Research license |
| Command R7B Arabic | Cohere | 8B | CC BY-NC 4.0 |
| Qwen3 (multilingual) | Alibaba | 8B–235B | Apache 2.0 |

- Falcon-H1-Arabic tops the Open Arabic LLM Leaderboard as of early 2026 (7B: 71.5%, 34B: 75.4%) ([source](https://annota8.ai/blog/arabic-llm-benchmark-landscape-2026.html)).
- Earlier GEC evidence from the SWEET paper (QALB-2014 dev, 5-shot): Jais-13B-Chat 46.0, Fanar 68.4, GPT-4o 77.2, SWEET cascade 80.3.
- Shortlist for testing retrieval prompting: Fanar-2-27B, Jais-2, Falcon-H1-Arabic 7B/34B, Qwen3.
- If hosting an open model anyway, LoRA fine-tuning on QALB will likely beat prompting, at the cost of the QALB license question.
- Retrieval prompting suits domains far from QALB or small in-house datasets: embed the database, retrieve the top 5–10 similar pairs per input, and score against SWEET on the same sample.

## Other languages

Only English has a mature SWEET-style tagger; Japanese has a community port, and Korean and Spanish have seq2seq models only.

| Language | Edit tagger | Other open options | Main data |
| --- | --- | --- | --- |
| English | [GECToR](https://github.com/gotutiyan/gector) (mature) | LanguageTool, T5/BART fine-tunes | BEA-2019, cLang-8 |
| Japanese | [gector-ja](https://github.com/jonnyli1125/gector-ja) (community) | LLMs | Lang-8, TMU learner corpus |
| Korean | none found | [KoBART gec_kr](https://huggingface.co/Soyoung97/gec_kr), [KoGEC NLLB](https://arxiv.org/abs/2506.11432) | Kor-Lang8/Native/Learner |
| Spanish | none found | [BART fine-tune](https://huggingface.co/SkitCon/gec-spanish-BARTO-SYNTHETIC), LanguageTool | COWS-L2H (small) |

- **English:** gotutiyan's large 3-model ensemble scores 76.4 F0.5 on BEA-2019 test. Its Hugging Face weights are stated as non-commercial despite MIT cards; check Grammarly's official weights for commercial use.
- **Japanese:** gector-ja uses Tohoku BERT and about 19.8M synthetic sentences from Wikipedia. Hobby-level; test before use.
- **Korean:** [Yoon et al.](https://arxiv.org/abs/2210.14389) provide datasets, 14 error types and KAGAS (an automatic error-type annotator).
- **Any output can feed the same schema:** align source and corrected text (SWEET's aligner works for any language) and categorize with ERRANT (English), KAGAS (Korean) or ARETA (Arabic).
- **Training SWEET for another language:** replace the Arabic-specific normalization in the aligner; segment Japanese first (e.g. MeCab); Korean's spaced word units work as is.

## Next steps

The first milestone is measured Arabic corrections from SWEET in the existing server, before any in-browser or multi-language work.

- [ ] Build an evaluation set: 50–100 real user sentences per language, corrected by a native speaker; score with the M2 scorer.
- [ ] Add SWEET (qalb14-zaebuc checkpoints) to the Python server with a minimal dependency set.
- [ ] Write the span adapter and category rules; feed results into the DSPy suggestion schema.
- [ ] Compare SWEET vs current Gemini prompt on the Arabic evaluation set.
- [ ] Measure the current English Gemini setup on the same kind of set; consider GECToR if it wins.
- [ ] Decide licensing for production use of QALB/ZAEBUC-trained weights.
- [ ] Optional: in-browser prototype with int8 ONNX nopnx model; compare size, speed and F0.5 with the server.
- [ ] Optional: edit-level ensemble (SWEET + AraBART+GED) via SWEET's `ensemble.py` if one more F0.5 point matters.

## Sources

**Papers**

- Alhafni & Habash (2025). [Enhancing Text Editing for Grammatical Error Correction: Arabic as a Case Study](https://arxiv.org/abs/2503.00985). ACL 2025. (SWEET)
- Lou & Akef (2026). [STAGEET: Stage-wise Typed Edit Tagging for GEC with Arabic as a Case Study](https://arxiv.org/abs/2608.28614).
- Alrehili & Alhothali (2025). [ArbESC+: Arabic Enhanced Edit Selection System Combination for GEC](https://arxiv.org/abs/2511.14230).
- Alrehili & Alhothali. Retrieval-Supported Prompting in Large Language Models for Arabic Grammatical Error Correction. IEEE (abstract only; full text not located).
- Alhafni, Inoue, Khairallah & Habash (2023). [Advancements in Arabic Grammatical Error Detection and Correction](https://aclanthology.org/2023.emnlp-main.396). EMNLP 2023.
- Kwon et al. (2023). [Beyond English: Evaluating LLMs for Arabic Grammatical Error Correction](https://aclanthology.org/2023.arabicnlp-1.9). ArabicNLP 2023.
- [Explanation based In-Context Demonstrations Retrieval for Multilingual GEC](https://aclanthology.org/2025.naacl-long.251.pdf). NAACL 2025.
- Peng et al. (2026). [Encode Errors: Representational Retrieval of In-Context Demonstrations for Multilingual GEC](https://arxiv.org/abs/2606.15416).
- [Jais 2: A Family of Arabic-Centric Open Large Language Models](https://arxiv.org/abs/2608.13580) (2026).
- Yoon et al. [Towards standardizing Korean GEC: Datasets and Annotation](https://arxiv.org/abs/2210.14389).
- Kim et al. (2025). [KoGEC: Korean GEC with Pre-trained Translation Models](https://arxiv.org/abs/2506.11432).
- Davidson et al. (2020). Developing NLP Tools with a New Corpus of Learner Spanish (COWS-L2H). LREC 2020.

**Code and models**

- [CAMeL-Lab/text-editing](https://github.com/CAMeL-Lab/text-editing) — SWEET code
- [SWEET checkpoints on Hugging Face](https://huggingface.co/CAMeL-Lab/text-editing-qalb14-zaebuc-pnx)
- [CAMeL-Lab/arabic-gec](https://github.com/CAMeL-Lab/arabic-gec) — data, aligner, ARETA, AraBART+GED
- [gotutiyan/gector](https://github.com/gotutiyan/gector) — GECToR reimplementation
- [jonnyli1125/gector-ja](https://github.com/jonnyli1125/gector-ja) — Japanese GECToR
- [Soyoung97/gec_kr](https://huggingface.co/Soyoung97/gec_kr) — Korean KoBART GEC
- [SkitCon/gec-spanish-BARTO-SYNTHETIC](https://huggingface.co/SkitCon/gec-spanish-BARTO-SYNTHETIC) — Spanish BART GEC
- [Arabic LLM leaderboard overview 2026](https://annota8.ai/blog/arabic-llm-benchmark-landscape-2026.html)

## Review comments

Fifteen review comments, from the review of October 12, 2026. Each names the section and sentence it concerns; R1–R4 and R11–R13 are also marked in place above. The text above is left as written.

<a id="r1"></a>**R1. Summary: "Caveat"; Code, models and data: "Licensing".** The license caveat is a blocker, not a footnote. Every SWEET checkpoint is trained on QALB (research only, commercial license via CMU) and/or ZAEBUC (CC BY-NC-SA 4.0). For a commercial product, "use SWEET" means license QALB or retrain on our own data. It belongs in the Summary's first line and first in Next steps. The `-coda` checkpoint's training-data license is not stated.

<a id="r2"></a>**R2. Summary: "Starting point".** Out of date. "Nothing is measured yet" is wrong: the repo has a gated spelling benchmark (`npm run eval`) and a completion eval. The server runs two DSPy programs, `ContinueText` (completion) and `PolishDraft` (on-demand grammar polish with word diff and safety checks). There is no (span, replacement, confidence, category) schema; an adapter would need a new contract or must map onto polish's diff.

<a id="r3"></a>**R3. Summary: first paragraph; Integration into the prototype.** Gemini is dev-only; production uses a local LLM. "Keep the DSPy module", not "DSPy/Gemini". That makes the Open-weight Arabic LLMs section central rather than "if hosting an open model anyway".

<a id="r4"></a>**R4. In-browser deployment: "Fit".** "Suits an extension" conflicts with the no-browser-extensions constraint. A 135–270 MB download per agent desktop needs its own feasibility line (done in the analysis).

<a id="r5"></a>**R5. Integration: "Category rules on edit labels".** Orthography edits (hamza, ta marbuta, alif maqsura) overlap Hunspell spell check and auto-correct for Arabic. Precedence is undefined: which one flags, which may auto-replace, how duplicate underlines are avoided.

<a id="r6"></a>**R6. Integration: steps and "Gotchas".** Protected tokens are missing. URLs, emails, reference numbers, tokens with digits and `$(substitution.fields)` must never change; mask them before tagging or reuse polish's `protected-changed` check.

<a id="r7"></a>**R7. Integration: "Gotchas".** Mixed Arabic/English sentences are common in GOSI chats and absent from QALB and ZAEBUC. Missing as a gotcha and as an evaluation slice.

<a id="r8"></a>**R8. Next steps: "Write the span adapter … feed results into the DSPy suggestion schema".** Don't route SWEET through DSPy. SWEET is not an LLM call; its adapter is deterministic post-processing. DSPy covers only explanation and rewrite calls.

<a id="r9"></a>**R9. Integration: step 1.** "Browser sends text to the server when the user pauses typing" is a new always-on path for composer text; polish runs on demand only. It needs a requirements check and must stay under the telemetry no-text rule.

<a id="r10"></a>**R10. Code, models and data: CAMeL-Lab/text-editing notes.** `pdb.set_trace()` on reconstruction failures would hang a server request. It is required patching, not a quirk.

<a id="r11"></a>**R11. Integration: step 3.** "Tens of milliseconds per sentence on CPU" is unsupported: the only runtimes quoted are on an A100. Three 135M-parameter passes on CPU may take hundreds of ms. It is an estimate at best.

<a id="r12"></a>**R12. Benchmark comparison: table.** Possible copy errors to re-check against the papers: SWEET 3-ensemble shows 81.3 for both QALB-2014 and QALB-2015; Seq2Seq++ and the SWEET cascade both show 80.3 / 83.1 on QALB-2015 and ZAEBUC.

<a id="r13"></a>**R13. Papers reviewed: STAGEET.** "arXiv 2608.28614 (July 2026)": a 2608 arXiv id means August 2026.

<a id="r14"></a>**R14. Next steps: "Build an evaluation set".** Build the Arabic set inside the existing `eval/` tooling rather than a standalone M2 run, and "real user sentences" must follow the synthetic-or-redacted rule. (Written for the dropped `arabic-gec-sweet` eval plan.)

<a id="r15"></a>**R15. Next steps.** The file was untracked and Next steps skips OpenSpec. The first concrete step should be an OpenSpec change gated on the licensing decision (R1). (Written when the plan was `arabic-gec-sweet`; the follow-up is now `sweet-vs-hunspell-analysis`.)
