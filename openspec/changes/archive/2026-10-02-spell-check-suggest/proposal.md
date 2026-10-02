# Proposal

## Why

GOSI's top request in PER #60254 is spelling help while agents type, in Arabic and English, built into Agent Desktop because their InfoSec policy bans extensions. The `repo-scaffold` change proved the engine path (Hunspell WASM in a worker, both dictionaries). Phase 1 now puts it in front of agents in its lowest-risk form: misspelled words get underlined and the agent picks a fix. Nothing is replaced automatically yet. This change also settles two facts that were open:
- The real Agent Desktop chat composer, observed on a 5.x dev tenant, is a GWT `<div contenteditable="true">`, so the architecture's CSS Custom Highlight approach applies directly.
- AyaSpell is tri-licensed GPL-2+ / LGPL-2.1+ / MPL-1.1 (per Debian's `hunspell-ar` copyright file), so Arabic can ship under MPL 1.1 like Hunspell.

**Serves:** PER #60254, delivery phase 1 (spell check EN + AR, suggest-only).

## What Changes

- **Tokenizer:** splits composer text into words with their exact DOM ranges. It skips URLs, emails, tokens containing digits and `$(substitution.fields)`, routes each word to Arabic or English by script, and only reports a word once it is *settled* (the caret has left it).
- **Composer spell check:** one `attach(element, options)` hook for any `contenteditable` composer:
  - **Watching:** observes edits on a debounce and keeps a per-word result cache.
  - **Underlines:** drawn with the CSS Custom Highlight API, never inside the editable DOM.
  - **Suggestions:** a popover opened by click or keyboard offers fixes, "Ignore" (for this session) and dismissal.
  - **Applying a fix:** goes through the editor's native input path, so one undo reverts it and the host app (GWT) sees a normal input event.
  - **Native spellcheck:** turned off on the field only once the engine is ready.
  - **Teardown:** `detach()` restores everything.
- **Arabic handling:** a word is checked as typed first, then with diacritics and tatweel removed, so valid vowelled forms are never flagged.
- **Worker:** adds a batch `check` request so one round trip covers a whole edit.
- **Arabic dictionary becomes a normal shipped asset (BREAKING for the scaffold's licensing guard):**
  - The pinned AyaSpell pair is committed under `dicts/ar/` with its license notice, and MPL 1.1 is elected.
  - `fetch-dicts` provisions both languages offline.
  - The `INCLUDE_AR_DICT` gate and the `.local-dicts` path are removed, and the manifest marks Arabic redistributable.
- **Demo harness:**
  - The chat stand-in now matches the real composer: `contenteditable="true"`, normal white-space, and buttons that insert an emoji or a predefined message the way Agent Desktop does.
  - An "Agent Desktop fidelity" toggle forces the host's hard-coded LTR base direction.
  - Both composers get spell check attached.
- **Real Agent Desktop check (dev only):** a loader script, never shipped, that attaches the layer to the live chat composer on a dev tenant. It builds the worker from a blob URL; the tenant was checked to have no CSP, and blob workers and WASM run there.

## Non-goals

- Auto-replacement and the confidence layer (Phase 2).
- Admin configuration UI, privileges, custom dictionary (Phase 2). Phase 1 takes `enabled` and `languages` as attach options, standing in for the tenant feature flag.
- Grammar, inline completion, any Tier 2 or server call.
- Fixing Agent Desktop's hard-coded LTR direction on the composer. This change records it as a product finding and doesn't patch it.
- Shipping inside Agent Desktop itself. That needs an Agent Desktop source change; here the layer is a standalone module plus the dev-only loader.
- The real email editor. Its element type hasn't been observed yet, so Phase 1 targets the demo's `contenteditable` email stand-in, and the real editor is an open question.

## New third-party dependencies

| Dependency | Use | License | Shipped? |
|---|---|---|---|
| AyaSpell Arabic `.aff`/`.dic` (LibreOffice `dictionaries` @ `32b006a2`, already pinned) | Arabic dictionary | GPL-2+ / LGPL-2.1+ / MPL-1.1; **MPL 1.1 elected** | **yes** (status changes from local-only) |

No new npm packages. Word segmentation uses the built-in `Intl.Segmenter`.

## Capabilities

### New Capabilities
- `text-tokenizer`: word segmentation with DOM ranges, exclusion rules, per-word script detection, and when a word counts as settled.
- `composer-spell-check`: attaching to a composer, Arabic-aware checking, underline rendering, the suggestion popover, applying fixes with intact undo, ignore list, native-spellcheck handover, detach.

### Modified Capabilities
- `spelling-worker`: adds a batch check request.
- `dictionary-provisioning`: Arabic becomes vendored and redistributable under MPL 1.1; provisioning is fully offline; the Arabic exclusion gate is removed.
- `demo-harness`: the chat stand-in matches the real Agent Desktop composer (rich `contenteditable`, emoji and predefined-message insertion, LTR fidelity toggle), and spell check is attached to both composers.

## Impact

- **New code:** `src/tokenizer/`, `src/composer/`, `dev/ad-loader` (dev only).
- **Changed:** `src/spell/` (batch check), `scripts/fetch-dicts.ts`, `vite.config.ts` (Arabic plugin removed), `src/demo/`, `dicts/` (adds `ar/` and the license notice), `CLAUDE.md`, `README.md`, `openspec/config.yaml` (licensing context updated).
- **Repository size:** about 7.3 MB more for the Arabic pair. In exchange, builds and tests work fully offline and Arabic tests always run.
- **Host interaction:** the layer sets `spellcheck="false"` on the composer, adds one `<style>` element for the `::highlight` rule, and appends a popover element outside the editable region. `detach()` reverses all three.
