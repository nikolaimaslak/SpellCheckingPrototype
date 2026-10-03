# Tasks

## 1. Model selection

- [x] 1.1 Create `server/model-select.ts` `selectModel(env)` per design §3 and use it in `server/main.ts` (startup log names the model and whether text leaves the machine; `/health` returns `{ ok, model, mode, external }`); verify with `test/server/model-select.test.ts`: auto without a key → fake (external false), auto with a key → Gemini (external true), `gemini` without a key → null, `fake` → fake, unknown value → auto with a warning flag; and a smoke run of `/health` in auto mode without a key

## 2. One-command start and config

- [x] 2.1 Implement `scripts/demo.ts` per design §1 with exported pure helpers `nodeVersionOk` and `portFree`; add `"demo": "node scripts/demo.ts"`, `engines.node: ">=23.6.0"` and version `0.1.0` to `package.json`; verify with `test/scripts/demo.test.ts` (version comparisons; `portFree` false while a test server holds the port, true after it closes)
- [x] 2.2 Set Vite `server.host: '127.0.0.1'` and the default port 5173, and define `__APP_VERSION__` (package version plus short git commit, `unknown` on failure); verify `npm run typecheck`, and that `curl` reaches both `http://localhost:5173/` and `http://127.0.0.1:5173/` during `npm run dev`
- [x] 2.3 Manual run of `npm run demo`: one banner with URL and model; Ctrl+C stops both (`lsof -i :5173 -i :5175` shows nothing); a held port 5173 produces the port message before anything starts

## 3. Demo page additions

- [x] 3.1 Add `src/demo/model-banner.ts` (states: Gemini warning, offline test model, unavailable; on load and after Apply) and the browser-support notice; verify with `test/demo/banner.test.ts` (jsdom, mocked `fetch`: each health response renders the right state; a network error renders "unavailable"; a missing `CSS.highlights` renders the browser notice)
- [x] 3.2 Add presets ("Spell check only", "Auto-correct", "Everything on") and "Reset demo settings" to the settings panel; verify with `test/demo/settings.test.ts`: "Everything on" yields effective auto, completion on and polish on and submits; reset clears storage and restores the defaults
- [x] 3.3 Add the version stamp footer; verify with a jsdom test that renders a given `__APP_VERSION__`, and in the browser that the footer shows the current commit

## 4. Tester documentation

- [x] 4.1 Add `.env.example` (`GEMINI_API_KEY=`, `COMPLETION_MODEL=auto`, with data-flow comments); verify `.env` remains gitignored and `.env.example` is tracked (`git check-ignore`)
- [x] 4.2 Write `docs/TESTING.md` per design §5 (setup, banner, scenarios T1–T8 with exact EN/AR inputs and expected results including must-not-change cases, known limitations incl. "afte" and KI-1, data handling, reporting); verify every scenario input and expected result against the running demo in task 6.1
- [x] 4.3 Write `docs/TEST-REPORT-TEMPLATE.md` and `.github/ISSUE_TEMPLATE/test-report.md` (scenario, steps, input text, expected and actual, browser and version, language, model banner, version stamp, screenshot); verify both contain the same fields
- [x] 4.4 Rewrite `README.md` tester-first (quick start in three commands, browsers, banner, troubleshooting: port in use, `localhost`, no key; link to the guide; developer section after) and update `CLAUDE.md` (`npm run demo`, new files, port 5173); verify every command in both runs

## 5. Integration

- [x] 5.1 Run the full test suite, typecheck and build, and `openspec validate external-test --strict`

## 6. External-tester dry run

- [x] 6.1 Fresh-copy dry run as a tester (tracked files only, temp directory, no `.env`): follow the README and `docs/TESTING.md` exactly with `npm run demo` (offline model), walk through T1–T8 in Chrome and confirm every expected result. Then add a key in the temp copy's `.env` (with your go-ahead, using the existing key) and confirm the banner switches to the Gemini warning and T4/T6 produce live results. Record any guide corrections.
