import { useEffect, useState } from 'react';
import { fetchModel, type ModelInfo } from '../../assistant/server';

/** One line saying which model answers completion and polish, and whether typed text leaves this machine. */
export function ModelLine() {
  const [info, setInfo] = useState<ModelInfo | null | undefined>();
  useEffect(() => void fetchModel().then(setInfo), []);

  if (info === undefined) return <p className="text-sm text-slate-500">Model: checking…</p>;
  if (info === null) return <p className="text-sm text-red-700">Model: unavailable (the server isn't running). Spell checking still works.</p>;
  if (info.model === 'fake') return <p className="text-sm text-slate-500">Model: offline test model (nothing leaves this machine)</p>;
  if (info.external) return <p className="text-sm text-amber-700">Model: {info.model} (text you type is sent outside this machine: made-up text only)</p>;
  return <p className="text-sm text-slate-500">Model: {info.model} (on this machine)</p>;
}
