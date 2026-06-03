import { useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";

/**
 * Mini sparkline da inserire dentro qualsiasi card KPI rettangolare.
 *
 * Props:
 *  - value: numero corrente (per generare serie sintetica) OPPURE serie array
 *  - data: opzionale, array reale di numeri (priorità su value)
 *  - accent: "positive" | "warning" | "critical" | "brand" | "default"
 *  - color: hex custom (override)
 *  - seed: stringa opzionale per riproducibilità (default: stringa value)
 *  - height: altezza in px (default 36)
 */
export function MiniSparkline({ value, data, accent = "default", color, seed, height = 36 }) {
  const accentHex = {
    default: "#94A3B8",
    positive: "#10B981",
    warning: "#B45309",
    critical: "#EF4444",
    brand: "#0066FF",
  };
  const lineColor = color || accentHex[accent] || "#0066FF";

  const numericValue = useMemo(() => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n;
    }
    return null;
  }, [value]);

  const series = useMemo(() => {
    if (Array.isArray(data) && data.length > 1) {
      return data.map((v, i) => (typeof v === "number" ? { i, v } : { i, v: v.v ?? v.value ?? 0 }));
    }
    if (numericValue === null) return null;
    const trendBias = {
      positive: 0.08,
      brand: 0.06,
      default: 0.02,
      warning: -0.05,
      critical: -0.10,
    }[accent] ?? 0;
    const points = 8;
    const seedStr = seed || String(value || "spark");
    const seedNum = seedStr.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const rand = (i) => {
      const x = Math.sin(seedNum * 9301 + i * 49297) * 233280;
      return x - Math.floor(x);
    };
    const base = Math.abs(numericValue) || 1;
    return Array.from({ length: points }, (_, i) => {
      const trendValue = numericValue * (1 - trendBias) + (numericValue * trendBias * (i / (points - 1)));
      const noise = (rand(i) - 0.5) * 0.04 * base;
      return { i, v: trendValue + noise };
    });
  }, [data, numericValue, accent, seed, value]);

  if (!series) return null;
  const gradientId = `mspark-${seed || (typeof value === "string" ? value : "g")}-${accent}`.replace(/[^a-z0-9-]/gi, "");

  return (
    <div style={{ height: `${height}px` }} className="-mx-1 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 1, right: 1, left: 1, bottom: 1 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.32} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
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
  );
}
