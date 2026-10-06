// One-command start for testers: checks Node, uv and ports, provisions
// dictionaries, prepares the Python environment, runs the completion server
// (Python, through uv) and the demo page together, prints one URL, and stops
// both on Ctrl+C.
// Usage: npm run demo
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MIN_NODE = '23.6.0';
export const DEMO_PORT = 5173;
export const SERVER_PORT = 5175;

/** True when `version` (e.g. "v25.9.0" or "23.6.1") is at least `min`. */
export function nodeVersionOk(version: string, min = MIN_NODE): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = parse(version);
  const b = parse(min);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

function answers(port: number, host: string): Promise<boolean> {
  return new Promise((done) => {
    const socket = connect({ port, host });
    socket.setTimeout(500);
    socket.once('connect', () => (socket.destroy(), done(true)));
    socket.once('timeout', () => (socket.destroy(), done(false)));
    socket.once('error', () => done(false)); // refused, or no IPv6 on this machine
  });
}

/**
 * True when nothing answers on `port` at either loopback address. Connecting
 * (rather than test-binding) also catches servers on the wildcard address,
 * which a test bind on 127.0.0.1 can coexist with on macOS.
 */
export async function portFree(port: number): Promise<boolean> {
  return !(await answers(port, '127.0.0.1')) && !(await answers(port, '::1'));
}

export const UV_INSTALL = 'curl -LsSf https://astral.sh/uv/install.sh | sh   (macOS: brew install uv; Windows: winget install astral-sh.uv)';

/** True when the `uv` command (or `command`) runs. */
export function uvAvailable(command = 'uv'): boolean {
  const res = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return !res.error && res.status === 0;
}

export function uvMissingMessage(): string {
  return `uv is required to run the completion server (it installs the right Python by itself). Install it with:\n    ${UV_INSTALL}\n  then run npm run demo again.`;
}

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function pipe(child: ChildProcess, label: string, onLine?: (line: string) => void) {
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = '';
    stream?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) console.log(`[${label}] ${line}`);
        onLine?.(line);
      }
    });
  }
}

/** The banner's model description from /health. */
export function describeModel(h: { model: string | null; external: boolean } | null): string {
  if (!h) return 'completion server not responding (spell checking still works)';
  if (!h.model) return 'completion and polish unavailable (COMPLETION_MODEL=gemini needs GEMINI_API_KEY)';
  if (h.model === 'fake') return 'offline test model (completion and polish show canned results)';
  if (h.external) return `${h.model} (typed text is sent outside this machine: use made-up text only)`;
  return `${h.model} (local model: typed text stays on this machine)`;
}

async function health(): Promise<{ model: string | null; external: boolean } | null> {
  // The Python server needs a few seconds to import DSPy and LiteLLM (longer on the first start).
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${SERVER_PORT}/health`);
      if (res.ok) return (await res.json()) as { model: string | null; external: boolean };
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function main() {
  if (!nodeVersionOk(process.version)) {
    fail(`Node ${MIN_NODE} or newer is required (found ${process.version}). Install a current Node from https://nodejs.org and try again.`);
  }
  if (!uvAvailable()) fail(uvMissingMessage());
  for (const [port, what] of [[DEMO_PORT, 'demo page'], [SERVER_PORT, 'completion server']] as const) {
    if (!(await portFree(port))) {
      fail(`Port ${port} (${what}) is already in use. Stop the program using it (find it with: lsof -i :${port}) and run npm run demo again.`);
    }
  }

  const dicts = spawnSync(process.execPath, [join(ROOT, 'scripts/fetch-dicts.ts')], { stdio: 'inherit' });
  if (dicts.status !== 0) fail('Could not provision the dictionaries (see the error above).');

  const sync = spawnSync('uv', ['sync', '--project', 'server', '--locked', '--quiet'], { cwd: ROOT, stdio: 'inherit' });
  if (sync.status !== 0) fail('Could not prepare the Python environment for the completion server (uv sync failed, see above).');

  const children: ChildProcess[] = [];
  let stopping = false;
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    for (const c of children) if (c.exitCode === null) c.kill('SIGTERM');
    setTimeout(() => process.exit(code), 300);
  };

  const server = spawn('uv', ['run', '--project', 'server', '--locked', '--no-sync', 'python', '-m', 'assist'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(SERVER_PORT) },
  });
  children.push(server);
  pipe(server, 'server');

  const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(DEMO_PORT), '--strictPort'], { cwd: ROOT, env: process.env });
  children.push(vite);
  let announced = false;
  pipe(vite, 'demo', (line) => {
    if (announced || !/ready in|Local:/.test(line)) return;
    announced = true;
    void health().then((h) => {
      const model = describeModel(h);
      console.log(`\n  ▶ Open http://localhost:${DEMO_PORT}/   ·   model: ${model}\n  ▶ Press Ctrl+C to stop.\n`);
    });
  });

  for (const c of children) {
    c.on('exit', (code) => {
      if (!stopping) {
        console.error(`\n✖ ${c === server ? 'completion server' : 'demo page'} stopped (exit ${code ?? 'signal'}); shutting down.`);
        stop(code ?? 1);
      }
    });
  }
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
