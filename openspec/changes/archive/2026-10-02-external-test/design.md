# Design

## Context

See proposal.md (Why). Observed current state:
- **Two processes:** `npm run dev` (Vite) and `npm run server` (completion server on 5175, model chosen by `COMPLETION_MODEL`, default `gemini`). Without a key, completion and polish answer 503.
- **Vite on macOS** binds `localhost` to `[::1]` only, so `http://127.0.0.1:<port>` doesn't load (hit during this project).
- **`package.json`** has version `0.0.0` and no `engines`. Scripts and the server run `.ts` directly under Node, which needs Node ≥ 23.6 (unflagged type stripping).
- **Demo settings** persist in `localStorage` with no reset. Defaults: mode `suggest`, completion and polish off.
- **Browser support:** spelling underlines and auto-correct highlights require `CSS.highlights` (Chrome/Edge 105+, Safari 17.2+, Firefox 140+).

## Goals / Non-Goals

**Goals:**
- From a fresh clone to a working page in three commands, with no key required.
- A tester can always tell which model is active and whether their text leaves the machine.
- Every report names the exact build and model.

**Non-Goals:**
- Hosting, containers or LAN exposure. Everything binds to the loopback interface.
- Automated end-to-end browser tests for testers. The guide is the test plan.

## Decisions

### 1. `npm run demo` orchestrator (tooling, `scripts/demo.ts`)
A dependency-free Node script (run directly, like `fetch-dicts.ts`) with pure, unit-tested helpers:
- `nodeVersionOk(version, '23.6.0')`.
- `portFree(port)`: a `net.createServer().listen()` probe on `127.0.0.1` and `::1`.

Flow:
1. Check Node and both ports (5173, 5175). On a conflict, exit with a message naming the port and an `lsof -i :PORT` hint.
2. Run `fetch-dicts` synchronously.
3. Spawn `node server/main.ts` and `vite --port 5173 --strictPort`, prefixing their output with `[server]` and `[demo]`.
4. When Vite prints its ready line, query `http://localhost:5175/health` and print one banner: the URL plus the active model and whether it sends text to Google.
5. On SIGINT or SIGTERM, or when either child exits, kill both and exit with the child's code.

*Alternative: the `concurrently` npm package.* Rejected: a new dependency for about 80 lines.

### 2. Loopback binding (config, `vite.config.ts`)
`server.host: '127.0.0.1'`. `http://localhost:5173/` still works, because browsers fall back from `::1` to `127.0.0.1`, and `127.0.0.1` now works too. That removes the IPv6-only pitfall without exposing the page to the LAN. The demo's default port moves back to Vite's standard 5173.

### 3. Model selection (Tier 2, `server/model-select.ts`)
`selectModel(env) → { model, mode, external }`, pure and unit-tested:

| Mode | Behavior |
|---|---|
| `auto` (default) | Gemini if `GEMINI_API_KEY`, else the fake model |
| `gemini` | Gemini, or null without a key (→ 503, as before) |
| `fake` | the fake model |
| unknown value | treated as `auto`, with a startup warning |

`GET /health` returns `{ ok, model, mode, external }`. `server/main.ts` uses this function. Startup logs name the model and whether text is sent externally, never the key.

### 4. Demo page additions (demo harness, `src/demo/`)
- **Model banner (`model-banner.ts`):** fetches `/api/health` with a 2 s timeout on load and after every Apply, then renders one of three states into a `role="status"` element at the top. The Gemini state is styled as a warning.
- **Presets and reset (`settings.ts`):** a `PRESETS` map from name to a partial `DemoSettings`. A preset fills the form and submits it, reusing the existing apply path. Reset removes the storage key, refills the defaults and applies.
  - Spell check only: `suggest`, completion off, polish off.
  - Auto-correct: `auto`, completion off, polish off.
  - Everything on: `auto`, completion `all`, polish `all`, all sources.
- **Version stamp:** `vite.config.ts` defines `__APP_VERSION__` as `package.json` version plus `git rev-parse --short HEAD` (try/catch → `unknown`). It's rendered in a footer, and `package.json` version is set to `0.1.0` for the first external test round.
- **Browser notice:** `if (!('highlights' in CSS))`, render a notice naming the supported browsers. Spelling still runs, but underlines can't paint.

### 5. Documentation (tester kit)
- **`docs/TESTING.md`:**
  - setup (Node ≥ 23.6, supported browsers, `npm install`, `npm run demo`, optional key in `.env`);
  - the model banner explained;
  - scenarios T1–T8 (spell check, auto-correct, auto-correct revert, inline completion, knowledge base grounding, grammar polish, admin and agent settings, telemetry summary), each with presets to choose, exact inputs (English and Arabic) and expected results. They're taken from behavior verified in Chrome during phases 1–4, including the must-not-change cases;
  - known limitations;
  - data handling;
  - reporting.
- **`docs/TEST-REPORT-TEMPLATE.md`** and **`.github/ISSUE_TEMPLATE/test-report.md`:** the same fields, with frontmatter for GitHub.
- **`README.md`:** tester quick start first, then browsers, the banner, troubleshooting and the link to the guide; the developer section after (scripts, layout, licensing, planning).
- **`CLAUDE.md`:** adds `npm run demo` and the new files.
- **`.env.example`:** both variables, with data-flow comments.

### Tier map
| Component | Tier |
|---|---|
| `scripts/demo.ts`, `vite.config.ts` | tooling |
| `server/model-select.ts`, `/health` | Tier 2 stand-in |
| banner, presets, reset, version, browser notice | demo harness |
| docs, templates, README | documentation |

## Risks / Trade-offs

- [Testers on Node < 23.6] → An early, explicit error with the required version. The README states the requirement first.
- [Port conflicts with other local tools] → An explicit check with a hint. Ports aren't configurable in this round, to keep the guide simple.
- [Testers paste real customer text while Gemini is active] → A prominent banner, the guide's data-handling section, and the default being the offline model unless the tester adds their own key.
- [Guide drift: expected results stop matching behavior] → The guide is walked through on a fresh clone as part of this change (task 6.x), and the scenarios cite only behavior covered by tests or recorded checks.

## Migration Plan

Developers who used `npm run dev` on port 5199: the default is now 5173, and `npm run dev` and `npm run server` keep working separately. No stored settings change.

## Open Questions

None.

## Implementation Notes

- **Port probe:** a test *bind* on `127.0.0.1` succeeds on macOS even while another server listens on the wildcard address (`*:5175`), so the first version missed a real conflict and the server crashed instead. `portFree` now *connects* to both loopback addresses (caught during task 2.3, with a regression test).
- **Completion server bound to loopback:** it listened on all interfaces (`*:5175`), which would have exposed the endpoint (and the key's quota) to the tester's network. It now binds `127.0.0.1`, and the Vite proxy targets `127.0.0.1:5175`.
- **An empty `COMPLETION_MODEL=`** (as in `.env.example`, when left blank) means `auto`, silently.
- **Tester dry run** (fresh tracked-files copy, no `.env`, offline model, Chrome, October 2, 2026):
  - **Start:** `npm run demo` printed one banner (URL plus "offline test model").
  - **Page:** the banner, version stamp (`v0.1.0 · <commit>`), presets and defaults were correct.
  - **Scenarios:** T1.1–T1.10, T2.1–T2.12, T3.1–T3.3, T4.1–T4.8, T5.1–T5.2, T6.1–T6.7, T7.1–T7.4 and T8.1 all matched the guide.
  - **Telemetry:** the log held 40 events with no typed, suggested or polished text.
  - **Reset:** restores the defaults and persists across a reload.
  - **Not script-testable:** T2.13 (real paste) can't be produced by a script and is covered by the unit test (`insertFromPaste` is ignored); a tester checks it by hand.
  - **No guide corrections were needed.** Suggestion lists can vary slightly between runs (KI-1); the guide only asserts the first suggestion.
- **Live half of the dry run** (same fresh copy with `.env` copied in, then deleted):
  - `npm run demo` announced Gemini with the Google warning, and the page banner switched to the yellow warning state.
  - T4.2 live completion in 648 ms; Tab inserted it. T4.7 Arabic completion "وسيتم معالجته خلال ثلاثة أيام عمل…".
  - T6.1 live polish in 439 ms (go/buyed → went/bought); Accept applied. T6.4 Arabic preview RTL (هذه → هذا).
  - The 20-word completion cap still ends some suggestions mid-phrase (known tuning item).
