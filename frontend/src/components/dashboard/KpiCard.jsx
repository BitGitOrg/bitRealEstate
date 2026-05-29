import { TrendingUp, TrendingDown } from "lucide-react";

export const KpiCard = ({ label, value, delta, icon: Icon, accent = "default", sublabel, testId }) => {
  const accentClasses = {
    default: "text-[#0F172A]",
    positive: "text-[#059669]",
    warning: "text-[#B45309]",
    critical: "text-[#DC2626]",
    brand: "text-[#2563EB]",
  };
  const deltaPositive = typeof delta === "number" ? delta >= 0 : null;

  return (
    <div
      data-testid={testId || `kpi-${(label || "").toLowerCase().replace(/\s+/g, '-')}`}
      className="group bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-5 card-hover relative overflow-hidden"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] uppercase tracking-[0.12em] text-[#475569] font-medium">{label}</span>
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center">
            <Icon size={14} className="text-[#475569] group-hover:text-[#2563EB] transition-colors" />
          </div>
        )}
      </div>
      <div className={`font-display text-3xl md:text-4xl font-bold tracking-tighter tabular ${accentClasses[accent]}`}>{value}</div>
      <div className="flex items-center justify-between mt-2">
        {sublabel && <span className="text-xs text-[#64748B]">{sublabel}</span>}
        {deltaPositive !== null && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium tabular ${deltaPositive ? "text-[#059669]" : "text-[#DC2626]"}`}>
            {deltaPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {deltaPositive ? "+" : ""}{delta}%
          </span>
        )}
      </div>
    </div>
  );
};
