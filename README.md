# Auto-completion and auto-correction demo

Demo of LLM spell checking, auto-correction, and inline auto-completion, in English and Arabic.

The page talks to a small Node backend (`server/`) behind Basic auth.

## Run locally

Needs Node.js 24 (`.nvmrc`) and a current Chrome or Edge.

```sh
npm install
cp .env.example .env   # fill in LLM_API_KEY, LLM_URL, MODEL, BASIC_AUTH_USER, BASIC_AUTH_PASSWORD
```

Then:

```sh
npm run dev   # the page with hot reload and the API on http://127.0.0.1:8787/
```

## Deploy

On a machine with Node 24:

```sh
git clone https://github.com/nikolaimaslak/SpellCheckingPrototype.git
cd SpellCheckingPrototype
npm ci
cp .env.example .env   # fill in the same values as for local runs
npm start              # serves the page and /api on 127.0.0.1:$PORT
```

## License

Proprietary, all rights reserved. See `LICENSE`.
