import type { ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-700">{title}</legend>
      {children}
    </fieldset>
  );
}
