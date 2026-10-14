/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    // IPv4 loopback: both http://localhost:5173 and http://127.0.0.1:5173 work,
    // and nothing is exposed to the network.
    host: '127.0.0.1',
    port: 5173,
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    // Real-engine tests depend on Hunspell's time-limited suggest(); running
    // files in parallel starves it and truncates results (docs/known-issues.md, KI-1).
    fileParallelism: false,
  },
});
