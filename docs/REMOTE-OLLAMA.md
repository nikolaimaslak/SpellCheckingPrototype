# Running completion and polish on a remote Ollama GPU

How to use a model served by [Ollama](https://ollama.com) on another machine (for example a workstation with a 12 GB GPU) instead of Gemini, for inline completion and grammar polish. No code change is needed: the server takes any LiteLLM model id (`server/assist/settings.py`).

One model serves both features: `COMPLETION_MODEL` selects the model for completion **and** polish.

## 1. On the GPU machine

1. Install Ollama and check that it sees the GPU (`ollama ps` shows `100% GPU` for a loaded model).
2. Pull the models to try (check exact tags on the Ollama library page):
   ```
   ollama pull qwen3:8b
   ollama pull qwen3:4b-instruct-2507-q4_K_M
   ```
3. Set these in the Ollama service environment (systemd: `systemctl edit ollama`, then `Environment=...`; macOS app: `launchctl setenv`), and restart Ollama:

   | Variable | Value | Why |
   |---|---|---|
   | `OLLAMA_KEEP_ALIVE` | `1h` (or `-1`: never unload) | The default unloads a model after 5 minutes idle. Loading takes seconds, longer than the server's timeouts (2 s completion, 4 s polish, fixed in code), so the first request after a pause fails. |
   | `OLLAMA_CONTEXT_LENGTH` | `8192` | Ollama's default context is small, and a longer prompt (conversation, canned responses, KB passages) is **cut silently**. Recent Ollama versions read this variable. |
   | `OLLAMA_MAX_LOADED_MODELS` | `1` | When comparing models on 12 GB, one at a time avoids splitting between GPU and CPU. |

   Leave `OLLAMA_HOST` at its default (`127.0.0.1:11434`): the tunnel below doesn't need Ollama open to the network.

## 2. Connect through an SSH tunnel (recommended)

On the machine running the demo:

```
ssh -N -L 11434:127.0.0.1:11434 user@gpu-host
```

Keep it running. If Ollama also runs locally and holds port 11434, pick another local port (`-L 11435:127.0.0.1:11434`) and use it in `COMPLETION_API_BASE` below.

**Why a tunnel and not the GPU host's address:**
- The server decides whether text leaves the machine from `COMPLETION_API_BASE`. A loopback address counts as **local** (`external: false`, a neutral banner); any other host counts as **external** (yellow banner: made-up text only), even on your own network.
- Through the tunnel the address is `127.0.0.1`, which matches the production setup the prototype stands in for: a model next to the service, with the traffic encrypted by SSH.
- Ollama has no authentication: opening it with `OLLAMA_HOST=0.0.0.0` lets anyone on the network use the GPU and send it prompts.

If a tunnel isn't possible, set `OLLAMA_HOST=0.0.0.0:11434` on the GPU host, firewall the port to your machine only, and use `COMPLETION_API_BASE=http://gpu-host:11434`. The demo then shows the yellow banner, and the synthetic-data rule applies.

## 3. Point the server at it

In `.env` (gitignored; see `.env.example`):

```
COMPLETION_MODEL=ollama_chat/qwen3:8b
COMPLETION_API_BASE=http://127.0.0.1:11434
```

Then `npm run demo` (or `npm run server`). Use `ollama_chat/`, not `ollama/`: the chat endpoint applies the model's chat template. Environment variables win over `.env`, so a one-off model is:

```
COMPLETION_MODEL=ollama_chat/aya-expanse:8b npm run demo
```

## 4. Check it

1. `curl http://127.0.0.1:11434/api/tags` lists the GPU host's models (the tunnel works).
2. `curl http://127.0.0.1:5175/health` shows `"model": "ollama_chat/qwen3:8b"` and `"external": false`.
3. Warm the model up once before testing: `ollama run qwen3:8b "hi"` on the GPU host, so the first composer request doesn't time out.
4. In the demo, the banner names the model and says nothing leaves the machine. Type in the English and Arabic composers and try polish.

## Choosing a model (12 GB)

Up to about 14B fits at 4-bit quantization, with room for the context. Check each model's license before anything beyond evaluation (project rule: every new dependency gets a license check).

| Model | Approx. size (Q4) | Use | License |
|---|---|---|---|
| Qwen3 4B Instruct (2507) | 2.5 GB | Completion, where latency matters most | Apache 2.0 |
| Qwen3 8B | 5 GB | All-round starting point, English and Arabic | Apache 2.0 |
| Qwen3 14B | 9 GB | Polish quality; tight on 12 GB, too slow for completion | Apache 2.0 |
| ALLaM 7B Instruct | 4.5 GB | Arabic (Saudi) polish; weaker English | Verify on the model card |
| Gemma 3 4B / 12B | 2.5 / 7.5 GB | Comparison | Gemma Terms (custom): legal review |
| Aya Expanse 8B | 5 GB | Bilingual reference (23 languages, 8K context) | CC BY-NC: **evaluation only** |

**Thinking models:** Qwen3 models other than the `2507-Instruct` variants reason before answering by default. That adds seconds (past the timeouts) and can break the typed JSON answer. Prefer non-thinking variants; thinking that leaks shows up as `format` failures in the capture report.

## Comparing against Gemini

- **Completion:** build a set once (`npm run eval:completion:build -- <chat-text> --name <set>`), then run `npm run eval:completion -- --set <set>` with each model and compare the reports (shown vs withheld, word completion, spacing errors, latency). See `docs/COMPLETION-EVAL.md`.
- **Polish:** no benchmark yet. Run the demo with `ASSIST_CAPTURE=errors`, work through the polish scenarios in `docs/TESTING.md`, and run `npm run capture:report`: failures per reason (`format`, `timeout`, `wrong-script`, `protected-changed`, `rewrote-word`).
- `npm test` uses the offline test model and says nothing about a real one.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/health` shows the offline test model or Gemini | `COMPLETION_MODEL` not set, or a typo without a `provider/` prefix (falls back to `auto` with a startup warning) | Check the server's startup output and `.env` |
| `/health` shows `external: true` | `COMPLETION_API_BASE` isn't a loopback address | Use the tunnel and `http://127.0.0.1:<port>` |
| Requests fail with `timeout` (504) | Model not loaded (cold start), too large for the GPU (`ollama ps` shows a CPU share), or thinking enabled | Warm up, set `OLLAMA_KEEP_ALIVE`, pick a smaller or non-thinking model |
| Requests fail with `failed` (502) | Tunnel down, wrong port, or model tag not pulled | `curl …/api/tags`; restart the tunnel; `ollama pull` |
| Many `format` failures | The model doesn't keep to the JSON answer, or thinking text leaks | Try another model; check examples with `npm run capture:report` |
| Completion ignores earlier turns | Prompt cut by a small context | Set `OLLAMA_CONTEXT_LENGTH`, or limit `COMPLETION_MAX_TURNS` |
