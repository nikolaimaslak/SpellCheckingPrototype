/**
 * Chat stand-in composer: Enter sends to the transcript, Shift+Enter inserts a
 * line break (left to the browser's plaintext-only editing).
 */
export function mountChat(composer: HTMLElement, transcript: HTMLElement): void {
  composer.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    const text = (composer.textContent ?? '').trim();
    if (!text) return;
    const item = document.createElement('li');
    item.dir = 'auto';
    item.textContent = text;
    transcript.append(item);
    item.scrollIntoView?.({ block: 'nearest' });
    composer.textContent = '';
  });
}
