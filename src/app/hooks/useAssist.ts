import { useEffect, type RefObject } from 'react';
import type { SpellService } from '../../spell/service';
import { attachAssist, type AssistContext, type AssistSettings } from '../lib/assist';

/** Keeps spelling, completion and polish attached to the composer; re-attaches when settings change. */
export function useAssist(ref: RefObject<HTMLElement | null>, settings: AssistSettings, spellService: SpellService | undefined, assistContext: AssistContext) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !spellService) return;
    return attachAssist(el, settings, spellService, assistContext);
  }, [ref, settings, spellService, assistContext]);
}
