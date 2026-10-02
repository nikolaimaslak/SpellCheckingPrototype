# Design

## Context

Builds on Phase 3 (see proposal.md, Why).
- **Server:** `node:http`, model-agnostic `CompletionModel`, BM25-lite `retrieve()` over canned responses, `buildUserContent()` with stable parts first, `postprocess()`, a field allowlist for telemetry, and the fake model.
- **Client:** completion ghost text with the shared native edit path (`execCommand('insertText')`), `buildTextMap`, `rangeFor` and `pointAt` from the tokenizer, and `[data-bp-spell-popover]` as the popover marker.

Facts that shape this design:
- **Undo granularity (probed in Chrome, demo email composer):** two non-adjacent `insertText` edits in one task produce **two** undo steps. Each edit kept the surrounding bold intact. So "formatting survives" and "one Undo reverts everything" can't both hold for rich text through native editing. That's why there's a single replace for one text run, and per-span edits plus "Revert polish" otherwise.
- **Gemini config:** completion uses `stopSequences ["\n"]` and `maxOutputTokens 48`. Polish needs multi-line output and more tokens, so the model call must take per-request generation options.

## Goals / Non-Goals

**Goals:**
- Knowledge base content helps only when it clearly applies; a weak match adds nothing.
- Polish can't damage protected content or turn into a rewrite, and the agent always sees exactly what will change before it changes.
- Same edit path, undo behavior and overlay rules as the earlier phases.

**Non-Goals:**
- A knowledge base article viewer or citations in the UI. Sources are reported in the reply and telemetry only.
- Partial acceptance of individual polish changes. It's all or nothing, which keeps the preview honest and simple.

## Decisions

### 1. Knowledge base passages and retrieval (Tier 2, `server/retrieval.ts`, `server/data/kb.json`)
- **Data:** `kb.json` holds about 6 synthetic articles per language (`{ id, lang, title, body }`, with a `_note` labeling them synthetic). At load time they're split into passages of up to 2 sentences, with ids `kb:<article>#<n>` and the title prefixed for context.
- **Generic ranking:** `retrieve()` becomes `rank(items: { id, text }[], weightedQueries, k, threshold)`, used by both the canned responses (customer 1.0 + prefix 0.5, threshold 0.5, k 3) and the knowledge base (**customer message only**, threshold `KB_THRESHOLD`, k 2).
- **Threshold:** `KB_THRESHOLD` is calibrated by tests on strong and weak queries (strong: early-retirement question → retirement passage; weak: greetings and thanks → nothing) and kept as one named constant.
- **Prompt order:** `Approved responses:` → `Knowledge base:` → `Conversation:` → `Agent is typing:`. The system instruction now says not to invent figures, dates or policies absent from the approved responses, the knowledge base or the conversation.
- **Request:** `sources.kb` (default true) is parsed like the other sources, and the reply's `sources` lists canned ids followed by knowledge base passage ids.

### 2. Model options (Tier 2, `server/types.ts`, `server/models/*`)
`CompletionModel.complete(system, user, signal, opts?: { maxOutputTokens?, stopSequences? })`. Gemini maps the options into `generationConfig`, keeping the completion defaults when they're absent. The fake model ignores them. Completion passes nothing, so its behavior is unchanged.

### 3. Polish service (Tier 2, `server/polish.ts`)
- **Contract:** `POST /v1/polish {text}`.
  - **Validation:** non-empty, at most 4000 characters, otherwise 400.
  - **Instruction (`POLISH_INSTRUCTION`):** fix grammar, spelling and punctuation only; same language; keep meaning, tone, wording, line breaks and every placeholder, URL, email, number and code exactly; return only the corrected text.
  - **Model call:** `{ maxOutputTokens: min(2048, ceil(len / 2) + 64), stopSequences: [] }` with a 4 s timeout.
- **Output cleanup:** strip surrounding quotes or code fences, and normalize CRLF.
- **Safety checks (any failure means unchanged, `changed: false`, plus a `reason`):**
  1. **Protected tokens:** the multiset of `$(...)`, URLs, emails and digit-containing runs (the same patterns as the tokenizer's exclusions, kept server-local because the server doesn't import `src/`) must be identical between draft and output.
  2. **Length:** the ratio must be within 0.7–1.3.
  3. **Line breaks:** the number of line breaks must be equal, so edits never merge or split paragraphs.
- **Statuses:** 503, 502 and 504 as for completion. `lang` is the majority script.
- **Fake model polish:** a deterministic correction table (e.g. "He go" → "He went", "buyed" → "bought", plus one Arabic pair) for offline tests and UI checks.

### 4. Client: diff (Tier 1, `src/polish/diff.ts`)
Tokens are runs of letters and digits (`[\p{L}\p{M}\p{N}]+`), runs of whitespace, single punctuation marks, and `\n` as its own token. The LCS is computed over the tokens, and adjacent delete+insert runs are merged into `replace` hunks: `{ start, end, text }` in **draft** flat offsets, plus the polished segment. That's pure and works for Arabic (letters plus marks stay in one token). Hunks touching `\n` are dropped defensively; the server already guarantees equal line counts.

### 5. Client: apply and revert (Tier 1, `src/polish/apply.ts`)
- **Stale check:** `buildTextMap(el).text` must equal the text that was sent; otherwise Accept is refused.
- **Single run:** if every hunk lies inside one text segment of the map, there's one `env.replace(rangeFor(start of first, end of last), polished substring)`. That's one undo step (the chat case, and plain email paragraphs).
- **Across formatting:** otherwise, hunks are applied **last to first** (so earlier offsets stay valid), each with `env.replace(rangeFor(h.start, h.end), h.text)`. Each applied span is recorded as a live Range over its replacement plus the original text. A 10 s "Revert polish" toast then restores every span whose text is still the replacement, last to first. Formatting survives because each replace inherits the formatting at its own position (verified in Chrome).
- **Pure insertions** (`start === end`) use a collapsed range at `pointAt(start)`.

### 6. Client: button, panel, controller (Tier 1, `src/polish/`)
- **Button:** a body-level `<button>`, positioned just outside the composer's top-right corner (top-left for an RTL composer), repositioned on input, scroll and resize. `aria-label="Polish grammar and spelling"`. It's disabled under 3 words or while a request is in flight.
- **Panel:** body-level, anchored under the composer, `dir` from the draft's script. It renders the hunks as `<ins>` for new text and `<del>` for removed text, inline with the unchanged text. Buttons: Accept and Dismiss, or Close when there's nothing to apply. A window-capture listener handles Escape (closes, `stopImmediatePropagation`, so the host never sees it).
- **Controller:** `attachPolish(el, { fetcher, onEvent, env })`.
  - **Pressing Polish:** does nothing while a spelling popover is open. Otherwise it calls an injected `onOpen` hook (the demo and loader wire it to the completion handle's `dismiss()`), then requests and renders.
  - **Mutual exclusion:** spelling and polish check each other's open marker (`[data-bp-spell-popover]` / `[data-bp-polish-panel]`), so the two panels are never open together.
  - **Events:** `polish-shown` (lang, latencyMs, changes), `polish-accepted`, `polish-dismissed`, `polish-reverted`, all without text.
  - **Cleanup:** `detach()` removes the button, panel and toast.
- **Auto-correct:** never triggers on polish edits, because they're multi-character `insertText` (existing trigger rule).
- **Completion:** suppresses requests while `[data-bp-polish-panel]` exists (a one-line addition to its trigger state).

### 7. Policy (config, `src/policy/`)
- `CompletionPolicy.sources.kb` (default true).
- `AdminPolicy.grammar: { enabled: 'off' | 'all' | 'listed'; teams; users }` (default off).
- `AgentPreference.grammar?: boolean`.
- A shared `enabledFor(listed, agent)` helper behind `resolveCompletion` and a new `resolveGrammar`.
- Parse fallbacks keep stored Phase 3 settings loading.

### 8. Telemetry (Tier 1 + Tier 2)
- **Allowlist:** server types `polish-shown` and `polish-accepted` keep `latencyMs`, `changes`; `polish-dismissed` and `polish-reverted` keep only the common fields.
- **Summary:** adds polish acceptance (accepted ÷ shown with changes > 0) and polish latency p50.

### 9. Demo and loader (demo harness, dev only)
- **Demo:** settings gain a knowledge base source checkbox, grammar enablement and lists, and an agent grammar preference. Polish is attached to both composers when `resolveGrammar` holds, and the counter adds polish counts.
- **Loader:** `{ grammar: true }` attaches polish with a console warning (text goes to the hosted model), calling `http://localhost:5175`.

### Tier map
| Component | Tier |
|---|---|
| `server/polish.ts`, KB retrieval, prompt changes | Tier 2 stand-in |
| `src/polish/*` | Tier 1 (browser; network only to our own service) |
| `src/policy/*` additions | config |
| demo, loader | demo harness, dev only |

### Undo, editable DOM, RTL
- **Undo:** one step for single-run accepts. For accepts across formatting, one step per span plus one-click Revert.
- **Editable DOM:** never written except through `env.replace`. Button, panel and toast are overlays.
- **RTL:** the panel follows the draft's script. The button sits on the composer's inline-start side for RTL composers. Arabic tokens include their marks in the diff.

### Testing approach
- **Server (Node, no network):**
  - knowledge base threshold calibration (strong vs weak queries, EN and AR), prompt order with the knowledge base, `sources.kb` off;
  - polish: each safety check, a fence-wrapped output, the CRLF case, 400/503/502/504;
  - Gemini option passthrough;
  - telemetry allowlist and summary for polish.
- **Client (jsdom):**
  - diff (EN replacements, insertion, deletion, Arabic, punctuation, `\n` hunks dropped);
  - apply (single-run → one `replace`; bold across → per-span `replace` last to first, and revert restores; stale → refused) with a text-mutating fake `replace`;
  - panel (ins/del rendering, `dir`, Escape not reaching the host, no-changes and unavailable states);
  - button states, controller events without text, policy resolvers.
- **Chrome (fake model):** chat accept, then one Undo; email bold preserved, then Revert; Arabic RTL panel; ghost dismissed on Polish.
- **Live Gemini (key already in `.env`):** 5 English and 5 Arabic drafts polished and reviewed; 2 knowledge base-grounded completions; latency recorded.
- **Agent Desktop (your go-ahead):** polish in the GWT composer without sending.

## Risks / Trade-offs

- [The model "polishes" too much, changing word choice or tone] → The instruction is grammar-only, the length ratio check and protected-token check apply, and the preview shows every change before it applies. The live review checks for over-editing.
- [Arabic grammar quality of a small fast model is uncertain] → The live review covers 5 Arabic drafts and the findings are recorded. This joins the existing Arabic native-speaker review before any GOSI rollout.
- [A knowledge base passage with confident-sounding figures leaks into completions] → It's high-confidence only, at most 2 passages, synthetic data, and the instruction forbids content outside the provided sources. A real knowledge base would need an editorial pass on what's exposed to completion.
- [Rich-text accept isn't a single undo step] → Mitigated with the one-click Revert for 10 s, and documented.
- [Polish latency is likely about 1 s or more for long drafts] → It's an explicit action with a loading state; latency is measured.

## Migration Plan

`parsePolicy` fills `grammar` (off) and `sources.kb` (on), so stored Phase 3 demo settings keep working. No deployed users exist.

## Open Questions

None that change this change. The real knowledge base connector stays a follow-up, as you decided.

## Implementation Notes

- **Knowledge base threshold:** `KB_THRESHOLD = 4`, from calibration. Specific questions scored 4.1–10.7 and vague ones ("What about my pension?", "سؤال عن المعاش") at most 3.04. At 3, the Arabic survivor question also pulled an unrelated early-retirement passage via the shared word "معاش". Encoded in `test/server/kb.test.ts`.
- **Polish whitespace bug** (caught by the Chrome email check): a paragraph's text ends with a line-break separator, which models drop, so the line-break check rejected every email polish. The service now keeps the draft's own leading and trailing whitespace around the model's inner text.
- **Diff display order:** deletion before insertion ("~~go~~ went"); the hunks themselves are unaffected.
- **Live Gemini check** (`gemini-3.5-flash-lite`, October 2, 2026, synthetic drafts):
  - **Polish quality:** 10 of 10 drafts (5 EN, 5 AR) were correctly corrected with no rewording. Protected content was preserved every time (`$(user.firstName)`, "104233", "12 May", "3").
    - English: subject-verb agreement, "recieved" → "received", "you" → "your", "trough" → "through", "i" → "I".
    - Arabic: gender agreement (هذه الطلب → هذا الطلب, قبولها → قبوله, محدثة → محدث), hamza (ان → أن, اخر → آخر, اي → أي), taa marbuta (الوطنيه → الوطنية, دفعه → دفعة), شي → شيء.
  - **Polish latency** (10 drafts): p50 583 ms, p95 766 ms.
  - **Knowledge base-grounded completions:** EN "Early retirement is" → "available to members with at least 25 years of contributions." (sources `kb:en-early-retirement#0,#1`). AR "يحق للمستحقين" → "من أفراد أسرته الحصول على معاش، ويجب تقديم شهادة الوفاة وإثبات صلة القرابة." (sources include `kb:ar-survivor-benefits#0`).
- **Real Agent Desktop run** (dev tenant, October 2, 2026, Gemini, loader with `{ mode: 'off', grammar: true }`, synthetic draft, nothing sent):
  - **Placement:** the composer touches the window's right edge, so the Polish button took the inside-corner fallback (just above its top-right corner), and the preview opened above the composer.
  - **Polish:** Gemini corrected "we has recieved … will processed" in 732 ms. The preview showed has/recieved struck through and have/received/be inserted.
  - **Accept and undo:** Accept applied it as one edit (one `input` event, no toast needed), and one Undo restored the draft.
  - **Escape:** closed the preview with the draft unchanged; neither the composer nor `document` saw the key.
  - **Cleanup:** `detachAll()` left no polish overlays.
