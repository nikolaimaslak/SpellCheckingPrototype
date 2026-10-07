import { addMessage, type Role } from './chat';

export interface Turn {
  role: Role;
  text: string;
}

export interface ParsedChat {
  conversations: Turn[][];
  warnings: string[];
}

// The chat format of the local completion eval (server/assist_eval/sources.py),
// mirrored line for line; test/fixtures/chat-format.json keeps the two equal.
const LABEL = /^\s*(customer|agent|العميل|الموظف)\s*:\s*(.*)$/iu;
const ROLES: Record<string, Role> = { customer: 'customer', العميل: 'customer', agent: 'agent', الموظف: 'agent' };

/** Turns start with `Customer:` / `Agent:` (or `العميل:` / `الموظف:`); unlabelled lines continue the turn; `---` ends a conversation; `#` lines are comments. */
export function parseChat(text: string): ParsedChat {
  const conversations: Turn[][] = [];
  const warnings: string[] = [];
  let current: Turn[] = [];
  let role: Role | null = null;
  let lines: string[] = [];

  const closeTurn = () => {
    const joined = lines.join('\n').trim();
    if (role && joined) current.push({ role, text: joined });
    role = null;
    lines = [];
  };
  const closeConversation = () => {
    closeTurn();
    if (current.length) conversations.push(current);
    current = [];
  };

  text.replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) return;
    if (trimmed === '---') return closeConversation();
    const label = LABEL.exec(line);
    if (label) {
      closeTurn();
      role = ROLES[label[1].toLowerCase()];
      lines = [label[2]];
    } else if (trimmed) {
      if (role === null) warnings.push(`line ${index + 1}: text before the first role label, skipped`);
      else lines.push(trimmed);
    }
  });
  closeConversation();
  return { conversations, warnings };
}

const MAX_FILE_BYTES = 1024 * 1024;
const preview = (text: string, n = 40) => {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > n ? `${line.slice(0, n)}…` : line;
};

export interface LoaderOptions {
  /** Called after a load; returns true when it turned canned responses off. */
  onLoaded?: () => boolean;
}

/**
 * The "Load conversation" control: paste text or pick a local file in the
 * eval's chat format, choose a conversation and where to stop, and load it
 * into the transcript. Nothing leaves the page.
 */
export function mountConversationLoader(root: HTMLElement, transcript: HTMLElement, options: LoaderOptions = {}): void {
  const text = root.querySelector<HTMLTextAreaElement>('textarea')!;
  const file = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  const which = root.querySelector<HTMLSelectElement>('select[name="which"]')!;
  const upTo = root.querySelector<HTMLSelectElement>('select[name="upTo"]')!;
  const load = root.querySelector<HTMLButtonElement>('[data-load]')!;
  const status = root.querySelector<HTMLOutputElement>('output')!;
  let parsed: ParsedChat = { conversations: [], warnings: [] };

  const option = (value: string, label: string) => Object.assign(document.createElement('option'), { value, textContent: label });

  const fillStops = () => {
    const turns = parsed.conversations[Number(which.value) || 0] ?? [];
    const agents = turns.map((t, i) => [t, i] as const).filter(([t]) => t.role === 'agent');
    upTo.replaceChildren(
      ...agents.map(([t], k) => option(String(k + 1), `Before agent message ${k + 1}: “${preview(t.text)}”`)),
      option('all', 'Whole conversation'),
    );
    upTo.value = agents.length ? String(agents.length) : 'all';
  };

  const refresh = () => {
    parsed = parseChat(text.value);
    const n = parsed.conversations.length;
    which.hidden = n < 2;
    which.replaceChildren(...parsed.conversations.map((c, i) => option(String(i), `${i + 1} · ${preview(c[0]?.text ?? '')}`)));
    fillStops();
    load.disabled = n === 0;
    const skipped = parsed.warnings.length ? ` · ${parsed.warnings.length} line(s) skipped: ${parsed.warnings.map((w) => w.split(':')[0]).join(', ')}` : '';
    status.value = !text.value.trim()
      ? ''
      : n === 0
        ? `No Customer: or Agent: turns found${skipped}`
        : `${n} conversation${n > 1 ? 's' : ''}, ${parsed.conversations.reduce((s, c) => s + c.length, 0)} turns${skipped}`;
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  text.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 150);
  });
  text.addEventListener('change', refresh);
  which.addEventListener('change', fillStops);

  file.addEventListener('change', async () => {
    const picked = file.files?.[0];
    if (!picked) return;
    if (picked.size > MAX_FILE_BYTES) {
      status.value = `${picked.name} is larger than 1 MB; paste a part of it instead`;
      return;
    }
    // Read in the page: the file never leaves it.
    text.value = await picked.text();
    refresh();
  });

  load.addEventListener('click', () => {
    if (!parsed.conversations.length) {
      status.value = 'No Customer: or Agent: turns found';
      return;
    }
    const turns = parsed.conversations[Number(which.value) || 0];
    let end = turns.length;
    if (upTo.value !== 'all') {
      const k = Number(upTo.value);
      let seen = 0;
      end = turns.findIndex((t) => t.role === 'agent' && ++seen === k);
    }
    transcript.replaceChildren();
    turns.slice(0, end).forEach((t) => addMessage(transcript, t.role, t.text));
    const cannedOff = options.onLoaded?.() ?? false;
    status.value =
      `Loaded ${end} turn${end === 1 ? '' : 's'}` + (cannedOff ? ' · Canned responses turned off for this conversation (Settings → Completion context).' : '');
    if (root instanceof HTMLDetailsElement) root.open = false;
    document.getElementById('chat-composer')?.focus();
  });
}

/** Unticks "Canned responses" in the settings form and applies it, as a tester would; true when it changed. */
export function turnCannedOff(settings: HTMLFormElement): boolean {
  const canned = settings.querySelector<HTMLInputElement>('[name="sourceCanned"]');
  if (!canned?.checked) return false;
  canned.checked = false;
  settings.requestSubmit();
  return true;
}
