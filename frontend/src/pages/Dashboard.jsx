import { Layout } from "../components/layout/Layout";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { ScoreGauge } from "../components/ScoreGauge";
import { StatusBadge, SeverityBadge } from "../components/StatusBadge";
import { ScoreBadge } from "../components/ScoreBadge";
import {
  Building2, Wallet, TrendingUp, Banknote, AlertTriangle, Sparkles,
  ArrowUpRight, ArrowDownRight, MapPin, Trophy, Activity, FileBarChart
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiClient } from "../lib/auth";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import {
  portfolioKPI, properties, cashFlowMensile, ricaviCostiAnnuali,
  distribuzioneTipologia, alerts, formatEur,
} from "../lib/demoData";

const tooltipStyle = {
  backgroundColor: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  fontSize: 12,
  color: "#0F172A",
  boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
};

export default function Dashboard() {
  const [latestBilancio, setLatestBilancio] = useState(null);
  const [bankCashflow, setBankCashflow] = useState(null);

  useEffect(() => {
    apiClient().get("/import/bilanci/latest")
      .then(r => setLatestBilancio(r.data && r.data.periodo ? r.data : null))
      .catch(() => {});
    apiClient().get("/import/banca/cashflow-mensile?months=12")
      .then(r => setBankCashflow(r.data?.count >= 2 ? r.data.rows : null))
      .catch(() => {});
  }, []);

  // KPI override from real bilancio if present
  const hasReal = !!latestBilancio;
  const ce = latestBilancio?.conto_economico || {};
  const sp = latestBilancio?.stato_patrimoniale || {};
  const kpi = hasReal ? {
    valore_stimato_totale: sp.valore_immobili || portfolioKPI.valore_stimato_totale,
    capitale_investito: (sp.valore_immobili || 0) - (sp.debito_mutui || 0) || portfolioKPI.capitale_investito,
    ricavi_mensili: Math.round((ce.ricavi_affitti || 0) / 12) || portfolioKPI.ricavi_mensili,
    cash_flow_mensile: Math.round((ce.utile_netto || 0) / 12) || portfolioKPI.cash_flow_mensile,
    debito_residuo: sp.debito_mutui || portfolioKPI.debito_residuo,
    liquidita_disponibile: sp.liquidita || portfolioKPI.liquidita_disponibile,
    utile_anno: ce.utile_netto || portfolioKPI.utile_anno,
    patrimonio_netto: sp.patrimonio_netto || 0,
    rendimento_medio_netto: sp.valore_immobili && ce.utile_netto
      ? +((ce.utile_netto / sp.valore_immobili) * 100).toFixed(2)
      : portfolioKPI.rendimento_medio_netto,
    totale_immobili: portfolioKPI.totale_immobili,
    immobili_profittevoli: portfolioKPI.immobili_profittevoli,
    immobili_sotto_target: portfolioKPI.immobili_sotto_target,
    immobili_sfitti: portfolioKPI.immobili_sfitti,
  } : portfolioKPI;

  const top = [...properties].sort((a, b) => b.portfolio_score - a.portfolio_score)[0];
  const worst = [...properties].sort((a, b) => a.portfolio_score - b.portfolio_score)[0];

  return (
    <Layout
      title="Dashboard Generale"
      subtitle={hasReal ? `KPI da bilancio ${latestBilancio.periodo} (${latestBilancio.tipo})` : "Vista sintetica del portafoglio · Dati demo"}
      actions={
        <Link to="/ai-autopilot" data-testid="dashboard-ai-cta" className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgba(0,102,255,0.1)] border border-[rgba(0,102,255,0.3)] text-[#2563EB] hover:bg-[rgba(0,102,255,0.2)] text-sm font-medium transition-colors">
          <Sparkles size={14} /> Chiedi ad AI Autopilot
        </Link>
      }
    >
      {hasReal && (
        <div data-testid="dashboard-bilancio-banner" className="mb-4 px-4 py-3 rounded-xl bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.3)] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <FileBarChart size={16} className="text-[#059669]"/>
            <div>
              <div className="text-sm font-medium text-[#0F172A]">
                KPI aggiornati dal bilancio importato — <strong>{latestBilancio.periodo}</strong> ({latestBilancio.tipo})
              </div>
              <div className="text-xs text-[#475569] mt-0.5">Utile netto {formatEur(ce.utile_netto)} · Patrimonio netto {formatEur(sp.patrimonio_netto)}</div>
            </div>
          </div>
          <Link to="/import" className="text-xs text-[#2563EB] hover:underline">Gestisci import →</Link>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <KpiCard label="Valore patrimonio" value={formatEur(kpi.valore_stimato_totale)} delta={hasReal ? null : 6.4} icon={Building2} accent="brand" sublabel={hasReal ? "Da bilancio" : "Stima attuale"} />
        <KpiCard label={hasReal ? "Patrimonio netto" : "Capitale investito"} value={formatEur(hasReal ? kpi.patrimonio_netto : kpi.capitale_investito)} icon={Wallet} sublabel={hasReal ? "Attivo − Passivo" : `${kpi.totale_immobili} immobili`} />
        <KpiCard label="Ricavi mensili" value={formatEur(kpi.ricavi_mensili)} delta={hasReal ? null : 2.1} icon={ArrowUpRight} accent="positive" sublabel={hasReal ? "Affitti / 12" : "Affitti incassati"} />
        <KpiCard label="Cash flow netto" value={formatEur(kpi.cash_flow_mensile)} delta={hasReal ? null : -3.2} icon={Activity} accent={kpi.cash_flow_mensile > 0 ? "positive" : "critical"} sublabel={hasReal ? "Utile/12" : "Questo mese"} />
        <KpiCard label="Debito residuo" value={formatEur(kpi.debito_residuo)} icon={Banknote} accent="warning" sublabel={hasReal ? "Mutui da bilancio" : "LTV 38%"} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Rend. medio netto" value={`${kpi.rendimento_medio_netto}%`} delta={hasReal ? null : 0.4} icon={TrendingUp} accent="positive" sublabel="Target 4,5%" />
        <KpiCard label="Utile anno" value={formatEur(kpi.utile_anno)} delta={hasReal ? null : 12.1} icon={ArrowUpRight} accent="positive" sublabel={hasReal ? "Da bilancio" : null} />
        <KpiCard label="Liquidità" value={formatEur(kpi.liquidita_disponibile)} icon={Wallet} sublabel="Disponibile" />
        <KpiCard label="Immobili critici" value={kpi.immobili_sotto_target + kpi.immobili_sfitti} icon={AlertTriangle} accent="critical" sublabel="Sotto target / sfitti" />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <SectionCard testId="chart-cashflow" title="Andamento Cash Flow" subtitle={bankCashflow ? `${bankCashflow.length} mesi · da movimenti bancari reali` : "Ultimi 12 mesi · dati demo"} className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={bankCashflow || cashFlowMensile} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0066FF" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#0066FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="mese" stroke="#64748B" fontSize={11} axisLine={false} tickLine={false} />
              <YAxis stroke="#64748B" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEur(v)} />
              <Area type="monotone" dataKey="saldo" stroke="#0066FF" strokeWidth={2} fill="url(#g1)" />
            </AreaChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard testId="chart-distribuzione" title="Distribuzione patrimonio" subtitle="Per tipologia">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={distribuzioneTipologia} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                {distribuzioneTipologia.map((e, i) => <Cell key={i} fill={e.color} stroke="#FFFFFF" strokeWidth={2} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {distribuzioneTipologia.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{background: d.color}}/> {d.name}</span>
                <span className="text-[#475569] tabular">{d.value}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <SectionCard testId="chart-ricavi-costi" title="Ricavi vs Costi" subtitle={bankCashflow ? `${bankCashflow.length} mesi · da movimenti bancari reali` : "Confronto mensile · dati demo"} className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bankCashflow ? bankCashflow.map(b => ({mese: b.mese, ricavi: b.incassi, costi: b.uscite})) : ricaviCostiAnnuali} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="mese" stroke="#64748B" fontSize={11} axisLine={false} tickLine={false} />
              <YAxis stroke="#64748B" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEur(v)} />
              <Bar dataKey="ricavi" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="costi" fill="#EF4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard testId="portfolio-score-card" title="Portfolio Score" subtitle="Salute complessiva del patrimonio">
          <div className="flex flex-col items-center justify-center py-2">
            <ScoreGauge value={72} size={160} dataTestId="portfolio-score-main" />
            <div className="mt-4 grid grid-cols-2 gap-3 w-full">
              <div className="text-center p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <div className="text-[10px] uppercase text-[#64748B]">Profittevoli</div>
                <div className="font-display text-lg font-bold text-[#059669] tabular">{portfolioKPI.immobili_profittevoli}</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <div className="text-[10px] uppercase text-[#64748B]">Sotto target</div>
                <div className="font-display text-lg font-bold text-[#DC2626] tabular">{portfolioKPI.immobili_sotto_target}</div>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Widgets row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="widget-best" title="Miglior immobile" action={<Trophy size={16} className="text-[#B45309]" />}>
          <Link to={`/immobile/${top.id}`} className="block group">
            <img src={top.img} alt={top.nome} className="w-full h-28 object-cover rounded-lg mb-3" />
            <div className="font-display font-semibold text-sm text-[#0F172A] group-hover:text-[#2563EB] transition-colors">{top.nome}</div>
            <div className="flex items-center justify-between text-xs mt-1.5">
              <span className="text-[#475569] flex items-center gap-1"><MapPin size={10}/> {top.citta}</span>
              <span className="text-[#059669] tabular font-medium">{top.rendimento_netto}% netto</span>
            </div>
          </Link>
        </SectionCard>

        <SectionCard testId="widget-worst" title="Da monitorare" action={<AlertTriangle size={16} className="text-[#DC2626]" />}>
          <Link to={`/immobile/${worst.id}`} className="block group">
            <img src={worst.img} alt={worst.nome} className="w-full h-28 object-cover rounded-lg mb-3 grayscale-[40%]" />
            <div className="font-display font-semibold text-sm text-[#0F172A] group-hover:text-[#2563EB] transition-colors">{worst.nome}</div>
            <div className="flex items-center justify-between text-xs mt-1.5">
              <span className="text-[#475569] flex items-center gap-1"><MapPin size={10}/> {worst.citta}</span>
              <StatusBadge stato={worst.stato} />
            </div>
          </Link>
        </SectionCard>

        <SectionCard testId="widget-alerts" title="Alert recenti" action={<Link to="/alert-center" className="text-xs text-[#2563EB] hover:underline">Vedi tutti</Link>}>
          <div className="space-y-2.5">
            {alerts.slice(0, 3).map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 pb-2.5 border-b border-[#E2E8F0] last:border-0 last:pb-0">
                <SeverityBadge severity={a.severity} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[#0F172A] truncate">{a.titolo}</div>
                  <div className="text-[11px] text-[#475569] line-clamp-2">{a.descrizione}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard testId="widget-forecast" title="Liquidità 90 gg" action={<Activity size={16} className="text-[#2563EB]" />}>
          <div className="font-display text-3xl font-bold tabular text-[#0F172A]">{formatEur(168200)}</div>
          <div className="text-xs text-[#475569] mt-1">Previsione netta forecast</div>
          <div className="mt-4 h-12">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[{v:142},{v:155},{v:148},{v:162},{v:168}]}>
                <Line type="monotone" dataKey="v" stroke="#10B981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Link to="/cash-flow" className="text-xs text-[#2563EB] hover:underline">Vedi forecast →</Link>
        </SectionCard>
      </div>

      {/* Recent properties table */}
      <SectionCard testId="dashboard-recent-properties" title="Patrimonio recente" subtitle="Ultimi immobili nel portafoglio"
        action={<Link to="/patrimonio" className="text-xs text-[#2563EB] hover:underline">Vedi tutti →</Link>}>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                <th className="font-medium px-2 py-2">Immobile</th>
                <th className="font-medium px-2 py-2">Città</th>
                <th className="font-medium px-2 py-2">Stato</th>
                <th className="font-medium px-2 py-2 text-right">Canone</th>
                <th className="font-medium px-2 py-2 text-right">Rend. netto</th>
                <th className="font-medium px-2 py-2 text-right">Cash flow</th>
                <th className="font-medium px-2 py-2 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {properties.slice(0, 6).map((p) => (
                <tr key={p.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]/50 transition-colors">
                  <td className="px-2 py-3">
                    <Link to={`/immobile/${p.id}`} className="flex items-center gap-3 hover:text-[#2563EB]" data-testid={`row-property-${p.id}`}>
                      <img src={p.img} alt="" className="w-10 h-10 rounded object-cover" />
                      <div>
                        <div className="font-medium text-[#0F172A]">{p.nome}</div>
                        <div className="text-[11px] text-[#64748B]">{p.id} · {p.metratura} m²</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-2 py-3 text-[#475569]">{p.citta}</td>
                  <td className="px-2 py-3"><StatusBadge stato={p.stato} /></td>
                  <td className="px-2 py-3 text-right tabular">{p.canone_mensile ? formatEur(p.canone_mensile) : "—"}</td>
                  <td className="px-2 py-3 text-right tabular">
                    {p.rendimento_netto > 0 ? <span className="text-[#059669]">{p.rendimento_netto}%</span> : <span className="text-[#64748B]">—</span>}
                  </td>
                  <td className="px-2 py-3 text-right tabular">
                    <span className={p.cash_flow_mensile >= 0 ? "text-[#059669]" : "text-[#DC2626]"}>
                      {formatEur(p.cash_flow_mensile)}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <ScoreBadge score={p.portfolio_score} breakdown={p.score_breakdown} testId={`dash-score-${p.id}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </Layout>
  );
}
