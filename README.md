# Auto-completion and auto-correction demo

Demo of LLM spell checking, auto-correction, and inline auto-completion, in English and Arabic.

**Try it:** https://nikolaimaslak.github.io/SpellCheckingPrototype/

The page talks to a small Node backend (`server/`) behind Basic auth. The backend holds the LLM API key and forwards `/api/autocorrection` and `/api/autocompletion` to an OpenAI-compatible chat completions endpoint (`LLM_URL` and `MODEL` in `server/openai-chat-client.ts`).

To share the page, keep the LLM tunnel and `npm run dev` running, then run `ngrok http 5173` and send the https URL it prints.

## Run locally

Needs Node.js 24 (`.nvmrc`) and a current Chrome or Edge.

```sh
npm install
cp .env.example .env   # fill in LLM_API_KEY, BASIC_AUTH_USER, BASIC_AUTH_PASSWORD
npm start
```

Open http://127.0.0.1:8787/ and log in with the Basic auth user and password. For development with hot reload, run `npm run server` and `npm run dev` side by side and open http://localhost:5173/. `CLAUDE.md` describes the code layout.

## License

Proprietary, all rights reserved. See `LICENSE`.
