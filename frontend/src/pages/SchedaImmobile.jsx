import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { StatusBadge, DisdettaBadge } from "../components/StatusBadge";
import { ScoreGauge } from "../components/ScoreGauge";
import { getProperty, formatEur } from "../lib/demoData";
import { apiClient } from "../lib/auth";
import { ArrowLeft, MapPin, FileText, Download, Calendar, Save, User, Home, Loader2, AlertTriangle, Bell, Clock, X, LogOut, KeyRound, History, Banknote } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

const Row = ({ label, value }) => (
  <div className="flex justify-between py-2 border-b border-[#E2E8F0] last:border-0 text-sm">
    <span className="text-[#475569]">{label}</span>
    <span className="text-[#0F172A] tabular text-right">{value}</span>
  </div>
);

export default function SchedaImmobile() {
  const { id } = useParams();
  const [remoteP, setRemoteP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [docs, setDocs] = useState([]);
  const [lavoriProp, setLavoriProp] = useState([]);
  const [movs, setMovs] = useState([]);

  useEffect(() => {
    // Try to fetch from API; fall back to demo
    apiClient().get(`/properties/${id}`)
      .then(r => setRemoteP(r.data))
      .catch(() => setRemoteP(null))
      .finally(() => setLoading(false));
    // Carica alert del backend (filtra lato client per immobile_id)
    apiClient().get(`/alerts`).then(r => {
      const all = r.data || [];
      setAlerts(all.filter(a => a.immobile_id === id));
    }).catch(() => {});
    // Documenti dell'immobile (router /documents)
    apiClient().get(`/documents?immobile_id=${id}`)
      .then(r => setDocs(r.data || []))
      .catch(() => setDocs([]));
    // Lavori legati a questo immobile
    apiClient().get(`/lavori?immobile_id=${id}`)
      .then(r => setLavoriProp(r.data || []))
      .catch(() => setLavoriProp([]));
    // Movimenti banca che matchano questo immobile (filtro client su match_canone.property_id)
    apiClient().get(`/import/banca?limit=200`)
      .then(r => {
        const items = r.data?.items || [];
        const filtered = items.filter(m => m.match_canone?.property_id === id).map(m => ({
          id: m.id,
          data: (m.data || "").slice(0, 10),
          tipo: m.importo >= 0 ? "ricavo" : "costo",
          categoria: m.match_canone ? "Affitto incassato" : (m.importo >= 0 ? "Bonifico" : "Pagamento"),
          descrizione: m.descrizione || "—",
          importo: Math.abs(m.importo),
        }));
        setMovs(filtered);
      })
      .catch(() => setMovs([]));
  }, [id]);

  const refreshAlertsForProperty = () => {
    apiClient().get(`/alerts`).then(r => {
      setAlerts((r.data || []).filter(a => a.immobile_id === id));
    });
  };
  const dismissAlert = async (alertId) => {
    try {
      await apiClient().delete(`/alerts/${alertId}`);
      toast.success("Alert chiuso");
      refreshAlertsForProperty();
    } catch {
      toast.error("Errore");
    }
  };

  const demoP = getProperty(id);
  const p = remoteP || demoP;
  if (loading) return <Layout title="Caricamento…"><div className="text-[#64748B]">Sto cercando l'immobile…</div></Layout>;
  if (!p) return <Layout title="Immobile non trovato"><Link to="/patrimonio" className="text-[#2563EB]">← Torna al patrimonio</Link></Layout>;

  const lavoroAttivo = lavoriProp.find(l => l.stato === "in_corso") || lavoriProp[0] || null;

  return (
    <Layout
      title={p.nome}
      subtitle={`${p.id} · ${p.indirizzo}, ${p.citta}`}
      actions={<Link to="/patrimonio" data-testid="back-patrimonio" className="inline-flex items-center gap-1.5 text-sm text-[#475569] hover:text-[#0F172A]"><ArrowLeft size={14}/> Patrimonio</Link>}
    >
      {/* Hero */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <div className="xl:col-span-2 bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl overflow-hidden">
          <img src={p.img} alt={p.nome} className="w-full h-72 object-cover" />
          <div className="p-5 flex flex-wrap items-center gap-3">
            <StatusBadge stato={p.stato} />
            {p.disdetta_ricevuta_il && <DisdettaBadge dataUscita={p.data_uscita_prevista} dataTestId="hero-disdetta-badge" />}
            <span className="text-xs text-[#475569] flex items-center gap-1"><MapPin size={12}/> {p.indirizzo}, {p.citta}</span>
            <span className="text-xs text-[#475569]">{p.metratura} m² · {p.tipologia} · Piano {p.piano}</span>
            <span className="text-xs text-[#475569]">Classe {p.classe_energetica}</span>
          </div>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-6 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-widest text-[#64748B] mb-2">Portfolio Score</span>
          <ScoreGauge value={p.portfolio_score} size={140} dataTestId="immobile-score" />
          {p.score_breakdown && (
            <div className="w-full mt-3 px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[10px] space-y-0.5">
              <div className="flex justify-between text-[#64748B]"><span>Base</span><span className="tabular text-[#0F172A] font-medium">{p.score_breakdown.base}</span></div>
              {(p.score_breakdown.alerts_alta + p.score_breakdown.alerts_media + p.score_breakdown.alerts_bassa) > 0 && (
                <div className="flex justify-between text-[#DC2626]">
                  <span>{p.score_breakdown.alerts_alta + p.score_breakdown.alerts_media + p.score_breakdown.alerts_bassa} alert</span>
                  <span className="tabular font-medium">-{p.score_breakdown.penalty_alerts}</span>
                </div>
              )}
              {p.score_breakdown.morosi > 0 && (
                <div className="flex justify-between text-[#DC2626]"><span>{p.score_breakdown.morosi} morosi</span><span className="tabular font-medium">-{p.score_breakdown.morosi * 5}</span></div>
              )}
              {p.score_breakdown.bonus_rend_alto > 0 && (
                <div className="flex justify-between text-[#059669]"><span>Rend. netto &gt; 8%</span><span className="tabular font-medium">+{p.score_breakdown.bonus_rend_alto}</span></div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 w-full mt-5">
            <div className="text-center p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
              <div className="text-[10px] uppercase text-[#64748B]">Rend. netto</div>
              <div className="font-display text-lg font-bold tabular text-[#059669]">{p.rendimento_netto > 0 ? `${p.rendimento_netto}%` : "—"}</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
              <div className="text-[10px] uppercase text-[#64748B]">Cash flow</div>
              <div className={`font-display text-lg font-bold tabular ${p.cash_flow_mensile >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{formatEur(p.cash_flow_mensile)}</div>
            </div>
          </div>
          {alerts.length > 0 && (
            <div className="w-full mt-3 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[#FFFBEB] border border-[#FCD34D]/40">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#92400E] font-medium">
                <AlertTriangle size={11} /> {alerts.length} alert attiv{alerts.length === 1 ? "o" : "i"}
              </span>
              <a href="#alerts-section" className="text-[10px] text-[#B45309] hover:underline">Vedi sotto ↓</a>
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="anagrafica" className="w-full">
        <TabsList className="bg-[#FFFFFF] border border-[#E2E8F0]" data-testid="immobile-tabs">
          <TabsTrigger value="anagrafica" data-testid="scheda-tab-anagrafica">Anagrafica</TabsTrigger>
          <TabsTrigger value="acquisto" data-testid="scheda-tab-acquisto">Acquisto</TabsTrigger>
          <TabsTrigger value="economico" data-testid="scheda-tab-economico">Economico</TabsTrigger>
          <TabsTrigger value="locazione" data-testid="scheda-tab-locazione">Locazione</TabsTrigger>
          <TabsTrigger value="documenti" data-testid="scheda-tab-documenti">Documenti</TabsTrigger>
          <TabsTrigger value="movimenti" data-testid="scheda-tab-movimenti">Movimenti</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="scheda-tab-alerts">
            Alert{alerts.length > 0 && <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full bg-[#FEE2E2] text-[#DC2626] px-1">{alerts.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="anagrafica" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Anagrafica" testId="card-anagrafica">
              <Row label="Nome" value={p.nome} />
              <Row label="Codice interno" value={p.id} />
              <Row label="Indirizzo" value={p.indirizzo} />
              <Row label="Comune" value={`${p.citta} (${p.provincia})`} />
              <Row label="Tipologia" value={p.tipologia} />
              <Row label="Superficie" value={`${p.metratura} m²`} />
              <Row label="Piano" value={p.piano} />
              <Row label="Anno costruzione" value={p.anno_costruzione} />
              <Row label="Classe energetica" value={p.classe_energetica} />
            </SectionCard>
            <SectionCard title="Valore" testId="card-valore">
              <Row label="Valore di mercato stimato" value={formatEur(p.valore_stimato)} />
              <Row label="Costo totale investimento" value={formatEur(p.costo_totale)} />
              <Row label="Rivalutazione stimata" value={<span className="text-[#059669]">{formatEur(p.valore_stimato - p.costo_totale)}</span>} />
              <Row label="Stato locazione" value={<StatusBadge stato={p.stato} />} />
              <Row label="Tipologia operazione" value={p.operazione.replace(/_/g, " ")} />
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="acquisto" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Dati di acquisto" testId="card-acquisto">
              <Row label="Data rogito" value={p.data_acquisto || "—"} />
              <Row label="Prezzo di acquisto" value={formatEur(p.prezzo_acquisto)} />
              <Row label="Notaio" value={formatEur(p.notaio)} />
              <Row label="Agenzia" value={formatEur(p.agenzia)} />
              <Row label="Imposte" value={formatEur(p.imposte)} />
              <Row label="Lavori" value={formatEur(p.lavori)} />
              <Row label="Totale" value={<strong>{formatEur(p.costo_totale)}</strong>} />
            </SectionCard>
            <SectionCard title="Finanziamento" testId="card-mutuo" action={
              <Link to="/mutui" className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline">
                <Banknote size={12} /> Gestisci mutui
              </Link>
            }>
              {p.mutuo ? (
                <>
                  <Row label="Banca" value={p.mutuo.banca} />
                  <Row label="Capitale residuo" value={formatEur(p.mutuo.residuo)} />
                  <Row label="Rata mensile" value={formatEur(p.mutuo.rata)} />
                  <Row label="Tasso" value={`${p.mutuo.tasso}%`} />
                </>
              ) : (
                <div className="text-sm text-[#475569] py-4">
                  Nessun finanziamento collegato. <Link to="/mutui" className="text-[#2563EB] hover:underline">Aggiungi mutuo</Link> o importa il PDF della banca.
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="economico" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SectionCard title="Ricavi" testId="card-ricavi" >
              <Row label="Canone mensile" value={formatEur(p.canone_mensile)} />
              <Row label="Canone annuo" value={formatEur(p.canone_mensile * 12)} />
              {p.inquilino && <>
                <Row label="Conduttore" value={p.inquilino} />
                <Row label="Contratto" value={`${p.data_inizio_contratto || "?"} → ${p.scadenza_contratto || "?"}`} />
              </>}
            </SectionCard>
            <SectionCard title="Rendimento" testId="card-rendimento">
              <Row label="Lordo" value={p.rendimento_lordo > 0 ? `${p.rendimento_lordo}%` : "—"} />
              <Row label="Netto" value={p.rendimento_netto > 0 ? `${p.rendimento_netto}%` : "—"} />
              <Row label="ROI" value={p.rendimento_netto > 0 ? `${(p.rendimento_netto * 1.4).toFixed(1)}%` : "—"} />
              <Row label="Cash flow / mese" value={formatEur(p.cash_flow_mensile)} />
            </SectionCard>
            <SectionCard title="Lavori in corso" testId="card-lavori">
              {lavoroAttivo ? (
                <>
                  <Row label="Descrizione" value={lavoroAttivo.descrizione} />
                  <Row label="Impresa" value={lavoroAttivo.impresa} />
                  <Row label="Budget" value={formatEur(lavoroAttivo.budget)} />
                  <Row label="Speso" value={<span className={lavoroAttivo.speso > lavoroAttivo.budget ? "text-[#DC2626]" : ""}>{formatEur(lavoroAttivo.speso)}</span>} />
                  <Row label="Avanzamento" value={`${lavoroAttivo.avanzamento}%`} />
                </>
              ) : (
                <div className="text-sm text-[#475569] py-4">Nessun cantiere attivo.</div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="locazione" className="mt-4">
          <LocazioneSection p={p} onSaved={(updated) => { setRemoteP(updated); refreshAlertsForProperty(); }} />
        </TabsContent>

        <TabsContent value="documenti" className="mt-4">
          <SectionCard title="Archivio documenti" subtitle={`${docs.length} documenti collegati`} testId="card-documenti">
            <div className="space-y-2">
              {docs.length === 0 && <div className="text-sm text-[#475569] py-4">Nessun documento caricato.</div>}
              {docs.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg hover:border-[#CBD5E1] transition-colors" data-testid={`doc-${d.id}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText size={16} className="text-[#2563EB] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{d.nome}</div>
                      <div className="text-[11px] text-[#64748B]">{d.tipo} · {d.dimensione} · {d.caricato}</div>
                    </div>
                  </div>
                  <button className="p-2 rounded hover:bg-[#FFFFFF] text-[#475569] hover:text-[#0F172A]"><Download size={14} /></button>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="movimenti" className="mt-4">
          <SectionCard title="Movimenti economici" subtitle="Ultimi costi e ricavi" testId="card-movimenti">
            {movs.length === 0 && <div className="text-sm text-[#475569] py-4">Nessun movimento registrato per questo immobile.</div>}
            <table className="w-full text-sm">
              <tbody>
                {movs.map(m => (
                  <tr key={m.id} className="border-b border-[#E2E8F0] last:border-0">
                    <td className="py-3 text-[#475569]"><Calendar size={12} className="inline mr-1" />{m.data}</td>
                    <td className="py-3">{m.categoria}</td>
                    <td className="py-3 text-[#475569]">{m.descrizione}</td>
                    <td className={`py-3 text-right tabular font-medium ${m.tipo === "ricavo" ? "text-[#059669]" : "text-[#DC2626]"}`}>{m.tipo === "ricavo" ? "+" : "-"}{formatEur(m.importo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <SectionCard
            title="Alert immobile"
            subtitle={alerts.length === 0 ? "Tutto sotto controllo — nessun alert attivo" : `${alerts.length} notifich${alerts.length === 1 ? "a" : "e"} attiv${alerts.length === 1 ? "a" : "e"}`}
            testId="card-alerts"
            action={
              <a href="/alert-center" className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline">
                <Bell size={11} /> Centro Alert
              </a>
            }
          >
            <div id="alerts-section" />
            {alerts.length === 0 ? (
              <div className="py-8 text-center">
                <Bell size={32} className="mx-auto text-[#CBD5E1] mb-2" />
                <div className="text-sm text-[#475569]">Nessun alert per questo immobile.</div>
                <div className="text-[11px] text-[#94A3B8] mt-1">Carica un documento e analizzalo con l'AI per generare alert automatici su anomalie e scadenze.</div>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map(a => {
                  const sev = a.severity || "media";
                  const sevColor = sev === "alta" ? "#DC2626" : sev === "media" ? "#B45309" : "#0066FF";
                  const sevBg = sev === "alta" ? "#FEE2E2" : sev === "media" ? "#FEF3C7" : "#DBEAFE";
                  const days = a.days_remaining;
                  return (
                    <div key={a.id} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 flex items-start gap-3 hover:border-[#CBD5E1]">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: sevBg, border: `1px solid ${sevColor}40` }}>
                        <AlertTriangle size={14} style={{ color: sevColor }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded" style={{ background: sevBg, color: sevColor }}>
                            {sev}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider text-[#64748B]">{a.tipo}</span>
                          {typeof days === "number" && (
                            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${days < 0 ? "bg-red-100 text-red-700" : days <= 30 ? "bg-orange-100 text-orange-700" : days <= 60 ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                              <Clock size={9} />
                              {days < 0 ? `scaduto da ${-days}gg` : `tra ${days}gg`}
                            </span>
                          )}
                          <span className="text-[10px] text-[#94A3B8] ml-auto">{(a.ts || "").slice(0, 10)}</span>
                        </div>
                        <div className="text-sm font-medium text-[#0F172A]">{a.titolo}</div>
                        <div className="text-xs text-[#475569] mt-0.5">{a.descrizione}</div>
                      </div>
                      <button onClick={() => dismissAlert(a.id)} title="Chiudi alert" className="p-1.5 hover:bg-white rounded-lg text-[#64748B] hover:text-[#0F172A]">
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}

// =============================================================
// Locazione section — ciclo di vita completo: contratto attivo, disdetta, chiusura, storico, nuovo
// =============================================================
const LocField = ({ label, value, onChange, type = "text", placeholder, testId, suffix }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
    <div className="mt-1 flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg focus-within:border-[#0066FF]">
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className="flex-1 bg-transparent px-3 py-2 outline-none text-sm min-w-0"
      />
      {suffix && <span className="px-3 text-xs text-[#64748B]">{suffix}</span>}
    </div>
  </label>
);

function LocazioneSection({ p, onSaved }) {
  const hasActive = !!p.inquilino || (p.canone_mensile && p.canone_mensile > 0);
  const hasDisdetta = !!p.disdetta_ricevuta_il;
  const [storico, setStorico] = useState([]);
  const [showDisdetta, setShowDisdetta] = useState(false);
  const [showChiudi, setShowChiudi] = useState(false);

  const loadStorico = async () => {
    try {
      const r = await apiClient().get(`/properties/${p.id}/storico-contratti`);
      setStorico(r.data || []);
    } catch {}
  };
  useEffect(() => { loadStorico(); }, [p.id]); // eslint-disable-line

  const reload = async () => {
    try {
      const r = await apiClient().get(`/properties/${p.id}`);
      onSaved?.(r.data);
      loadStorico();
    } catch {}
  };

  const annullaDisdetta = async () => {
    if (!confirm("Annullare la disdetta registrata?")) return;
    try {
      await apiClient().post(`/properties/${p.id}/annulla-disdetta`);
      toast.success("Disdetta annullata");
      reload();
    } catch {
      toast.error("Errore");
    }
  };

  // Banner stato contratto
  let banner = null;
  if (hasActive) {
    const today = new Date();
    const end = p.scadenza_contratto ? new Date(p.scadenza_contratto) : null;
    const daysLeftScad = end ? Math.round((end - today) / 86400000) : null;
    if (hasDisdetta) {
      const dEnd = new Date(p.data_uscita_prevista);
      const daysLeft = Math.round((dEnd - today) / 86400000);
      banner = { label: `Disdetta registrata · uscita prevista il ${p.data_uscita_prevista}${daysLeft >= 0 ? ` (tra ${daysLeft}gg)` : ""}`, color: "#B45309", bg: "#FFFBEB" };
    } else if (daysLeftScad != null && daysLeftScad < 0) {
      banner = { label: `Contratto SCADUTO da ${-daysLeftScad}gg — chiudilo o registra rinnovo`, color: "#DC2626", bg: "#FEF2F2" };
    } else if (daysLeftScad != null && daysLeftScad < 90) {
      banner = { label: `Contratto in scadenza tra ${daysLeftScad} giorni`, color: "#B45309", bg: "#FFFBEB" };
    } else if (daysLeftScad != null) {
      banner = { label: `Locazione attiva · scade tra ${daysLeftScad} giorni`, color: "#059669", bg: "#ECFDF5" };
    } else {
      banner = { label: "Locazione attiva", color: "#059669", bg: "#ECFDF5" };
    }
  } else {
    banner = { label: "Immobile sfitto · nessuna locazione attiva", color: "#475569", bg: "#F1F5F9" };
  }

  return (
    <div className="space-y-4">
      {/* Banner stato + azioni rapide */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 flex items-center justify-between gap-4 flex-wrap" data-testid="loc-banner">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: banner.bg, color: banner.color }}>
            {banner.label}
          </div>
          {hasActive && (
            <div className="text-xs text-[#64748B]">
              Inquilino: <strong className="text-[#0F172A]">{p.inquilino || "—"}</strong> · Canone <strong className="text-[#0F172A] tabular">{formatEur(p.canone_mensile || 0)}</strong>/mese
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasActive && !hasDisdetta && (
            <button
              data-testid="loc-disdetta-btn"
              onClick={() => setShowDisdetta(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#FCD34D] bg-[#FFFBEB] text-[#B45309] hover:bg-[#FEF3C7] text-xs font-medium transition-colors"
            >
              <KeyRound size={12} /> Registra disdetta
            </button>
          )}
          {hasDisdetta && (
            <button
              data-testid="loc-annulla-disdetta-btn"
              onClick={annullaDisdetta}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC] text-xs font-medium transition-colors"
            >
              <X size={12} /> Annulla disdetta
            </button>
          )}
          {hasActive && (
            <button
              data-testid="loc-chiudi-btn"
              onClick={() => setShowChiudi(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium transition-colors"
            >
              <LogOut size={12} /> Chiudi contratto
            </button>
          )}
        </div>
      </div>

      {/* Form contratto */}
      <LocazioneForm p={p} onSaved={onSaved} title={hasActive ? "Contratto attivo" : "Nuovo contratto di locazione"} cta={hasActive ? "Salva modifiche" : "Crea contratto"} />

      {/* Storico contratti */}
      {storico.length > 0 && (
        <SectionCard
          title="Storico contratti"
          subtitle={`${storico.length} contratt${storico.length === 1 ? "o" : "i"} archiviati`}
          testId="loc-storico"
          action={<History size={16} className="text-[#64748B]" />}
        >
          <div className="space-y-2">
            {storico.map((s) => (
              <div key={s.id} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="font-medium text-[#0F172A]">{s.inquilino || "—"}</div>
                  <div className="text-xs text-[#64748B]">
                    {s.data_inizio || "?"} → <strong className="text-[#0F172A]">{s.data_uscita_effettiva || "?"}</strong>
                  </div>
                </div>
                <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1 text-xs">
                  <span className="text-[#64748B]">Canone: <strong className="text-[#0F172A] tabular">{formatEur(s.canone_mensile || 0)}</strong></span>
                  <span className="text-[#64748B]">Motivo: <strong className="text-[#0F172A]">{(s.motivo_chiusura || "—").replace(/_/g, " ")}</strong></span>
                  <span className="text-[#64748B]">Consegna: <strong className="text-[#0F172A]">{s.stato_consegna || "—"}</strong></span>
                  <span className="text-[#64748B]">Disdetta: <strong className="text-[#0F172A]">{s.parte_disdicente || "—"}</strong></span>
                </div>
                {s.note_chiusura && <div className="text-xs text-[#475569] mt-1 italic">«{s.note_chiusura}»</div>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {showDisdetta && <DisdettaModal p={p} onClose={() => setShowDisdetta(false)} onSaved={() => { setShowDisdetta(false); reload(); }} />}
      {showChiudi && <ChiudiModal p={p} onClose={() => setShowChiudi(false)} onSaved={() => { setShowChiudi(false); reload(); }} />}
    </div>
  );
}

function LocazioneForm({ p, onSaved, title = "Contratto attivo", cta = "Salva locazione" }) {
  const [form, setForm] = useState({
    inquilino: p.inquilino || "",
    data_inizio_contratto: p.data_inizio_contratto || "",
    scadenza_contratto: p.scadenza_contratto || "",
    deposito_cauzionale: p.deposito_cauzionale || 0,
    durata_contratto_anni: p.durata_contratto_anni || 0,
    rinnovo_automatico: !!p.rinnovo_automatico,
    canone_mensile: p.canone_mensile || 0,
    note_locazione: p.note_locazione || "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      inquilino: p.inquilino || "",
      data_inizio_contratto: p.data_inizio_contratto || "",
      scadenza_contratto: p.scadenza_contratto || "",
      deposito_cauzionale: p.deposito_cauzionale || 0,
      durata_contratto_anni: p.durata_contratto_anni || 0,
      rinnovo_automatico: !!p.rinnovo_automatico,
      canone_mensile: p.canone_mensile || 0,
      note_locazione: p.note_locazione || "",
    });
  }, [p.id]); // eslint-disable-line

  const save = async () => {
    setSaving(true);
    try {
      const r = await apiClient().patch(`/properties/${p.id}/locazione`, form);
      onSaved?.(r.data);
      toast.success("Dati locazione salvati");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-2">
        <SectionCard
          title={title}
          subtitle="Inquilino, contratto, canone — confluiscono in Affitti, Cash Flow e Investor Book"
          testId="card-locazione-form"
          action={<User size={16} className="text-[#0066FF]" />}
        >
          <div className="space-y-4">
            <LocField label="Inquilino / Conduttore" testId="loc-inquilino" value={form.inquilino} onChange={(v) => setForm({ ...form, inquilino: v })} placeholder="Nome inquilino o ragione sociale" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <LocField label="Data inizio contratto" testId="loc-inizio" type="date" value={form.data_inizio_contratto} onChange={(v) => setForm({ ...form, data_inizio_contratto: v })} />
              <LocField label="Scadenza contratto" testId="loc-scadenza" type="date" value={form.scadenza_contratto} onChange={(v) => setForm({ ...form, scadenza_contratto: v })} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <LocField label="Canone mensile" testId="loc-canone" type="number" value={form.canone_mensile} onChange={(v) => setForm({ ...form, canone_mensile: v })} suffix="€" />
              <LocField label="Deposito cauzionale" testId="loc-deposito" type="number" value={form.deposito_cauzionale} onChange={(v) => setForm({ ...form, deposito_cauzionale: v })} suffix="€" />
              <LocField label="Durata contratto" testId="loc-durata" type="number" value={form.durata_contratto_anni} onChange={(v) => setForm({ ...form, durata_contratto_anni: v })} suffix="anni" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                data-testid="loc-rinnovo"
                checked={!!form.rinnovo_automatico}
                onChange={(e) => setForm({ ...form, rinnovo_automatico: e.target.checked })}
                className="w-4 h-4 rounded border-[#CBD5E1] text-[#0066FF] focus:ring-[#0066FF]"
              />
              <span className="text-sm text-[#0F172A]">Rinnovo automatico alla scadenza</span>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Note locazione (opzionale)</span>
              <textarea
                data-testid="loc-note"
                rows={2}
                value={form.note_locazione}
                onChange={(e) => setForm({ ...form, note_locazione: e.target.value })}
                placeholder="Es. cedolare secca al 21%, garante coniuge, animali ammessi…"
                className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF] resize-none"
              />
            </label>
            <div className="flex justify-end pt-2 border-t border-[#E2E8F0]">
              <button
                data-testid="loc-save"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-sm font-medium disabled:opacity-50 transition"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Salvataggio…" : cta}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="space-y-4">
        <SectionCard title="Riepilogo economico" testId="card-locazione-status" action={<Home size={16} className="text-[#2563EB]" />}>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between py-1 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">Canone annuo</span>
              <span className="font-semibold text-[#0F172A] tabular">{formatEur((form.canone_mensile || 0) * 12)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">Rendimento lordo</span>
              <span className="font-semibold text-[#059669] tabular">{p.rendimento_lordo > 0 ? `${p.rendimento_lordo}%` : "—"}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[#64748B]">Rendimento netto</span>
              <span className="font-semibold text-[#059669] tabular">{p.rendimento_netto > 0 ? `${p.rendimento_netto}%` : "—"}</span>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Tips" testId="card-locazione-tips">
          <ul className="text-xs text-[#475569] space-y-2 leading-relaxed">
            <li className="flex gap-2"><Calendar size={12} className="text-[#0066FF] shrink-0 mt-0.5" /><span>Imposta la scadenza per ricevere alert nei 90 giorni precedenti.</span></li>
            <li className="flex gap-2"><KeyRound size={12} className="text-[#B45309] shrink-0 mt-0.5" /><span>Quando ricevi una disdetta usa il bottone <strong>Registra disdetta</strong>: lo stato passerà automaticamente a sfitto alla data uscita.</span></li>
            <li className="flex gap-2"><History size={12} className="text-[#64748B] shrink-0 mt-0.5" /><span>Lo <strong>storico contratti</strong> mantiene la cronologia inquilini per audit e calcoli di tasso occupazione.</span></li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function DisdettaModal({ p, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultExit = p.scadenza_contratto || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const [form, setForm] = useState({
    data_ricezione: today,
    data_uscita_prevista: defaultExit,
    parte_disdicente: "conduttore",
    motivo: "",
  });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await apiClient().post(`/properties/${p.id}/disdetta`, form);
      toast.success("Disdetta registrata — alert creato");
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="loc-disdetta-modal">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center gap-2">
          <KeyRound size={16} className="text-[#B45309]" />
          <div>
            <div className="text-sm font-semibold text-[#0F172A]">Registra disdetta</div>
            <div className="text-xs text-[#64748B]">{p.nome} · inquilino {p.inquilino || "—"}</div>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <LocField label="Data ricezione disdetta" type="date" value={form.data_ricezione} onChange={(v) => setForm({ ...form, data_ricezione: v })} testId="disdetta-data-ricezione" />
          <LocField label="Data uscita prevista" type="date" value={form.data_uscita_prevista} onChange={(v) => setForm({ ...form, data_uscita_prevista: v })} testId="disdetta-data-uscita" />
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Chi disdice</span>
            <select value={form.parte_disdicente} onChange={(e) => setForm({ ...form, parte_disdicente: e.target.value })} className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]">
              <option value="conduttore">Conduttore (inquilino)</option>
              <option value="locatore">Locatore (proprietà)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Motivo (opzionale)</span>
            <textarea rows={2} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder="Es. trasferimento per lavoro, vendita immobile…" className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF] resize-none" />
          </label>
          <div className="bg-[#FFFBEB] border border-[#FCD34D]/40 rounded-lg p-3 text-xs text-[#92400E]">
            Alla <strong>data uscita prevista</strong> il sistema chiuderà automaticamente il contratto e l'immobile passerà a <strong>sfitto</strong>. Riceverai un alert finché la disdetta è attiva.
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-sm text-[#475569]">Annulla</button>
          <button onClick={submit} disabled={saving} data-testid="disdetta-submit" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#B45309] hover:bg-[#92400E] disabled:opacity-50 text-white text-sm font-semibold">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
            Registra disdetta
          </button>
        </div>
      </div>
    </div>
  );
}

function ChiudiModal({ p, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    data_uscita_effettiva: p.data_uscita_prevista || today,
    motivo_chiusura: p.disdetta_ricevuta_il ? "disdetta_conduttore" : "fine_naturale",
    stato_consegna: "ok",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!confirm("Confermi la chiusura del contratto? L'immobile passerà a sfitto e i dati saranno archiviati nello storico.")) return;
    setSaving(true);
    try {
      await apiClient().post(`/properties/${p.id}/chiudi-contratto`, form);
      toast.success("Contratto chiuso · immobile ora sfitto");
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="loc-chiudi-modal">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center gap-2">
          <LogOut size={16} className="text-[#DC2626]" />
          <div>
            <div className="text-sm font-semibold text-[#0F172A]">Chiudi contratto</div>
            <div className="text-xs text-[#64748B]">{p.nome} · inquilino {p.inquilino || "—"}</div>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <LocField label="Data uscita effettiva" type="date" value={form.data_uscita_effettiva} onChange={(v) => setForm({ ...form, data_uscita_effettiva: v })} testId="chiudi-data-uscita" />
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Motivo chiusura</span>
            <select value={form.motivo_chiusura} onChange={(e) => setForm({ ...form, motivo_chiusura: e.target.value })} data-testid="chiudi-motivo" className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]">
              <option value="fine_naturale">Fine naturale del contratto</option>
              <option value="disdetta_conduttore">Disdetta conduttore</option>
              <option value="disdetta_locatore">Disdetta locatore</option>
              <option value="morosita">Morosità (sfratto)</option>
              <option value="vendita">Vendita immobile</option>
              <option value="altro">Altro</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Stato consegna</span>
            <select value={form.stato_consegna} onChange={(e) => setForm({ ...form, stato_consegna: e.target.value })} className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]">
              <option value="ok">OK – nessun danno</option>
              <option value="con_riserve">Con riserve / trattenuta deposito</option>
              <option value="da_ripristinare">Da ripristinare (lavori necessari)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Note (opzionale)</span>
            <textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Es. trattenuti 300€ da deposito per imbiancatura" className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF] resize-none" />
          </label>
          <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-3 text-xs text-[#991B1B]">
            <strong>Attenzione:</strong> i campi locazione dell'immobile verranno svuotati e snapshottati nello storico. Lo stato dell'immobile passerà a <strong>sfitto</strong>. Gli incassi previsti futuri non pagati saranno archiviati.
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-sm text-[#475569]">Annulla</button>
          <button onClick={submit} disabled={saving} data-testid="chiudi-submit" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white text-sm font-semibold">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
            Chiudi contratto
          </button>
        </div>
      </div>
    </div>
  );
}
