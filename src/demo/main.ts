import './style.css';
import { attachSpellCheck, type SpellCheckHandle } from '../composer';
import { startSpellWorker } from '../spell/client';
import { createSpellService } from '../spell/service';
import { mountChat, mountChatControls, setChatFidelity } from './chat';
import { mountEmail } from './email';
import { trackStatus } from './status';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const chat = byId('chat-composer');
const email = byId('email-composer');
mountChat(chat, byId('chat-transcript'));
mountChatControls(chat, document.querySelector<HTMLElement>('.chat-controls')!);
mountEmail(email, document.querySelector<HTMLElement>('.email-toolbar')!);

const service = createSpellService(startSpellWorker());
trackStatus(byId('engine-status'), service);

let handles: SpellCheckHandle[] = [];
const setSpellCheck = (on: boolean) => {
  handles.forEach((h) => h.detach());
  handles = on ? [chat, email].map((el) => attachSpellCheck(el, { service })) : [];
};
setSpellCheck(true);

byId<HTMLInputElement>('spell-toggle').addEventListener('change', (e) => setSpellCheck((e.target as HTMLInputElement).checked));
byId<HTMLInputElement>('fidelity-toggle').addEventListener('change', (e) => setChatFidelity(chat, (e.target as HTMLInputElement).checked));

if (import.meta.env.DEV) {
  // Console access for manual checks.
  Object.assign(window, { spellDemo: { service, get handles() { return handles; } } });
}
