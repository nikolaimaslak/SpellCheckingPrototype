import { useEffect } from 'react';
import type { PolishState } from '../../assistant/types';

interface Props {
  polish: PolishState;
  onPolish: () => void;
  onAccept: () => void;
  onDismiss: () => void;
}

const BUTTON = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-50';
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

export function PolishBar({ polish, onPolish, onAccept, onDismiss }: Props) {
  const { preview } = polish;

  useEffect(() => {
    if (!preview) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      onDismiss();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [preview, onDismiss]);

  return (
    <div className="space-y-2">
      <button type="button" className={BUTTON} disabled={polish.busy} onMouseDown={keepFocus} onClick={onPolish}>
        {polish.busy ? 'Polishing…' : 'Polish'}
      </button>

      {preview && (
        <div role="dialog" aria-label="Spelling fixes" className="space-y-2 rounded-md border border-slate-300 p-3 text-sm shadow">
          {preview.segments.length > 0 && (
            <div dir={preview.dir} className="text-start leading-6 whitespace-pre-wrap">
              {preview.segments.map((segment, i) =>
                segment.type === 'added' ? (
                  <ins key={i} className="rounded bg-green-100 text-green-900 no-underline">
                    {segment.text}
                  </ins>
                ) : segment.type === 'removed' ? (
                  <del key={i} className="text-red-700">
                    {segment.text}
                  </del>
                ) : (
                  <span key={i}>{segment.text}</span>
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
