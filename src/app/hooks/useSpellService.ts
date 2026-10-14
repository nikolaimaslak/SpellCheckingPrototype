import { useEffect, useState } from 'react';
import { startSpellWorker } from '../../spell/client';
import type { Lang } from '../../spell/protocol';
import { createSpellService, type SpellService, type SpellServiceStatus } from '../../spell/service';

/** A spelling worker for these languages and custom words; restarted when either changes. */
export function useSpellService(languages: Lang[], customWords: string[]) {
  const key = JSON.stringify([languages, customWords]);
  const [state, setState] = useState<{ spellService?: SpellService; spellStatus?: SpellServiceStatus }>({});

  useEffect(() => {
    const [langs, words] = JSON.parse(key) as [Lang[], string[]];
    const client = startSpellWorker();
    const spellService = createSpellService(client, { languages: langs, customWords: words });
    setState({ spellService, spellStatus: spellService.status });
    const unsubscribe = spellService.onStatus((spellStatus) => setState({ spellService, spellStatus }));
    return () => {
      unsubscribe();
      client.terminate();
    };
  }, [key]);

  return state;
}
