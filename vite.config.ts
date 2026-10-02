/// <reference types="vitest/config" />
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const AR_DIR = '.local-dicts/ar';
const AR_FILES = ['ar.aff', 'ar.dic'];

/**
 * The Arabic dictionary's license is an open legal item, so it lives outside
 * public/ (which Vite copies wholesale). Dev serves it from .local-dicts/ar;
 * production builds include it only with INCLUDE_AR_DICT=1.
 */
function arabicDictionary(): Plugin {
  return {
    name: 'arabic-dictionary',
    configureServer(server) {
      server.middlewares.use('/dicts/ar/', (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0];
        const file = join(AR_DIR, name);
        if (!AR_FILES.includes(name)) return next();
        if (!existsSync(file)) {
          // Answer 404 explicitly; falling through would hit the SPA fallback.
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      if (process.env.INCLUDE_AR_DICT !== '1') return;
      for (const name of AR_FILES) {
        const file = join(AR_DIR, name);
        if (!existsSync(file)) this.error(`INCLUDE_AR_DICT=1 but ${file} is missing; run npm run fetch-dicts`);
        this.emitFile({ type: 'asset', fileName: `dicts/ar/${name}`, source: readFileSync(file) });
      }
      this.warn('Arabic dictionary INCLUDED in build output — license not yet cleared; do not distribute.');
    },
  };
}

export default defineConfig({
  plugins: [arabicDictionary()],
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
