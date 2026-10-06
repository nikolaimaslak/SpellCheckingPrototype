# Live checks with Gemini (tasks 8.2 and 8.3), 2026-10-06

Model `gemini-3.5-flash-lite`, synthetic text only, LLM cache off, against the Python server over HTTP. The demo page itself was not driven: browser screenshots of the page timed out, so the ghost-text display is left as a manual check.

## 8.2 Spot checks

| Case | Result |
|---|---|
| English mid-word "It hasn't been proce" | "ssed within 3 working days; you will be notified by SMS once it is complete." (3/3) |
| English after a space "…your request " | withheld `format` (3/3): Gemini repeats the finished word in `word` ("request") and, in some answers, starts `rest` without a space |
| Arabic mid-word "…تم استلا" | "م طلبك وسيتم معالجته خلال ثلاثة أيام عمل، وستصلك رسالة نصية عند الانتهاء." (3/3) |
| Mixed Arabic/English conversation | "ك." once, empty once, `format` once |
| Long chat, 34 turns, full conversation | " has been received and will be processed within 3 working days; …" (3/3), 700–930 ms |
| Polish, English and Arabic | corrected, 850 ms and 500 ms |

- Completion latency p50 **776 ms** (max 1311 ms), against **681 ms** in the reference run. The full 34-turn conversation didn't slow it noticeably.
- Gemini's `includeThoughts` costs nothing at `thinkingLevel: minimal`: the usage reports no reasoning tokens.
- Nothing was written under `.cache/`. The server log has only the startup line.

## 8.3 Dataset comparison (5 samples of each of the 60 cases)

| | Shown | Withheld: format | Latency p50 |
|---|---:|---:|---:|
| Node server (reference) | 50.0% | 37.7% | 681 ms |
| Python/DSPy server | 51.7% | 19.0% | 678 ms |

By category, shown (format):

| Category | Reference | Python/DSPy |
|---|---:|---:|
| mid-word | 40.0% (60.0%) | **74.5%** (25.5%) |
| finished-word | 46.2% (49.2%) | 53.8% (32.3%) |
| after-punctuation | 77.5% (10.0%) | **22.5%** (0.0%) |
| after-space | 73.3% (0.0%) | **50.0%** (0.0%) |
| new-sentence | 16.0% (0.0%) | **0.0%** (0.0%) |
| details | 63.3% (36.7%) | 46.7% (26.7%) |

By language, shown: en 50.0% (ref 48.8%), ar 58.9% (ref 51.1%), mixed 44.0% (ref 52.0%).

**Reading:**
- Mid-word and Arabic got clearly better, and `format` withholds halved. Lenient-in-form parsing explains part of that; the rest comes from the model following the field descriptions.
- New words after punctuation, a space or a full stop got clearly worse. The raw answers there are valid, empty `{ "word": "", "rest": "" }`. The model now takes "If nothing sensible can be added, return an empty `word` and `rest`" more often under the JSON adapter's framing, on this off-domain dataset. This is a prompt-shape effect, not a parsing or assembly fault.
- The seam check of the retired judge isn't available; a by-eye check found no wrong seam words, only false alarms of the quick script on the Arabic comma "،".

**Raised with the user before archiving**: this is the "prompt changes shape" risk from design.md, and the later optimizer change is where the program's instructions get tuned.

## 8.3 rerun after revising the completion instructions (user's choice: fix in this change)

Changes to `CompleteSentence`'s instructions:
- after a space or punctuation, `word` is empty and the previous word isn't repeated;
- after a space, comma, colon or full stop, continue with the words the agent would most likely write next;
- return an empty answer only when no continuation fits the conversation at all (was: "if nothing sensible can be added").

Same dataset, 5 samples per case, cache off:

| | Reference (Node) | First run (DSPy) | Revised (DSPy) |
|---|---:|---:|---:|
| Shown, all | 50.0% | 51.7% | **61.0%** |
| Withheld: format | 37.7% | 19.0% | 23.7% |
| mid-word | 40.0% | 74.5% | 70.0% |
| finished-word | 46.2% | 53.8% | 53.8% |
| after-punctuation | 77.5% | 22.5% | 67.5% |
| after-space | 73.3% | 50.0% | 63.3% |
| new-sentence | 16.0% | 0.0% | 28.0% |
| details | 63.3% | 46.7% | 60.0% |
| en / ar / mixed shown | 48.8 / 51.1 / 52.0% | 50.0 / 58.9 / 44.0% | 61.9 / 66.7 / 48.0% |
| Latency p50 | 681 ms | 678 ms | 693 ms |

After punctuation and after a space are still about 10 points below the reference, and mixed text is 4 points below; everything else is above. A by-eye check of 14 new-word suggestions found no invented figures (the order number and amount came from the conversation); one suggestion picked up an off-topic approved response, the existing "prefer approved wording" behavior.
