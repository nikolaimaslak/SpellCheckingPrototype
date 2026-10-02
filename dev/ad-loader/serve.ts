// DEV ONLY. Builds the Agent Desktop loader and serves it, the WASM module and
// the dictionaries with CORS, for `import('http://localhost:5174/ad-spell.js')`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const PORT = 5174;
const ORIGIN = `http://localhost:${PORT}`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'dev/ad-loader/dist');

execFileSync(process.execPath, [join(ROOT, 'scripts/fetch-dicts.ts')], { stdio: 'inherit' });

for (const [entry, name] of [
  ['loader.ts', 'ad-spell'],
  ['worker.ts', 'ad-spell-worker'],
] as const) {
  await build({
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    define: { __AD_ORIGIN__: JSON.stringify(ORIGIN) },
    build: {
      outDir: OUT,
      emptyOutDir: false,
      minify: false,
      lib: { entry: join(ROOT, 'dev/ad-loader', entry), formats: ['iife'], name: name.replace(/-/g, '_'), fileName: () => `${name}.js` },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
}

const FILES: Record<string, string> = {
  '/ad-spell.js': join(OUT, 'ad-spell.js'),
  '/ad-spell-worker.js': join(OUT, 'ad-spell-worker.js'),
  '/hunspell.wasm': join(ROOT, 'src/spell/wasm/hunspell.wasm'),
  '/dicts/en/en.aff': join(ROOT, 'public/dicts/en/en.aff'),
  '/dicts/en/en.dic': join(ROOT, 'public/dicts/en/en.dic'),
  '/dicts/ar/ar.aff': join(ROOT, 'public/dicts/ar/ar.aff'),
  '/dicts/ar/ar.dic': join(ROOT, 'public/dicts/ar/ar.dic'),
};
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.aff': 'text/plain', '.dic': 'text/plain' };

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Chrome's private/local network access checks for public → localhost requests.
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.writeHead(204).end();
    return;
  }
  const file = FILES[(req.url ?? '').split('?')[0]];
  if (!file || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(file));
}).listen(PORT, () => {
  console.log(`ad-loader: serving on ${ORIGIN}`);
  console.log(`In the Agent Desktop DevTools console:  import('${ORIGIN}/ad-spell.js?v=' + Date.now())`);
  console.log('Allow Chrome\'s local network access prompt; a failed import is cached per URL, hence ?v=.');
});
