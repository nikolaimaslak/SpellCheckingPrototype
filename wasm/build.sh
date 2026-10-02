#!/usr/bin/env bash
# Compiles Hunspell to WebAssembly inside a pinned emsdk Docker image.
# Outputs (committed): src/spell/wasm/{hunspell.mjs,hunspell.wasm,PROVENANCE.json,NOTICE}
set -euo pipefail

HUNSPELL_TAG="v1.7.4"
HUNSPELL_COMMIT="92aa34b3f378ec115562fb06bd1728d566a339ec"
EMSDK_VERSION="6.0.10"
EMSDK_IMAGE="emscripten/emsdk@sha256:e077d54e2b8970575ebc4f185ac1de0b95c05f2b266134d4ba27449af7aebf65"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/wasm/.build"
OUT="$ROOT/src/spell/wasm"

mkdir -p "$WORK" "$OUT"

if [ ! -d "$WORK/hunspell/.git" ]; then
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$HUNSPELL_TAG" https://github.com/hunspell/hunspell.git "$WORK/hunspell"
fi
actual="$(git -C "$WORK/hunspell" rev-parse HEAD)"
if [ "$actual" != "$HUNSPELL_COMMIT" ]; then
  echo "error: hunspell $HUNSPELL_TAG resolved to $actual, expected $HUNSPELL_COMMIT" >&2
  exit 1
fi

docker run --rm \
  -v "$ROOT:/src" -w /src \
  -u "$(id -u):$(id -g)" \
  -e EM_CACHE=/src/wasm/.build/em-cache \
  "$EMSDK_IMAGE" \
  em++ -O3 -std=c++17 \
    -ffile-prefix-map=/src=. \
    -I wasm/.build/hunspell/src/hunspell \
    wasm/.build/hunspell/src/hunspell/*.cxx \
    wasm/binding.cpp \
    -o src/spell/wasm/hunspell.mjs \
    -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=createHunspellModule \
    -sENVIRONMENT=web,worker,node \
    -sALLOW_MEMORY_GROWTH -sFORCE_FILESYSTEM \
    -sEXPORTED_FUNCTIONS=_hs_create,_hs_spell,_hs_suggest,_hs_add,_hs_free_str,_hs_destroy,_malloc,_free \
    -sEXPORTED_RUNTIME_METHODS=FS,cwrap,UTF8ToString,stringToNewUTF8

sha() { shasum -a 256 "$1" | cut -d' ' -f1; }

cat > "$OUT/PROVENANCE.json" <<JSON
{
  "hunspell": { "tag": "$HUNSPELL_TAG", "commit": "$HUNSPELL_COMMIT", "license": "MPL-1.1 (elected from MPL-1.1/GPL-2.0/LGPL-2.1)" },
  "emsdk": { "version": "$EMSDK_VERSION", "image": "$EMSDK_IMAGE" },
  "outputs": {
    "hunspell.mjs": "$(sha "$OUT/hunspell.mjs")",
    "hunspell.wasm": "$(sha "$OUT/hunspell.wasm")"
  }
}
JSON

cat > "$OUT/NOTICE" <<TXT
hunspell.wasm / hunspell.mjs are compiled from Hunspell $HUNSPELL_TAG
(https://github.com/hunspell/hunspell, commit $HUNSPELL_COMMIT).

Hunspell is tri-licensed under MPL 1.1 / GPL 2.0 / LGPL 2.1. This project
elects the Mozilla Public License 1.1; no GPL or LGPL terms are taken.
Source for the compiled files is available at the commit above; the binding
is wasm/binding.cpp and the build is wasm/build.sh in this repository.
TXT

echo "built: $(ls -1 "$OUT" | tr '\n' ' ')"
