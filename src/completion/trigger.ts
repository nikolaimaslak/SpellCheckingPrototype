export interface TriggerState {
  /** The current block's text up to the caret. */
  before: string;
  /** Text after the caret on the same line ('' at line end). */
  after: string;
  composing: boolean;
  popoverOpen: boolean;
  enabled: boolean;
}

const MIN_WORDS = 3;
const SENTENCE_END = /[.!?؟\n]/u;

/** The sentence being typed: everything after the last terminator. */
export function currentSentence(before: string): string {
  const parts = before.split(SENTENCE_END);
  return parts[parts.length - 1];
}

/** True when a completion may be requested for this caret position. */
export function shouldRequest(s: TriggerState): boolean {
  if (!s.enabled || s.composing || s.popoverOpen) return false;
  if (s.after.replace(/\s/g, '') !== '') return false; // caret must be at the end of its line
  const words = currentSentence(s.before).match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length >= MIN_WORDS;
}
