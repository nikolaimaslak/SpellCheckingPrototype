# Tasks

## 1. Policy

- [x] 1.1 Extend `src/policy/`: `CompletionPolicy.sources.kb` (default true), `AdminPolicy.grammar` (`off`/`all`/`listed`, teams, users; default off), `AgentPreference.grammar`, a shared listed-enablement helper behind `resolveCompletion` and a new `resolveGrammar`, and parse fallbacks; verify with `test/policy/policy.test.ts`: the `resolveGrammar` truth table (off, all, listed by team and by user, agent opt-out only when allowed, agent can't enable), and stored Phase 3 settings parse with `grammar` off and `kb` on

## 2. Knowledge base grounding (server)

- [x] 2.1 Generalize `server/retrieval.ts` to `rank(items, weightedQueries, k, threshold)` (canned behavior unchanged; existing retrieval tests still pass), add `server/data/kb.json` (about 6 synthetic EN and 6 AR articles, `_note` labeled synthetic) with passage splitting (≤ 2 sentences, title-prefixed, ids `kb:<article>#<n>`) and `retrieveKb(passages, customer)` with a named `KB_THRESHOLD`; verify with `test/server/kb.test.ts`: strong EN and AR questions (early retirement, survivor benefits) return the right passage, while greetings, thanks and off-topic questions return nothing (this calibrates `KB_THRESHOLD`)
- [x] 2.2 Add the `Knowledge base:` prompt section (after approved responses, before conversation), update `SYSTEM_INSTRUCTION` to cover the knowledge base, parse `sources.kb` in `server/complete.ts`, append passage ids to `sources`, and let the fake model fall back to the first knowledge base passage; verify with prompt and complete tests (section order; `kb: false` sends no passage; a strong match lists `kb:` ids; a weak match lists none)
- [x] 2.3 Add `sources.kb` to the client completion request (`src/completion/client.ts` types, the demo and the loader pass the policy value); verify `npm run typecheck` and an updated controller test asserting `sources.kb` is forwarded

## 3. Polish service (server)

- [x] 3.1 Extend `CompletionModel.complete` with optional `{ maxOutputTokens, stopSequences }`, mapped by the Gemini client into `generationConfig` (completion defaults unchanged when absent); verify with `test/server/gemini.test.ts` (options override; defaults intact without them)
- [x] 3.2 Implement `server/polish.ts` per design §3 (validation, `POLISH_INSTRUCTION`, model options, output cleanup, protected-token multiset check, length ratio 0.7–1.3, equal line-break count, majority-script `lang`, 400/503/502/504, sanitized reasons) and the fake model's deterministic polish table; wire `POST /v1/polish` in `server/main.ts`; verify with `test/server/polish.test.ts`: corrected EN and AR via fakes; `$(user.firstName)`, URL and reference-number changes rejected with a reason; over- and under-length rejected; line-break change rejected; fenced output cleaned; 400 for empty and > 4000 characters; 503 without a model; the key never appears in a reply
- [x] 3.3 Extend `server/telemetry.ts` (allowlist for the four polish types with `latencyMs` and `changes`; summary polish acceptance and latency p50; HTML card); verify with telemetry tests (4 previews with changes, 3 accepted → 75%; text fields dropped from polish events)

## 4. Polish client

- [x] 4.1 Implement `src/polish/diff.ts` per design §4; verify with `test/polish/diff.test.ts`: "He go … buyed" → two replace hunks with correct offsets; pure insertion and deletion; Arabic word replacement keeps marks within tokens; punctuation-only change; hunks touching `\n` dropped
- [x] 4.2 Implement `src/polish/client.ts` (POST `{base}/v1/polish`, 6 s timeout, errors → `null`) and `src/polish/apply.ts` per design §5 (stale check, single-run single replace, per-span last-to-first with live-range revert records, pure insertions); verify with `test/polish/apply.test.ts` (jsdom, text-mutating fake `replace`): plain text → exactly one `replace`; `<b>` between hunks → one `replace` per hunk applied last to first, bold still present, and revert restores the original text; stale text → refused with no `replace`
- [x] 4.3 Implement `src/polish/ui.ts` (overlay button with states and positioning, preview panel with `<ins>`/`<del>`, `dir`, Accept/Dismiss/Close, Escape capture, "no changes" and "unavailable" states, 10 s Revert toast) and `src/polish/controller.ts` `attachPolish(el, { fetcher, onEvent, onOpen, env })` with `detach`; add `dismiss()` to the completion handle, polish-panel suppression to completion's trigger, and a polish-panel check before opening the spelling popover; verify with `test/polish/controller.test.ts` (jsdom): button disabled under 3 words; Polish calls `onOpen` and renders hunks; Arabic panel is `dir="rtl"`; Escape closes without reaching a host listener and leaves the text; Accept applies and emits `polish-accepted` without text; no-changes and unavailable states offer only Close; completion requests nothing while the panel is open; detach removes all overlays

## 5. Demo harness

- [x] 5.1 Extend the settings panel (knowledge base source, grammar enablement with team and user lists, agent grammar preference, effective display) and `main.ts` (attach polish to both composers with `resolveGrammar`, `onOpen` → completion `dismiss`, polish events into the counter and telemetry); extend `test/demo/settings.test.ts` (grammar `all` → effective "polish on"; agent opt-out honored only when allowed; stored Phase 3 settings load)
- [x] 5.2 Scripted Chrome check (fake model): the chat draft "He go to the office yesterday and buyed a pen." → Polish → the panel shows the ins/del changes → Accept → corrected text, one `input` event per replace, and one Undo restores the draft; showing ghost text then pressing Polish dismisses the ghost
- [x] 5.3 Scripted Chrome check (fake model): an email draft with "the office" in bold → Accept keeps the bold and shows Revert polish → Revert restores the original words; an Arabic draft shows an RTL panel; editing the draft while the panel is open makes Accept refuse
- [x] 5.4 Telemetry check: after 5.2 and 5.3, `/api/summary` shows polish acceptance and latency, and `telemetry/events.jsonl` contains none of the draft or corrected sentences

## 6. Loader and docs

- [x] 6.1 Make `dev/ad-loader` attach polish only with `{ grammar: true }` (console warning, base URL `http://localhost:5175`, `onOpen` → completion `dismiss` when both are on); verify `npm run typecheck`, and that on the demo page the loader with `{ grammar: true }` and the fake model shows the Polish button and panel
- [x] 6.2 Update `CLAUDE.md` (layout: `src/polish`, `server/polish.ts`, `kb.json`) and `README.md` (Polish button, knowledge base grounding, data handling); verify the documented commands run

## 7. Live and real-host checks

- [x] 7.1 Live Gemini check (key already in `.env`): restart the server in Gemini mode; polish 5 English and 5 Arabic synthetic drafts and review for over-editing and grammar quality; run 2 knowledge base-grounded completions (EN and AR) and confirm `kb:` sources and on-topic text; record polish latency p50/p95 and findings in design.md
- [x] 7.2 With the user's go-ahead, on the dev tenant: load the loader with `{ grammar: true }` (fake model, or Gemini with synthetic text) and, **without sending**, Polish a synthetic draft in the GWT chat composer: the button is placed by the composer, the panel opens, Accept applies with one Undo restoring, and Escape closes without the host reacting; finish with `__bpSpell.detachAll()`

## 8. Integration

- [x] 8.1 Fresh-copy check (tracked files only, temp directory, no `.env`): `npm install && npm test && npm run build` pass offline, and `npm run server` answers 503 on `/v1/polish` without a key
- [x] 8.2 Run `openspec validate kb-grammar --strict` and confirm it passes
