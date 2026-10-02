# Design

## Context

Builds on Phases 1–2 (see proposal.md, Why):
- `attachSpellCheck` (modes, popover marked `[data-bp-spell-popover]`, `env.replace` → `execCommand('insertText')`, auto-correct triggered only by a *single-character* typed boundary).
- The policy module (`AdminPolicy`, `resolveMode`, `parsePolicy`).
- The demo with a chat transcript of agent messages only.
- The `AssistEvent` callback.

Constraints carried over: nothing is drawn into the editable DOM; one native edit path; the host (Agent Desktop) has a fixed LTR composer, cancels Enter before any input event (verified in Phase 2), and the chat composer is `max-height: 262px; overflow-y: auto`.

Gemini facts used (Google docs, October 2026):
- **Model:** `gemini-3.5-flash-lite` is stable and recommended for new low-latency work.
- **REST:** `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header `x-goog-api-key`.
- **Body:** `systemInstruction`, `contents[{role, parts[{text}]}]`, `generationConfig{temperature, maxOutputTokens, stopSequences}`.
- **Thinking:** set through `thinkingConfig` (`thinkingLevel`: minimal/low/…). Its exact placement inside `generationConfig` is verified against the live API in task 3.3.
- **Response text:** `candidates[0].content.parts[0].text`.

## Goals / Non-Goals

**Goals:**
- Ghost text that feels native in English, in Arabic, and under the host's fixed LTR direction, and can never leak into the message.
- A service contract stable enough that the dev server can be swapped for the real dev server or Intelligence Engine by changing a base URL.
- Honest numbers: latency and acceptance are measured from day one.

**Non-Goals:**
- Streaming partial completions; one-shot requests are enough to measure.
- Multi-line or paragraph completions (≤ 1 sentence by spec).
- Prompt caching beyond ordering stable content first. Gemini's implicit caching may apply once prompts are large enough; it isn't relied on.

## Decisions

### 1. Service layout (Tier 2 stand-in, `server/`)
A dependency-free Node server (`node:http`, TypeScript run directly by Node 25, like `scripts/`), started with `npm run server`. It listens on port 5175 with permissive CORS for dev, and loads a gitignored `.env` (only `GEMINI_API_KEY`, `COMPLETION_MODEL`, `PORT`).

| File | Role |
|---|---|
| `server/main.ts` | routing: `POST /v1/complete`, `POST /v1/events`, `GET /summary`, `GET /health` |
| `server/complete.ts` | validate request → retrieve → build prompt → model → post-process → reply |
| `server/retrieval.ts` | normalization and lexical ranking over `server/data/canned.json` |
| `server/prompt.ts` | system instruction and user content assembly, stable parts first |
| `server/postprocess.ts` | continuation rules (no prefix repetition, 1 sentence, ≤ 20 words, one line, same script, leading space) |
| `server/models/gemini.ts` | REST client: `temperature 0.2`, `maxOutputTokens 48`, `stopSequences ["\n"]`, minimal thinking, `AbortSignal.timeout(2000)` |
| `server/models/fake.ts` | deterministic test double (completes from the top canned response). Selected with `COMPLETION_MODEL=fake` for offline tests and scripted UI checks; never a product mode. |
| `server/telemetry.ts` | allowlisted event append (JSONL) and summary computation and HTML |

`CompletionModel { name; complete(system, user, signal) → Promise<string> }` keeps the handler model-agnostic and unit-testable.

### 2. Retrieval (Tier 2, `server/retrieval.ts`)
- **Normalization:** lower-case; Arabic tashkeel and tatweel removed; alef/hamza forms (أ إ آ ٱ → ا), ة → ه and ى → ي folded *for retrieval only* (not spelling). Then tokens are taken.
- **Scoring:** a BM25-lite score of each canned response against the customer's last message (weight 1.0) plus the prefix (weight 0.5). The top 3 with a score above a small threshold are used.
- **Deviation:** the architecture calls for embedding retrieval. Lexical matching is enough for a 12-item demo library, and the function signature (`retrieve(query) → {id, text, score}[]`) lets embeddings replace it.

### 3. Prompt (Tier 2, `server/prompt.ts`)
- **System instruction:** complete the agent's unfinished sentence in a contact-center conversation for the Saudi social insurance context; output only the continuation; at most one sentence; same language and script as the agent's text; prefer the wording of the approved responses; no greetings or sign-offs mid-sentence; no quotes.
- **User content order:** `Approved responses:` (sources) → `Conversation:` (last 6 turns, labeled Customer/Agent) → `Agent is typing:` + the prefix. The variable part comes last so consecutive requests share a prompt prefix.

### 4. Post-processing (Tier 2, `server/postprocess.ts`)
1. Trim quotes and whitespace.
2. If the output starts with the prefix's tail (any overlap of the last ≥ 1 words), drop the overlap.
3. Cut after the first `.`, `!`, `?` or `؟`, or at a newline.
4. Cap at 20 words.
5. Reject if the script of the first letter doesn't match the last word of the prefix (Arabic vs Latin).
6. Add a leading space when the prefix doesn't end with whitespace and the continuation starts with a letter or digit (word continuation like "proces|sed" isn't attempted, because prefixes are sent only at a pause).
7. Empty means "nothing to add".

### 5. Client controller (Tier 1, `src/completion/`)
- **`trigger.ts` (pure):** `shouldRequest({ text, caret, lineEnd, composing, popoverOpen, enabled })` checks the caret is at the end of its line, the current sentence (since the last `[.!?؟\n]`) has ≥ 3 words, and nothing suppresses it.
- **`client.ts`:** `requestCompletion(baseUrl, body, signal)` → `fetch` POST with `AbortController` and a 2.5 s client timeout. Non-200 or any error resolves to `null` (silently nothing shown).
- **`controller.ts`:** `attachCompletion(el, { baseUrl, sources, transcript(): Turn[], onEvent, env })` → `{ detach }`.
  - **Listening:** `input`, `selectionchange`, `blur`, `compositionstart` and `compositionend` reset a 400 ms debounce, which requests when `shouldRequest` holds. Each new request aborts the previous one, and a generation counter drops stale replies.
  - **Showing:** on reply, the ghost text is shown and `completion-shown` is emitted (lang, latency, length).
  - **Keys:** a `keydown` listener on `window` in the **capture phase**, active only while ghost text is showing:
    - **Tab:** `preventDefault` and `stopImmediatePropagation`, then accept. Accepting calls `env.replace(collapsed caret range, text)`, the same native path as everything else: one undo step and a host `input` event. Because it's a multi-character insert, Phase 2's auto-correct trigger ignores it by construction.
    - **Escape:** `stopImmediatePropagation` (the host never sees it), then dismiss.
    - **Enter, arrows, other navigation:** dismiss without intercepting, so Enter still sends.
  - **Typing through:** on `beforeinput` of `insertText`, if the ghost starts with `data`, the matched part is consumed after the input and the ghost repositioned; otherwise it's dismissed.
  - **Popover priority:** if `[data-bp-spell-popover]` exists, nothing is requested or shown. The popover's own window-capture listener is registered earlier and handles keys first.
  - **Clearing:** a `MutationObserver` dismisses the ghost when the host clears the composer (send).

### 6. Ghost text overlay (Tier 1, `src/completion/ghost.ts`)
- **Element:** a `position: fixed` element appended to `document.body` with `pointer-events: none`, `aria-hidden="true"` and a muted color. It copies the composer's `font`, `line-height` and `letter-spacing`, and uses `white-space: pre-wrap`.
- **Geometry, through a `measure` seam:**
  - **Caret rect:** from the last character before the caret (`Range` over it). A collapsed range at a line end can report a zero rect, so the character's own rect is used instead.
  - **Box:** the overlay's box is the composer's content box (rect minus padding and border). `top` is the caret line's top.
  - **LTR:** `direction: ltr` and `text-indent: caret.right − content.left`.
  - **RTL:** `direction: rtl` and `text-indent: content.right − caret.left`.

  So the first line starts exactly at the caret and later lines wrap within the composer width, in the right direction.
- **Direction:** comes from the script of the last word before the caret, not from the composer.
- **Arabic under a fixed-LTR composer (Agent Desktop):** the Arabic run is pinned to the left edge, and the caret (its logical end) is its leftmost glyph, so there's no room to continue on the same line. Real typing would shift the existing words right, which an overlay can't do. So in this case the ghost goes on the **line below**: `top` = caret line bottom, `direction: rtl`, `text-align: left`, no indent. That's exactly where the host puts wrapped Arabic text. (Decided during implementation, option 1. Product finding: `dir="auto"` on Agent Desktop's composer would allow inline placement.)
- **Repositioning:** on input, scroll (composer or window) and resize. It's hidden when the caret line is scrolled out of the composer's visible area.
- **Editable DOM / undo:** the overlay is never inside the composer, and nothing changes until Tab. The sent message can't contain it.

### 7. Policy (config, `src/policy/`)
```ts
interface CompletionPolicy { enabled: 'off' | 'all' | 'listed'; teams: string[]; users: string[]; sources: { transcript: boolean; canned: boolean } }
AdminPolicy.completion: CompletionPolicy        // default: enabled 'off' (opt-in: data goes to a hosted model)
AgentPreference.completion?: boolean
interface AgentIdentity { user: string; team: string }
resolveCompletion(policy, pref, agent): boolean
// admin enables for agent (all, or team/user listed) && !(policy.agentMayLower && pref.completion === false)
```
`parsePolicy` and `parsePreference` are extended with field-level fallbacks.

### 8. Telemetry (Tier 1 client `src/telemetry/`, Tier 2 `server/telemetry.ts`)
- **Client:** `createTelemetry({ url, session, flushMs = 5000 })` → `record(event)`. It queues events and flushes with `fetch(..., { keepalive: true })` every 5 s, and with `navigator.sendBeacon` when the page is hidden. Failures are swallowed. The demo wires both `attachSpellCheck.onEvent` and `attachCompletion.onEvent` into it.
- **Server:** an **allowlist** per event type: `type`, `ts`, `lang`, `session`, plus `latencyMs`, `shownLength`, `acceptedLength` (completion) or `original`, `replacement` (spelling). Anything else is dropped, so text can't be logged even if a client sends it. Events are appended to `telemetry/events.jsonl` (gitignored).
- **Summary:** `GET /summary` returns a small HTML page with acceptance rate, p50 and p95 latency, revert rate, and counts by type and language. It's computed on request.

### 9. Demo, loader, config (demo harness, dev only, config)
- **Vite:** `server.proxy['/api'] → http://localhost:5175` (path rewritten), so the page calls same-origin `/api/v1/...`.
- **Demo:**
  - **Conversation:** `src/demo/scenarios.ts` holds English and Arabic pension-inquiry scenarios played by a "Next customer message" button, plus a "Customer says" input. Transcript items are labeled by role.
  - **Wiring:** completion is attached to both composers, with the transcript read from the demo transcript.
  - **Settings:** a completion fieldset plus a current-agent selector (user, team).
  - **Telemetry:** a "Telemetry summary" link to `/api/summary`.
- **Data:** `server/data/canned.json` holds about 12 entries (EN and AR, ids, text) with a `_note` saying it is synthetic demo data, not GOSI content.
- **Loader:** completion runs only when `__bpSpellConfig.completion === true`. It then logs a warning that composer text is sent to a hosted model, and calls `http://localhost:5175` directly (CORS), with prefix-only context (Agent Desktop's transcript DOM uses build-specific class names).
- **`openspec/config.yaml`:** the context changes to say Tier 2 (completion) is in scope from Phase 3, server-side only, with the key in the server environment.

### Tier map
| Component | Tier |
|---|---|
| `src/completion/*`, `src/telemetry/*` | Tier 1 (browser; network only to our own service) |
| `server/*` | Tier 2 stand-in (dev Node server) |
| `src/policy/*` completion fields | config |
| `src/demo/*`, `dev/ad-loader` | demo harness, dev only |

### Testing approach
- **Server (Node, no network):** retrieval (EN, AR with hamza variants, sources off); post-processing (each rule); prompt order; the complete handler with the fake model (reply shape, empty completion, 503 without key, 502 and 504 on fake failure or timeout); the Gemini client with a mocked `fetch` (URL, header, body fields, text extraction, key never in errors); telemetry allowlist, append and summary math.
- **Client (jsdom):** `shouldRequest` table; the controller with a fake client and env (debounce, abort and stale drop, Tab accept through `replace`, Tab passthrough without ghost, typing-through, diverge, Escape not propagating, Enter dismiss, popover suppression, events without text); `resolveCompletion` truth table; the telemetry client (batching, failure tolerance).
- **Real Chrome (scripted, demo, `COMPLETION_MODEL=fake`):** overlay geometry (EN; AR under fidelity LTR, ghost left of the caret; wrapping), Tab, undo, typing-through, sent message clean.
- **Live Gemini (needs your `GEMINI_API_KEY`):** request shape and thinking placement verified, sample EN and AR completions reviewed, latency p50 and p95 recorded.

## Risks / Trade-offs

- [The hosted-model round trip (network plus model) likely exceeds the 200–400 ms architecture budget] → Measured and reported (p50 and p95). The ghost text simply appears later; abort-on-keystroke keeps it from showing stale text. Streaming, a regional endpoint or a smaller prompt can follow.
- [Data egress: transcript and prefix go to Google] → Synthetic demo data only. Completion is off by default in policy and in the loader, with a warning when enabled. Production stays inside the tenant boundary.
- [Caret geometry quirks at line ends, after trailing spaces, or in empty blocks] → Measure from the previous character's rect, with fallbacks. Covered by Chrome checks, and the overlay is hidden rather than misplaced if geometry is unavailable.
- [Tab is focus navigation in Agent Desktop] → It's only intercepted while ghost text is visible. Otherwise the host gets it.
- [Model output in the wrong language, repeated, or rambling] → The post-processing rules reject or trim it; the spec covers each case.
- [Key leakage] → The key lives only in the server environment or gitignored `.env`. Error messages are sanitized, and a test asserts the key never appears in replies.

## Migration Plan

`AdminPolicy` gains a `completion` field. `parsePolicy` fills the default (`off`) for stored settings from Phase 2, so existing demo settings keep working. No deployed users exist.

## Open Questions

- Where the real dev server or Intelligence Engine endpoint lives (you're checking). It doesn't change this change: the client only needs its base URL, and the contract is defined here.

## Implementation Notes

- **Typing-through** is detected from the `input` event's `inputType`/`data` plus a caret check, not from `beforeinput`. Chrome fires no `beforeinput` for `execCommand` insertions, and some IMEs don't either (found in the Chrome check). Typing the whole suggestion counts as `completion-accepted`.
- **Arabic under a fixed-LTR composer:** the ghost goes on the line below, left-aligned (option 1, see Decisions §6). Verified in Chrome on the demo with fidelity on, and on Agent Desktop.
- **`.gitignore`:** the telemetry log folder must be ignored as `/telemetry/` (anchored). Unanchored, it also matched `src/telemetry/` and `test/telemetry/` (caught by the fresh-copy check).
- **Retrieval stopwords:** "can" and "check" outranked content words until the English and Arabic stopword lists were extended.
- **Real Agent Desktop run** (dev tenant, October 2, 2026, fake model, loader with `{ mode: 'suggest', completion: true }`, nothing sent):
  - The English ghost text renders in Agent Desktop's own font (14px Trebuchet MS), starting 4 px (the leading space) after the caret on the same line, with the composer HTML unchanged.
  - Tab inserts it with one `input` event, and Undo restores the original. Escape dismisses it.
  - The Arabic ghost appears on the line below, left-aligned, RTL.
  - With no ghost, a real Tab moved focus out of the composer as the host normally does.
  - `detachAll()` left no ghosts, highlights or `spellcheck` changes.
- **Live Gemini check** (`gemini-3.5-flash-lite`, October 2, 2026, synthetic demo prompts, 30 requests, 0 errors or empty replies):
  - **Request shape:** accepted as built (`thinkingConfig` inside `generationConfig`).
  - **Latency:** round trip p50 about 530–560 ms, p95 about 740 ms, max 937 ms (the first, cold request). Server-side p50 558 ms, p95 648 ms. That's **above the architecture's 200–400 ms budget**, as anticipated. The ghost text appears roughly half a second after the pause. Abort-on-keystroke keeps stale text from showing.
  - **Quality** (5 EN + 5 AR reviewed): every completion continued the agent's sentence in the right language and closely followed the matching canned response. Two rough edges:
    1. The 20-word cap can cut a long canned sentence mid-phrase ("…notified by SMS once it is").
    2. One Arabic completion dropped the article ("وسجل الاشتراكات خاص بك محدث", where "الخاص" is grammatical).

    Both are prompt and post-processing tuning items, not blockers.
  - **Key hygiene:** the key was read from the gitignored `.env`; the server log contains no key material.
