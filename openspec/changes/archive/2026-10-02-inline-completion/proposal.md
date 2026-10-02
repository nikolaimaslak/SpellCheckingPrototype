# Proposal

## Why

In PER #60145, GOSI asked for auto-complete like Gmail Smart Compose: the suggestion appears *inside the same chat or email editor* while the agent types, generic at first but ideally drawing on the live conversation and approved (canned) responses. An administrator must be able to enable it *globally or for specific users or teams*, and the agent accepts or ignores each suggestion. Their top goals are faster handling time and more consistent replies. Phases 1–2 delivered spell checking and auto-correct (#60254). This change delivers the first model-driven (Tier 2) capability, with the telemetry needed to judge whether it helps.

**Serves:** PER #60145, delivery phase 3 (inline completion grounded in the transcript and canned responses, per-team rollout, telemetry).

## What Changes

- **Inline completion (Tier 1 client):**
  - **When it asks:** after the agent pauses about 400 ms with the caret at the end of the text and enough of a sentence typed, the composer requests a completion. Any keystroke cancels the request in flight.
  - **How it shows:** as dismissible **ghost text** after the caret, drawn in an overlay so it never enters the editable DOM. It renders right to left for Arabic and fits the host's fixed left-to-right layout.
  - **Accepting:** **Tab** inserts it through the same native edit path as everything else (one undo step, host `input` event).
  - **Typing through:** typing characters that match the suggestion keeps the rest; anything else dismisses it, as does **Escape**.
  - **Coexistence:** suppressed while the spelling popover is open, during IME composition, and when completion isn't enabled for this agent.
- **Completion service (Tier 2, dev stand-in for the Intelligence Engine):** a small local Node server exposing `POST /v1/complete`.
  - **Context, cheapest first:** the recent transcript, then canned responses retrieved by lexical similarity to the customer's last message and the agent's sentence.
  - **Model:** **Google Gemini** (`gemini-3.5-flash-lite`, minimal thinking, low temperature, short output), over REST with the key only in the server environment.
  - **Output:** post-processed to at most one sentence that continues the agent's text in the same language.
  - **Contract:** a stable JSON interface with a configurable base URL, so the demo can later point at a real dev server or Intelligence Engine. If the model is unavailable, the endpoint fails cleanly and the composer simply shows nothing.
- **Telemetry (dev):** the client sends assistance events in batches to `POST /v1/events`:
  - **Completions:** shown, accepted, dismissed, latency.
  - **Spelling:** auto-correct, revert, accepted suggestion, ignore.

  The server appends them to a local JSONL file, and a `/summary` page shows completion acceptance rate, auto-correct revert rate and latency percentiles. Completion text and transcripts are **not** logged.
- **Policy (assist-policy):** adds completion enablement: off, on for everyone, or on only for listed teams and users. It also adds context-source toggles (transcript, canned responses) and lets the agent turn completion off for themselves when the admin allows agent choice.
- **Demo harness:**
  - **Conversation:** a scripted customer side (English and Arabic GOSI-style scenarios) so the transcript has customer messages.
  - **Canned responses:** a synthetic library, clearly marked as demo data.
  - **Settings:** completion controls in the settings panel, with a "current agent" team and user selector.
  - **Telemetry:** a link to the summary.

## Non-goals

- Knowledge base grounding for completion (Phase 4).
- Grammar polish (Phase 4).
- Embedding-based retrieval. The architecture calls for embeddings; this prototype uses lexical similarity over a small library, behind the same interface.
- Real Intelligence Engine or Contact Center Administrator integration, real privileges, and production data handling (masking, retention).
- Handling-time (AHT) measurement, which needs real interaction timing.
- Completion on the real Agent Desktop beyond a rendering and acceptance check. Composer text would leave for Google, so it's only done with synthetic text on the dev tenant with your go-ahead.

## Data handling (prototype)

The completion request (recent transcript, canned snippets, the agent's current sentence) is sent from the dev server to Google's Gemini API. That's acceptable only for **synthetic demo conversations**. The dev-only Agent Desktop loader leaves completion **off** unless explicitly enabled, and prints a warning when it is. The production design keeps this traffic inside the Intelligence Engine's tenant boundary (architecture §4).

## New third-party dependencies

| Dependency | Use | License / terms | Shipped? |
|---|---|---|---|
| Google Gemini API (`gemini-3.5-flash-lite`), called over REST with `fetch` | completion model for dev | Google APIs Terms of Service and Gemini API Additional Terms; needs `GEMINI_API_KEY` | no (dev server only) |

No new npm packages: plain `fetch` on Node 25, and `node:http` for the server.

## Capabilities

### New Capabilities
- `inline-completion`: when completions are requested, how ghost text is shown, accepted, typed through and dismissed, and how it coexists with spell checking and the host.
- `completion-service`: the completion endpoint contract, context assembly and retrieval, model call, output post-processing, failure behavior and key handling.
- `assist-telemetry`: event batching from the client, the local event log, what is and isn't recorded, and the summary page.

### Modified Capabilities
- `assist-policy`: "Admin policy" gains completion enablement (all, or listed teams and users) and context-source toggles. "Admin settings take precedence" covers the agent turning completion off.
- `demo-harness`: "Admin and agent settings panel" gains completion controls and the current-agent selector; adds a scripted customer conversation, a synthetic canned library and a telemetry summary link.

## Impact

- **New code:** `src/completion/` (client: trigger, overlay, accept), `server/` (completion service, retrieval, Gemini client, telemetry, summary page, demo data), `src/telemetry/` (batching client).
- **Changed:** `src/policy/`, `src/composer/attach.ts` (shared accept path and popover-open state), `src/demo/*`, `vite.config.ts` (dev proxy `/api` → completion server), `package.json` scripts (`npm run server`), `.gitignore` (`.env`, `telemetry/`), `CLAUDE.md` and `README.md`, `openspec/config.yaml` (Tier 2 is now in scope).
- **Secrets:** `GEMINI_API_KEY` is read from the server's environment (or a gitignored `.env`) and never reaches the browser or the repository.
