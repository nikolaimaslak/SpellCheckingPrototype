# License audit: Python dependencies (task 1.3)

The whole locked set in `server/uv.lock` (77 packages, Python 3.13), checked on 2026-10-06 from each installed package's license metadata.

**Result: no package is under GPL or LGPL.**

| License | Packages |
|---|---|
| MIT | dspy, litellm, fastapi, pydantic, pydantic-core, pydantic-settings, gepa, json_repair, tiktoken, jiter, jsonschema, referencing, rpds-py, anyio, attrs, cachetools, filelock, h11, h2, hpack, hyperframe, iniconfig, jmespath, pluggy, pytest, pyyaml, six, typing-inspection, urllib3, zipp, annotated-types, annotated-doc, charset-normalizer, jsonschema-specifications |
| BSD (2- or 3-clause) | uvicorn, starlette, click, fsspec, httpcore, httpx, idna, jinja2, markupsafe, pygments, python-dotenv, cloudpickle, fastuuid |
| Apache-2.0 | openai, boto3, botocore, s3transfer, huggingface_hub, hf-xet, tokenizers, diskcache, distro, requests, tenacity, aiosignal, frozenlist, multidict, propcache, yarl, opentelemetry-api, importlib_metadata |
| Dual or combined permissive | aiohttp (Apache-2.0 AND MIT), packaging (Apache-2.0 OR BSD-2-Clause), python-dateutil (BSD and Apache), sniffio (MIT or Apache) |
| PSF / CNRI | typing_extensions (PSF-2.0), aiohappyeyeballs (PSF), regex (Apache-2.0 AND CNRI-Python) |
| **MPL-2.0 (needs a manual look)** | certifi (MPL-2.0), orjson (MPL-2.0 AND (Apache-2.0 OR MIT)), tqdm (MPL-2.0 AND MIT) |

**The three MPL-2.0 packages:**
- MPL-2.0 is a file-level weak copyleft, the same family as the MPL 1.1 terms we already use for Hunspell and AyaSpell. Changes to those packages' own files would have to be shared.
- We use all three unmodified, as indirect dependencies of DSPy and LiteLLM, and don't ship them in the browser bundle.
- MPL-2.0 isn't GPL or LGPL, and its secondary-licence clause doesn't apply to unmodified use.

**Not used:** LiteLLM's `enterprise/` code, which is under a separate license, isn't imported.
