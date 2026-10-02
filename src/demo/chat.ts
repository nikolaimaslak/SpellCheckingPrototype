/**
 * Chat stand-in matching the Agent Desktop chat composer: a rich
 * contenteditable where Enter sends plain text and Shift+Enter breaks the line.
 */
export function mountChat(composer: HTMLElement, transcript: HTMLElement): void {
  composer.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.defaultPrevented) return;
    event.preventDefault();
    // innerText keeps line breaks from <br>/<div>; jsdom lacks it, so fall back.
    const text = (composer.innerText ?? composer.textContent ?? '').trim();
    if (!text) return;
    addMessage(transcript, 'agent', text);
    composer.replaceChildren();
  });
}

/**
 * Emoji and predefined-message controls: insert at the caret through the
 * editor's input path, as Agent Desktop's composer controls do.
 */
export function mountChatControls(composer: HTMLElement, controls: HTMLElement): void {
  controls.addEventListener('mousedown', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-insert]');
    if (!button) return;
    event.preventDefault(); // keep the composer's focus and caret
    const sel = document.getSelection();
    if (!sel || !sel.anchorNode || !composer.contains(sel.anchorNode)) {
      composer.focus();
      document.getSelection()?.selectAllChildren(composer);
      document.getSelection()?.collapseToEnd();
    }
    document.execCommand('insertText', false, button.dataset.insert!);
  });
}

/** Agent Desktop fidelity: the real composer has a fixed LTR base direction. */
export function setChatFidelity(composer: HTMLElement, on: boolean): void {
  composer.classList.toggle('fidelity', on);
  if (on) composer.removeAttribute('dir');
  else composer.dir = 'auto';
}

export type Role = 'customer' | 'agent';

/** Appends a role-labeled message to the transcript. */
export function addMessage(transcript: HTMLElement, role: Role, text: string): void {
  const item = document.createElement('li');
  item.dir = 'auto';
  item.dataset.role = role;
  item.dataset.label = role === 'customer' ? 'Customer' : 'Agent';
  item.textContent = text;
  transcript.append(item);
  item.scrollIntoView?.({ block: 'nearest' });
}

/** The conversation as completion context, oldest first. */
export function readTranscript(transcript: HTMLElement): { role: Role; text: string }[] {
  return [...transcript.querySelectorAll<HTMLElement>('li[data-role]')].map((li) => ({ role: li.dataset.role as Role, text: li.textContent ?? '' }));
}
