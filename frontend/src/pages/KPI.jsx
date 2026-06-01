import { useEffect, useState, useMemo } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { ScoreGauge } from "../components/ScoreGauge";
import { apiClient } from "../lib/auth";
import { formatEur } from "../lib/demoData";
import { Link } from "react-router-dom";
import { Trophy, AlertTriangle, ArrowUpRight, Loader2 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

const tooltipStyle = { backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, color: "#0F172A", boxShadow: "0 4px 12px rgba(15,23,42,0.08)" };

const RankRow = ({ p, value, suffix = "" }) => (
  <Link to={`/immobile/${p.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#F8FAFC] transition-colors" data-testid={`rank-${p.id}`}>
    <img src={p.img} className="w-10 h-10 rounded object-cover" alt="" />
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-[#0F172A] truncate">{p.nome}</div>
      <div className="text-[11px] text-[#64748B]">{p.citta}</div>
    </div>
    <div className="text-right tabular text-sm">
      <span className="text-[#0F172A]">{value}{suffix}</span>
    </div>
  </Link>
);

export default function KPI() {
  const [props, setProps] = useState([]);
  const [agg, setAgg] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, m] = await Promise.all([
          apiClient().get("/properties"),
          apiClient().get("/mutui/aggregato"),
        ]);
        setProps(p.data || []);
        setAgg(m.data || null);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  const reddito = useMemo(() => props.filter(p => p.canone_mensile > 0 && p.rendimento_netto > 0), [props]);

  const byNetto = useMemo(() => [...reddito].sort((a,b) => b.rendimento_netto - a.rendimento_netto), [reddito]);
  const byCash = useMemo(() => [...reddito].sort((a,b) => b.cash_flow_mensile - a.cash_flow_mensile), [reddito]);
  const worst = useMemo(() => [...reddito].sort((a,b) => a.rendimento_netto - b.rendimento_netto), [reddito]);
  const chartData = useMemo(() => reddito.map(p => ({ nome: p.nome.substring(0, 14), netto: p.rendimento_netto, lordo: p.rendimento_lordo })), [reddito]);

  // KPI portafoglio reali
  const kpi = useMemo(() => {
    if (!props.length) return null;
    const tot_valore = props.reduce((s, p) => s + (p.valore_stimato || 0), 0);
    const tot_costo = props.reduce((s, p) => s + (p.costo_totale || 0), 0);
    const ricavi_anno = props.reduce((s, p) => s + (p.canone_mensile || 0) * 12, 0);
    const debito = agg?.debito_totale || 0;
    // Rendimento medio netto = media ponderata sul costo
    const wSum = reddito.reduce((s, p) => s + (p.rendimento_netto * p.costo_totale), 0);
    const totCostoReddito = reddito.reduce((s, p) => s + p.costo_totale, 0);
    const rendMedioNetto = totCostoReddito > 0 ? wSum / totCostoReddito : 0;
    // ROI medio = utile/capitale proprio (semplificato: cashflow annuo / capitale proprio investito)
    const capitale_proprio = tot_costo - debito;
    const cf_annuo = props.reduce((s, p) => s + (p.cash_flow_mensile || 0) * 12, 0);
    const roi = capitale_proprio > 0 ? (cf_annuo / capitale_proprio) * 100 : 0;
    const leva = capitale_proprio > 0 ? tot_costo / capitale_proprio : 1;
    // Portfolio Score: media degli score immobili
    const scores = props.filter(p => p.portfolio_score).map(p => p.portfolio_score);
    const portfolio_score = scores.length > 0 ? Math.round(scores.reduce((s,v) => s+v, 0) / scores.length) : 0;
    return {
      tot_valore, tot_costo, ricavi_anno, debito,
      rendMedioNetto: +rendMedioNetto.toFixed(2),
      roi: +roi.toFixed(2),
      leva: +leva.toFixed(2),
      portfolio_score,
      n_props: props.length,
    };
  }, [props, reddito, agg]);

  if (loading) return <Layout title="KPI & Rendimenti"><div className="py-20 flex justify-center"><Loader2 size={28} className="animate-spin text-[#0066FF]"/></div></Layout>;
  if (!kpi) return <Layout title="KPI & Rendimenti"><div className="py-10 text-center text-sm text-[#475569]">Nessun immobile in portafoglio.</div></Layout>;

  return (
    <Layout title="KPI & Rendimenti" subtitle={`${kpi.n_props} immobili · dati live`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SectionCard className="md:col-span-2" testId="kpi-chart-rendimenti" title="Rendimento per immobile" subtitle="Lordo vs Netto (regime fiscale società)">
          {chartData.length === 0 ? (
            <div className="text-sm text-[#475569] py-8 text-center">Nessun immobile a reddito.</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="nome" stroke="#64748B" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
                <Bar dataKey="lordo" name="Lordo" fill="#0066FF" radius={[4, 4, 0, 0]} />
                <Bar dataKey="netto" name="Netto" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard testId="kpi-portfolio-score" title="Portfolio Score" subtitle="Salute complessiva 0-100">
          <div className="flex flex-col items-center py-2">
            <ScoreGauge value={kpi.portfolio_score} size={150} />
            <div className="text-xs text-[#475569] text-center mt-3">Media degli Score dei singoli immobili</div>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="kpi-card-totale">
          <div className="text-[10px] uppercase text-[#64748B]">Valore patrimonio</div>
          <div className="font-display text-2xl font-bold tabular mt-1">{formatEur(kpi.tot_valore)}</div>
        </SectionCard>
        <SectionCard testId="kpi-card-medio">
          <div className="text-[10px] uppercase text-[#64748B]">Rendimento medio netto</div>
          <div className="font-display text-2xl font-bold tabular mt-1 text-[#059669]">{kpi.rendMedioNetto}%</div>
        </SectionCard>
        <SectionCard testId="kpi-card-roi">
          <div className="text-[10px] uppercase text-[#64748B]">ROI medio (cash/equity)</div>
          <div className="font-display text-2xl font-bold tabular mt-1">{kpi.roi}%</div>
        </SectionCard>
        <SectionCard testId="kpi-card-leva">
          <div className="text-[10px] uppercase text-[#64748B]">Leva finanziaria</div>
          <div className="font-display text-2xl font-bold tabular mt-1">{kpi.leva}×</div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SectionCard title="Top per rendimento netto" testId="kpi-rank-netto" action={<Trophy size={14} className="text-[#B45309]"/>}>
          {byNetto.length === 0 ? <div className="text-sm text-[#475569] py-2">—</div> : byNetto.slice(0, 5).map(p => <RankRow key={p.id} p={p} value={p.rendimento_netto.toFixed(2)} suffix="%" />)}
        </SectionCard>
        <SectionCard title="Top per cash flow" testId="kpi-rank-cash" action={<ArrowUpRight size={14} className="text-[#059669]"/>}>
          {byCash.length === 0 ? <div className="text-sm text-[#475569] py-2">—</div> : byCash.slice(0, 5).map(p => <RankRow key={p.id} p={p} value={formatEur(p.cash_flow_mensile)} />)}
        </SectionCard>
        <SectionCard title="Da monitorare (rendimento basso)" testId="kpi-rank-worst" action={<AlertTriangle size={14} className="text-[#DC2626]"/>}>
          {worst.length === 0 ? <div className="text-sm text-[#475569] py-2">—</div> : worst.slice(0, 5).map(p => <RankRow key={p.id} p={p} value={p.rendimento_netto.toFixed(2)} suffix="%" />)}
        </SectionCard>
      </div>
    </Layout>
  );
}
