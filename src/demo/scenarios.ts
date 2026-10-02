import { addMessage } from './chat';

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

/** Plays scenario turns one at a time; switching scenario restarts it. */
export function mountScenarios(transcript: HTMLElement, select: HTMLSelectElement, next: HTMLButtonElement, says: HTMLFormElement): void {
  let step = 0;
  select.addEventListener('change', () => (step = 0));
  next.addEventListener('click', () => {
    const turns = SCENARIOS[select.value] ?? [];
    if (step < turns.length) addMessage(transcript, 'customer', turns[step++]);
    next.disabled = step >= turns.length;
  });
  select.addEventListener('change', () => (next.disabled = false));
  says.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = says.elements.namedItem('text') as HTMLInputElement;
    const text = input.value.trim();
    if (text) addMessage(transcript, 'customer', text);
    input.value = '';
  });
}
