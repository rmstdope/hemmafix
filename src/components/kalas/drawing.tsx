/** Our own balloons: the single ones that drift in the sky, and the bunch that rises over it all. */

/** One balloon with its shine, knot and thin grey string. */
export function BalloonDrawing({ colour }: { colour: string }) {
  return (
    <svg aria-hidden viewBox="0 0 28 69" width="100%" height="100%" className="block">
      <ellipse cx="14" cy="17" rx="13" ry="16.5" fill={colour} />
      <ellipse cx="9" cy="10" rx="3" ry="5" fill="#fff" opacity=".45" />
      <path d="M11.5 33 L14 37 L16.5 33Z" fill={colour} />
      <path d="M14 37 q-4 8 0 16 q4 8 0 16" stroke="#8a8a8a" strokeWidth="1" fill="none" />
    </svg>
  );
}

/** The bunch's five balloons, back to front: where each is, and its colour. */
const BUNCH = [
  { x: 22, y: 40, colour: "#4d96ff" },
  { x: 90, y: 40, colour: "#2a9d8f" },
  { x: 44, y: 22, colour: "#ffd23f" },
  { x: 70, y: 22, colour: "#e63946" },
  { x: 56, y: 58, colour: "#c77dff" },
];

/** Five balloons whose strings meet at a red bow. */
export function BunchDrawing({ width }: { width: number }) {
  return (
    <svg aria-hidden width={width} height={(width * 170) / 110} viewBox="0 0 110 170" className="block">
      <path d="M55 150 L22 62 M55 150 L44 44 M55 150 L70 44 M55 150 L90 62 M55 150 L56 80" stroke="#777" strokeWidth="1.2" fill="none" />
      {BUNCH.map(({ x, y, colour }) => (
        <g key={colour} fill={colour}>
          <ellipse cx={x} cy={y} rx="17" ry="21" {...(colour === "#e63946" && { "data-bunch-red": true })} />
          <ellipse cx={x - 6} cy={y - 8} rx="3.5" ry="6" fill="#fff" opacity=".45" />
          <path d={`M${x - 3} ${y + 20} L${x} ${y + 25} L${x + 3} ${y + 20}Z`} />
        </g>
      ))}
      <path d="M55 150 l-10 -6 l0 12z M55 150 l10 -6 l0 12z" fill="#e63946" />
      <path d="M55 150 q-6 10 -2 19 M55 150 q6 10 2 19" stroke="#e63946" strokeWidth="1.6" fill="none" />
    </svg>
  );
}
