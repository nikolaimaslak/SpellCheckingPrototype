/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
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
