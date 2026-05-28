// Circular score gauge 0-100 — Portfolio Score / Deal Score
export const ScoreGauge = ({ value = 0, size = 120, label, dataTestId }) => {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (v / 100) * c;
  let color = "#EF4444";
  if (v >= 71) color = "#10B981";
  else if (v >= 41) color = "#F59E0B";

  return (
    <div className="inline-flex flex-col items-center" data-testid={dataTestId || "score-gauge"}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="#212B36" strokeWidth="8" fill="transparent" />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={color} strokeWidth="8" fill="transparent"
            strokeDasharray={c} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 700ms ease, stroke 300ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-bold tabular tracking-tighter" style={{ fontSize: size * 0.30, color }}>{v}</span>
          <span className="text-[10px] uppercase tracking-wider text-[#6B7280]">/ 100</span>
        </div>
      </div>
      {label && <span className="mt-2 text-xs text-[#9CA3AF] uppercase tracking-wider">{label}</span>}
    </div>
  );
};
