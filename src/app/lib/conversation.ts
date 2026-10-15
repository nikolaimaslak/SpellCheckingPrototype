import type { Turn } from '../../assistant/types';

const LABEL = /^\s*(customer|agent|العميل|الموظف)\s*:\s*(.*)$/iu;
const ROLES: Record<string, Turn['role']> = { customer: 'customer', العميل: 'customer', agent: 'agent', الموظف: 'agent' };

/**
 * The Conversation field's turns, oldest first. A line starting with
 * `Customer:` / `Agent:` (or `العميل:` / `الموظف:`) starts a turn; other lines
 * continue it; lines before the first label are skipped.
 */
export function parseConversation(text: string): Turn[] {
  const turns: Turn[] = [];
  for (const line of text.split(/\r?\n/)) {
    const label = LABEL.exec(line);
    if (label) turns.push({ role: ROLES[label[1].toLowerCase()], text: label[2].trim() });
    else if (line.trim() && turns.length) turns[turns.length - 1].text += `\n${line.trim()}`;
  }
  return turns.filter((t) => t.text);
}

/** The Conversation field with one more turn at the end. */
export function appendTurn(text: string, turn: Turn): string {
  const line = `${turn.role === 'customer' ? 'Customer' : 'Agent'}: ${turn.text}`;
  return text.trim() ? `${text.trimEnd()}\n${line}` : line;
}
