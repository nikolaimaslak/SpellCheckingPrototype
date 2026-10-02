# Design

## Context

Starting state (see proposal.md, Why): `package.json` exists with `vite@8`, `vitest@4`, `typescript@7` (the native Go compiler), `jsdom` and `dictionary-en@4` installed. `docs/` holds the PERs and the architecture draft. `src/`, `scripts/`, `wasm/`, `public/` and `test/` are empty folders. Docker 29 runs on an x86_64 host. Facts checked while writing this design:

- Hunspell's latest release is `v1.7.4` (commit `92aa34b3`). The `hunspell-asm` npm wrapper was last published in 2022 and bundles an older Hunspell.
- `emscripten/emsdk:6.0.10` is the current pinned-able image tag.
- `dictionary-en` ships `index.aff` (3 KB) and `index.dic` (552 KB).
- The AyaSpell pair at LibreOffice `dictionaries` commit `32b006a2` is `ar.aff` (87 KB) and `ar.dic` (7.2 MB). Its README credits the Ayaspell project and states no license, which confirms the open legal item.

## Goals / Non-Goals

**Goals:**
- Prove the full Tier 1 path once: pinned source → WASM → worker → dictionary → answer, in a browser and in Node.
- Make licensing safe by construction rather than by remembering to delete files.
- Pick the demo composers so Phase 1 decorations (CSS Custom Highlight API) can work on them unchanged.

**Non-Goals:**
- Performance tuning (Arabic load time is measured and shown, not optimized).
- Any public API for the composer layer. The worker protocol here is internal and may change in Phase 1.

## Decisions

### 1. Compile Hunspell ourselves with a C binding (build time → Tier 1 artifact)
`wasm/build.sh` runs inside `emscripten/emsdk:6.0.10`. It shallow-clones `hunspell` at `v1.7.4`, checks that the commit equals `92aa34b3…`, and compiles `src/hunspell/*.cxx` plus `wasm/binding.cpp` directly with `em++`, skipping autotools. The binding exposes `extern "C"` functions: `hs_create(aff_path, dic_path)`, `hs_spell(h, word)`, `hs_suggest(h, word)` (returns one malloc'd UTF-8 buffer of suggestions separated by `\n`), `hs_add(h, word)`, `hs_free_str(p)`, `hs_destroy(h)`.

Key flags: `-O3 -sMODULARIZE -sEXPORT_ES6 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH -sFORCE_FILESYSTEM -sEXPORTED_RUNTIME_METHODS=FS,cwrap,UTF8ToString,stringToNewUTF8`. Dictionaries are written into Emscripten's in-memory filesystem (MEMFS) before `hs_create`. Output goes to `src/spell/wasm/hunspell.mjs` and `hunspell.wasm`, plus `PROVENANCE.json` (tag, commit, emsdk version, sha256 of outputs) and `NOTICE` (MPL 1.1 election).

- *Alternative: `hunspell-asm`.* Rejected: unmaintained since 2022, an older Hunspell, and we can't audit its build.
- *Alternative: embind.* Rejected: bigger glue and a larger surface. Six C functions are enough.
- *Alternative: nspell (pure JS).* Rejected: the architecture specifies Hunspell, and nspell supports only part of the affix features that Arabic `.aff` files use.

### 2. Commit the compiled module
`src/spell/wasm/` is committed, so `npm install && npm test` works without Docker (spec: hunspell-wasm-build, Committed build output). The cost is a binary diff of a few hundred KB whenever the pin changes, which is rare and gets reviewed together with `PROVENANCE.json`.
- *Alternative: gitignore and build on install.* Rejected: it makes Docker a requirement for every contributor and for running tests.

### 3. Arabic lives outside `public/`, so it is excluded by construction
Vite copies `public/` wholesale into `dist/`, so a gitignored file under `public/` would still end up in builds. Instead:
- English: `scripts/fetch-dicts.ts` copies `node_modules/dictionary-en/index.{aff,dic}` to `public/dicts/en/en.{aff,dic}`. This is gitignored and regenerated; npm `predev`, `pretest` and `prebuild` hooks run it in English-only mode, which needs no network.
- Arabic: downloaded from raw GitHub at commit `32b006a2` into `.local-dicts/ar/` (gitignored), with sha256 checked against constants in the script. The download goes to a temp file and is renamed into place only after the hash matches.
- A small Vite plugin in `vite.config.ts` serves `/dicts/ar/*` from `.local-dicts/ar/` in dev. During `build` it copies those files into `dist/dicts/ar/` only when `INCLUDE_AR_DICT=1`, and prints a license warning when it does.
- `dicts/MANIFEST.md` (committed) records source, pin, license and redistributable status for each language.
- *Alternative: delete `dist/dicts/ar` after the build.* Rejected: it fails open if the plugin breaks.

### 4. Worker = thin shell over a testable handler (Tier 1)
`src/spell/protocol.ts` defines the messages: requests `{id, type: 'load', langs}`, `{id, type: 'spell' | 'suggest' | 'add', lang, word}`; replies `{id, ok: true, result}` or `{id, ok: false, error}`. `src/spell/engine.ts` wraps the WASM module as one engine per language. `src/spell/handler.ts` is a pure `handle(request) → reply` built on an injected loader (which fetches dictionary bytes), so Node tests run it against files read from disk. `src/spell/spell.worker.ts` only wires `onmessage` to the handler and loads files with `fetch` from the same origin. The page creates the worker with `new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module' })`, and the WASM file URL comes from Vite's `?url` import. Load timing for each language goes into the `load` reply, for the status indicator.
- *Alternative: Comlink or a similar RPC library.* Rejected: an extra dependency for four message types.

### 5. Both demo composers are `contenteditable` (demo only, stands in for Tier 1 hosts)
The CSS Custom Highlight API paints DOM `Range`s, and `<textarea>` text is not reachable by a `Range`. So the chat stand-in is `contenteditable="plaintext-only"` (one text node, no formatting), and the email stand-in is plain `contenteditable` with a toolbar for bold, italic and lists using `document.execCommand`. This is deprecated but adequate for a stand-in and keeps native undo. Enter in chat is intercepted to send. Shift+Enter inserts a newline.

- **Editable DOM / undo:** this change adds no decorations and does not change text programmatically, apart from clearing the chat composer on send. Native undo stays intact.
- **RTL:** each composer gets `dir="auto"`, and each block inside the email composer gets `unicode-bidi: plaintext`, so direction is worked out per paragraph. Mixed sentences rely on the browser's bidi algorithm. Only system fonts, no web fonts, which keeps the page offline (spec: demo-harness, Runs locally offline).

### 6. Tooling
- `tsconfig.json`: `strict`, `target ES2022`, `module ESNext`, `moduleResolution bundler`, `lib [ES2022, DOM, DOM.Iterable, WebWorker]`, `types ["vite/client"]`, `noEmit`.
- Vitest: default environment `node`. DOM tests opt in with `// @vitest-environment jsdom`.
- Tests live in `test/`, mirroring `src/`.

### Tier map
| Component | Tier |
|---|---|
| `wasm/build.sh`, `binding.cpp` | build time (output runs in Tier 1) |
| `src/spell/*` (engine, handler, worker) | Tier 1 (browser, offline) |
| `scripts/fetch-dicts.ts`, Vite dictionary plugin | build/dev tooling |
| `src/demo/*`, `index.html` | demo harness (stands in for Agent Desktop, Tier 1 host) |
| `src/composer`, `src/tokenizer`, `src/autocorrect` | Tier 1 placeholders (empty, README only) |

## Risks / Trade-offs

- [Hunspell may not compile cleanly without autotools (a missing `config.h` or a warning treated as an error)] → Hunspell's core library has few platform dependencies. If it fails, add a minimal generated `config.h` in `wasm/`. Don't fall back to `hunspell-asm`.
- [Emscripten output may not be byte-for-byte reproducible] → The spec demands identical provenance, so pin the image by digest, not just by tag. If outputs still differ, record the cause in `PROVENANCE.json` and treat matching tag, commit and toolchain as the reproducibility bar.
- [The 7.2 MB Arabic `.dic` makes worker startup slow (possibly seconds) and uses a lot of WASM memory] → Measured and shown on the status indicator. English loads first and becomes usable on its own. Optimization is Phase 1 work.
- [The real Agent Desktop 2.0 chat composer may be a `<textarea>`] → Then Phase 1 needs a mirror-overlay technique instead of Range highlights. The demo choice is right for contenteditable hosts. The question is flagged below.
- [TypeScript 7 (native compiler) or the Vite 8 / Vitest 4 pairing may be incompatible] → If `npm run typecheck` or `npm test` breaks for toolchain reasons, pin TypeScript to the latest 5.x or 6.x and record why.
- [`execCommand` is deprecated] → Accepted for a stand-in. The real email editor will be integrated in a later change.
- [The raw GitHub URL for the Arabic files could disappear] → The sha256 pin means any substitute must be byte-identical. If the URL is gone, use the LibreOffice gerrit mirror.

## Migration Plan

None. Greenfield repository. Rollback means reverting the commit.

## Open Questions

- Is the Agent Desktop 2.0 chat composer a `<textarea>` or `contenteditable`? Doesn't affect this change. It decides the Phase 1 highlight approach.

## Implementation Notes

- `scripts/fetch-dicts.ts` is TypeScript run directly by Node 25 (type stripping) rather than `.mjs`, so it is typechecked and its hash guard can be unit-tested. To keep that working, `tsconfig.json` enables `erasableSyntaxOnly` and `allowImportingTsExtensions`.
- `@types/node` (MIT, dev only) was added for the Node-side tests and script.
- The WASM build was byte-reproducible: a clean rebuild, including a fresh emscripten cache, produced identical `PROVENANCE.json` hashes.
- The Vite dev middleware answers 404 for missing Arabic files, and the worker also rejects `text/html` replies, so the SPA fallback can't masquerade as a dictionary.
- Measured load times on the demo page: English about 90 ms, Arabic about 0.9–1.1 s.
