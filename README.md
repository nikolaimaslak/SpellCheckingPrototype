# Auto-completion and auto-correction demo

Demo of LLM spell checking, auto-correction, and inline auto-completion, in English and Arabic.

**Try it:** https://nikolaimaslak.github.io/SpellCheckingPrototype/

The page talks to a local LLM server: an OpenAI-compatible endpoint at `http://127.0.0.1:8000/v1/chat/completions` (vLLM with `google/gemma-4-31B-it`).

## Run locally

Needs Node.js 23.6+ and a current Chrome or Edge.

```sh
npm install
npm run dev
```

Open http://localhost:5173/. `CLAUDE.md` describes the code layout.

## License

Proprietary, all rights reserved. See `LICENSE`.
