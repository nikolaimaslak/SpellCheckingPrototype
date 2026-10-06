import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { nodeVersionOk, portFree } from '../../scripts/demo';

describe('demo start helpers', () => {
  it('compares Node versions', () => {
    expect(nodeVersionOk('v25.9.0')).toBe(true);
    expect(nodeVersionOk('v23.6.0')).toBe(true);
    expect(nodeVersionOk('v23.5.9')).toBe(false);
    expect(nodeVersionOk('v22.12.0')).toBe(false);
    expect(nodeVersionOk('24.0.0', '23.6.0')).toBe(true);
  });

  it('detects a server on the wildcard address too', async () => {
    const holder = createServer();
    await new Promise<void>((r) => holder.listen(0, () => r())); // :: / 0.0.0.0
    const port = (holder.address() as { port: number }).port;
    expect(await portFree(port)).toBe(false);
    await new Promise<void>((r) => holder.close(() => r()));
  });

  it('detects a port held by another server, and frees it after close', async () => {
    const holder = createServer();
    await new Promise<void>((r) => holder.listen(0, '127.0.0.1', () => r()));
    const port = (holder.address() as { port: number }).port;
    expect(await portFree(port)).toBe(false);
    await new Promise<void>((r) => holder.close(() => r()));
    expect(await portFree(port)).toBe(true);
  });
});

describe('uv check and model banner', () => {
  it('reports a missing uv, naming it and its install command', async () => {
    const { uvAvailable, uvMissingMessage } = await import('../../scripts/demo');
    expect(uvAvailable('uv-definitely-not-installed')).toBe(false);
    expect(uvMissingMessage()).toMatch(/uv is required/);
    expect(uvMissingMessage()).toContain('https://astral.sh/uv/install.sh');
  });

  it('describes each kind of model', async () => {
    const { describeModel } = await import('../../scripts/demo');
    expect(describeModel(null)).toMatch(/not responding/);
    expect(describeModel({ model: null, external: false })).toMatch(/unavailable/);
    expect(describeModel({ model: 'fake', external: false })).toMatch(/offline test model/);
    expect(describeModel({ model: 'gemini-3.5-flash-lite', external: true })).toMatch(/sent outside this machine/);
    expect(describeModel({ model: 'ollama_chat/qwen3:8b', external: false })).toMatch(/stays on this machine/);
  });
});
