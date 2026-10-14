/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// "0.1.0 · 3abdde6": testers quote this in reports so they name the exact build.
function appVersion(): string {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  try {
    return `${version} · ${execFileSync('git', ['rev-parse', '--short', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()}`;
  } catch {
    return `${version} · unknown`;
  }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  // Tailwind is used by the React page (app.html) only.
  plugins: [tailwindcss()],
  // Two pages: the original demo (index.html) and the React demo (app.html).
  build: { rollupOptions: { input: { main: 'index.html', app: 'app.html' } } },
  server: {
    // IPv4 loopback: both http://localhost:5173 and http://127.0.0.1:5173 work,
    // and nothing is exposed to the network.
    host: '127.0.0.1',
    port: 5173,
    // Completion service (npm run server); the page calls same-origin /api/...
    proxy: { '/api': { target: 'http://127.0.0.1:5175', rewrite: (path) => path.replace(/^\/api/, '') } },
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Real-engine tests depend on Hunspell's time-limited suggest(); running
    // files in parallel starves it and truncates results (docs/known-issues.md, KI-1).
    fileParallelism: false,
  },
});
