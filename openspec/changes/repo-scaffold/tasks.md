# Tasks

## 1. Project tooling

- [x] 1.1 Verify the pre-existing setup: `package.json` scripts and dev dependencies match design §6, and `docs/requirements/*.{pdf,txt}` and `docs/architecture/*.{pdf,txt}` exist; verify with `npm ls --depth=0` and `ls docs/*`
- [x] 1.2 Add `.gitignore` (node_modules, dist, `public/dicts/`, `.local-dicts/`, `wasm/.build/`, OS files) and `.editorconfig`; verify `git status` no longer lists `node_modules`
- [x] 1.3 Add `tsconfig.json` per design §6 and a trivial `src/demo/main.ts`; verify `npm run typecheck` passes (if TypeScript 7 breaks for toolchain reasons, pin TS 5.x/6.x and note why in design.md)
- [x] 1.4 Add `vite.config.ts` (ES-module workers, Vitest config with `node` default and `test/` include) and a placeholder `test/smoke.test.ts`; verify `npm test` runs it green
- [x] 1.5 Create placeholder folders `src/composer`, `src/tokenizer`, `src/autocorrect`, each with a one-paragraph `README.md` naming its architecture component and tier; verify the files exist

## 2. Hunspell → WASM build

- [x] 2.1 Write `wasm/binding.cpp` with the six `extern "C"` functions from design §1 (`hs_create`, `hs_spell`, `hs_suggest`, `hs_add`, `hs_free_str`, `hs_destroy`); verify by code review against spec hunspell-wasm-build "Minimal engine surface"
- [x] 2.2 Write `wasm/build.sh` with pinned constants at the top (Hunspell `v1.7.4`, expected commit `92aa34b3…`, `emscripten/emsdk:6.0.10` resolved to its digest): it clones into `wasm/.build/`, checks the commit, compiles with the design §1 flags, and writes `src/spell/wasm/{hunspell.mjs,hunspell.wasm}`; verify `npm run build:wasm` succeeds
- [x] 2.3 Have the build write `src/spell/wasm/PROVENANCE.json` (tag, commit, emsdk version and digest, sha256 per output) and `src/spell/wasm/NOTICE` (Hunspell, tag, MPL 1.1 election); verify both files exist after a build
- [x] 2.4 Run the build a second time and diff `PROVENANCE.json`; verify the two are identical, or record the non-determinism cause in design.md Risks
- [x] 2.5 Implement `src/spell/engine.ts` (load module, write aff/dic bytes to MEMFS, wrap the six functions, split suggestions, free buffers); verify with `test/spell/engine.test.ts` in Node: "receive" correct, "recieve" incorrect with "receive" suggested, "GOSI" correct after `add`, destroy releases the engine
- [x] 2.6 Commit-readiness check: `git status` shows `src/spell/wasm/*` as trackable (not ignored) and `wasm/.build/` ignored

## 3. Dictionary provisioning

- [x] 3.1 Write `scripts/fetch-dicts.ts` English path: copy `node_modules/dictionary-en/index.{aff,dic}` to `public/dicts/en/en.{aff,dic}`, and support `--en-only`; verify running it twice gives byte-identical files (`shasum`)
- [x] 3.2 Add the Arabic path: download `ar.{aff,dic}` from LibreOffice `dictionaries` commit `32b006a2…` to a temp file, check against pinned sha256 constants, rename into `.local-dicts/ar/`; when offline, print "Arabic skipped" and exit 0; verify the first run fetches, a re-run is a no-op, and `git status` doesn't list `.local-dicts`
- [x] 3.3 Test the hash guard: `test/scripts/fetch-dicts.test.ts` feeds a tampered payload to the verify-and-place function and checks that it throws naming the file and leaves no file in `.local-dicts/ar/`
- [x] 3.4 Wire npm `predev`, `pretest` and `prebuild` to `fetch-dicts --en-only`, and keep the full `npm run fetch-dicts` for Arabic; verify that `npm test` on a tree with `public/dicts` deleted recreates English
- [x] 3.5 Add the Vite dictionary plugin (design §3): dev middleware serves `/dicts/ar/*` from `.local-dicts/ar/`, and `build` copies them only when `INCLUDE_AR_DICT=1`, printing a license warning; verify that `npm run build` leaves no `dist/dicts/ar`, and that `INCLUDE_AR_DICT=1 npm run build` includes it and prints the warning
- [x] 3.6 Write `dicts/MANIFEST.md` (source, pin, sha256, license, redistributable: English yes, Arabic pending legal review); verify both entries exist and the hashes match the script constants
- [x] 3.7 Extend `test/spell/engine.test.ts` with an Arabic case that runs only when `.local-dicts/ar/` exists: create the engine, spell "مرحبا", and check that suggestions for a misspelled Arabic word come back as valid Arabic strings; verify it passes locally and skips cleanly when the files are absent

## 4. Spelling worker

- [x] 4.1 Define `src/spell/protocol.ts` (request and reply types per design §4, with load timings in the `load` reply); verify `npm run typecheck`
- [x] 4.2 Implement `src/spell/handler.ts` on an injected loader; verify with `test/spell/handler.test.ts`: replies echo the request id; loading en+ar with Arabic missing gives English loaded and Arabic failed with a reason; a request for an unloaded language errors and later requests still work
- [x] 4.3 Implement `src/spell/spell.worker.ts` (same-origin `fetch` loader, WASM via `?url`, `onmessage` → handler) and a small `src/spell/client.ts` that matches replies by id; verify `npm run typecheck` and `npm run build` succeed
- [x] 4.4 Manual check on the demo page (after 5.3): in DevTools, the WASM module and dictionaries load only in the worker thread; after "ready", set the Network panel to Offline and check that spell requests from the console still answer

## 5. Demo harness

- [x] 5.1 Build `index.html` and `src/demo/` chat composer (`contenteditable="plaintext-only"`, `dir="auto"`, Enter sends to the transcript and clears, Shift+Enter adds a newline); verify with `test/demo/chat.test.ts` (jsdom): Enter appends to the transcript and empties the composer, and Shift+Enter does not send
- [x] 5.2 Add the email composer (`contenteditable`, `dir="auto"`, per-block `unicode-bidi: plaintext`, toolbar for bold, italic and lists); verify by a manual check: bold half a word, then confirm it renders as one word and the formatting holds
- [x] 5.3 Add the engine status indicator wired to `client.ts` (loading → ready or failed, languages loaded and failed, load ms each); verify with `test/demo/status.test.ts` (jsdom, fake client) for the "English loaded, Arabic unavailable" state
- [x] 5.4 Manual RTL check on the demo page: "مرحبا، كيف يمكنني مساعدتك؟" renders RTL in both composers; "رقم الطلب في نظام GOSI هو" shows "GOSI" inline in correct bidi order; an English paragraph next to an Arabic paragraph in the email composer each gets its own direction
- [x] 5.5 Offline check: with no external URLs in `index.html` or CSS (`grep -E "https?://" index.html src/demo`), run `npm run dev` with networking off and confirm the status reaches ready

## 6. Docs and integration

- [x] 6.1 Write `CLAUDE.md` (project summary pointing to `docs/` and `openspec/config.yaml`, commands, layout, hard constraints, OpenSpec workflow); verify every command it lists runs
- [x] 6.2 Write `README.md` (prerequisites: Node and npm, Docker optional; setup `npm install && npm run fetch-dicts && npm run dev`; scripts table; licensing note); verify by following it on a fresh clone in a temp directory
- [x] 6.3 End-to-end check from a fresh clone in a temp directory with no Docker use: `npm install && npm test && npm run build` all pass, and `dist/` contains no `dicts/ar`
- [x] 6.4 Run `openspec validate repo-scaffold --strict` and confirm it passes
