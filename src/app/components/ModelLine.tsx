import { MODEL } from '../../assistant/openai/client';

/** One line saying which model answers completion and polish, and where typed text goes. */
export function ModelLine({ apiKey }: { apiKey: string }) {
  if (!apiKey) {
    return <p className="text-sm text-slate-500">Model: none (enter an OpenAI API key for spelling, completion and Polish).</p>;
  }
  return <p className="text-sm text-amber-700">Model: OpenAI {MODEL} (text you type is sent to OpenAI: made-up text only)</p>;
}
