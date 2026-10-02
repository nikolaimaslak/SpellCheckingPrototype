import type { ResultByType, SpellCommand, SpellReply } from './protocol';

/** The subset of Worker the client needs; lets tests pass a fake. */
export interface SpellPort {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<SpellReply>) => void): void;
}

/** Page-side handle to the spelling worker; matches replies to requests by id. */
export class SpellClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: never) => void; reject: (err: Error) => void }>();

  private readonly port: SpellPort;

  constructor(port: SpellPort) {
    this.port = port;
    port.addEventListener('message', ({ data }) => {
      const entry = this.pending.get(data.id);
      if (!entry) return; // stale or unknown reply
      this.pending.delete(data.id);
      if (data.ok) entry.resolve(data.result as never);
      else entry.reject(new Error(data.error));
    });
  }

  request<C extends SpellCommand>(command: C): Promise<ResultByType[C['type']]> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.port.postMessage({ ...command, id });
    });
  }
}

export function startSpellWorker(): SpellClient {
  const worker = new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module' });
  return new SpellClient(worker);
}
