import { useEffect } from 'react';
import type { PolishState } from '../../assistant/state';

interface Props {
  polish: PolishState;
  onPolish: () => void;
  onAccept: () => void;
  onDismiss: () => void;
  onRevert: () => void;
}

const BUTTON = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-50';
// Keep the field's focus and caret when a button is pressed.
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/** The Polish button, the preview of its changes (Accept / Dismiss) and "Revert polish". */
export function PolishBar({ polish, onPolish, onAccept, onDismiss, onRevert }: Props) {
  const { preview } = polish;

  // Escape closes the preview; the field never sees it.
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onDismiss();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [preview, onDismiss]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" className={BUTTON} disabled={!polish.canPolish || polish.busy} onMouseDown={keepFocus} onClick={onPolish}>
          {polish.busy ? 'Polishing…' : 'Polish'}
        </button>
        {polish.revertable && (
          <>
            <span className="text-sm text-slate-500">Polish applied</span>
            <button type="button" className={BUTTON} onMouseDown={keepFocus} onClick={onRevert}>
              Revert polish
            </button>
          </>
        )}
      </div>

      {preview && (
        <div role="dialog" aria-label="Grammar and spelling suggestions" className="space-y-2 rounded-md border border-slate-300 p-3 text-sm shadow">
          {preview.segments.length > 0 && (
            <div dir={preview.dir} className="text-start leading-6 whitespace-pre-wrap">
              {preview.segments.map((s, i) =>
                s.type === 'ins' ? (
                  <ins key={i} className="rounded bg-green-100 text-green-900 no-underline">
                    {s.text}
                  </ins>
                ) : s.type === 'del' ? (
                  <del key={i} className="text-red-700">
                    {s.text}
                  </del>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </div>
          )}
          {preview.message && <p className="text-slate-500">{preview.message}</p>}
          <div className="flex justify-end gap-2">
            {preview.segments.length > 0 ? (
              <>
                <button type="button" className={BUTTON} onMouseDown={keepFocus} onClick={onDismiss}>
                  Dismiss
                </button>
                <button type="button" className={`${BUTTON} font-semibold`} onMouseDown={keepFocus} onClick={onAccept}>
                  Accept
                </button>
              </>
            ) : (
              <button type="button" className={BUTTON} onMouseDown={keepFocus} onClick={onDismiss}>
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
