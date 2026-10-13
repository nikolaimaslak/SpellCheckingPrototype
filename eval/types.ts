// Shared shapes of the evaluation data.
import type { ErrorType, Lang } from './error-types.ts';

/** `unscored`: a word imported data marks as edited for reasons other than spelling (grammar, word choice); it counts in no metric. */
export type Gold = 'correct' | 'misspelled' | 'excluded' | 'unscored';

/** A labelled span of a message. Tokens without a label are gold correct. */
export interface Label {
  /** Flat offset of the span in the message text (UTF-16, as String.slice). */
  start: number;
  /** The span's text as it appears in the message (the misspelling, for `misspelled`). */
  word: string;
  gold: Gold;
  /** The intended word, for `misspelled`. */
  intended?: string;
  /** The error type, when known (generated data); otherwise classified. */
  type?: ErrorType;
}

export interface Message {
  id: string;
  text: string;
  labels?: Label[];
}

export type Outcome =
  | 'untouched'
  | 'false-flag'
  | 'corruption'
  | 'missed'
  | 'fixed'
  | 'wrong-fix'
  | 'flagged'
  | 'excluded'
  | 'exclusion-leak'
  | 'unscored';

export interface WordOutcome {
  dataset: string;
  messageId: string;
  lang: Lang | null;
  word: string;
  start: number;
  gold: Gold;
  intended: string | null;
  outcome: Outcome;
  /** Gold misspellings: true when the engine accepts the typed word (a real-word error); null for other gold labels. */
  realWord: boolean | null;
  /** Gold misspellings: the error type (from the label, else classified). */
  errorType: ErrorType | null;
  /** Detected misspellings: 1-based rank of the intended word among the system's corrections, or null. */
  rank: number | null;
  /** The auto-replacement, if any. */
  replacement: string | null;
  /** The rule that produced the auto-replacement: a known misspelling, a case-only fix or the single-neighbor rule. */
  source: 'list' | 'case' | 'neighbor' | null;
  /** The system's ranked corrections: the auto-replacement first, then the suggestions. */
  corrections: string[];
  /** Type of the edit the top correction makes (typed word → correction), when there is one. */
  correctionType: ErrorType | null;
  /** The message text, for examples. */
  context: string;
}
