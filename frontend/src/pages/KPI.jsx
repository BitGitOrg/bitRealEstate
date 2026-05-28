import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { ScoreGauge } from "../components/ScoreGauge";
import { properties, portfolioKPI, formatEur } from "../lib/demoData";
import { Link } from "react-router-dom";
import { Trophy, AlertTriangle, ArrowUpRight } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

const tooltipStyle = { backgroundColor: "#080C11", border: "1px solid #212B36", borderRadius: 8, fontSize: 12, color: "#F3F4F6" };

const RankRow = ({ p, value, suffix = "" }) => (
  <Link to={`/immobile/${p.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#080C11] transition-colors" data-testid={`rank-${p.id}`}>
    <img src={p.img} className="w-10 h-10 rounded object-cover" alt=""/>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-[#F3F4F6] truncate">{p.nome}</div>
      <div className="text-[11px] text-[#6B7280]">{p.citta}</div>
    </div>
    <div className="text-right tabular text-sm">
      <span className={p.cash_flow_mensile >= 0 ? "text-[#34D399]" : "text-[#F87171]"}>{value}{suffix}</span>
    </div>
  </Link>
);

export default function KPI() {
  const byNetto = [...properties].filter(p => p.rendimento_netto > 0).sort((a,b) => b.rendimento_netto - a.rendimento_netto);
  const byCash = [...properties].sort((a,b) => b.cash_flow_mensile - a.cash_flow_mensile);
  const worst = [...properties].filter(p => p.rendimento_netto > 0).sort((a,b) => a.rendimento_netto - b.rendimento_netto);
  const chartData = properties.filter(p => p.rendimento_netto > 0).map(p => ({ nome: p.nome.substring(0, 12), netto: p.rendimento_netto, lordo: p.rendimento_lordo }));

  return (
    <Layout title="KPI & Rendimenti" subtitle="Indicatori di performance del portafoglio">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SectionCard className="md:col-span-2" testId="kpi-chart-rendimenti" title="Rendimento per immobile" subtitle="Lordo vs netto">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#212B36" vertical={false} />
              <XAxis dataKey="nome" stroke="#6B7280" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis stroke="#6B7280" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
              <Bar dataKey="lordo" name="Lordo" fill="#0066FF" radius={[4, 4, 0, 0]} />
              <Bar dataKey="netto" name="Netto" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard testId="kpi-portfolio-score" title="Portfolio Score">
          <div className="flex flex-col items-center py-2">
            <ScoreGauge value={72} size={150} />
            <div className="text-xs text-[#9CA3AF] text-center mt-3">Salute complessiva del patrimonio (media ponderata 0-100)</div>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="kpi-card-totale">
          <div className="text-[10px] uppercase text-[#6B7280]">Valore patrimonio</div>
          <div className="font-display text-2xl font-bold tabular mt-1">{formatEur(portfolioKPI.valore_stimato_totale)}</div>
        </SectionCard>
        <SectionCard testId="kpi-card-medio">
          <div className="text-[10px] uppercase text-[#6B7280]">Rendimento medio netto</div>
          <div className="font-display text-2xl font-bold tabular mt-1 text-[#34D399]">{portfolioKPI.rendimento_medio_netto}%</div>
        </SectionCard>
        <SectionCard testId="kpi-card-roi">
          <div className="text-[10px] uppercase text-[#6B7280]">ROI medio</div>
          <div className="font-display text-2xl font-bold tabular mt-1">8,4%</div>
        </SectionCard>
        <SectionCard testId="kpi-card-leva">
          <div className="text-[10px] uppercase text-[#6B7280]">Leva finanziaria</div>
          <div className="font-display text-2xl font-bold tabular mt-1">1,38×</div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SectionCard title="Top per rendimento netto" testId="kpi-rank-netto" action={<Trophy size={14} className="text-[#FBBF24]"/>}>
          {byNetto.slice(0, 5).map(p => <RankRow key={p.id} p={p} value={p.rendimento_netto.toFixed(2)} suffix="%" />)}
        </SectionCard>
        <SectionCard title="Top per cash flow" testId="kpi-rank-cash" action={<ArrowUpRight size={14} className="text-[#34D399]"/>}>
          {byCash.slice(0, 5).map(p => <RankRow key={p.id} p={p} value={formatEur(p.cash_flow_mensile)} />)}
        </SectionCard>
        <SectionCard title="Da monitorare" testId="kpi-rank-worst" action={<AlertTriangle size={14} className="text-[#F87171]"/>}>
          {worst.slice(0, 5).map(p => <RankRow key={p.id} p={p} value={p.rendimento_netto.toFixed(2)} suffix="%" />)}
        </SectionCard>
      </div>
    </Layout>
  );
}
