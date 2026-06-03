import { useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, Tooltip as ReTooltip } from "recharts";

/**
 * Mini sparkline da inserire dentro qualsiasi card KPI rettangolare.
 *
 * Props:
 *  - value: numero corrente (per fallback sintetico)
 *  - data: opzionale, array reale di numeri (ha priorità su value)
 *  - labels: opzionale, array di stringhe (etichette per i punti, es. ["Gen","Feb",…])
 *  - accent: "positive" | "warning" | "critical" | "brand" | "default"
 *  - color: hex custom (override)
 *  - seed: stringa opzionale per riproducibilità (default: stringa value)
 *  - height: altezza in px (default 36)
 *  - format: funzione per formattare i valori nel tooltip (default: it-IT number)
 */
export function MiniSparkline({ value, data, labels, accent = "default", color, seed, height = 36, format }) {
  const accentHex = {
    default: "#94A3B8",
    positive: "#10B981",
    warning: "#B45309",
    critical: "#EF4444",
    brand: "#0066FF",
  };
  const lineColor = color || accentHex[accent] || "#0066FF";
  const fmt = format || ((v) => v != null ? Math.round(v).toLocaleString("it-IT") : "—");

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
      return data.map((v, i) => {
        const num = typeof v === "number" ? v : (v?.v ?? v?.value ?? 0);
        return { i, v: num, label: labels?.[i] || `T${i + 1}` };
      });
    }
    if (numericValue === null) return null;
    const trendBias = {
      positive: 0.20,
      brand: 0.15,
      default: 0.08,
      warning: -0.12,
      critical: -0.20,
    }[accent] ?? 0;
    const points = 6;
    const seedStr = seed || String(value || "spark");
    const seedNum = seedStr.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const rand = (i) => {
      const x = Math.sin(seedNum * 9301 + i * 49297) * 233280;
      return x - Math.floor(x);
    };
    const base = Math.abs(numericValue) || 1;
    const MESI = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
    const now = new Date();
    return Array.from({ length: points }, (_, i) => {
      const trendValue = numericValue * (1 - trendBias) + (numericValue * trendBias * (i / (points - 1)));
      const noise = (rand(i) - 0.5) * 0.10 * base;
      const monthIdx = (now.getMonth() - (points - 1 - i) + 12) % 12;
      return { i, v: trendValue + noise, label: MESI[monthIdx] };
    });
  }, [data, numericValue, accent, seed, value, labels]);

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
          <ReTooltip
            cursor={{ stroke: lineColor, strokeWidth: 1, strokeDasharray: "2 2" }}
            content={({ active, payload }) => {
              if (!active || !payload || !payload[0]) return null;
              const p = payload[0].payload;
              return (
                <div style={{
                  background: "white",
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
                  padding: "6px 10px",
                  fontSize: 11,
                  lineHeight: 1.4,
                  fontFamily: "inherit",
                }}>
                  <div style={{ color: "#64748B", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                    {p.label}
                  </div>
                  <div style={{ color: lineColor, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(p.v)}
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={lineColor}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 3, fill: lineColor, stroke: "white", strokeWidth: 1 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
