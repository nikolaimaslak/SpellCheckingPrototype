# Tasks

## 1. Policy

- [x] 1.1 Extend `src/policy/` with `CompletionPolicy` (default `enabled: 'off'`, empty lists, both sources on), `AgentPreference.completion`, `AgentIdentity`, and `resolveCompletion(policy, pref, agent)`; extend `parsePolicy` and `parsePreference` with field-level fallbacks (stored Phase 2 settings without `completion` still parse); verify with `test/policy/policy.test.ts`: the `resolveCompletion` truth table (off, all, listed by team, listed by user, agent turns off when allowed, agent can't turn on, agent turning off ignored when choice not allowed) and the parse fallbacks

## 2. Completion service core (no network)

- [x] 2.1 Create `server/retrieval.ts` (normalization incl. Arabic alef/hamza/ة/ى folding for retrieval, tokenization, BM25-lite over the canned library, top 3 above a threshold) and `server/data/canned.json` (about 12 synthetic EN and AR entries with a `_note` saying it is synthetic demo data); verify with `test/server/retrieval.test.ts`: an English contribution-status query ranks the matching response first, "استعلام عن الاشتراكات" retrieves the entry spelled "الإشتراكات", and an unrelated query returns nothing
- [x] 2.2 Implement `server/prompt.ts` (system instruction; user content ordered approved responses → last 6 turns → prefix); verify with a unit test that the stable sections precede the prefix and that disabled sources are omitted
- [x] 2.3 Implement `server/postprocess.ts` per design §4; verify with table tests for every completion-service post-processing scenario (prefix repetition removed, second sentence cut, 20-word cap, newline cut, wrong script → empty, leading-space rules, Arabic ؟ terminator)
- [x] 2.4 Implement `server/models/fake.ts` and `server/complete.ts` (validate body; retrieve when canned is on; build prompt; call the model with a timeout; post-process; reply `{ completion, lang, latencyMs, model, sources }`; map no model → 503, model error → 502, timeout → 504, with sanitized reasons); verify with `test/server/complete.test.ts` using the fake model and failing or slow fakes

## 3. Gemini client and server wiring

- [x] 3.1 Implement `server/models/gemini.ts` (REST `generateContent` for `gemini-3.5-flash-lite`, `x-goog-api-key`, `systemInstruction`, `contents`, `generationConfig` with temperature 0.2, `maxOutputTokens` 48, `stopSequences ["\n"]`, minimal `thinkingConfig`, `AbortSignal` timeout, text extraction from `candidates[0].content.parts[0].text`, errors without the key); verify with `test/server/gemini.test.ts` using a mocked `fetch`: URL, header, body fields, extraction, and that the key never appears in thrown messages
- [x] 3.2 Implement `server/telemetry.ts` (per-type allowlist, JSONL append to `telemetry/events.jsonl`, summary math and HTML) and `server/main.ts` (routes, CORS, `.env` loading, `COMPLETION_MODEL=fake|gemini`, 503 when `gemini` lacks a key, `/health`), plus the `npm run server` script and `.gitignore` entries for `.env` and `telemetry/`; verify with `test/server/telemetry.test.ts` (non-allowlisted fields such as `text` dropped; summary for 10 shown, 4 accepted, 5 auto-corrections, 1 revert gives 40% and 20%) and a smoke run (`npm run server` with `COMPLETION_MODEL=fake`, then `curl` `/health`, `/v1/complete`, `/v1/events` and `/summary`)
- [x] 3.3 Live Gemini check (needs the user's `GEMINI_API_KEY` in the server environment; I never handle the key): start the server with `COMPLETION_MODEL=gemini`; confirm the request is accepted (adjusting the `thinkingConfig` placement if the API rejects it), review 5 English and 5 Arabic sample completions for the demo scenarios, and record p50 and p95 latency in design.md

## 4. Client: trigger, request, ghost overlay

- [x] 4.1 Implement `src/completion/trigger.ts` `shouldRequest` per design §5; verify with table tests: ≥ 3 words required, caret at line end, sentence boundary resets the count (incl. ؟), composing, popover and disabled suppress
- [x] 4.2 Implement `src/completion/client.ts` (`fetch` POST with abort and a 2.5 s timeout; non-200 or error → `null`); verify with unit tests using a mocked `fetch` (success, 503 → null, abort → null, timeout → null)
- [x] 4.3 Implement `src/completion/ghost.ts` (fixed overlay, font copy, direction from the last word's script, `text-indent` geometry via a `measure` seam, reposition and hide-when-scrolled-out, remove); verify with jsdom tests through the `measure` seam: LTR indent equals caret.right − content.left, RTL indent equals content.right − caret.left even when the composer is LTR, `aria-hidden` and `pointer-events: none`, and the overlay is outside the composer
- [x] 4.4 Implement `src/completion/controller.ts` `attachCompletion` per design §5 (debounce 400 ms, abort and stale drop, show and events, window-capture Tab and Escape while showing, typing-through on `beforeinput`, dismiss on other keys, caret moves, blur and host clearing, popover suppression, `detach`); verify with `test/completion/controller.test.ts` (jsdom, fake client, `replace` and `measure`): one request after the pause; abort on keystroke with the late reply ignored; Tab accepts once through `replace` and a host `keydown` listener doesn't see the Tab; Tab with no ghost is not intercepted; " wi" consumes, " has" dismisses; Escape doesn't reach the host; Enter dismisses without being prevented; no request while `[data-bp-spell-popover]` exists; events carry latency and lengths and no text
- [x] 4.5 Implement `src/telemetry/index.ts` (`createTelemetry`: queue, flush every 5 s via `fetch` keepalive, `sendBeacon` on hidden, failures swallowed); verify with unit tests (batching three events into one POST, a failing endpoint doesn't throw, hidden triggers a beacon)

## 5. Demo harness

- [x] 5.1 Add the Vite dev proxy (`/api` → `http://localhost:5175`) and a `src/demo/scenarios.ts` scripted conversation (English and Arabic pension inquiry, "Next customer message", "Customer says" input, role-labeled transcript items, RTL for Arabic); verify with `test/demo/scenarios.test.ts` (jsdom: playing a step appends a customer item with role and `dir="auto"`, and the transcript reader returns `{ role, text }` turns in order)
- [x] 5.2 Extend the settings panel (completion enablement off/all/listed with team and user lists, sources, agent completion preference locked unless allowed, current agent user and team, effective settings display) and wire `main.ts` (attach completion to both composers with `resolveCompletion`, telemetry for spelling and completion events, summary link); extend `test/demo/settings.test.ts` (listed-team switch flips the effective completion; stored Phase 2 settings still load)
- [x] 5.3 Scripted Chrome check with `COMPLETION_MODEL=fake`: after a customer message and "Thank you for contacting us, your request" plus a pause, ghost text appears right after the caret; Tab inserts it (one `input` event, one Undo removes it); typing-through consumes; Escape dismisses; Enter sends without the ghost; the composer HTML never contains the ghost
- [x] 5.4 Scripted Chrome RTL and geometry check with `COMPLETION_MODEL=fake`: with an RTL line (`dir="auto"`) and an Arabic sentence, the ghost text starts at the caret on the same line and extends left; with Agent Desktop fidelity (fixed LTR), it appears on the line below, left-aligned, in RTL order; a long completion wraps within the composer width; the ghost hides when the caret line scrolls out of the chat composer
- [x] 5.5 Telemetry check: after the 5.3 interactions, `/api/summary` shows completion shown and accepted counts, an acceptance rate and latency percentiles, and `telemetry/events.jsonl` contains no completion or composer text (`grep` for the typed sentence finds nothing)

## 6. Loader, docs, config

- [x] 6.1 Make `dev/ad-loader` attach completion only when `__bpSpellConfig.completion === true` (console warning about the hosted model, base URL `http://localhost:5175`, prefix-only context); verify `npm run typecheck`, and that on the demo page the loader with `{ completion: true }` and the fake model shows ghost text
- [x] 6.2 Update `openspec/config.yaml` (Tier 2 completion in scope from Phase 3, server-side only, key in the server environment), `CLAUDE.md` and `README.md` (`npm run server`, `.env` with `GEMINI_API_KEY`, `COMPLETION_MODEL`, the data-handling note, the summary page); verify every command listed runs

## 7. Real Agent Desktop check (with the user)

- [x] 7.1 With the user's go-ahead (and their key in the server environment, or the fake model), load the loader with `{ completion: true }` on the dev tenant and type a synthetic English and Arabic sentence **without sending**: ghost text renders at the caret in the GWT composer (Arabic leftwards under its fixed LTR), Tab inserts it as one undo step, Escape dismisses, and Tab with no ghost still moves focus as the host does; finish with `__bpSpell.detachAll()`

## 8. Integration

- [x] 8.1 Fresh-copy check (tracked files only, temp directory, no `.env`): `npm install && npm test && npm run build` pass, no test needs network or a key, and `npm run server` starts and answers 503 on `/v1/complete` without a key
- [x] 8.2 Run `openspec validate inline-completion --strict` and confirm it passes
