// Minimal C ABI over Hunspell for the WASM build (see wasm/build.sh).
// Hunspell is used under its MPL 1.1 license option.
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "hunspell.hxx"

extern "C" {

// Creates an engine from .aff/.dic paths in the Emscripten filesystem.
Hunspell* hs_create(const char* aff_path, const char* dic_path) {
  return new Hunspell(aff_path, dic_path);
}

// Returns 1 if the UTF-8 word is spelled correctly, 0 otherwise.
int hs_spell(Hunspell* h, const char* word) {
  return h->spell(std::string(word)) ? 1 : 0;
}

// Returns a malloc'd UTF-8 buffer of suggestions joined by '\n' (empty
// string when there are none). The caller frees it with hs_free_str.
char* hs_suggest(Hunspell* h, const char* word) {
  std::vector<std::string> list = h->suggest(std::string(word));
  std::string joined;
  for (size_t i = 0; i < list.size(); ++i) {
    if (i) joined += '\n';
    joined += list[i];
  }
  char* out = static_cast<char*>(std::malloc(joined.size() + 1));
  std::memcpy(out, joined.c_str(), joined.size() + 1);
  return out;
}

// Adds a word to the runtime dictionary for this engine's lifetime.
int hs_add(Hunspell* h, const char* word) {
  return h->add(std::string(word));
}

void hs_free_str(char* p) { std::free(p); }

void hs_destroy(Hunspell* h) { delete h; }

}  // extern "C"
