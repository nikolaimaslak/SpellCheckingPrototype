import './style.css';
import { createCompletionClient, attachCompletion, type CompletionHandle } from '../completion';
import { attachSpellCheck, type SpellCheckHandle } from '../composer';
import { resolveCompletion, resolveGrammar, resolveMode } from '../policy';
import { attachPolish, createPolishClient, type PolishHandle } from '../polish';
import { startSpellWorker, type SpellClient } from '../spell/client';
import { createSpellService } from '../spell/service';
import { createTelemetry } from '../telemetry';
import { mountChat, mountChatControls, readTranscript, setChatFidelity } from './chat';
import { mountEmail } from './email';
import { mountScenarios } from './scenarios';
import { fetchModelState, highlightsSupported, renderBrowserNotice, renderModelBanner, renderVersion } from './model-banner';
import { clearSettings, loadSettings, mountEventCounter, mountSettings, saveSettings, type DemoSettings } from './settings';
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
const transcript = byId('chat-transcript');
mountChat(chat, transcript);
mountChatControls(chat, document.querySelector<HTMLElement>('.chat-controls')!);
mountEmail(email, document.querySelector<HTMLElement>('.email-toolbar')!);
mountScenarios(transcript, byId<HTMLSelectElement>('scenario'), byId<HTMLButtonElement>('next-customer'), byId<HTMLFormElement>('customer-says'));
byId<HTMLInputElement>('fidelity-toggle').addEventListener('change', (e) => setChatFidelity(chat, (e.target as HTMLInputElement).checked));

const telemetry = createTelemetry({ url: '/api/v1/events', session: crypto.randomUUID() });
const count = mountEventCounter(byId('assist-events'));
const record = (event: { type: string; lang?: string }) => {
  count(event);
  telemetry.record(event);
};
const fetcher = createCompletionClient('/api');
const polishFetcher = createPolishClient('/api');

let client: SpellClient | undefined;
let handles: SpellCheckHandle[] = [];
let completions: CompletionHandle[] = [];
let polishes: PolishHandle[] = [];
let stopStatus = () => {};
let current: ReturnType<typeof createSpellService> | undefined;

/** Stand-in for "applies on next login": a fresh spell service and fresh attachments. */
function apply({ policy, preference, agent }: DemoSettings) {
  handles.forEach((h) => h.detach());
  completions.forEach((h) => h.detach());
  polishes.forEach((h) => h.detach());
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
          attachSpellCheck(el, { service: current!, mode, languages: policy.languages, customWords: policy.customDictionary, onEvent: record }),
        );
  completions = resolveCompletion(policy, preference, agent)
    ? [chat, email].map((el) =>
        attachCompletion(el, { fetcher, sources: policy.completion.sources, transcript: () => readTranscript(transcript), onEvent: record }),
      )
    : [];
  polishes = resolveGrammar(policy, preference, agent)
    ? [chat, email].map((el, i) =>
        // Pressing Polish dismisses that composer's ghost text.
        attachPolish(el, { fetcher: polishFetcher, onEvent: record, onOpen: () => completions[i]?.dismiss() }),
      )
    : [];
}

const refreshModelBanner = () => void fetchModelState().then((s) => renderModelBanner(byId('model-banner'), s));
renderBrowserNotice(byId('browser-notice'), highlightsSupported());
renderVersion(byId('app-version'), __APP_VERSION__);

const initial = loadSettings(storage);
mountSettings(
  byId<HTMLFormElement>('assist-settings'),
  initial,
  (s) => {
    saveSettings(storage, s);
    apply(s);
    refreshModelBanner();
  },
  () => clearSettings(storage),
);
apply(initial);
refreshModelBanner();

if (import.meta.env.DEV) {
  // Console access for manual checks.
  Object.assign(window, {
    spellDemo: {
      get service() { return current; },
      get handles() { return handles; },
      get completions() { return completions; },
      get polishes() { return polishes; },
      telemetry,
    },
  });
}
