import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { createAssistant, type Assistant, type AssistantOptions } from '../../assistant';
import { INITIAL_STATE } from '../../assistant/types';

const noSubscription = () => () => {};
const initialState = () => INITIAL_STATE;

export function useAssistant(fieldRef: RefObject<HTMLElement | null>, options: AssistantOptions) {
  const [assistant, setAssistant] = useState<Assistant>();

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) {
      return;
    }
    const created = createAssistant(field, options);
    setAssistant(created);
    return () => {
      created.release();
      setAssistant(undefined);
    };
  }, [fieldRef, options]);

  const state = useSyncExternalStore(assistant?.subscribe ?? noSubscription, assistant?.getState ?? initialState);
  return { assistant, state };
}
