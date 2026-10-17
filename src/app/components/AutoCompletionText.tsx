import { useEffect, useReducer, type RefObject } from 'react';
import type { AutoCompletionState } from '../../assistant';
import { measureAutoCompletion } from '../lib/auto-completion-layout';

export function AutoCompletionText({ autoCompletion, fieldRef }: { autoCompletion: AutoCompletionState; fieldRef: RefObject<HTMLElement | null> }) {
  const [, remeasure] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, true);
    return () => {
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, true);
    };
  }, []);

  const hasTextBelow = autoCompletion.fieldText.slice(autoCompletion.caretOffset).trim() !== '';
  const layout = fieldRef.current && measureAutoCompletion(fieldRef.current, autoCompletion.direction, hasTextBelow);
  if (!layout) {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-40 m-0 p-0 whitespace-pre-wrap text-slate-400 [overflow-wrap:anywhere]"
      style={layout}
    >
      {autoCompletion.text}
    </div>
  );
}
