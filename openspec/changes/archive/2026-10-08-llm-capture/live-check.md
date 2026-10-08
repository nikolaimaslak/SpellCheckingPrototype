# Live check (task 3.2), 2026-10-08

`gemini-3.5-flash-lite`, cache off, `ASSIST_CAPTURE=errors`. In process, with the telemetry log and the capture log redirected to the session scratchpad, so the real `telemetry/` and `capture/` were untouched. Inputs: the 60 synthetic `cases.jsonl` prefixes, the 26 cases of the local `chat1` set, and 4 polish drafts (English, a placeholder with a reference number, Arabic, and a line break).

`/summary`, "LLM output issues":

| Endpoint | Requests | Failures | Repairs | Reasons |
|---|---:|---:|---:|---|
| complete | 86 | 2% | 6% | empty-answer 5 · multi-sentence 2 · wrong-script 2 · space-after-space 2 · too-long 1 |
| polish | 4 | 0% | 0% | — |

`npm run capture:report` listed the 7 failing or repaired completions, with input, raw answer and shown text:
- **multi-sentence (2):** a second sentence was cut ("ration. Let me check your options…" → "ration."). Expected behavior.
- **space-after-space (2):** the model started with a space after a prefix ending in a space. The server fixed it.
- **too-long (1):** cut at 20 words, mid-clause.
- **wrong-script (2), and these look like a false positive of an existing rule:** both prefixes are Arabic sentences ending in an English word, "أرسلت لك رابط الـ reset،" and "بعد مسح الـ cache ". The model correctly continued in Arabic, but the script rule compares against the prefix's **last word** (English), so the suggestion was withheld. That rule is unchanged by this change, which only reports it. Worth a follow-up: judge the script by the sentence or prefix majority, not the last word.
