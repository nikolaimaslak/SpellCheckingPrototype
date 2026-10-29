# Auto-completion and auto-correction demo

Demo of LLM spell checking, auto-correction, and inline auto-completion, in English and Arabic.

**Try it:** https://nikolaimaslak.github.io/SpellCheckingPrototype/

Paste an LLM API key at the top of the page (kept in memory only, not saved). The page calls an OpenAI-compatible chat completions endpoint (`LLM_URL` and `MODEL` in `src/app/lib/llm-client.ts`).

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
