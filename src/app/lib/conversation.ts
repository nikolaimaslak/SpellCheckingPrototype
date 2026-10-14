import type { Turn } from '../../completion';
import { parseChat } from '../../demo/conversation';

/** The conversation field's turns, oldest first (`Customer:` / `Agent:` lines, as in the completion eval). */
export const parseConversation = (text: string): Turn[] => parseChat(text).conversations.flat();

/** The conversation field with one more turn at the end. */
export function appendTurn(text: string, turn: Turn): string {
  const line = `${turn.role === 'customer' ? 'Customer' : 'Agent'}: ${turn.text}`;
  return text.trim() ? `${text.trimEnd()}\n${line}` : line;
}
