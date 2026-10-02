const COMMANDS = new Set(['bold', 'italic', 'insertUnorderedList', 'insertOrderedList']);

/**
 * Email stand-in composer. execCommand is deprecated but keeps native undo
 * and is adequate until the real Agent Desktop editor is integrated.
 */
export function mountEmail(composer: HTMLElement, toolbar: HTMLElement): void {
  document.execCommand('defaultParagraphSeparator', false, 'p');
  toolbar.addEventListener('mousedown', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-command]');
    if (!button) return;
    // mousedown + preventDefault keeps the composer's selection intact.
    event.preventDefault();
    const command = button.dataset.command!;
    if (COMMANDS.has(command)) {
      composer.focus();
      document.execCommand(command);
    }
  });
}
