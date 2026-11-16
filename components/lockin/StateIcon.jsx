/** Fixed-size shape per slot state, so state never rests on colour alone. */
const PATHS = {
  locked: (
    <>
      <rect x="2.5" y="6" width="9" height="6.5" rx="1" fill="currentColor" />
      <path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  unknown: (
    <>
      <circle cx="7" cy="7" r="5.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.6" />
      <circle cx="7" cy="7" r="1.6" fill="currentColor" />
    </>
  ),
  reset: (
    <>
      <path d="M3.2 7a3.8 3.8 0 1 0 1.2-2.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.4 2.2v3.2h3.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  final: <path d="M2.5 7L5.2 11L11.5 3" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  empty: <rect x="2.5" y="2.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5" />,
  yet: (
    <>
      <circle cx="7" cy="7" r="5.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 4v3.3l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </>
  ),
  live: (
    <>
      <circle cx="7" cy="7" r="5.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="7" cy="7" r="2.6" fill="currentColor" />
    </>
  ),
  unresolved: <path d="M7 2.2l5 9.3H2z" fill="none" stroke="currentColor" strokeWidth="1.3" />,
};

export function StateIcon({ state, className = "" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className={`shrink-0 ${className}`}>
      {PATHS[state] ?? PATHS.unresolved}
    </svg>
  );
}

/** Annotation markers for the last-15 strip, drawn at a centre point. */
export function AnnotationMark({ code, cx, cy, size = 3.2 }) {
  const s = size;
  if (code === "overtime") return <rect x={cx - s} y={cy - s} width={2 * s} height={2 * s} fill="currentColor" />;
  if (code === "minutes_jump") return <path d={`M${cx} ${cy - s - 0.6}L${cx + s + 0.6} ${cy + s}H${cx - s - 0.6}Z`} fill="currentColor" />;
  return <circle cx={cx} cy={cy} r={s} fill="none" stroke="currentColor" strokeWidth="1.3" />;
}

export function AnnotationKey({ code }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
      <AnnotationMark code={code} cx={5} cy={5} size={3.4} />
    </svg>
  );
}
