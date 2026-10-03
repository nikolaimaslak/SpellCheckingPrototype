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
