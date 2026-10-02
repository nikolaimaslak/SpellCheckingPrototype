# Dictionary manifest

| Language | Source | Pin | sha256 | License | Redistributable |
|---|---|---|---|---|---|
| English (`en`) | npm `dictionary-en` (wooorm/dictionaries, SCOWL-derived), copied to `public/dicts/en/` | `dictionary-en@4.0.0` (locked in `package-lock.json`) | `index.aff` 8ae1f19d4840d957728ad90555d5a8dff6cc5c046279c95ff0c00fc0a0136c7b · `index.dic` f0b1a234bd178bdd01875b2a392a9647f888b8fe879f79c52aae62c2759b3647 | MIT AND BSD | **yes** |
| Arabic (`ar`) | AyaSpell via [LibreOffice/dictionaries](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/ar), fetched to `.local-dicts/ar/` (gitignored) | commit `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | `ar.aff` cec30b8621001e49618feb05aec1984c5fcfbf7d2ec309901d5cbf66585217a3 · `ar.dic` 2a3e5367f61c1583734db9d66734f5603e6be5c2d227cf5c5cd7e4ca586e34fe | **unclear** — upstream README credits the Ayaspell project but states no license | **pending legal review** — local evaluation only; excluded from builds unless `INCLUDE_AR_DICT=1` |

The Arabic hashes are enforced by `scripts/fetch-dicts.ts` (`AR_FILES`). Fallbacks if legal does not clear AyaSpell (architecture §6): a commercial Arabic dictionary, or a clean-room wordlist built with MIT-licensed CAMeL Tools.
