import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { createAssistant, type Assistant, type AssistantOptions } from '../../assistant';
import { INITIAL_STATE } from '../../assistant/state';

const noSubscription = () => () => {};
const initialState = () => INITIAL_STATE;

/**
 * Attaches the assistant to the message field and returns it with its state
 * (what to draw). Re-attaches when `options` change; pass a stable object.
 */
export function useAssistant(fieldRef: RefObject<HTMLElement | null>, options: AssistantOptions) {
  const [assistant, setAssistant] = useState<Assistant>();

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const created = createAssistant(field, options);
    setAssistant(created);
    return () => {
      created.detach();
      setAssistant(undefined);
    };
  }, [fieldRef, options]);

  const state = useSyncExternalStore(assistant?.subscribe ?? noSubscription, assistant?.getState ?? initialState);
  return { assistant, state };
}
