import { useState } from "react";

/**
 * ScoreBadge: mostra il portfolio_score con tooltip che spiega lo score_breakdown.
 * Props:
 *  - score: number
 *  - breakdown: { base, penalty_alerts, alerts_alta, alerts_media, alerts_bassa, morosi, bonus_rend_alto } | undefined
 *  - size: 'sm' | 'md' | 'lg' (default md)
 *  - testId
 */
export function ScoreBadge({ score, breakdown, size = "md", testId }) {
  const [open, setOpen] = useState(false);
  const value = typeof score === "number" ? score : 0;
  const color =
    value >= 71 ? "#059669" :
    value >= 41 ? "#B45309" :
    "#DC2626";
  const sizeCls = size === "sm" ? "text-xs" : size === "lg" ? "text-2xl font-bold" : "text-sm font-semibold";

  const hasBreakdown = breakdown && (
    typeof breakdown.base === "number" ||
    breakdown.penalty_alerts ||
    breakdown.bonus_rend_alto ||
    breakdown.morosi
  );

  return (
    <span
      className="relative inline-flex items-center gap-0.5 cursor-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen(!open)}
      data-testid={testId}
    >
      <span className={`tabular ${sizeCls}`} style={{ color }}>{value}</span>
      {hasBreakdown && (
        <span className="text-[9px] text-[#94A3B8] underline decoration-dotted">?</span>
      )}
      {open && hasBreakdown && (
        <div className="absolute z-50 top-full right-0 mt-1" onClick={(e) => e.stopPropagation()}>
          <ScoreTooltip breakdown={breakdown} finalScore={value} />
        </div>
      )}
    </span>
  );
}

function ScoreTooltip({ breakdown: b, finalScore }) {
  const rows = [];
  rows.push({ label: "Score base", value: b.base ?? 50, sign: 0, color: "#0F172A" });
  if (b.alerts_alta > 0) rows.push({ label: `${b.alerts_alta} alert ALTA`, value: -b.alerts_alta * 10, sign: -1, color: "#DC2626" });
  if (b.alerts_media > 0) rows.push({ label: `${b.alerts_media} alert MEDIA`, value: -b.alerts_media * 3, sign: -1, color: "#B45309" });
  if (b.alerts_bassa > 0) rows.push({ label: `${b.alerts_bassa} alert BASSA`, value: -b.alerts_bassa * 1, sign: -1, color: "#0066FF" });
  if (b.morosi > 0) rows.push({ label: `${b.morosi} incassi non a posto`, value: -b.morosi * 5, sign: -1, color: "#DC2626" });
  if (b.bonus_rend_alto > 0) rows.push({ label: "Rendimento netto > 8%", value: +b.bonus_rend_alto, sign: 1, color: "#059669" });

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg shadow-xl px-3 py-2 w-64 text-[11px] cursor-default">
      <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold mb-1.5">Come è calcolato</div>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-2 leading-tight">
            <span className="text-[#475569] truncate">{r.label}</span>
            <span className="tabular font-semibold" style={{ color: r.color }}>
              {r.sign > 0 ? "+" : ""}{r.value}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-[#E2E8F0]">
          <span className="font-semibold text-[#0F172A]">Totale</span>
          <span className="tabular text-base font-bold" style={{ color: finalScore >= 71 ? "#059669" : finalScore >= 41 ? "#B45309" : "#DC2626" }}>
            {finalScore}/100
          </span>
        </div>
      </div>
    </div>
  );
}
