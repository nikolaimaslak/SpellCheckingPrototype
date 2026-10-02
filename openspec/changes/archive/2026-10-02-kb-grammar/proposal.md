# Proposal

## Why

The architecture's last phase finishes both tickets:
- **Grounding:** completions stay generic unless the customer's question matches a canned response. GOSI asked for suggestions that can draw on their **knowledge base** (PER #60145).
- **Grammar:** GOSI said grammar correction *"would provide additional value for both Arabic and English"* and pointed to Konnect Insights, where it's a button (PER #60254).

Rule-based grammar checkers have effectively no Arabic coverage, so the architecture runs grammar as an on-demand model action in Tier 2 rather than on every keystroke.

**Serves:** PER #60145 + PER #60254, delivery phase 4 (knowledge base grounding for completion; on-demand grammar polish).

## What Changes

- **Knowledge base grounding (completion service):**
  - **Data:** a synthetic English and Arabic knowledge base (`server/data/kb.json`, labeled synthetic), split into passages.
  - **When it's used:** only when the **customer's last message** retrieves a passage with **high confidence**, because a weak match is worse than none. Then at most 2 passages are added to the prompt, after the canned responses.
  - **Reporting:** the reply lists which passages were used.
  - **Hallucination guard:** the system instruction forbids figures or policies not found in the canned responses, the knowledge base or the conversation.
  - **Control:** a new `kb` context source, switchable in the policy.
- **Grammar polish service (Tier 2):** `POST /v1/polish` takes the agent's draft and returns a corrected version (grammar and spelling only; meaning, tone and wording otherwise kept).
  - **Protected content:** `$(substitution.fields)`, URLs, emails, numbers and reference codes must come back unchanged.
  - **Length check:** the result must stay within ±30% of the draft's length.

  A result failing either check is returned as "no changes" with a reason. Same model setup as completion (Gemini in dev, the fake model offline), with the key server-side only.
- **Grammar polish in the composer (Tier 1 client):**
  - **Button:** a small "Polish" button by the composer, drawn as an overlay outside the editable DOM, the button style GOSI knows.
  - **Preview:** it shows a panel with the corrected text, changed words highlighted (deletions struck through), in the right direction for Arabic.
  - **Accept or Dismiss:** **Accept** applies only the changed words. **Dismiss** or Escape leaves the draft untouched.
  - **Undo:**
    - *Changes within one text run* (chat, or plain email text): one replace, undone by a single Undo.
    - *Changes across formatting* (bold, lists): applied per change so formatting survives, and a short-lived **"Revert polish"** button restores everything in one click.
  - **Stale drafts:** if the agent edited the draft while the preview was open, Accept is refused and they're asked to polish again.
- **Policy:** grammar polish enablement (off, all, listed teams and users) with agent opt-out when allowed, and the `kb` completion source.
- **Telemetry:** `polish-shown` (change count, latency), `polish-accepted`, `polish-dismissed` and `polish-reverted` events (no text). The summary adds polish acceptance rate and latency.
- **Demo and loader:**
  - **Demo:** grammar and knowledge-base settings in the panel, and a Polish button on both composers.
  - **Loader:** polish only with `{ grammar: true }`, plus a console warning, as for completion.

## Non-goals

- Real Bright Pattern knowledge base integration (your choice: synthetic for now; the retrieval interface is where a connector plugs in).
- Inline grammar underlines (your choice: preview, then accept).
- Style or tone rewriting, translation, or summarization: grammar and spelling only.
- Embedding retrieval: still lexical, like the canned responses.
- Production data handling. As with completion, the draft goes to the hosted model, so it's for synthetic text only.

## New third-party dependencies

None. Gemini is already used, under the same terms and key handling.

## Capabilities

### New Capabilities
- `grammar-polish`: the composer's Polish button, preview panel, accept, dismiss and revert behavior, and polish events.
- `polish-service`: the polish endpoint contract, instructions, protected-content and length safety checks, and failure behavior.

### Modified Capabilities
- `completion-service`: "Context assembly" adds high-confidence knowledge base passages and the `kb` source.
- `assist-policy`: "Admin policy" adds the `kb` source and grammar enablement; "Admin settings take precedence" covers grammar opt-out.
- `assist-telemetry`: "Event batching", "What is recorded" and "Summary page" cover polish events.
- `demo-harness`: "Admin and agent settings panel" adds grammar controls and the knowledge base source.

## Impact

- **New code:** `server/polish.ts`, `server/data/kb.json`, KB passage retrieval in `server/retrieval.ts`, `src/polish/` (button, panel, diff, apply).
- **Changed:** `server/complete.ts`, `server/prompt.ts`, `server/main.ts`, `server/models/fake.ts`, `server/telemetry.ts`, `src/policy/`, `src/completion/client.ts` (the `kb` source), `src/demo/*`, `dev/ad-loader/loader.ts`, `CLAUDE.md` and `README.md`.
- **Host interaction:** polish edits go through the same native edit path. The button, panel and toast are body-level overlays, removed on detach.
