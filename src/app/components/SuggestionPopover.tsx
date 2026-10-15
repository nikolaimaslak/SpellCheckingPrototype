import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { rectOfRange } from '../../assistant/browser';
import { rangeOf, readFieldText } from '../../assistant/text/field-text';
import type { PopoverState, Rect } from '../../assistant/types';

interface Props {
  popover: PopoverState;
  fieldRef: RefObject<HTMLElement | null>;
  onPick: (suggestion: string) => void;
  onIgnore: () => void;
  onAddToDictionary: (word: string) => void;
  onClose: (restoreFocus: boolean) => void;
}

const GAP = 4;
const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta'];

export function SuggestionPopover({ popover, fieldRef, onPick, onIgnore, onAddToDictionary, onClose }: Props) {
  const items = [
    ...popover.suggestions.map((s) => ({ label: s, run: () => onPick(s), strong: true })),
    { label: 'Ignore', run: onIgnore, strong: false },
    { label: 'Add to dictionary', run: () => onAddToDictionary(popover.word), strong: false },
  ];
  const [focused, setFocused] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>();

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (box.current && field) {
      setPosition(place(rectOfRange(rangeOf(readFieldText(field), popover.wordStartOffset, popover.wordEndOffset)), box.current.getBoundingClientRect(), popover.dir));
    }
  }, [popover, fieldRef]);

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
      className="fixed z-50 min-w-36 rounded-md border border-slate-300 bg-white py-1 text-start text-sm text-slate-800 shadow"
      style={position ?? { top: 0, left: 0, visibility: 'hidden' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {!popover.suggestions.length && <div className="px-3 py-1 text-slate-500">No suggestions</div>}
      {items.map((item, i) => (
        <div key={item.label} role="option" aria-selected={i === focused}>
          {item.label === 'Ignore' && <div role="separator" className="my-1 border-t border-slate-200" />}
          <div
            className={`cursor-pointer px-3 py-1 whitespace-nowrap ${i === focused ? 'bg-slate-100' : ''} ${item.strong ? 'font-semibold' : ''}`}
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

function place(anchor: Rect, size: { width: number; height: number }, dir: 'ltr' | 'rtl') {
  let top = anchor.bottom + GAP;
  if (top + size.height > window.innerHeight && anchor.top - GAP - size.height >= 0) top = anchor.top - GAP - size.height;
  const left = dir === 'rtl' ? anchor.right - size.width : anchor.left;
  return { top: Math.round(top), left: Math.round(Math.max(GAP, Math.min(left, window.innerWidth - size.width - GAP))) };
}
