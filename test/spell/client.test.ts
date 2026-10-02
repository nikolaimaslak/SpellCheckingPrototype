import { describe, expect, it, vi } from 'vitest';
import { SpellClient, type SpellPort } from '../../src/spell/client';

describe('SpellClient.terminate', () => {
  it('terminates the worker and rejects pending and later requests', async () => {
    const port: SpellPort = { postMessage: vi.fn(), addEventListener: vi.fn(), terminate: vi.fn() };
    const client = new SpellClient(port);
    const pending = client.request({ type: 'spell', lang: 'en', word: 'x' });
    client.terminate();
    await expect(pending).rejects.toThrow(/terminated/);
    await expect(client.request({ type: 'spell', lang: 'en', word: 'y' })).rejects.toThrow(/terminated/);
    expect(port.terminate).toHaveBeenCalledOnce();
  });
});
