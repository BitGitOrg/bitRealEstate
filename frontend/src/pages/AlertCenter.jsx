import { useState, useEffect } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { SeverityBadge } from "../components/StatusBadge";
import { apiClient } from "../lib/auth";
import { toast } from "sonner";
import { AlertTriangle, FileWarning, Lightbulb, Bell, ChevronRight, RefreshCw, X, Loader2, Clock } from "lucide-react";
import { Link } from "react-router-dom";

const TIPI = {
  economico: { label: "Economici", icon: AlertTriangle, color: "#EF4444" },
  documentale: { label: "Documentali", icon: FileWarning, color: "#F59E0B" },
  strategico: { label: "Strategici", icon: Lightbulb, color: "#0066FF" },
};

export default function AlertCenter() {
  const [tipo, setTipo] = useState("tutti");
  const [realAlerts, setRealAlerts] = useState([]);
  const [realProps, setRealProps] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = () => apiClient().get("/alerts").then(r => setRealAlerts(r.data || [])).catch(() => {});

  useEffect(() => {
    load();
    apiClient().get("/properties").then(r => setRealProps(r.data || [])).catch(() => {});
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await apiClient().post("/alerts/refresh");
      toast.success(`${r.data.alerts_generated} alert generati su ${r.data.checked_properties} immobili`);
      setLastRefresh(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
      load();
    } catch {
      toast.error("Errore refresh alert");
    } finally {
      setRefreshing(false);
    }
  };

  const dismiss = async (alertId) => {
    const isReal = !!realAlerts.find(a => a.id === alertId);
    if (!isReal) { toast.info("Gli alert demo non possono essere chiusi"); return; }
    try {
      await apiClient().delete(`/alerts/${alertId}`);
      toast.success("Alert chiuso");
      load();
    } catch {
      toast.error("Errore");
    }
  };

  // Merge: alert reali (priorità) + alert demo (fallback). Mai entrambi.
  const items = realAlerts;
  const allProps = realProps;

  const filtered = items.filter(a => tipo === "tutti" || a.tipo === tipo);
  const counts = Object.keys(TIPI).reduce((acc, k) => ({ ...acc, [k]: items.filter(a => a.tipo === k).length }), {});
  const altaCount = items.filter(a => a.severity === "alta").length;

  return (
    <Layout
      title="AI Alert Center"
      subtitle={`${items.length} notifiche · ${altaCount} ad alta priorità${realAlerts.length > 0 ? ` · live${lastRefresh ? ` (agg. ${lastRefresh})` : ""}` : " · demo"}`}
      actions={
        <button
          data-testid="alert-refresh"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {refreshing ? "Analisi in corso…" : "Scansiona scadenze"}
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="alert-tot">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center"><Bell size={18} className="text-[#0F172A]"/></div>
            <div>
              <div className="text-[10px] uppercase text-[#64748B]">Notifiche totali</div>
              <div className="font-display text-2xl font-bold tabular">{items.length}</div>
            </div>
          </div>
        </SectionCard>
        {Object.entries(TIPI).map(([k, m]) => {
          const Icon = m.icon;
          return (
            <SectionCard key={k} testId={`alert-tipo-${k}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${m.color}20`, border: `1px solid ${m.color}40` }}>
                  <Icon size={18} style={{ color: m.color }} />
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#64748B]">{m.label}</div>
                  <div className="font-display text-2xl font-bold tabular">{counts[k] || 0}</div>
                </div>
              </div>
            </SectionCard>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {["tutti", ...Object.keys(TIPI)].map(t => (
          <button
            key={t}
            data-testid={`filter-tipo-${t}`}
            onClick={() => setTipo(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${tipo === t ? "bg-[#0066FF] text-white border-[#0066FF]" : "bg-[#FFFFFF] text-[#475569] border-[#E2E8F0] hover:border-[#CBD5E1]"}`}
          >
            {t === "tutti" ? "Tutti" : TIPI[t].label}
          </button>
        ))}
        {realAlerts.length === 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#475569] bg-[#FFFBEB] border border-[#FCD34D]/40 rounded-full px-2.5 py-1">
            <Lightbulb size={11} /> Premi <b className="mx-0.5">«Scansiona scadenze»</b> per generare alert reali sui tuoi contratti
          </span>
        )}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center">
            <Bell size={32} className="mx-auto text-[#CBD5E1] mb-2" />
            <div className="text-sm text-[#475569]">Nessun alert. Tutto sotto controllo.</div>
          </div>
        )}
        {filtered.map(a => {
          const meta = TIPI[a.tipo] || TIPI.economico;
          const Icon = meta.icon;
          const p = a.immobile_id ? allProps.find(x => x.id === a.immobile_id) : null;
          const isReal = !!realAlerts.find(r => r.id === a.id);
          const days = a.days_remaining;
          return (
            <div key={a.id} data-testid={`alert-${a.id}`} className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-4 card-hover flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${meta.color}20`, border: `1px solid ${meta.color}40` }}>
                <Icon size={18} style={{ color: meta.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <SeverityBadge severity={a.severity} />
                  <span className="text-[10px] uppercase tracking-wider text-[#64748B]">{meta.label}</span>
                  {typeof days === "number" && (
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${days < 0 ? "bg-red-100 text-red-700" : days <= 30 ? "bg-orange-100 text-orange-700" : days <= 60 ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                      <Clock size={9} />
                      {days < 0 ? `scaduto da ${-days}gg` : `tra ${days}gg`}
                    </span>
                  )}
                  <span className="text-[10px] text-[#64748B] ml-auto">{(a.ts || "").slice(0, 10)}</span>
                </div>
                <div className="font-display font-semibold text-[#0F172A]">{a.titolo}</div>
                <div className="text-sm text-[#475569] mt-1">{a.descrizione}</div>
                {p && (
                  <Link to={`/immobile/${p.id}`} className="inline-flex items-center gap-1 text-xs text-[#2563EB] mt-2 hover:underline">
                    Vai a {p.nome} <ChevronRight size={12} />
                  </Link>
                )}
              </div>
              {isReal && (
                <button
                  onClick={() => dismiss(a.id)}
                  title="Chiudi alert"
                  className="p-1.5 hover:bg-[#F1F5F9] rounded-lg text-[#64748B] hover:text-[#0F172A]"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
