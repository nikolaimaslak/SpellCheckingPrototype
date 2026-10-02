import './style.css';
import { startSpellWorker } from '../spell/client';
import { mountChat } from './chat';
import { mountEmail } from './email';
import { trackStatus } from './status';

const byId = (id: string) => document.getElementById(id)!;

mountChat(byId('chat-composer'), byId('chat-transcript'));
mountEmail(byId('email-composer'), document.querySelector<HTMLElement>('.toolbar')!);

const spell = startSpellWorker();
void trackStatus(byId('engine-status'), () => spell.request({ type: 'load', langs: ['en', 'ar'] }));

if (import.meta.env.DEV) {
  // Console access for manual checks, e.g. await spell.request({ type: 'spell', lang: 'en', word: 'recieve' })
  Object.assign(window, { spell });
}
