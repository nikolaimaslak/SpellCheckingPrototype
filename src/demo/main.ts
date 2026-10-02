import './style.css';
import { attachSpellCheck, type SpellCheckHandle } from '../composer';
import { resolveMode } from '../policy';
import { startSpellWorker, type SpellClient } from '../spell/client';
import { createSpellService } from '../spell/service';
import { mountChat, mountChatControls, setChatFidelity } from './chat';
import { mountEmail } from './email';
import { loadSettings, mountEventCounter, mountSettings, saveSettings, type DemoSettings } from './settings';
import { trackStatus } from './status';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();

const chat = byId('chat-composer');
const email = byId('email-composer');
mountChat(chat, byId('chat-transcript'));
mountChatControls(chat, document.querySelector<HTMLElement>('.chat-controls')!);
mountEmail(email, document.querySelector<HTMLElement>('.email-toolbar')!);
byId<HTMLInputElement>('fidelity-toggle').addEventListener('change', (e) => setChatFidelity(chat, (e.target as HTMLInputElement).checked));

const record = mountEventCounter(byId('assist-events'));
let client: SpellClient | undefined;
let handles: SpellCheckHandle[] = [];
let stopStatus = () => {};
let current: ReturnType<typeof createSpellService> | undefined;

/** Stand-in for "applies on next login": a fresh spell service and fresh attachments. */
function apply({ policy, preference }: DemoSettings) {
  handles.forEach((h) => h.detach());
  stopStatus();
  client?.terminate();
  client = startSpellWorker();
  current = createSpellService(client, { languages: policy.languages, customWords: policy.customDictionary });
  stopStatus = trackStatus(byId('engine-status'), current);
  const mode = resolveMode(policy, preference);
  handles =
    mode === 'off'
      ? []
      : [chat, email].map((el) =>
          attachSpellCheck(el, {
            service: current!,
            mode,
            languages: policy.languages,
            customWords: policy.customDictionary,
            onEvent: record,
          }),
        );
}

const initial = loadSettings(storage);
mountSettings(byId<HTMLFormElement>('assist-settings'), initial, (s) => {
  saveSettings(storage, s);
  apply(s);
});
apply(initial);

if (import.meta.env.DEV) {
  // Console access for manual checks.
  Object.assign(window, { spellDemo: { get service() { return current; }, get handles() { return handles; } } });
}
