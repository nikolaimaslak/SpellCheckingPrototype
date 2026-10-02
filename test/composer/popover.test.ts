// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPopover } from '../../src/composer/popover';

const opened: { close(): void }[] = [];
const open = (over: Partial<Parameters<typeof openPopover>[0]> = {}) => {
  const calls = { pick: vi.fn(), ignore: vi.fn(), close: vi.fn() };
  const handle = openPopover({
    document,
    anchor: new DOMRect(100, 100, 50, 16),
    dir: 'ltr',
    suggestions: ['receive', 'relieve'],
    onPick: calls.pick,
    onIgnore: calls.ignore,
    onClose: calls.close,
    ...over,
  });
  opened.push(handle);
  return { handle, ...calls };
};
const key = (k: string, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};
const options = () => [...document.querySelectorAll('[data-bp-spell-popover] [role=option]')].map((o) => o.textContent);

afterEach(() => {
  opened.splice(0).forEach((h) => h.close());
  document.body.replaceChildren();
});

describe('suggestion popover', () => {
  it('lists up to five suggestions plus Ignore', () => {
    open({ suggestions: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'] });
    expect(options()).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'Ignore']);
  });

  it('shows a no-suggestions state and still offers Ignore', () => {
    open({ suggestions: [] });
    expect(document.querySelector('[data-bp-spell-popover]')!.textContent).toContain('No suggestions');
    expect(options()).toEqual(['Ignore']);
  });

  it('lays out right to left for Arabic', () => {
    const { handle } = open({ dir: 'rtl', suggestions: ['إذا'] });
    expect(handle.element.dir).toBe('rtl');
  });

  it('Enter picks the focused option and the host never sees the Enter', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const hostKeydown = vi.fn();
    host.addEventListener('keydown', hostKeydown);
    const { pick, close } = open();
    key('ArrowDown', host);
    const e = key('Enter', host);
    expect(pick).toHaveBeenCalledWith('relieve');
    expect(hostKeydown).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
    expect(close).toHaveBeenCalledWith(true);
    expect(document.querySelector('[data-bp-spell-popover]')).toBeNull();
  });

  it('ArrowUp wraps to Ignore', () => {
    const { ignore } = open();
    key('ArrowUp');
    key('Enter');
    expect(ignore).toHaveBeenCalled();
  });

  it('Escape closes, restores focus and changes nothing', () => {
    const { pick, ignore, close } = open();
    key('Escape');
    expect(close).toHaveBeenCalledWith(true);
    expect(pick).not.toHaveBeenCalled();
    expect(ignore).not.toHaveBeenCalled();
    expect(document.querySelector('[data-bp-spell-popover]')).toBeNull();
  });

  it('clicking elsewhere closes without restoring focus', () => {
    const { close } = open();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(close).toHaveBeenCalledWith(false);
  });

  it('clicking an option picks it, and mousedown inside does not steal focus', () => {
    const { handle, pick } = open();
    const first = handle.element.querySelector('[role=option]')!;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    first.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    (first as HTMLElement).click();
    expect(pick).toHaveBeenCalledWith('receive');
  });

  it('typing another key closes it and lets the key through', () => {
    const { close } = open();
    const e = key('a');
    expect(e.defaultPrevented).toBe(false);
    expect(close).toHaveBeenCalledWith(false);
  });
});
