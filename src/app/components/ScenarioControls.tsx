import { useState } from 'react';
import { SCENARIOS } from '../lib/conversation';

/** Scenario picker for the Conversation field: Next adds the customer's next line. */
export function ScenarioControls({ conversation, onCustomerMessage }: { conversation: string; onCustomerMessage: (text: string) => void }) {
  const names = Object.keys(SCENARIOS);
  const [scenario, setScenario] = useState(names[0]);
  // The first scenario line not in the Conversation field yet, so edits and Reset are respected.
  const next = (SCENARIOS[scenario] ?? []).find((line) => !conversation.includes(line));

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select
        className="rounded border border-slate-300 px-1 py-1"
        value={scenario}
        onChange={(e) => setScenario(e.target.value)}
      >
        {names.map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
      <button
        type="button"
        className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 disabled:opacity-50"
        disabled={!next}
        onClick={() => next && onCustomerMessage(next)}
      >
        Next customer message
      </button>
      <span className="text-xs text-slate-500">adds the scenario's next line below</span>
    </div>
  );
}
