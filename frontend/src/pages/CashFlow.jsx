import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { cashFlowMensile, cashFlowForecast, formatEur } from "../lib/demoData";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area, ReferenceLine
} from "recharts";
import { Wallet, TrendingUp, AlertTriangle } from "lucide-react";

const tooltipStyle = { backgroundColor: "#080C11", border: "1px solid #212B36", borderRadius: 8, fontSize: 12, color: "#F3F4F6" };

export default function CashFlow() {
  const saldoCorrente = cashFlowMensile[cashFlowMensile.length - 1].saldo;
  const saldoMedio = cashFlowMensile.reduce((s, m) => s + m.saldo, 0) / cashFlowMensile.length;
  const mesiTensione = cashFlowForecast.filter(f => f.saldo_previsto < 0).length;

  return (
    <Layout title="Cash Flow" subtitle="Andamento storico e forecast della liquidità">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="cf-kpi-current">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[#6B7280]"><Wallet size={12}/> Saldo mese corrente</div>
          <div className={`font-display text-3xl font-bold tabular mt-1 ${saldoCorrente >= 0 ? "text-[#34D399]" : "text-[#F87171]"}`}>{formatEur(saldoCorrente)}</div>
        </SectionCard>
        <SectionCard testId="cf-kpi-medio">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[#6B7280]"><TrendingUp size={12}/> Media 12 mesi</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{formatEur(Math.round(saldoMedio))}</div>
        </SectionCard>
        <SectionCard testId="cf-kpi-90">
          <div className="text-[10px] uppercase text-[#6B7280]">Liquidità 90 gg</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#60A5FA]">{formatEur(168200)}</div>
        </SectionCard>
        <SectionCard testId="cf-kpi-tensione">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[#6B7280]"><AlertTriangle size={12}/> Mesi in tensione</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#F87171]">{mesiTensione}</div>
          <div className="text-[11px] text-[#6B7280]">Nei prossimi 12 mesi</div>
        </SectionCard>
      </div>

      <SectionCard title="Cash flow storico" subtitle="Incassi, uscite e saldo netto" testId="cf-storico" className="mb-4">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={cashFlowMensile} margin={{ top: 10, right: 5, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#212B36" vertical={false} />
            <XAxis dataKey="mese" stroke="#6B7280" fontSize={11} axisLine={false} tickLine={false} />
            <YAxis stroke="#6B7280" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEur(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="incassi" name="Incassi" fill="#10B981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="uscite" name="Uscite" fill="#EF4444" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="saldo" name="Saldo netto" stroke="#0066FF" strokeWidth={2.5} dot={{ fill: "#0066FF", r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard title="Forecast 12 mesi" subtitle="Previsione saldo basata su contratti, mutui e scadenze attese" testId="cf-forecast">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={cashFlowForecast} margin={{ top: 10, right: 5, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id="cfFwd" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0066FF" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#0066FF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#212B36" vertical={false} />
            <XAxis dataKey="mese" stroke="#6B7280" fontSize={11} axisLine={false} tickLine={false} />
            <YAxis stroke="#6B7280" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEur(v)} />
            <ReferenceLine y={0} stroke="#EF4444" strokeDasharray="3 3" />
            <Area type="monotone" dataKey="saldo_previsto" name="Saldo previsto" stroke="#0066FF" strokeWidth={2} fill="url(#cfFwd)" />
          </AreaChart>
        </ResponsiveContainer>
        <div className="mt-3 text-xs text-[#9CA3AF]">
          ⚠ Mesi con saldo negativo previsto: <strong className="text-[#F87171]">{cashFlowForecast.filter(f => f.alert).map(f => f.mese).join(", ")}</strong>
        </div>
      </SectionCard>
    </Layout>
  );
}
