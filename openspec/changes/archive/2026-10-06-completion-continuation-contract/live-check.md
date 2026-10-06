# Live checks with Gemini (tasks 4.1 and 4.2), 2026-10-06

Model `gemini-3.5-flash-lite`, cache off, 60 cases of `eval/completion/cases.jsonl` × 5 samples, synthetic text only. "word/rest" is the retired contract rebuilt in the scratchpad (signature and assembly as of the archived `dspy-assist-service`), measured in the same run.

## 4.1 Run 1: the signature as designed

| | word/rest | continuation |
|---|---:|---:|
| Shown | 75.3% | **92.7%** |
| Withheld or error | 18.3% | 0.0% |
| Seam word correct | 100.0% | 97.1% |
| Spacing errors | 0.0% | 0.0% |
| Latency p50 | 666 ms | 639 ms |
| Shown en / ar / mixed | 74.4 / 84.4 / 62.0% | 98.1 / 90.0 / 80.0% |
| Shown mid-word / finished-word | 75.5 / 63.1% | 100.0 / 98.5% |
| Shown after-punctuation / after-space | 87.5 / 83.3% | **72.5** / 83.3% |
| Shown new-sentence / details | 72.0 / 80.0% | 80.0 / 100.0% |

- Wrong seams: `ar-mid-details` ("التفا" + "اصيل…", a doubled alef), and `en-mid-leibniz` ("Leib" + "n would…", letters dropped).
- Empty after punctuation: `en-punct-colon` ("Here is what I found:"), `ar-punct-colon` ("إليك ما وجدته:") and `mx-punct-reset` ("…رابط الـ reset،"). The conversation gives the model nothing to state, so an empty answer follows the "never invent" rule.

## 4.1 Run 2: punctuation rule tuned (design 4)

The added line: "After a space or punctuation, including a colon that introduces what follows, the agent is waiting for the next words: suggest them. Return an empty `continuation` only when no continuation fits the conversation at all." It sits after the case rules, and the old closing sentence is gone.

| | word/rest | continuation |
|---|---:|---:|
| Shown | 74.0% | **93.0%** |
| Withheld or error | 19.3% | 0.0% |
| Seam word correct | 100.0% | 96.5% |
| Spacing errors | 0.0% | 0.0% |
| Latency p50 | 648 ms | 625 ms |
| Shown en / ar / mixed | 73.1 / 84.4 / 58.0% | 94.4 / 97.8 / 80.0% |
| Shown mid-word / finished-word | 78.2 / 56.9% | 100.0 / 92.3% |
| Shown after-punctuation / after-space | 90.0 / 83.3% | **75.0** / 83.3% |
| Shown new-sentence / details | 64.0 / 73.3% | 96.0 / 100.0% |

- Wrong seams: `ar-mid-details` ("التفا" + "اصيل", doubled alef) and `ar-mid-password` ("المرو" + "ُرور", "رو" repeated). Both are Arabic letters repeated at the join.
- Empty after punctuation: the same three cases as run 1.

**Acceptance (design 4):**
- shown at least the word/rest figure: **met** (93.0% against 74.0%);
- spacing errors 0%: **met**;
- after-punctuation at least 80%: **not met** (75.0%);
- seam correct at least 97%: **not met** (96.5%; 97.1% in run 1).

Raised with the user.

## 4.2 Spot checks, the prefixes that failed on 2026-10-06 (3 samples each, server code)

| Typed | Shown |
|---|---|
| `I would be happ` | "y to help you with that." ×3 |
| `…nothing will h` | "appen to your accrued benefits." / "appen to it." / "appen to your contributions." |
| `…your request ` | "has been received and will be processed within…" ×3 |
| `…تم استلا` | "م طلبك وسيتم معالجته خلال ثلاثة أيام عمل، …" ×3 |
| `…فتح حساب` | " أبشر." ×3 |
| `…you could have be` | "en confused with other machine learning…" / "en confused with fine-tuning…" |
| `…سأرسل لك التفا` | "اصيل قريباً." and two variants: the doubled alef every time |

**Decision (user, 2026-10-06): accept as is.** The after-punctuation target is relaxed to the measured 75%: the remaining empties are correct non-answers on conversations that give nothing to state. The seam target is relaxed to the measured 96.5%: Arabic letters repeated at the join are tracked as KI-6. Not pursued: an Arabic-only overlap repair, or a browser dictionary check.
