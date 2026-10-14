import { attachCompletion, createCompletionClient, type CompletionFetcher, type CompletionHandle, type Turn } from '../../completion';
import { attachSpellCheck } from '../../composer';
import { attachPolish, createPolishClient, type PolishFetcher } from '../../polish';
import type { SpellService } from '../../spell/service';
import type { LogEvent } from './event-log';
import { lines, spellMode, type AppSettings } from './settings';

export interface AssistContext {
  /** The Conversation field's turns, oldest first: customer words are never auto-corrected, and it is completion context. */
  conversation: () => Turn[];
  log: (event: LogEvent) => void;
}

const baseCompletion = createCompletionClient('/api');
const basePolish = createPolishClient('/api');

/**
 * Completion client that sends the canned and KB fields with every request
 * (the server searches them instead of its own files) and logs the request and reply.
 */
export function completionFetcher(canned: string[], kb: string[], log: AssistContext['log']): CompletionFetcher {
  return async (request, signal) => {
    log({ type: 'complete-request', prefix: request.prefix, turns: request.transcript.length, canned: canned.length, kb: kb.length } as LogEvent);
    const body = { ...request, canned, kb };
    const reply = await baseCompletion(body, signal);
    log({ type: 'complete-reply', reply, aborted: signal.aborted } as LogEvent);
    return reply;
  };
}

export function polishFetcher(log: AssistContext['log']): PolishFetcher {
  return async (text, signal) => {
    log({ type: 'polish-request', text } as LogEvent);
    const reply = await basePolish(text, signal);
    log({ type: 'polish-reply', reply } as LogEvent);
    return reply;
  };
}

/** What attaching depends on: everything but the conversation, which is read live through the context. */
export type AssistSettings = Omit<AppSettings, 'conversation'>;

/** Attaches spelling and completion as the settings say, and polish always. Returns detach. */
export function attachAssist(el: HTMLElement, settings: AssistSettings, spellService: SpellService, assistContext: AssistContext): () => void {
  const detach: (() => void)[] = [];
  const mode = spellMode(settings);
  if (mode !== 'off') {
    const spell = attachSpellCheck(el, {
      service: spellService,
      mode,
      autoReplace: settings.autoReplace,
      languages: settings.languages,
      customWords: lines(settings.customDictionary),
      conversation: assistContext.conversation,
      onEvent: assistContext.log,
      // Undo (Ctrl/Cmd+Z) is the only revert key: replacements are native edits.
      backspaceRevert: false,
    });
    detach.push(() => spell.detach());
  }

  let completion: CompletionHandle | undefined;
  if (settings.completion) {
    const canned = lines(settings.canned);
    const kb = lines(settings.kb);
    const handle = attachCompletion(el, {
      fetcher: completionFetcher(canned, kb, assistContext.log),
      sources: { transcript: true, canned: canned.length > 0, kb: kb.length > 0 },
      transcript: assistContext.conversation,
      onEvent: assistContext.log,
    });
    completion = handle;
    detach.push(() => handle.detach());
  }

  // Polish is always on: pressing it hides the completion ghost text.
  const polish = attachPolish(el, { fetcher: polishFetcher(assistContext.log), onEvent: assistContext.log, onOpen: () => completion?.dismiss() });
  detach.push(() => polish.detach());

  return () => detach.forEach((d) => d());
}
