import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../lib/auth";
import { toast } from "sonner";
import { SectionCard } from "../components/dashboard/SectionCard";
import {
  Calculator, TrendingUp, AlertTriangle, CheckCircle2, Banknote, Loader2,
  Sparkles, History, Trash2, ChevronDown, ChevronRight, Building2, Target,
  ShieldCheck, FileText, Info, ScrollText, BookOpen, Tag,
} from "lucide-react";

const eur = (n) => (Number.isFinite(n) ? `€ ${Math.round(n).toLocaleString("it-IT")}` : "—");
const pct = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : "—");
const num = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—");

const SEMAFORO_STYLE = {
  verde: { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", strong: "#059669", ring: "#10B981" },
  giallo: { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", strong: "#D97706", ring: "#F59E0B" },
  rosso: { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", strong: "#DC2626", ring: "#EF4444" },
};

const ESITO_LABEL = {
  approvabile_standard: "Approvabile in iter standard",
  approvabile_con_garanzie: "Approvabile con garanzie aggiuntive",
  rinegoziabile: "Rinegoziabile con modifiche",
  rifiuto_probabile: "Rifiuto probabile",
};

const PRIORITA_BADGE = {
  alta: "bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]",
  media: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]",
  bassa: "bg-[#DBEAFE] text-[#1E40AF] border-[#BFDBFE]",
};

const TIPO_TASSO = [
  { v: "fisso", l: "Fisso" },
  { v: "variabile", l: "Variabile" },
  { v: "misto", l: "Misto" },
];

const FINALITA = [
  { v: "immobile_reddito", l: "Acquisto immobile a reddito" },
  { v: "ristrutturazione", l: "Ristrutturazione + rivendita" },
  { v: "sostituzione", l: "Sostituzione/surroga mutuo esistente" },
  { v: "acquisto_terreno", l: "Acquisto terreno/sviluppo" },
];

const DURATE = [10, 15, 20, 25, 30];

export default function MortgageFeasibility() {
  const [rateOptions, setRateOptions] = useState([]);
  const [tuoiDati, setTuoiDati] = useState(null);

  const [form, setForm] = useState({
    importo: 200000,
    durata_anni: 20,
    tasso_pct: 3.5,
    tipo_tasso: "fisso",
    finalita: "immobile_reddito",
    prezzo_immobile_target: 280000,
    canone_atteso_mensile: 1200,
    banca_target: "",
    note: "",
    tag: "",
  });

  const [rateSel, setRateSel] = useState("custom");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    apiClient().get("/mortgage-feasibility/rate-suggestions").then(r => {
      setRateOptions(r.data?.options || []);
      setTuoiDati(r.data?.tuoi_dati || null);
    }).catch(() => {});
  }, []);

  // Auto-seleziona il primo "tuo tasso" quando arrivano le opzioni
  useEffect(() => {
    if (!rateOptions.length) return;
    const first = rateOptions[0];
    if (first && first.id.startsWith("tuo_")) {
      setRateSel(first.id);
      setForm(f => ({ ...f, tasso_pct: first.value, tipo_tasso: first.tipo_tasso }));
    }
  }, [rateOptions]);

  const loadHistory = async () => {
    try {
      const r = await apiClient().get("/mortgage-feasibility/history");
      setHistory(r.data || []);
    } catch { /* */ }
  };
  useEffect(() => { loadHistory(); }, []);

  const onRateSelect = (id) => {
    setRateSel(id);
    if (id === "custom") return;
    const opt = rateOptions.find(o => o.id === id);
    if (opt) setForm(f => ({ ...f, tasso_pct: opt.value, tipo_tasso: opt.tipo_tasso }));
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const run = async () => {
    if (!form.importo || !form.durata_anni || !form.tasso_pct) {
      toast.error("Importo, durata e tasso obbligatori");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const r = await apiClient().post("/mortgage-feasibility/analyze", {
        ...form,
        prezzo_immobile_target: form.prezzo_immobile_target || null,
        canone_atteso_mensile: form.canone_atteso_mensile || null,
        banca_target: form.banca_target || null,
        note: form.note || null,
        tag: form.tag || null,
      });
      setResult(r.data);
      toast.success(`Analisi completata · score ${r.data?.ai?.punteggio_fattibilita}/100`);
      loadHistory();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore analisi");
    } finally {
      setLoading(false);
    }
  };

  const removeFromHistory = async (id) => {
    if (!window.confirm(`Eliminare simulazione ${id}?`)) return;
    try {
      await apiClient().delete(`/mortgage-feasibility/${id}`);
      toast.success("Eliminata");
      loadHistory();
    } catch { toast.error("Errore eliminazione"); }
  };

  const openHistorical = (h) => {
    setResult(h);
    setShowHistory(false);
    if (h.input) setForm(f => ({ ...f, ...h.input }));
  };

  const ai = result?.ai;
  const kpi = result?.kpi;
  const portfolio = result?.portfolio_snapshot;
  const score = ai?.punteggio_fattibilita ?? kpi?.score_deterministico;
  const semaforo = ai?.semaforo || kpi?.semaforo || "giallo";
  const sty = SEMAFORO_STYLE[semaforo] || SEMAFORO_STYLE.giallo;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" data-testid="mortgage-feasibility">
      {/* LEFT — INPUT */}
      <div className="lg:col-span-2 space-y-4">
        <SectionCard
          testId="mf-input"
          title="Richiesta mutuo"
          subtitle="Calcoliamo l'impatto sul tuo bilancio reale (DSCR, LTV, NOI, rata/reddito)"
          action={<Calculator size={16} className="text-[#0066FF]" />}
        >
          <div className="space-y-3">
            {/* Importo */}
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Importo mutuo</span>
                <input type="number" data-testid="mf-importo" value={form.importo}
                  onChange={(e) => set("importo", parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#0066FF] tabular" />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Prezzo immobile target</span>
                <input type="number" data-testid="mf-prezzo" value={form.prezzo_immobile_target}
                  onChange={(e) => set("prezzo_immobile_target", parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#0066FF] tabular" />
              </label>
            </div>

            {/* Durata */}
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Durata (anni)</span>
              <div className="mt-1 grid grid-cols-5 gap-1.5">
                {DURATE.map((y) => (
                  <button key={y} onClick={() => set("durata_anni", y)}
                    data-testid={`mf-durata-${y}`}
                    className={`px-2 py-2 text-sm font-semibold border transition ${form.durata_anni === y ? "border-[#0066FF] bg-[rgba(0,102,255,0.1)] text-[#2563EB]" : "border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1]"}`}>
                    {y}
                  </button>
                ))}
              </div>
            </label>

            {/* Tasso suggerito */}
            {rateOptions.length > 0 && (
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium flex items-center gap-1">
                  <Sparkles size={11} className="text-[#0066FF]" />
                  Suggerimento tasso
                </span>
                <select value={rateSel} onChange={(e) => onRateSelect(e.target.value)}
                  data-testid="mf-rate-suggestion"
                  className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#0066FF]">
                  {rateOptions.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                  <option value="custom">— Inserisci manualmente —</option>
                </select>
                {tuoiDati && (tuoiDati.tasso_medio_fisso || tuoiDati.tasso_medio_variabile) && (
                  <span className="text-[10px] text-[#64748B] mt-0.5 block">
                    Calcolato sui {tuoiDati.n_mutui_attivi} mutui in essere nel gestionale
                  </span>
                )}
              </label>
            )}

            {/* Tasso + tipo */}
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Tasso annuo %</span>
                <input type="number" step="0.01" data-testid="mf-tasso" value={form.tasso_pct}
                  onChange={(e) => { setRateSel("custom"); set("tasso_pct", parseFloat(e.target.value) || 0); }}
                  className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#0066FF] tabular" />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Tipo tasso</span>
                <select value={form.tipo_tasso} onChange={(e) => set("tipo_tasso", e.target.value)}
                  data-testid="mf-tipo-tasso"
                  className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#0066FF]">
                  {TIPO_TASSO.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </label>
            </div>

            {/* Finalità */}
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Finalità</span>
              <select value={form.finalita} onChange={(e) => set("finalita", e.target.value)}
                data-testid="mf-finalita"
                className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#0066FF]">
                {FINALITA.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </label>

            {/* Canone */}
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium flex items-center gap-1">
                Canone atteso (€/mese)
                <Info size={11} className="text-[#64748B]" />
              </span>
              <input type="number" data-testid="mf-canone" value={form.canone_atteso_mensile}
                onChange={(e) => set("canone_atteso_mensile", parseFloat(e.target.value) || 0)}
                placeholder="Lascia 0 se non a reddito"
                className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#0066FF] tabular" />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Banca target (opz)</span>
                <input type="text" data-testid="mf-banca" value={form.banca_target}
                  onChange={(e) => set("banca_target", e.target.value)}
                  placeholder="es. Intesa SP"
                  className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#0066FF]" />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium flex items-center gap-1">
                  <Tag size={10} /> Tag
                </span>
                <input type="text" data-testid="mf-tag" value={form.tag}
                  onChange={(e) => set("tag", e.target.value)}
                  placeholder="es. Trilocale Bologna"
                  className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#0066FF]" />
              </label>
            </div>

            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Note al credit officer (opz)</span>
              <textarea data-testid="mf-note" value={form.note} rows={2}
                onChange={(e) => set("note", e.target.value)}
                placeholder="Eventuali garanzie, contesto, fidejussioni..."
                className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#0066FF] resize-none" />
            </label>

            <button onClick={run} disabled={loading} data-testid="mf-run"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-60 text-white text-sm font-semibold transition">
              {loading ? <><Loader2 size={16} className="animate-spin"/> Analisi banker in corso…</> : <><Sparkles size={16}/> Analizza fattibilità</>}
            </button>
          </div>
        </SectionCard>

        {/* Storico */}
        <SectionCard
          testId="mf-history"
          title={`Storico simulazioni (${history.length})`}
          action={<History size={16} className="text-[#7C3AED]"/>}
        >
          {history.length === 0 ? (
            <div className="text-xs text-[#64748B] py-4 text-center">Nessuna simulazione salvata</div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {history.slice(0, 20).map(h => {
                const hSty = SEMAFORO_STYLE[h.ai?.semaforo || h.kpi?.semaforo || "giallo"];
                const hScore = h.ai?.punteggio_fattibilita ?? h.kpi?.score_deterministico;
                return (
                  <div key={h.id}
                    className="flex items-center gap-2 p-2 border border-[#E2E8F0] hover:border-[#0066FF] cursor-pointer transition-colors group"
                    onClick={() => openHistorical(h)}
                    data-testid={`mf-hist-${h.id}`}>
                    <div className="w-9 h-9 flex items-center justify-center font-display font-bold text-xs tabular"
                         style={{ background: hSty.bg, color: hSty.strong, border: `1px solid ${hSty.border}` }}>
                      {hScore}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-[#0F172A] truncate">
                        {h.input?.tag || `${eur(h.input?.importo)} × ${h.input?.durata_anni}a`}
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        {new Date(h.created_at).toLocaleDateString("it-IT")} · {h.input?.tasso_pct}% {h.input?.tipo_tasso}
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeFromHistory(h.id); }}
                      className="opacity-0 group-hover:opacity-100 text-[#64748B] hover:text-[#DC2626] p-1 transition-opacity"
                      data-testid={`mf-hist-del-${h.id}`}>
                      <Trash2 size={12}/>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* RIGHT — RESULT */}
      <div className="lg:col-span-3 space-y-4">
        {!result && !loading && (
          <SectionCard testId="mf-placeholder" title="Output analisi">
            <div className="text-center py-16">
              <Calculator size={56} className="mx-auto text-[#CBD5E1]"/>
              <div className="text-sm text-[#64748B] mt-3">Configura la richiesta e premi <strong>Analizza fattibilità</strong></div>
              <div className="text-[11px] text-[#94A3B8] mt-1">{`L'analisi AI applica linee guida ABI · EBA/GL/2020/06 · Banca d'Italia Circ. 285`}</div>
            </div>
          </SectionCard>
        )}

        {loading && (
          <SectionCard testId="mf-loading" title="Senior Credit Officer al lavoro…">
            <div className="text-center py-16">
              <Loader2 size={48} className="mx-auto text-[#0066FF] animate-spin"/>
              <div className="text-sm text-[#475569] mt-3">Aggregazione bilancio · calcolo DSCR/LTV/DTI · analisi banker-grade</div>
            </div>
          </SectionCard>
        )}

        {result && ai && kpi && (
          <>
            {/* Verdict header */}
            <div
              className="border p-5 flex flex-col md:flex-row md:items-center md:gap-6 gap-4"
              style={{ background: sty.bg, borderColor: sty.border }}
              data-testid="mf-verdict"
            >
              {/* Score gauge */}
              <div className="flex items-center gap-3 md:gap-4">
                <div className="relative w-24 h-24 shrink-0">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="44" fill="none" stroke="#FFFFFF" strokeWidth="9" />
                    <circle cx="50" cy="50" r="44" fill="none" stroke={sty.ring} strokeWidth="9"
                      strokeDasharray={`${(score / 100) * 276.46} 276.46`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-3xl font-bold tabular" style={{ color: sty.strong }}>{score}</span>
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: sty.text }}>/ 100</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: sty.text }}>
                    Esito atteso · {ESITO_LABEL[ai.esito_atteso] || ai.esito_atteso}
                  </div>
                  <div className="font-display text-lg font-semibold mt-0.5 leading-tight" style={{ color: sty.strong }}>
                    {ai.giudizio_sintetico}
                  </div>
                </div>
              </div>
            </div>

            {/* 4 KPI tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="mf-kpi-tiles">
              <KpiTile label="Rata mensile" value={eur(kpi.rata_nuova_mensile)} sub={`Totale post: ${eur(kpi.rata_mensile_post)}`} icon={Banknote} testId="mf-kpi-rata" />
              <KpiTile label="DSCR post" value={num(kpi.dscr_post)} sub={`Soglia ABI ≥ 1.20 · Buono ≥ 1.40`}
                       tone={kpi.dscr_post >= 1.4 ? "positive" : kpi.dscr_post >= 1.2 ? "warning" : "critical"}
                       icon={ShieldCheck} testId="mf-kpi-dscr" />
              <KpiTile label="LTV portfolio post" value={pct(kpi.ltv_portfolio_post_pct)} sub={kpi.ltv_immobile_pct !== null ? `LTV immobile: ${pct(kpi.ltv_immobile_pct)}` : "Aggregato"}
                       tone={kpi.ltv_portfolio_post_pct < 70 ? "positive" : kpi.ltv_portfolio_post_pct < 80 ? "warning" : "critical"}
                       icon={Building2} testId="mf-kpi-ltv" />
              <KpiTile label="Rata / ricavi" value={pct(kpi.rata_su_reddito_pct)} sub={`Soglia EBA ≤ 33%`}
                       tone={kpi.rata_su_reddito_pct < 33 ? "positive" : kpi.rata_su_reddito_pct < 40 ? "warning" : "critical"}
                       icon={TrendingUp} testId="mf-kpi-rr" />
            </div>

            {/* Secondary KPI */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <MiniKpi label="Cap rate" value={pct(kpi.cap_rate_target_pct)} />
              <MiniKpi label="NOI annuo post" value={eur(kpi.noi_post)} />
              <MiniKpi label="Cash flow mensile post" value={eur(kpi.cashflow_mensile_post)} />
              <MiniKpi label="Capitale proprio richiesto" value={eur(kpi.capitale_proprio_richiesto)} />
              <MiniKpi label="Debito totale post" value={eur(kpi.debito_post)} />
              <MiniKpi label="Liquidità (mesi rate)" value={num(kpi.mesi_liquidita_coperti, 1)} />
              <MiniKpi label="DTI post" value={pct(kpi.dti_post_pct)} />
              <MiniKpi label="Ricavi mensili post" value={eur(kpi.ricavi_post_mensili)} />
            </div>

            {/* Analisi dettagliata */}
            <SectionCard testId="mf-analysis" title="Analisi banker-grade" action={<FileText size={16} className="text-[#0066FF]"/>}>
              <div className="prose prose-sm max-w-none text-[13px] leading-relaxed text-[#1E293B] whitespace-pre-wrap">
                {ai.analisi_dettagliata}
              </div>
            </SectionCard>

            {/* Forza / Critici */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SectionCard testId="mf-strengths" title="Punti di forza" action={<CheckCircle2 size={14} className="text-[#059669]"/>}>
                {(ai.punti_forza || []).length === 0 ? (
                  <div className="text-xs text-[#64748B]">—</div>
                ) : (
                  <ul className="space-y-1.5">
                    {(ai.punti_forza || []).map((p, i) => (
                      <li key={i} className="text-[12.5px] text-[#065F46] flex gap-2">
                        <CheckCircle2 size={12} className="shrink-0 mt-1 text-[#059669]" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
              <SectionCard testId="mf-critical" title="Punti critici" action={<AlertTriangle size={14} className="text-[#DC2626]"/>}>
                {(ai.punti_critici || []).length === 0 ? (
                  <div className="text-xs text-[#64748B]">—</div>
                ) : (
                  <ul className="space-y-1.5">
                    {(ai.punti_critici || []).map((p, i) => (
                      <li key={i} className="text-[12.5px] text-[#991B1B] flex gap-2">
                        <AlertTriangle size={12} className="shrink-0 mt-1 text-[#DC2626]" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>

            {/* Raccomandazioni */}
            {(ai.raccomandazioni || []).length > 0 && (
              <SectionCard testId="mf-recs" title="Raccomandazioni azionabili" action={<Target size={16} className="text-[#0066FF]"/>}>
                <div className="space-y-2">
                  {ai.raccomandazioni.map((r, i) => (
                    <div key={i} className="border border-[#E2E8F0] p-3 hover:border-[#CBD5E1] transition-colors">
                      <div className="flex items-start gap-2">
                        <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 border ${PRIORITA_BADGE[r.priorita] || PRIORITA_BADGE.media}`}>
                          {r.priorita}
                        </span>
                        <div className="flex-1">
                          <div className="text-[13px] font-semibold text-[#0F172A]">{r.azione}</div>
                          <div className="text-[11.5px] text-[#475569] mt-0.5">→ {r.impatto_atteso}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Scenari alternativi */}
            {(ai.scenari_alternativi || []).length > 0 && (
              <SectionCard testId="mf-scenarios" title="Scenari alternativi" action={<Sparkles size={16} className="text-[#7C3AED]"/>}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {ai.scenari_alternativi.map((s, i) => {
                    const scSty = SEMAFORO_STYLE[
                      s.score_stimato >= 70 ? "verde" : s.score_stimato >= 45 ? "giallo" : "rosso"
                    ];
                    return (
                      <div key={i} className="border p-3" style={{ borderColor: scSty.border, background: scSty.bg }}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: scSty.text }}>{s.label}</span>
                          <span className="font-display text-xl font-bold tabular" style={{ color: scSty.strong }}>{s.score_stimato}</span>
                        </div>
                        <div className="text-[12px] font-semibold text-[#0F172A] mt-1">{s.modifica}</div>
                        <div className="text-[11px] text-[#475569] mt-1 leading-snug">{s.note}</div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            {/* Banche + covenant + docs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {(ai.banche_consigliate || []).length > 0 && (
                <SectionCard testId="mf-banks" title="Istituti consigliati" action={<Banknote size={14} className="text-[#0066FF]"/>}>
                  <ul className="space-y-1 text-[12px]">
                    {ai.banche_consigliate.map((b, i) => (
                      <li key={i} className="flex gap-2 text-[#1E293B]">
                        <ChevronRight size={12} className="shrink-0 mt-1 text-[#0066FF]" /> {b}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
              {(ai.covenant_attesi || []).length > 0 && (
                <SectionCard testId="mf-covenants" title="Covenant attesi" action={<ScrollText size={14} className="text-[#B45309]"/>}>
                  <ul className="space-y-1 text-[12px]">
                    {ai.covenant_attesi.map((c, i) => (
                      <li key={i} className="flex gap-2 text-[#1E293B]">
                        <ChevronRight size={12} className="shrink-0 mt-1 text-[#B45309]" /> {c}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
              {(ai.documenti_richiesti || []).length > 0 && (
                <SectionCard testId="mf-docs" title="Documenti richiesti" action={<BookOpen size={14} className="text-[#7C3AED]"/>}>
                  <ul className="space-y-1 text-[12px]">
                    {ai.documenti_richiesti.map((d, i) => (
                      <li key={i} className="flex gap-2 text-[#1E293B]">
                        <ChevronRight size={12} className="shrink-0 mt-1 text-[#7C3AED]" /> {d}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
            </div>

            {/* Snapshot patrimoniale usato (collapsible) */}
            <details className="bg-white border border-[#E2E8F0] p-3" data-testid="mf-snapshot">
              <summary className="cursor-pointer text-[12px] font-semibold text-[#475569] flex items-center gap-1">
                <ChevronDown size={12}/> {`Snapshot patrimoniale usato per l'analisi`}
              </summary>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-[11.5px]">
                <SnapKv label="Immobili" v={portfolio.n_immobili} />
                <SnapKv label="Valore portfolio" v={eur(portfolio.valore_immobili)} />
                <SnapKv label="Ricavi annui" v={eur(portfolio.ricavi_annui_attuali)} />
                <SnapKv label="NOI annuo" v={eur(portfolio.noi_annuo)} />
                <SnapKv label="Debito residuo" v={eur(portfolio.debito_residuo_totale)} />
                <SnapKv label="Rata mensile attuale" v={eur(portfolio.rata_mensile_attuale)} />
                <SnapKv label="DSCR attuale" v={num(portfolio.dscr_attuale)} />
                <SnapKv label="Cash flow mensile" v={eur(portfolio.cashflow_mensile_attuale)} />
                <SnapKv label="Liquidità" v={eur(portfolio.liquidita_disponibile)} />
                <SnapKv label="Patrimonio netto" v={eur(portfolio.patrimonio_netto)} />
                <SnapKv label="Mutui attivi" v={portfolio.n_mutui_attivi} />
                <SnapKv label="Ultimo bilancio" v={portfolio.bilancio_periodo || "—"} />
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

// ─── helper components ──────────────────────────────────────────────────────
const TONE = {
  positive: { bg: "#ECFDF5", text: "#065F46", strong: "#059669", border: "#A7F3D0" },
  warning:  { bg: "#FFFBEB", text: "#92400E", strong: "#B45309", border: "#FDE68A" },
  critical: { bg: "#FEF2F2", text: "#991B1B", strong: "#DC2626", border: "#FECACA" },
  default:  { bg: "#FFFFFF", text: "#0F172A", strong: "#0F172A", border: "#E2E8F0" },
};

function KpiTile({ label, value, sub, icon: Icon, tone = "default", testId }) {
  const t = TONE[tone] || TONE.default;
  return (
    <div className="border p-3" style={{ background: t.bg, borderColor: t.border }} data-testid={testId}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: t.text }}>{label}</span>
        {Icon && <Icon size={14} style={{ color: t.strong }} />}
      </div>
      <div className="font-display text-xl font-bold tabular mt-1" style={{ color: t.strong }}>{value}</div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: t.text }}>{sub}</div>}
    </div>
  );
}

function MiniKpi({ label, value }) {
  return (
    <div className="bg-white border border-[#E2E8F0] p-2">
      <div className="text-[9.5px] uppercase tracking-wider text-[#64748B]">{label}</div>
      <div className="text-sm font-semibold text-[#0F172A] tabular mt-0.5">{value}</div>
    </div>
  );
}

function SnapKv({ label, v }) {
  return (
    <div className="border border-[#E2E8F0] p-1.5">
      <div className="text-[9px] uppercase tracking-wider text-[#64748B]">{label}</div>
      <div className="text-[12.5px] font-semibold text-[#0F172A] tabular">{v}</div>
    </div>
  );
}
