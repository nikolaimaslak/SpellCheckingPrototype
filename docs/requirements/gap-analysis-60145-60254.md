# Gap analysis: formal requirements vs. prototype

Compares `60145-60254-formal-requirements.md` (SV, 2026-09-22) with the prototype at v0.1.0 (`openspec/specs/`, `src/`, `server/`). Written 2026-10-02.

**Status key:** **Met** · **Partial** · **Gap** (not built) · **Conflict** (prototype deliberately does the opposite) · **Product** (Agent Desktop / platform work the prototype can't own).

## Summary

The prototype covers the core mechanics of both functions: ghost text with Tab to accept, a confidence-gated auto-replace that can be reverted, flags with a popover, a custom dictionary, silent fallback and telemetry. Four areas need decisions or real work:

1. **Conflicts with deliberate prototype choices.** The headline example "teh" → "the" is never auto-replaced, because of the 4-letter minimum. Completions may include figures and timelines taken from the sources, which Req 3.7 forbids. Right Arrow dismisses the ghost text when it should accept it.
2. **The 200 ms latency budget (Req 3.5).** The prototype waits 400 ms after typing stops and then allows a 2.5 s timeout. A hosted LLM can't reliably answer within 200 ms of a keystroke. This needs a product conversation, not just a tuning change.
3. **Languages (Req 7–8).** Language routing is by script, so it only distinguishes Arabic from English. Spanish, French and German need real language detection, because they share the Latin script with English. Japanese and Korean don't fit Hunspell at all, since neither language separates words with spaces.
4. **Auto-replace on by default (Req 2.5).** Turning auto-replace on for all migrating tenants makes KI-1 (nondeterministic confidence under CPU load) a release blocker, not a deferred issue.

## Requirement by requirement

### Req 1–2: Tenant feature and configuration profile settings

| # | Requirement | Status | Prototype today |
|---|---|---|---|
| 1 | Tenant feature "Assisted typing…", off by default | Product | No tenant-feature concept. The closest equivalent is admin `mode: 'off'`. |
| 2.1 | *Use auto-correct* | Partial | Covered by `mode` (`off` / `suggest` / `auto`, see `src/policy/index.ts`). Flagging without replacing corresponds to `suggest`. |
| 2.2 | *Use auto-replace* (gated by 2.1) | Partial | Covered by `mode: 'auto'`. The structure differs: the requirement uses two booleans, the prototype a three-level mode. |
| 2.3 | *Send with unresolved flags without warning* | Gap | No setting and no send-time warning (see 4.6). |
| 2.4 | *Use auto-complete* | Partial | `completion.enabled` is `off` / `all` / `listed` (teams and users). The requirement scopes it per configuration profile instead. |
| 2.5.2–3 | All settings on for migrating tenants and new default profiles | Conflict | The prototype defaults to `suggest` and keeps completion opt-in. Auto-replace on by default is risky until KI-1 is fixed. |
| — | Agent may lower the mode; completion context sources; polish | Extra | Not in the formal requirements. Agent self-choice, per-source switches and grammar polish (`grammar-polish`, `polish-service`) are prototype extras. Decide whether to keep or drop them. |

**Proposed:** reshape `AdminPolicy` into the profile model: a feature flag plus four booleans with the gating rules. The resolution logic in `resolveMode` / `resolveCompletion` then maps profile settings to effective behavior.

### Req 3: Auto-complete

| # | Requirement | Status | Prototype today |
|---|---|---|---|
| 3.1 | Inline ghost text after the cursor, low contrast, not editable | Met | `inline-completion` "Ghost text display", including the Arabic RTL and fixed-LTR handling. |
| 3.2.1 | Accept all with Tab **and Right Arrow at end of line** | Met | Tab, or the forward arrow of the suggestion's direction: Right for English, Left for Arabic, also in the fixed-LTR composer (`completion-keys`). Ghost text only shows at the end of a line. |
| 3.2.2 | Accept one word at a time (Ctrl+Right Arrow) | Met | Ctrl + forward arrow (Option + forward arrow on macOS, where Ctrl+arrow switches desktops). One undo step per word (`completion-keys`). |
| 3.2.3 | Dismiss by typing another character, Escape or caret move | Met | Typing matching characters consumes the ghost text instead of dismissing it, which is an improvement over the requirement. |
| 3.3 | Never insert without explicit action | Met | |
| 3.4 | Regenerate as typing continues and after a partial accept | Met | Regenerates after each 400 ms pause. A partial accept keeps the rest of the current suggestion; once it's used up, the next pause requests a new one (`completion-keys`). Requests still need the caret at the end of the line and at least 3 words in the sentence. |
| 3.5 | **≤ 200 ms from keystroke to render; otherwise show nothing for that keystroke** | Conflict | 400 ms debounce, then up to 2.5 s client timeout (`src/completion/client.ts:26`) and 2 s server timeout. A late answer still shows if nothing was typed in between. Meeting 200 ms needs a hard client deadline and probably a different architecture: a local or small model, prefix caching, or predicting while the agent is still typing. |
| 3.6.1 | General language patterns | Met | Through the LLM. |
| 3.6.2 | Interaction context: thread, **case/ticket fields, customer profile, activity history** | Partial | Uses the transcript only (last 6 turns). No case, profile or history fields. |
| 3.6.3 | Knowledge base articles | Met | High-confidence retrieval from synthetic `kb.json`. |
| 3.6.4 | Global canned responses | Met | Synthetic `canned.json`. |
| 3.6.5 | Agent messages from previous relevant interactions | Gap | No retrieval over past transcripts. |
| 3.7 | **No PII, identifiers, amounts, dates or timelines** | Conflict | The prompt allows figures and dates that appear in the sources (`server/prompt.ts:8`). The spec example itself is "will be processed within **3 working days**". `postprocess.ts` has no PII, number or date filter. Needs a prompt change plus a deterministic output filter, reusing the tokenizer's digit, URL and email exclusions and adding Arabic-Indic digits, month names and number words in both languages. |

### Req 4: Auto-correct

| # | Requirement | Status | Prototype today |
|---|---|---|---|
| 4.1 | Continuous check; auto-replace or flag without interrupting typing | Met | Worker-based and debounced. |
| 4.2 | Auto-replace on space, punctuation or Enter; **"teh" → "the" is the example** | Partial | Triggers on a typed boundary, but **not on Enter-to-send** (deliberate: the message is sent as typed so nothing changes unseen). "teh" → "the" now works through the curated misspellings list (`autocorrect-misspellings-list`), as do the common Arabic hamza slips ("اذا" → "إذا"). |
| 4.2.1 | Brief visual indicator | Met | About 2 s flash, outside the editable DOM. |
| 4.2.1 | Revert with one action: Ctrl+Z **or Backspace right after** | Partial | Undo and the popover's "Revert to…" work. **Backspace-to-revert isn't implemented.** |
| 4.2.1 | A reverted word isn't auto-corrected again **in the same message** | Partial | Broader than required: a reverted word joins the session ignore list, so it isn't corrected again or even underlined for the rest of the session. |
| 4.2.2 | No auto-replace for names, URLs, emails, words with digits, all caps | Partial | URLs, emails, digits and all caps are excluded, including while an address is being typed (KI-2 fixed by `autocorrect-reliability`). **People's names aren't detected.** Capitalized words are corrected ("Seperate" → "Separate"). Names in the transcript or customer profile could feed an exclusion list, and mid-sentence capitalized words could be skipped. |
| 4.2.3 | High confidence from a **misspellings dictionary** or a configurable confidence threshold; more than one plausible fix means low confidence | Met (review pending) | A curated misspellings list per language (350 EN, 84 AR including 8 AyaSpell rules; human review pending, KI-5) comes first. Then the deterministic case-only fix and single-neighbor rule. An admin setting, **auto-replace confidence** (`list` or `list-and-rule`), is the configurable threshold. "More than one plausible fix" is enforced by curation, by an automatic alef-form check for Arabic, and by the single-neighbor rule. |
| 4.2.4 | Custom dictionary, never flagged or altered (nice-to-have) | Partial | Admin-maintained and covers words that are never flagged. Agent-added terms last only for the session (Ignore). Nothing is persisted per agent. |
| 4.3 | Low-confidence words are flagged; click to pick a fix or ignore | Met | Popover with up to 5 suggestions and Ignore, also usable from the keyboard. |
| 4.4 | Admin can disable auto-replace; then everything is flagged | Met | `mode: 'suggest'`. |
| 4.5 | Same on pasted text, canned responses and KB inserts (TBD) | Conflict (TBD) | Pasted and inserted text is **flagged but never auto-replaced** (spec "Paste is not auto-corrected"). Recommend keeping this: silently rewriting approved canned or KB text is risky. |
| 4.6 | "This message has possible typos, send anyway?" dialog | Gap | Nothing intercepts send. This needs the host's send hook (Agent Desktop's GWT composer), which the dev loader can explore. |

### Req 5–6: Where it applies

| # | Requirement | Status | Prototype today |
|---|---|---|---|
| 5.1–5.2 | AD 2.0 email and service chat | Partial | Demo stand-ins plus `dev/ad-loader` for a live tenant. Production wiring is Product work. |
| 5.3 | Comm Widget 2.0 | Gap / Product | Not tried. `attach()` targets any `contenteditable`; the widget may use a `<textarea>`, which the layer doesn't support. |
| 5.4 | KB article body drafts | Gap / Product | Not tried. Likely a rich editor (check which). |
| 6 | Not on internal chat, "from" fields, notes, titles, KB keywords, search | Product | The layer attaches only where the host calls it, so this is an integration rule. Worth recording in the spec as an attach-site allowlist. |

### Req 7–8: Languages

| # | Requirement | Status | Prototype today |
|---|---|---|---|
| 7 | Detect the language from interaction context; agent can switch manually | Gap | Language is chosen per word by script (Arabic → `ar`, Latin → `en`), and the admin enables languages. No detection from context and no agent switch. This works for Arabic/English but can't separate English, Spanish, French and German. |
| 8 | Third-party technology supports EN, AR, ES, FR, DE, JA, KO | Partial / risk | EN and AR are built. Hunspell dictionaries exist for ES, FR and DE, but each needs a license check (many are GPL/LGPL-only or tri-licensed). **JA and KO aren't practical with Hunspell**: Japanese has no spaces between words and Korean needs morphological analysis, so both need another engine or the Tier 2 service. The completion model (Gemini) handles all seven. |

### Req 9–11

| # | Requirement | Status | Prototype today |
|---|---|---|---|
| 9 | Third-party notices in the acknowledgements list | Partial | `src/spell/wasm/NOTICE`, `dicts/ar/NOTICE` and `dicts/MANIFEST.md` exist. Adding them to the product's acknowledgements is Product work. |
| 10 | Slow or down service: plain text box, no errors | Met | The completion client resolves to `null` on any failure. Telemetry failures are silent. If the spelling engine fails, the composer keeps native spellcheck. |
| 11 | Reporting: acceptance rate, auto-replace undo rate, handle time (TBD) | Partial | `/summary` shows completion acceptance and auto-correct revert rate. Handle time isn't measured; it needs per-interaction timing from the platform. |

## Proposed OpenSpec changes (in priority order)

**Done:**
- `autocorrect-reliability` (added after this analysis, ahead of item 2): KI-1, KI-2 and KI-3. Auto-replace is deterministic, never edits inside an email or URL being typed, and fixes a stray capital without picking another word. See `docs/known-issues.md`.
- `autocorrect-misspellings-list` (item 2, without its KI-1 part, done above): curated EN and AR misspellings lists (no third-party English source; Arabic includes AyaSpell's rules under MPL 1.1) and the auto-replace confidence setting. The configurable threshold is two levels: `list` and `list-and-rule`. The lists' human review is KI-5.
- `completion-keys` (item 3): the forward arrow accepts a suggestion (Right for English, Left for Arabic), Ctrl/Option + forward arrow accepts one word, and the next suggestion follows once the current one is used up.

1. **`completion-safety-filter`**: Req 3.7. Prompt forbids amounts, dates, identifiers and PII outright, and a deterministic post-filter drops any completion that contains them. Update the spec example. Small, and it removes a compliance conflict.
2. **`autocorrect-misspellings-list`**: Req 4.2 and 4.2.3, plus KI-1. Add a curated common-misspellings list for EN and AR (source license to be checked) that bypasses the length rule, so "teh" → "the" works. Replace suggestion-based confidence with the deterministic one-edit check from KI-1. Add a configurable threshold.
3. **`completion-keys`**: Req 3.2. Right Arrow at end of line accepts all (bidi-aware), Ctrl+Right accepts one word, and a new completion is fetched after a partial accept.
4. **`autocorrect-revert-backspace-and-names`**: Req 4.2.1 and 4.2.2. Backspace right after a replacement reverts it. Skip capitalized words that aren't sentence-initial, plus names from the transcript. Scope the "don't correct again" rule to the message.
5. **`send-typo-warning`**: Req 2.3 and 4.6. Confirmation on send when flags remain, gated by the new setting. Needs a send hook into the host.
6. **`profile-settings-model`**: Req 1–2. Reshape the policy into a tenant feature plus four profile booleans with gating, and update the demo settings panel.
7. **`completion-latency-budget`**: Req 3.5. Enforce a hard deadline per keystroke and measure achievable p50/p95 with Gemini Flash-Lite against 200 ms. The result feeds the product conversation.
8. **`language-detection`**: Req 7–8. Detect the language from context (customer messages), let the agent switch manually, and add ES, FR and DE dictionaries after license checks. Write up the JA/KO engine options.

The rest is Product or integration work: Comm Widget 2.0, KB article bodies, the attach-site allowlist, the acknowledgements list, and handle-time reporting.

## Questions for SV

- **Req 3.5:** is 200 ms keystroke-to-render a hard requirement for a hosted LLM, or a target? Would "never show a stale suggestion" plus about 500 ms be acceptable?
- **Req 3.7 vs. KB grounding:** must a KB-sourced fact like "within 3 working days" be suppressed too? As written, the requirement forbids it.
- **Req 4.2 and Enter:** should Enter that *sends* a chat message auto-replace first? The prototype sends the text as typed so nothing changes unseen at send time.
- **Req 4.5:** may approved canned and KB text be auto-replaced? We recommend flagging only.
- **Req 2.5:** auto-replace on by default for all migrating tenants? We'd suggest defaulting to flag-only until KI-1 is fixed.
- **Grammar polish, agent self-choice, team/user targeting:** keep them as extras or drop them?
- **Req 8:** does "third-party technology shall support JA/KO" cover spell checking, or only completion?
