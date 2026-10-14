import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PopoverState, Rect } from '../../assistant/state';

interface Props {
  popover: PopoverState;
  onPick: (suggestion: string) => void;
  onIgnore: () => void;
  onRevert: () => void;
  /** `restoreFocus`: put the caret back in the field (Escape). */
  onClose: (restoreFocus: boolean) => void;
}

const GAP = 4;
const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta'];

/**
 * The suggestions for a flagged word (or "Revert to …" for an auto-corrected
 * one), next to the word. Arrow keys, Enter and Escape are taken at window
 * level, so Enter picks a suggestion instead of sending the message; any
 * other key, a click outside or scrolling closes it.
 */
export function SuggestionPopover({ popover, onPick, onIgnore, onRevert, onClose }: Props) {
  const items = popover.revertTo
    ? [{ label: `Revert to ${popover.revertTo}`, run: onRevert, strong: false }]
    : [...popover.suggestions.map((s) => ({ label: s, run: () => onPick(s), strong: true })), { label: 'Ignore', run: onIgnore, strong: false }];
  const [focused, setFocused] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>();

  useLayoutEffect(() => {
    if (box.current) setPosition(place(popover.rect, box.current.getBoundingClientRect(), popover.dir));
  }, [popover]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
        if (!MODIFIERS.includes(e.key)) onClose(false);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'ArrowDown') setFocused((focused + 1) % items.length);
      else if (e.key === 'ArrowUp') setFocused((focused - 1 + items.length) % items.length);
      else if (e.key === 'Enter') items[focused].run();
      else onClose(true);
    };
    const onOutside = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose(false);
    };
    const onMove = () => onClose(false);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onOutside, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onOutside, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [items, focused, onClose]);

  return (
    <div
      ref={box}
      role="listbox"
      aria-label="Spelling suggestions"
      dir={popover.dir}
      className="fixed z-50 min-w-36 rounded-md border border-slate-300 bg-white py-1 text-start text-slate-800 shadow-lg"
      style={{ font: popover.font, ...(position ?? { top: popover.rect.bottom + GAP, left: popover.rect.left, visibility: 'hidden' }) }}
      // Keep the field's focus and selection while choosing.
      onMouseDown={(e) => e.preventDefault()}
    >
      {!popover.revertTo && !popover.suggestions.length && <div className="px-3 py-1 text-slate-500 italic">No suggestions</div>}
      {items.map((item, i) => (
        <div key={item.label} role="option" aria-selected={i === focused}>
          {item.label === 'Ignore' && <div role="separator" className="my-1 border-t border-slate-200" />}
          <div
            className={`cursor-pointer px-3 py-1 whitespace-nowrap ${i === focused ? 'bg-blue-50' : ''} ${item.strong ? 'font-semibold' : ''}`}
            onMouseEnter={() => setFocused(i)}
            onClick={item.run}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Below the word (above it near the viewport bottom), start-aligned to it, kept inside the viewport. */
function place(anchor: Rect, size: { width: number; height: number }, dir: 'ltr' | 'rtl') {
  let top = anchor.bottom + GAP;
  if (top + size.height > window.innerHeight && anchor.top - GAP - size.height >= 0) top = anchor.top - GAP - size.height;
  const left = dir === 'rtl' ? anchor.right - size.width : anchor.left;
  return { top: Math.round(top), left: Math.round(Math.max(GAP, Math.min(left, window.innerWidth - size.width - GAP))) };
}
