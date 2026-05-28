import { TrendingUp, TrendingDown } from "lucide-react";

export const KpiCard = ({ label, value, delta, icon: Icon, accent = "default", sublabel, testId }) => {
  const accentClasses = {
    default: "text-[#F3F4F6]",
    positive: "text-[#34D399]",
    warning: "text-[#FBBF24]",
    critical: "text-[#F87171]",
    brand: "text-[#60A5FA]",
  };
  const deltaPositive = typeof delta === "number" ? delta >= 0 : null;

  return (
    <div
      data-testid={testId || `kpi-${(label || "").toLowerCase().replace(/\s+/g, '-')}`}
      className="group bg-[#11171F] border border-[#212B36] rounded-xl p-5 card-hover relative overflow-hidden"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] uppercase tracking-[0.12em] text-[#9CA3AF] font-medium">{label}</span>
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-[#080C11] border border-[#212B36] flex items-center justify-center">
            <Icon size={14} className="text-[#9CA3AF] group-hover:text-[#60A5FA] transition-colors" />
          </div>
        )}
      </div>
      <div className={`font-display text-3xl md:text-4xl font-bold tracking-tighter tabular ${accentClasses[accent]}`}>{value}</div>
      <div className="flex items-center justify-between mt-2">
        {sublabel && <span className="text-xs text-[#6B7280]">{sublabel}</span>}
        {deltaPositive !== null && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium tabular ${deltaPositive ? "text-[#34D399]" : "text-[#F87171]"}`}>
            {deltaPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {deltaPositive ? "+" : ""}{delta}%
          </span>
        )}
      </div>
    </div>
  );
};
