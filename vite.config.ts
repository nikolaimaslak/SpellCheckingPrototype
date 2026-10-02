/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Completion service (npm run server); the page calls same-origin /api/...
    proxy: { '/api': { target: 'http://localhost:5175', rewrite: (path) => path.replace(/^\/api/, '') } },
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
