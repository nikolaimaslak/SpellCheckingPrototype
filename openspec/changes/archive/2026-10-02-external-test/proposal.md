# Proposal

## Why

The prototype now covers all four delivery phases, but only the people who built it can run and judge it. Today a tester would need to read the code to know they must run two servers, find the right port (the dev server is on a non-default port and binds to IPv6 `localhost` only), create a Gemini key or get HTTP 503s, and guess what "correct" behavior looks like. The settings they change persist in the browser with no way back. External testers (partner and customer-side reviewers) need to clone, start and test it in minutes, know what to expect, and send back reports that can be reproduced.

**Serves:** infrastructure for PER #60254 and #60145 (external validation of phases 1–4).

## What Changes

- **One-command start:** `npm run demo` checks the Node version, provisions dictionaries, starts the completion server and the demo page together, prints a single URL, and stops both on Ctrl+C. No new dependencies.
- **Switchable model, safe by default:**
  - **Default:** `COMPLETION_MODEL=auto`, which uses Gemini when `GEMINI_API_KEY` is set and otherwise the offline test model.
  - **Overrides:** `gemini` or `fake` can be set explicitly.
  - **Visible:** `/health` reports which model is active and whether it sends text externally, and the demo page shows a banner: "Gemini: typed text is sent to Google, use made-up text only", "Offline test model: completion and polish show canned results", or "Completion and polish unavailable".
  - `.env.example` documents the settings.
- **Tester guide (`docs/TESTING.md`):**
  - **Setup:** requirements and the start command.
  - **Test scenarios:** one per feature, each with exact input and expected result, taken from what has been verified.
  - **Known limitations:** for example "afte" stays underlined (ambiguous), KI-1, Arabic ghost text placement in a left-to-right composer, latency, synthetic data only.
  - **Data handling notes.**
  - **Reporting:** how to report a problem.
- **Report template:** a test report template (`docs/TEST-REPORT-TEMPLATE.md`, mirrored as a GitHub issue template) asking for steps, input text, expected and actual results, browser, model banner and the version stamp.
- **Demo page for testers:**
  - **Presets:** "Spell check only", "Auto-correct", "Everything on".
  - **Reset:** a "Reset demo settings" control.
  - **Version stamp:** shown on the page (package version plus git commit), so reports name the exact build.
  - **Browser notice:** shown when the browser lacks the CSS Custom Highlight API that underlines depend on.
- **README:** rewritten around a tester-first quick start (clone, `npm install`, `npm run demo`), supported browsers, the model banner, troubleshooting (port in use, use `localhost` not `127.0.0.1`, no key), and links to the tester guide. Developer details move below.
- **`package.json` `engines`:** Node ≥ 23.6 (scripts and the server run TypeScript directly).

## Non-goals

- Hosting or a container deployment (you chose local runs). The Agent Desktop dev loader stays developer-only and isn't part of the tester guide.
- Collecting telemetry from testers automatically. The guide explains how to share the local summary if asked.
- Changes to assistance behavior (spelling, auto-correct, completion, polish) beyond the model selection default.
- Frequency-based auto-correct (the "afte" case). It's documented as a known limitation and a future item.

## New third-party dependencies

None.

## Capabilities

### New Capabilities
- `tester-kit`: everything an external tester needs to run and report: the one-command start with version check, environment template, tester guide with scenarios and expected results, known limitations, report template, and the README quick start.

### Modified Capabilities
- `completion-service`: "Model call" gains the `auto` default (Gemini with a key, otherwise the offline model), explicit overrides, and `/health` reporting of the active model and external data flow.
- `demo-harness`: adds the model banner, presets and reset, version stamp, and browser-support notice.

## Impact

- **New files:** `scripts/demo.ts`, `.env.example`, `docs/TESTING.md`, `docs/TEST-REPORT-TEMPLATE.md`, `.github/ISSUE_TEMPLATE/test-report.md`.
- **Changed:** `server/main.ts` (model selection, `/health`), `src/demo/*` and `index.html` (banner, presets, reset, version, browser notice), `vite.config.ts` (version define), `package.json` (`demo` script, `engines`), `README.md`, `CLAUDE.md`.
- **Assumption:** testers send reports to whoever shared the repo with them (they may not have access to the private GitHub repo). The GitHub issue template is for those who do.
