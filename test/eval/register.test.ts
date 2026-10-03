// The eval tools run under plain Node; src/ uses extensionless imports that
// only resolve through eval/register.ts.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const run = (code: string) =>
  execFileSync(process.execPath, ['--import', './eval/register.ts', '--input-type=module', '-e', code], { encoding: 'utf8' }).trim();

describe('eval resolve hook', () => {
  it('loads src modules with extensionless and directory imports', () => {
    expect(run("const m = await import('./src/autocorrect/confidence.ts'); console.log(typeof m.decide)")).toBe('function');
  });

  it('still fails for a module that does not exist', () => {
    expect(() => run("await import('./src/no-such-module')")).toThrow();
  });
});
