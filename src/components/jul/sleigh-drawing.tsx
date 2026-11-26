const ANTLERS = "M47 10 L44 0 M47 8 L42 4 M51 10 L54 0 M52 6 L57 3";

function Reindeer({ x, nose }: { x: number; nose: string }) {
  return (
    <g transform={`translate(${x},0)`}>
      <g fill="#92400e">
        <ellipse cx="20" cy="30" rx="18" ry="8" />
        <rect x="6" y="34" width="3" height="14" />
        <rect x="30" y="34" width="3" height="14" />
        <path d="M36 26 L44 14 L50 16 L42 30 Z" />
        <circle cx="50" cy="15" r="5" />
      </g>
      <circle cx="55" cy="16" r="2.4" fill={nose} />
      <path d={ANTLERS} stroke="#92400e" strokeWidth="2" fill="none" />
    </g>
  );
}

/** Our own drawing of Santa in his sleigh behind two reindeer, flying to the right. */
export function SleighDrawing({ width }: { width: number }) {
  return (
    <svg aria-hidden width={width} height={(width * 60) / 190} viewBox="0 -4 190 60">
      <path data-sleigh-body d="M4 30 Q4 48 22 48 L60 48 L66 40 L58 40 L56 24 L14 24 Z" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1.5" />
      <path d="M0 52 L70 52" stroke="#eab308" strokeWidth="3" />
      {/* Santa: face, hat with its bobble, beard and coat */}
      <circle cx="34" cy="14" r="7" fill="#fcd9b6" />
      <path d="M27 10 L41 10 L36 0 Z" fill="#dc2626" />
      <circle cx="36" cy="0" r="2.5" fill="#fff" />
      <path d="M28 16 Q34 26 40 16 Z" fill="#fff" />
      <path d="M26 22 L42 22 L40 30 L28 30 Z" fill="#dc2626" />
      {/* The present behind him, and the reins */}
      <rect x="44" y="14" width="10" height="10" fill="#16a34a" />
      <rect x="48" y="14" width="2" height="10" fill="#fde68a" />
      <path d="M60 40 L84 30" stroke="#d6d3d1" strokeWidth="1.5" />
      <Reindeer x={80} nose="#1c1917" />
      <Reindeer x={130} nose="#ef4444" />
    </svg>
  );
}
