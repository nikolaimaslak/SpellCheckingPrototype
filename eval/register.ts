// Lets plain Node run the eval tools against src/. src/ is written for Vite
// and uses extensionless relative imports ("./textmap"); Node's resolver
// needs the extension. This hook retries a failed relative specifier with
// ".ts" and "/index.ts". Load it with: node --import ./eval/register.ts …
import { registerHooks } from 'node:module';

const RELATIVE = /^\.{1,2}\//;
// A missing file, or a directory ("../tokenizer" meaning its index.ts).
const RETRY = new Set(['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT']);

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (!RELATIVE.test(specifier) || !RETRY.has((err as { code?: string }).code ?? '')) throw err;
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          return nextResolve(specifier + suffix, context);
        } catch {
          // try the next form
        }
      }
      throw err;
    }
  },
});
