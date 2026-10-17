const AREA_COLORS = {
  assistant: '#0f172a',
  typing: '#2563eb',
  llm: '#9333ea',
  spelling: '#dc2626',
  replace: '#ea580c',
  ghost: '#64748b',
};

export type TraceArea = keyof typeof AREA_COLORS;

export function trace(area: TraceArea, message: string, details?: unknown) {
  const label = [`%c[${area}]%c ${message}`, `color:${AREA_COLORS[area]};font-weight:bold`, 'color:inherit'];
  if (details === undefined) {
    console.log(...label);
  } else {
    console.log(...label, details);
  }
}
