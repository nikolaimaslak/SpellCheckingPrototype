import type { Turn } from '../../assistant/server';

// Synthetic customer turns for the demo (not real GOSI conversations).
export const SCENARIOS: Record<string, string[]> = {
  'en-pension': [
    'Hello, I submitted a request for my pension documents last week. When will it be processed?',
    'Also, can you check the status of my contribution records?',
    'I changed my bank account. How do I update my details?',
  ],
  'ar-pension': [
    'السلام عليكم، قدمت طلباً للحصول على مستندات المعاش الأسبوع الماضي، متى سيتم معالجته؟',
    'هل يمكنك أيضاً الاستعلام عن الاشتراكات الخاصة بي؟',
    'غيرت حسابي البنكي، كيف أحدث بياناتي؟',
  ],
};

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
