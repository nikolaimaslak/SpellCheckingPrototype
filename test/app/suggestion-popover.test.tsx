// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PopoverState } from '../../src/assistant/state';
import { SuggestionPopover } from '../../src/app/components/SuggestionPopover';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
afterEach(() => {
  act(() => roots.splice(0).forEach((r) => r.unmount()));
  document.body.replaceChildren();
});

function open(over: Partial<PopoverState> = {}) {
  const calls = { pick: vi.fn(), ignore: vi.fn(), revert: vi.fn(), close: vi.fn() };
  const popover: PopoverState = { rect: { left: 100, top: 100, right: 150, bottom: 116 }, dir: 'ltr', font: '', suggestions: ['receive', 'relieve'], ...over };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<SuggestionPopover popover={popover} onPick={calls.pick} onIgnore={calls.ignore} onRevert={calls.revert} onClose={calls.close} />));
  return calls;
}
const key = (k: string, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  act(() => void target.dispatchEvent(e));
  return e;
};
const box = () => document.querySelector<HTMLElement>('[role=listbox]')!;
const options = () => [...document.querySelectorAll<HTMLElement>('[role=option]')].map((o) => o.textContent);

describe('suggestion popover', () => {
  it('lists the suggestions plus Ignore', () => {
    open({ suggestions: ['a1', 'a2', 'a3'] });
    expect(options()).toEqual(['a1', 'a2', 'a3', 'Ignore']);
  });

  it('shows a no-suggestions state and still offers Ignore', () => {
    open({ suggestions: [] });
    expect(box().textContent).toContain('No suggestions');
    expect(options()).toEqual(['Ignore']);
  });

  it('lays out right to left for Arabic', () => {
    open({ dir: 'rtl', suggestions: ['إذا'] });
    expect(box().dir).toBe('rtl');
  });

  it('offers only "Revert to …" for an auto-corrected word', () => {
    const { revert } = open({ suggestions: [], revertTo: 'المستخذم' });
    expect(options()).toEqual(['Revert to المستخذم']);
    key('Enter');
    expect(revert).toHaveBeenCalled();
  });

  it('Enter picks the focused option and the host never sees the Enter', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const hostKeydown = vi.fn();
    host.addEventListener('keydown', hostKeydown);
    const { pick } = open();
    key('ArrowDown', host);
    const e = key('Enter', host);
    expect(pick).toHaveBeenCalledWith('relieve');
    expect(hostKeydown).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
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
  });

  it('clicking elsewhere closes without restoring focus', () => {
    const { close } = open();
    act(() => void document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(close).toHaveBeenCalledWith(false);
  });

  it('clicking an option picks it, and mousedown inside does not steal focus', () => {
    const { pick, close } = open();
    const first = box().querySelector<HTMLElement>('[role=option] div')!;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => void first.dispatchEvent(down));
    expect(down.defaultPrevented).toBe(true);
    expect(close).not.toHaveBeenCalled();
    act(() => first.click());
    expect(pick).toHaveBeenCalledWith('receive');
  });

  it('typing another key closes it and lets the key through', () => {
    const { close } = open();
    const e = key('a');
    expect(e.defaultPrevented).toBe(false);
    expect(close).toHaveBeenCalledWith(false);
  });
});
