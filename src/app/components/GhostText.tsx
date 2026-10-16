import { useEffect, useReducer, type RefObject } from 'react';
import type { GhostState } from '../../assistant/types';
import { measureGhost } from '../lib/ghost-layout';

export function GhostText({ ghost, fieldRef }: { ghost: GhostState; fieldRef: RefObject<HTMLElement | null> }) {
  const [, remeasure] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, true);
    return () => {
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, true);
    };
  }, []);

  const hasTextBelow = ghost.fieldText.slice(ghost.caretOffset).trim() !== '';
  const layout = fieldRef.current && measureGhost(fieldRef.current, ghost.direction, hasTextBelow);
  if (!layout) {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-40 m-0 p-0 whitespace-pre-wrap text-slate-400 [overflow-wrap:anywhere]"
      style={layout}
    >
      {ghost.text}
    </div>
  );
}
