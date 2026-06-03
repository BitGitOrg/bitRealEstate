import { useEffect, useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { apiClient } from "../lib/auth";
import { formatEur } from "../lib/demoData";
import { toast } from "sonner";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area, ReferenceLine,
} from "recharts";
import { Wallet, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";
import { MiniSparkline } from "../components/MiniSparkline";
import { useKpiTrends } from "../lib/useKpiTrends";

const tooltipStyle = { backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, color: "#0F172A", boxShadow: "0 4px 12px rgba(15,23,42,0.08)" };

export default function CashFlow() {
  const { trends } = useKpiTrends();
  const [storico, setStorico] = useState([]);
  const [forecast, setForecast] = useState([]);
  const [agg, setAgg] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, f, a] = await Promise.all([
          apiClient().get("/cashflow/storico?months=12"),
          apiClient().get("/cashflow/forecast?months=12"),
          apiClient().get("/cashflow/aggregato"),
        ]);
        setStorico(s.data?.rows || []);
        setForecast(f.data?.rows || []);
        setAgg(a.data || null);
      } catch { toast.error("Errore caricamento cash flow"); }
      finally { setLoading(false); }
    })();
  }, []);

  const saldoCorrente = agg?.saldo_corrente ?? 0;
  const saldoMedio = agg?.saldo_medio_12m ?? 0;
  const liq90 = agg?.liquidita_90gg ?? 0;
  const mesiTensione = agg?.mesi_tensione_prossimi_12 ?? 0;

  return (
    <Layout title="Cash Flow" subtitle={loading ? "Caricamento…" : "Andamento storico e forecast 12 mesi"}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="cf-kpi-current">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[#64748B]"><Wallet size={12}/> Saldo mese corrente</div>
          <div className={`font-display text-3xl font-bold tabular mt-1 ${saldoCorrente >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{formatEur(saldoCorrente)}</div>
          <MiniSparkline value={saldoCorrente} accent={saldoCorrente >= 0 ? 'positive' : 'critical'} data={trends?.cash_flow} labels={trends?.month_labels_short} seed="saldo_corr" />
        </SectionCard>
        <SectionCard testId="cf-kpi-medio">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[#64748B]"><TrendingUp size={12}/> Media 12 mesi</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{formatEur(saldoMedio)}</div>
          <MiniSparkline value={saldoMedio} accent={'brand'} data={trends?.cash_flow} labels={trends?.month_labels_short} seed="saldo_medio" />
        </SectionCard>
        <SectionCard testId="cf-kpi-90">
          <div className="text-[10px] uppercase text-[#64748B]">Liquidità prevista 90 gg</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#2563EB]">{formatEur(liq90)}</div>
          <MiniSparkline value={liq90} accent={'brand'} data={trends?.cash_flow} labels={trends?.month_labels_short} seed="liq90" />
        </SectionCard>
        <SectionCard testId="cf-kpi-tensione">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[#64748B]"><AlertTriangle size={12}/> Mesi in tensione</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#DC2626]">{mesiTensione}</div>
          <div className="text-[11px] text-[#64748B]">Prossimi 12 mesi</div>
          <MiniSparkline value={Math.max(mesiTensione,1)} accent={'critical'} seed="tensione" />
        </SectionCard>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 size={28} className="animate-spin text-[#0066FF]"/></div>
      ) : (
        <>
          <SectionCard title="Cash flow storico (12 mesi)" subtitle="Incassi reali · uscite ricorrenti (rate mutui + spese gestione + tasse stimate)" testId="cf-storico" className="mb-4">
            {storico.length === 0 ? (
              <div className="text-sm text-[#475569] py-6 text-center">Nessun dato storico. I dati appariranno appena registri incassi o importi movimenti banca.</div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={storico} margin={{ top: 10, right: 5, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748B" fontSize={11} axisLine={false} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEur(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="incassi" name="Incassi" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="uscite" name="Uscite" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="saldo" name="Saldo netto" stroke="#0066FF" strokeWidth={2.5} dot={{ fill: "#0066FF", r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title="Forecast 12 mesi" subtitle="Previsione basata su contratti attivi · rate mutui · spese gestione · lavori residui" testId="cf-forecast">
            {forecast.length === 0 ? (
              <div className="text-sm text-[#475569] py-6 text-center">Nessuna previsione disponibile.</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={forecast} margin={{ top: 10, right: 5, left: -10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="cfFwd" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0066FF" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#0066FF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" stroke="#64748B" fontSize={11} axisLine={false} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEur(v)} />
                    <ReferenceLine y={0} stroke="#EF4444" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="saldo_previsto" name="Saldo mensile previsto" stroke="#0066FF" strokeWidth={2} fill="url(#cfFwd)" />
                  </AreaChart>
                </ResponsiveContainer>
                {forecast.some(f => f.alert) && (
                  <div className="mt-3 text-xs bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-3 text-[#991B1B]">
                    <strong>⚠ Mesi con saldo negativo previsto:</strong> {forecast.filter(f => f.alert).map(f => f.label).join(", ")}
                  </div>
                )}
              </>
            )}
          </SectionCard>
        </>
      )}
    </Layout>
  );
}
