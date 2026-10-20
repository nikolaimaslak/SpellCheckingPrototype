# Auto-completion and auto-correction demo

Demo of LLM spell checking, auto-correction, and inline auto-completion, in English and Arabic.

**Try it:** https://nikolaimaslak.github.io/SpellCheckingPrototype/

The page calls `/v1/chat/completions` on its own origin, and the dev server forwards `/v1` to the LLM server at `http://127.0.0.1:8000` (vLLM with `google/gemma-4-31B-it`, an OpenAI-compatible endpoint).

To share the page, keep the LLM tunnel and `npm run dev` running, then run `ngrok http 5173` and send the https URL it prints.

## Run locally

Needs Node.js 23.6+ and a current Chrome or Edge.

```sh
npm install
npm run dev
```

Open http://localhost:5173/. `CLAUDE.md` describes the code layout.

## License

Proprietary, all rights reserved. See `LICENSE`.
