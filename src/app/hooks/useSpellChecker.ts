import { useEffect, useState } from 'react';
import { startSpellChecker, type SpellChecker, type SpellStatus } from '../../spell/checker';
import type { Lang } from '../../spell/protocol';

/** A spelling worker for these languages and custom words; restarted when either changes. */
export function useSpellChecker(languages: Lang[], customWords: string[]) {
  const key = JSON.stringify([languages, customWords]);
  const [state, setState] = useState<{ checker?: SpellChecker; status?: SpellStatus }>({});

  useEffect(() => {
    const [langs, words] = JSON.parse(key) as [Lang[], string[]];
    const checker = startSpellChecker({ languages: langs, customWords: words });
    setState({ checker, status: checker.status });
    const unsubscribe = checker.onStatus((status) => setState({ checker, status }));
    return () => {
      unsubscribe();
      checker.terminate();
    };
  }, [key]);

  return state;
}
