import type { GhostState } from '../../assistant/types';

/**
 * The completion suggestion in grey. An overlay outside the field, so it can
 * never reach the message or the undo history; its first line starts at the
 * caret and later lines wrap inside the field.
 */
export function GhostText({ ghost }: { ghost: GhostState }) {
  const { layout } = ghost;
  if (!layout) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-40 m-0 p-0 whitespace-pre-wrap text-slate-400 [overflow-wrap:anywhere]"
      style={{
        top: layout.top,
        left: layout.left,
        width: layout.width,
        textIndent: layout.textIndent,
        textAlign: layout.textAlign,
        direction: layout.direction,
        font: layout.font,
        lineHeight: layout.lineHeight,
        letterSpacing: layout.letterSpacing,
      }}
    >
      {ghost.text}
    </div>
  );
}
