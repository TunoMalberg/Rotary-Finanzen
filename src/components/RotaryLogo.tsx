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
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i * 60 * Math.PI) / 180;
        const x1 = 32 + Math.cos(angle) * 9;
        const y1 = 32 + Math.sin(angle) * 9;
        const x2 = 32 + Math.cos(angle) * 30;
        const y2 = 32 + Math.sin(angle) * 30;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />;
      })}
      {/* gear teeth */}
      {Array.from({ length: 24 }).map((_, i) => {
        const angle = (i * 15 * Math.PI) / 180;
        const x1 = 32 + Math.cos(angle) * 30;
        const y1 = 32 + Math.sin(angle) * 30;
        const x2 = 32 + Math.cos(angle) * 33;
        const y2 = 32 + Math.sin(angle) * 33;
        return <line key={`t-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />;
      })}
    </svg>
  );
}