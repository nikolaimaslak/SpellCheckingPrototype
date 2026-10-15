/** The typing pause before a request, drawn as a ring filling up. Same size and place as the request spinner. */
export function PauseRing({ durationMs }: { durationMs: number }) {
  const radius = 5;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg aria-hidden="true" viewBox="0 0 14 14" className="pointer-events-none absolute top-2 right-2 size-3.5 -rotate-90">
      <circle cx="7" cy="7" r={radius} fill="none" className="stroke-slate-200" strokeWidth="2" />
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        className="stroke-slate-400"
        strokeWidth="2"
        strokeDasharray={circumference}
        style={{ strokeDashoffset: circumference, animation: `pause-ring ${durationMs}ms linear forwards` }}
      />
    </svg>
  );
}
