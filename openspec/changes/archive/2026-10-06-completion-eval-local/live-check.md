# Live check (task 4.2), 2026-10-06

Set built from `eval/completion/examples/chat-example.txt` (seed 1, 1 cut per category and message): 23 cases (en 11, ar 8, mixed 4; mid-word 6, end-of-word 6, after-space 6, after-punctuation 5). Run with `gemini-3.5-flash-lite`, 3 samples per case: 69 requests, about 20 s, and the cache was off.

| | all | mid-word | end-of-word | after-space | after-punctuation |
|---|---:|---:|---:|---:|---:|
| Shown | 91.3% | 100% | 66.7% | 100% | 100% |
| Withheld / errors | 0% / 0% | | | | |
| Word completion correct | 76.7% | 66.7% | 91.7% | — | — |
| Spacing errors | 0% | | | | |

Latency p50 702 ms, p95 999 ms.

**Failures, checked by eye (7 samples in 3 cases):**
- **"…up to date, and" + "I can help you…":** a real error. The suggestion joins the finished word ("andI"). The end-of-word metric caught it.
- **"…وتم تسجي" + "له بنجاح." (3/3):** a valid alternative. The model wrote "تسجيله" where the agent wrote "تسجيل".
- **"…في فتح حساب" + " أبشر الخاص بك." (3/3):** a valid alternative. "حساب" is a whole word, and the agent continued to "حسابك".

The metric is "matches the agent's real word", as specified, so it also counts valid alternatives as wrong. `docs/COMPLETION-EVAL.md` now says so and asks readers to check the examples.

`git status` showed nothing under `eval/local/`.
