// Pre-compute spoke and tooth coordinates with fixed precision so that the
// server-rendered HTML matches the client-rendered HTML byte-for-byte (avoids
// React hydration mismatches caused by floating-point serialization differences
// between Node and the browser).
const round = (n: number) => Math.round(n * 1000) / 1000;

const SPOKES = Array.from({ length: 6 }).map((_, i) => {
  const angle = (i * 60 * Math.PI) / 180;
  return {
    x1: round(32 + Math.cos(angle) * 9),
    y1: round(32 + Math.sin(angle) * 9),
    x2: round(32 + Math.cos(angle) * 30),
    y2: round(32 + Math.sin(angle) * 30),
  };
});

const TEETH = Array.from({ length: 24 }).map((_, i) => {
  const angle = (i * 15 * Math.PI) / 180;
  return {
    x1: round(32 + Math.cos(angle) * 30),
    y1: round(32 + Math.sin(angle) * 30),
    x2: round(32 + Math.cos(angle) * 33),
    y2: round(32 + Math.sin(angle) * 33),
  };
});

export function RotaryLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className="rotary-wheel-svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="rotary-grad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FBC02D" />
          <stop offset="100%" stopColor="#F7A81B" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#rotary-grad)" stroke="#1a1a1a" strokeWidth="1.2" />
      <circle cx="32" cy="32" r="9" fill="#fff" stroke="#1a1a1a" strokeWidth="1.4" />
      <circle cx="32" cy="32" r="3" fill="none" stroke="#1a1a1a" strokeWidth="1.6" />
      {/* spokes */}
      {SPOKES.map((s, i) => (
        <line
          key={i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke="#1a1a1a"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
      {/* gear teeth */}
      {TEETH.map((t, i) => (
        <line
          key={`t-${i}`}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke="#1a1a1a"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}