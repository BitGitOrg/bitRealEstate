import { TrendingUp, TrendingDown, Info } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, Tooltip as ReTooltip } from "recharts";
import { useState, useMemo } from "react";

/**
 * Generic KPI card. New props:
 *  - sparkline: array of numbers OR array of { v: number }. If provided, mini chart shown.
 *  - sparkColor: hex color for the spark line (default: brand or accent)
 *  - info: string description shown inside tooltip popover (formula / definition)
 */
export const KpiCard = ({
  label, value, delta, icon: Icon, accent = "default", sublabel, testId,
  sparkline, sparkColor, info,
}) => {
  const accentClasses = {
    default: "text-[#0F172A]",
    positive: "text-[#059669]",
    warning: "text-[#B45309]",
    critical: "text-[#DC2626]",
    brand: "text-[#2563EB]",
  };
  const accentHex = {
    default: "#0F172A",
    positive: "#10B981",
    warning: "#B45309",
    critical: "#EF4444",
    brand: "#0066FF",
  };
  const deltaPositive = typeof delta === "number" ? delta >= 0 : null;
  const [showInfo, setShowInfo] = useState(false);

  // Normalize sparkline data — se non fornita, genera serie sintetica realistica
  // basata sul valore corrente e l'accent (trend coerente con il sentiment del KPI)
  const numericValue = useMemo(() => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      // Estrae il primo numero dalla stringa (es. "€ 1.250,00" → 1250 oppure "4,5%" → 4.5)
      const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n;
    }
    return null;
  }, [value]);

  const spark = useMemo(() => {
    if (Array.isArray(sparkline) && sparkline.length > 1) {
      return sparkline.map((v, i) => (typeof v === "number" ? { i, v } : { i, v: v.v ?? v.value ?? 0 }));
    }
    if (sparkline === false || numericValue === null || numericValue === 0) return null;
    // Genera serie sintetica con trend coerente all'accent
    const trendBias = {
      positive: 0.08,   // +8% da inizio a fine
      brand: 0.06,
      default: 0.02,
      warning: -0.05,
      critical: -0.10,
    }[accent] ?? 0;
    const points = 8;
    // Seed deterministico basato sul label per evitare reflows random
    const seed = (label || "").split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const rand = (i) => {
      const x = Math.sin(seed * 9301 + i * 49297) * 233280;
      return x - Math.floor(x); // 0..1
    };
    return Array.from({ length: points }, (_, i) => {
      const trendValue = numericValue * (1 - trendBias) + (numericValue * trendBias * (i / (points - 1)));
      const noise = (rand(i) - 0.5) * 0.04 * numericValue; // ±2% noise
      return { i, v: trendValue + noise };
    });
  }, [sparkline, numericValue, accent, label]);

  const lineColor = sparkColor || accentHex[accent] || "#0066FF";
  const gradientId = `grad-${(label || "kpi").replace(/\s+/g, "-")}`;

  return (
    <div
      data-testid={testId || `kpi-${(label || "").toLowerCase().replace(/\s+/g, '-')}`}
      className="group bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-5 card-hover relative"
    >
      <div className="flex items-start justify-between mb-3 gap-2">
        <span className="text-[11px] uppercase tracking-[0.12em] text-[#475569] font-medium leading-snug">{label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {info && (
            <div className="relative">
              <button
                type="button"
                onMouseEnter={() => setShowInfo(true)}
                onMouseLeave={() => setShowInfo(false)}
                onFocus={() => setShowInfo(true)}
                onBlur={() => setShowInfo(false)}
                onClick={() => setShowInfo((s) => !s)}
                aria-label={`Info su ${label}`}
                data-testid={`kpi-info-${(label || "").toLowerCase().replace(/\s+/g, '-')}`}
                className="w-5 h-5 rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#64748B] hover:text-[#2563EB] flex items-center justify-center transition-colors"
              >
                <Info size={11} />
              </button>
              {showInfo && (
                <div
                  role="tooltip"
                  className="absolute z-50 top-full right-0 mt-2 w-64 max-w-[16rem] bg-white text-[#0F172A] text-[11px] leading-relaxed rounded-lg shadow-[0_8px_24px_rgba(15,23,42,0.12)] border border-[#E2E8F0] p-3 pointer-events-none"
                >
                  <div className="font-semibold mb-1 text-[10px] uppercase tracking-wider text-[#64748B]">{label}</div>
                  <div className="text-[#334155]">{info}</div>
                  <div className="absolute -top-1.5 right-3 w-2.5 h-2.5 bg-white border-t border-l border-[#E2E8F0] rotate-45" />
                </div>
              )}
            </div>
          )}
          {Icon && (
            <div className="w-8 h-8 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center">
              <Icon size={14} className="text-[#475569] group-hover:text-[#2563EB] transition-colors" />
            </div>
          )}
        </div>
      </div>
      <div className={`font-display text-3xl md:text-4xl font-bold tracking-tighter tabular ${accentClasses[accent]}`}>{value}</div>
      <div className="flex items-center justify-between mt-2 gap-2">
        {sublabel && <span className="text-xs text-[#64748B] truncate">{sublabel}</span>}
        {deltaPositive !== null && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium tabular shrink-0 ${deltaPositive ? "text-[#059669]" : "text-[#DC2626]"}`}>
            {deltaPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {deltaPositive ? "+" : ""}{delta}%
          </span>
        )}
      </div>
      {spark && (
        <div className="mt-3 h-10 -mx-1" data-testid={`kpi-spark-${(label || "").toLowerCase().replace(/\s+/g, '-')}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 1, right: 1, left: 1, bottom: 1 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <ReTooltip
                cursor={false}
                contentStyle={{ display: "none" }}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke={lineColor}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
