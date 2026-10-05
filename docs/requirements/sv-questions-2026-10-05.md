**Subject: Composer assistance prototype: status and decisions needed (PER #60254 / #60145)**

Draft, October 5, 2026. Not yet sent. Answers go back into `60145-60254-formal-requirements.md` and `gap-analysis-60145-60254.md`.

---

Hi SV,

Here's where the prototype stands against the formal requirements, and the decisions we need from you.

**Done since the gap analysis (October 2):**
- **Auto-correct is deterministic.** It no longer changes behaviour under CPU load. It never edits inside an email address or URL while it's being typed, and it fixes a stray capital ("oNly" → "only") without picking another word.
- **Maintained misspellings lists** (Req 4.2.3): about 350 English and 84 Arabic entries, so "teh" → "the" and "اذا" → "إذا" now work.
- **"Auto-replace confidence" admin setting:** "misspellings list only", or "list + single-candidate rule". This is our take on the "configurable threshold".
- **People's names are never auto-replaced** (Req 4.2.2). This covers capitalized words in mid-sentence ("Ms. Fatimah") and any word the customer wrote in the conversation.
- **Backspace right after a correction reverts it** (Req 4.2.1).
- **Completion keys** (Req 3.2): Right Arrow accepts a suggestion (Left Arrow for Arabic), and Ctrl+Right accepts one word at a time.

**Where auto-replace quality stands** (our offline benchmark, synthetic data):

| | English | Arabic | Bar for "on by default" |
|---|---|---|---|
| Correct words wrongly changed, per 10,000 | 7.6 | 2.0 | ≤ 1 |
| Auto-replace precision | 96.9% | 94.9% | ≥ 99% |
| Share of typos fixed automatically | 50% | 12% | (not a threshold) |

Most of the remaining English errors are British spellings (see question 6).

**Decisions we need:**

1. **Auto-replace default (Req 2.5).** Should migrating tenants get auto-replace on by default? *Our recommendation:* default to flag-only, and switch it on once the benchmark meets the bar above on real data.
2. **Completion latency (Req 3.5).** Is 200 ms from keystroke to suggestion a hard requirement or a target? A hosted model can't reliably answer that fast. *Our recommendation:* a target of about 500 ms, with a hard rule that a stale suggestion is never shown. We haven't measured p50/p95 yet, and can do that next if useful.
3. **Facts in completions (Req 3.7 vs. knowledge base).** Req 3.7 bans amounts, dates and timelines, but approved KB articles contain facts like "within 3 working days". Must those be suppressed too? *Our recommendation:* always block personal data and identifiers; allow figures only when they appear verbatim in an approved KB article or canned response.
4. **Enter to send (Req 4.2).** Should a typo be auto-corrected when Enter sends the message? *Our recommendation:* no. The agent would never see the change before it goes out.
5. **Pasted, canned and KB text (Req 4.5).** Should auto-replace rewrite inserted text? *Our recommendation:* underline only. Silently changing approved wording is risky.
6. **English dictionary: US or UK?** We use en-US, so "labour" becomes "labor" and "cancelled" becomes "canceled". Which spelling do GOSI agents write?
7. **Revert scope (Req 4.2.1).** Today a reverted word stays protected for the whole session, not just the current message, so a name an agent reverted is never changed again. Is that acceptable?
8. **Prototype extras.** Keep or drop: grammar polish, letting agents choose a less aggressive mode, and team/user targeting for completion?
9. **Japanese and Korean (Req 8).** Does "shall support JA/KO" apply to spell checking, or only to completion? Spell checking for them would need a different engine than the one we use for English and Arabic.

**Two requests:**
- **Reviewers.** A fluent Arabic reader and an English reader, for about a day each, to review the drafted misspellings lists and the evaluation text (`docs/known-issues.md`, KI-4 and KI-5). Until then, the benchmark numbers are provisional.
- **Real agent text.** An anonymized sample of real agent messages (with corrected versions, if available) to validate the "on by default" bar. It stays out of the repository (`eval/datasets/private/`) and is reported as aggregates only.

Thanks,
[your name]
