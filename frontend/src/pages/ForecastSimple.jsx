import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { apiClient } from "../lib/auth";
import { toast } from "sonner";
import {
  LineChart, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart, Line, ReferenceLine,
} from "recharts";
import {
  Sparkles, Loader2, FileDown, MessageSquare, RefreshCw, GitCompare,
  TrendingUp, Building2, Wallet, AlertTriangle, Settings as SettingsIcon, ArrowRight,
  Activity, RotateCcw, ShieldAlert, Zap, Ban, Target, Rocket, CheckCircle2, Clock,
} from "lucide-react";

const API = "/forecast";
const eur = (n) => (isFinite(n) ? `€ ${Math.round(n).toLocaleString("it-IT")}` : "—");

const CITIES = ["Milano", "Roma", "Torino", "Bologna", "Firenze", "Padova", "Verona", "Napoli", "Bari", "Genova"];
const TIPOLOGIE = ["Monolocale", "Bilocale", "Trilocale", "Quadrilocale", "Villa", "Loft", "Attico"];

const exampleProms = [
  "Compro 2 bilocali a Milano all'anno a ~180k l'uno, affitto medio 1.100€/mese, leva 60%. Anno 3 vendo il peggior immobile esistente.",
  "Strategia mista: nei primi 2 anni 1 acquisto a reddito a Bologna (~150k), poi anno 3 compro+ristrutturo+vendo a Padova.",
  "Conservativa: 1 trilocale Verona ogni 2 anni, canone 950€, leva 50%. Mantieni 50k di liquidità sempre.",
];

export default function ForecastSimple({ embedded = false }) {
  const [mode, setMode] = useState("prompt"); // 'prompt' | 'params' | 'both'
  const [horizon, setHorizon] = useState(5);
  const [prompt, setPrompt] = useState("");
  const [params, setParams] = useState({
    acquisti_per_anno: 2, prezzo_medio: 180000, canone_medio: 1100,
    citta_preferita: "Milano", leva_pct: 60, tipologia: "Bilocale",
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // AI chat about the result
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatSending, setChatSending] = useState(false);

  // Vincoli hard applicati durante la simulazione
  const [vincoli, setVincoli] = useState({
    blocca_acquisti_cassa_negativa: false,
    riserva_minima_liquidita: 0,
  });
  // Sensitivity what-if (sliders live, debounced)
  const SENS_DEFAULT = { delta_tasso_pct: 0, delta_canone_pct: 0, delta_rivalutazione_pct: 0, vacancy_mesi_anno: 0 };
  const [sensitivity, setSensitivity] = useState(SENS_DEFAULT);
  const [sensResult, setSensResult] = useState(null);
  const [sensLoading, setSensLoading] = useState(false);
  // Tornado
  const [tornado, setTornado] = useState(null);
  const [tornadoLoading, setTornadoLoading] = useState(false);
  // Action Plan
  const [actionPlan, setActionPlan] = useState(null);
  const [actionPlanLoading, setActionPlanLoading] = useState(false);

  const canRun = (mode === "prompt" && prompt.trim()) || mode !== "prompt";

  const simulate = async (overrideMode) => {
    const useMode = overrideMode || mode;
    setLoading(true);
    // reset what-if/tornado on new run
    setSensitivity(SENS_DEFAULT);
    setSensResult(null);
    setTornado(null);
    setActionPlan(null);
    try {
      const body = { horizon_years: horizon, save: true };
      if (useMode === "prompt" || useMode === "both") body.prompt = prompt.trim();
      if (useMode === "params" || useMode === "both") body.params = params;
      if (vincoli.blocca_acquisti_cassa_negativa || vincoli.riserva_minima_liquidita > 0) body.vincoli = vincoli;
      const r = await apiClient().post(`${API}/quick`, body);
      setResult(r.data);
      setChatHistory([]);
      toast.success("Simulazione completata");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore simulazione");
    } finally {
      setLoading(false);
    }
  };

  const askAI = async () => {
    if (!chatInput.trim() || !result?.saved_id) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatHistory((h) => [...h, { user: msg, reply: null }]);
    setChatSending(true);
    try {
      const r = await apiClient().post(`${API}/scenarios/${result.saved_id}/ai`, { message: msg });
      setChatHistory((h) => {
        const copy = [...h];
        copy[copy.length - 1] = { user: msg, reply: r.data.reply };
        return copy;
      });
    } catch (e) {
      toast.error("Errore AI");
      setChatHistory((h) => h.slice(0, -1));
    } finally {
      setChatSending(false);
    }
  };

  // Debounced sensitivity: ricomputa quando uno slider cambia, salvo tutti a 0
  useEffect(() => {
    if (!result?.saved_id) {
      setSensResult(null);
      return;
    }
    const allZero =
      !sensitivity.delta_tasso_pct &&
      !sensitivity.delta_canone_pct &&
      !sensitivity.delta_rivalutazione_pct &&
      !sensitivity.vacancy_mesi_anno;
    if (allZero) {
      setSensResult(null);
      return;
    }
    const t = setTimeout(async () => {
      setSensLoading(true);
      try {
        const r = await apiClient().post(`${API}/scenarios/${result.saved_id}/sensitivity`, sensitivity);
        setSensResult(r.data.simulation);
      } catch {
        // silent — non rompe l'UI
      } finally {
        setSensLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [sensitivity, result?.saved_id]);

  const runTornado = async () => {
    if (!result?.saved_id) return;
    setTornadoLoading(true);
    try {
      const r = await apiClient().post(`${API}/scenarios/${result.saved_id}/tornado`);
      setTornado(r.data);
    } catch {
      toast.error("Errore tornado");
    } finally {
      setTornadoLoading(false);
    }
  };
  const resetSensitivity = () => setSensitivity(SENS_DEFAULT);

  const runActionPlan = async () => {
    if (!result?.saved_id) return;
    setActionPlanLoading(true);
    try {
      const r = await apiClient().post(`${API}/scenarios/${result.saved_id}/action-plan`);
      setActionPlan(r.data.actions || []);
      toast.success(`Piano d'azione generato (${r.data.actions?.length || 0} step)`);
    } catch {
      toast.error("Errore generazione piano d'azione");
    } finally {
      setActionPlanLoading(false);
    }
  };

  const accelerateGrowth = async () => {
    const boost = (prompt ? prompt.trim() + "\n\n" : "") +
      "ACCELERA LA CRESCITA: usa leva finanziaria massima (mutui 70-75% LTV), reinvesti tutti gli utili, " +
      "considera anche operazioni compra-ristruttura-vendi per liberare capitale e fare almeno +1 acquisto/anno rispetto al piano base.";
    setPrompt(boost);
    setMode("prompt");
    await simulate("prompt");
  };

  const downloadPdf = async () => {
    if (!result?.saved_id) return;
    try {
      const r = await apiClient().get(`${API}/scenarios/${result.saved_id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "piano_industriale.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error("Errore download PDF");
    }
  };

  const chartData = result?.simulation?.snapshots?.map((s) => ({
    anno: s.anno === 0 ? "Oggi" : `A${s.anno}`,
    pn: s.patrimonio_netto, debito: s.debito_residuo, cf: s.cash_flow_annuo,
    ricavi: s.ricavi_annui, costi: s.costi_annui, utile: s.utile_netto,
    ltv: s.ltv, alerts: (s.alerts || []).length,
  })) || [];

  const s = result?.simulation?.summary;
  const verdictTone = s?.verdict_severity === "critical"
    ? { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", icon: "#DC2626" }
    : s?.verdict_severity === "warning"
      ? { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", icon: "#B45309" }
      : { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", icon: "#059669" };

  const inner = (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT — INPUT */}
        <div className="lg:col-span-2 space-y-4">
          <SectionCard testId="quick-input" title="Cosa vuoi fare" subtitle="Scrivi a parole tue o imposta i parametri rapidi">
            {/* Mode toggle */}
            <div className="grid grid-cols-3 gap-1 mb-4 p-1 bg-[#F1F5F9] rounded-lg">
              {[
                { v: "prompt", l: "Prompt" },
                { v: "params", l: "Parametri" },
                { v: "both", l: "Entrambi" },
              ].map((m) => (
                <button
                  key={m.v}
                  data-testid={`mode-${m.v}`}
                  onClick={() => setMode(m.v)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${mode === m.v ? "bg-white text-[#0066FF] shadow-sm" : "text-[#64748B] hover:text-[#0F172A]"}`}
                >
                  {m.l}
                </button>
              ))}
            </div>

            {/* Horizon */}
            <label className="block mb-3">
              <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Orizzonte</span>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {[3, 5, 10].map((y) => (
                  <button
                    key={y}
                    data-testid={`horizon-${y}`}
                    onClick={() => setHorizon(y)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition ${horizon === y ? "border-[#0066FF] bg-[rgba(0,102,255,0.1)] text-[#2563EB]" : "border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1]"}`}
                  >
                    {y} anni
                  </button>
                ))}
              </div>
            </label>

            {/* Prompt textarea */}
            {(mode === "prompt" || mode === "both") && (
              <div className="mb-3">
                <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Descrivi il piano</span>
                <textarea
                  data-testid="quick-prompt"
                  rows={5}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Es. Compro 2 bilocali a Milano l'anno, canone 1.100/mese, leva 60%. Anno 3 vendo l'immobile con peggior rendimento…"
                  className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF] resize-none leading-relaxed"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {exampleProms.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(p)}
                      className="text-[10px] text-[#2563EB] bg-[#EFF6FF] hover:bg-[#DBEAFE] px-2 py-0.5 rounded-full transition"
                    >
                      Esempio {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Params */}
            {(mode === "params" || mode === "both") && (
              <div className="space-y-2 pt-2 border-t border-[#E2E8F0]">
                <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold mb-1">Parametri</div>
                <div className="grid grid-cols-2 gap-2">
                  <ParamField label="Acquisti/anno" v={params.acquisti_per_anno} onChange={(v) => setParams({ ...params, acquisti_per_anno: parseInt(v) || 1 })} type="number" testId="param-acquisti" />
                  <ParamSelect label="Tipologia" v={params.tipologia} onChange={(v) => setParams({ ...params, tipologia: v })} options={TIPOLOGIE} testId="param-tipologia" />
                  <ParamField label="Prezzo medio" v={params.prezzo_medio} onChange={(v) => setParams({ ...params, prezzo_medio: parseFloat(v) || 0 })} type="number" suffix="€" testId="param-prezzo" />
                  <ParamField label="Canone medio" v={params.canone_medio} onChange={(v) => setParams({ ...params, canone_medio: parseFloat(v) || 0 })} type="number" suffix="€/m" testId="param-canone" />
                  <ParamSelect label="Città" v={params.citta_preferita} onChange={(v) => setParams({ ...params, citta_preferita: v })} options={CITIES} testId="param-citta" />
                  <ParamField label="Leva mutuo" v={params.leva_pct} onChange={(v) => setParams({ ...params, leva_pct: parseFloat(v) || 0 })} type="number" suffix="%" testId="param-leva" />
                </div>
              </div>
            )}

            {/* Vincoli hard */}
            <div className="mt-4 pt-3 border-t border-[#E2E8F0]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert size={12} className="text-[#B45309]" />
                  <span className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">Vincoli hard</span>
                </div>
                <span className="text-[9px] text-[#94A3B8]">applicati durante la simulazione</span>
              </div>
              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="vincolo-blocca-cassa"
                  checked={vincoli.blocca_acquisti_cassa_negativa}
                  onChange={(e) => setVincoli({ ...vincoli, blocca_acquisti_cassa_negativa: e.target.checked })}
                  className="w-3.5 h-3.5 accent-[#B45309]"
                />
                <span className="text-xs text-[#0F172A]">Blocca acquisti se la cassa va sotto la riserva</span>
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Riserva minima liquidità</span>
                <div className="mt-1 flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus-within:border-[#0066FF]">
                  <input
                    type="number"
                    data-testid="vincolo-riserva"
                    value={vincoli.riserva_minima_liquidita || ""}
                    onChange={(e) => setVincoli({ ...vincoli, riserva_minima_liquidita: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="flex-1 bg-transparent px-2 py-1.5 outline-none text-sm min-w-0"
                  />
                  <span className="px-2 text-[10px] text-[#64748B]">€</span>
                </div>
                <span className="text-[9px] text-[#94A3B8] mt-0.5 block">Se &gt; 0, blocca acquisti che farebbero scendere la cassa sotto questa soglia</span>
              </label>
            </div>

            <button
              data-testid="quick-run"
              onClick={() => simulate()}
              disabled={loading || !canRun}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#0066FF] to-[#7C3AED] hover:opacity-90 text-white text-sm font-semibold disabled:opacity-50 transition"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {loading ? "Simulazione in corso…" : "Simula"}
            </button>
          </SectionCard>
        </div>

        {/* RIGHT — OUTPUT */}
        <div className="lg:col-span-3 space-y-4">
          {!result && !loading && (
            <SectionCard testId="quick-empty">
              <div className="text-center py-16">
                <Sparkles size={32} className="text-[#0066FF] mx-auto mb-3" />
                <div className="text-sm font-semibold text-[#0F172A] mb-1">Pronto a simulare</div>
                <div className="text-xs text-[#64748B] max-w-md mx-auto">
                  Compila a sinistra il piano o i parametri e clicca <b>Simula</b>. Vedrai apparire qui i grafici, la tabella anno-per-anno e gli alert proattivi.
                </div>
              </div>
            </SectionCard>
          )}

          {loading && (
            <SectionCard>
              <div className="py-16 flex flex-col items-center gap-3">
                <Loader2 size={32} className="text-[#0066FF] animate-spin" />
                <div className="text-xs text-[#64748B]">Calcolo proiezione…</div>
              </div>
            </SectionCard>
          )}

          {result && !loading && (
            <>
              {/* Verdict */}
              <div data-testid="quick-verdict" className="rounded-xl px-5 py-4 border flex items-start gap-3" style={{ background: verdictTone.bg, borderColor: verdictTone.border }}>
                <AlertTriangle size={20} className="shrink-0 mt-0.5" style={{ color: verdictTone.icon }} />
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color: verdictTone.text }}>{s.verdict}</div>
                  <div className="text-xs mt-1" style={{ color: verdictTone.text, opacity: 0.85 }}>
                    {s.alerts_critical} alert critici · {s.alerts_warning} warning · LTV finale {s.ltv_finale}%
                    {s.blocked_ops?.length > 0 && (
                      <> · <Ban size={11} className="inline mb-0.5" /> {s.blocked_ops.length} op. bloccate dai vincoli</>
                    )}
                  </div>
                </div>
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <KpiMini icon={TrendingUp} label="PN finale" value={eur(s.patrimonio_netto_finale)} sub={`Δ ${s.crescita_pct > 0 ? "+" : ""}${s.crescita_pct}%`} color={s.crescita_pct >= 0 ? "green" : "red"} />
                <KpiMini icon={Building2} label="Immobili" value={s.numero_immobili_finale} sub={`da ${result.simulation.snapshots[0].numero_immobili}`} />
                <KpiMini icon={Wallet} label="Cash flow cum." value={eur(s.cash_flow_cumulato)} color={s.cash_flow_cumulato >= 0 ? "green" : "red"} />
                <KpiMini icon={AlertTriangle} label="LTV finale" value={`${s.ltv_finale}%`} color={s.ltv_finale > 70 ? "red" : "green"} />
              </div>

              {/* Charts grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SectionCard testId="chart-pn" title="Patrimonio netto">
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={chartData}>
                      <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0066FF" stopOpacity={0.35} /><stop offset="100%" stopColor="#0066FF" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="anno" stroke="#64748B" fontSize={10} />
                      <YAxis stroke="#64748B" fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => eur(v)} />
                      <Area type="monotone" dataKey="pn" stroke="#0066FF" strokeWidth={2} fill="url(#g1)" name="PN" />
                    </AreaChart>
                  </ResponsiveContainer>
                </SectionCard>

                <SectionCard testId="chart-cf" title="Cash flow annuale">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="anno" stroke="#64748B" fontSize={10} />
                      <YAxis stroke="#64748B" fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => eur(v)} />
                      <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="3 3" />
                      <Bar dataKey="cf" fill="#059669" radius={[4, 4, 0, 0]} name="CF" />
                    </BarChart>
                  </ResponsiveContainer>
                </SectionCard>

                <SectionCard testId="chart-debt" title="Debito + LTV">
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="anno" stroke="#64748B" fontSize={10} />
                      <YAxis yAxisId="left" stroke="#64748B" fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis yAxisId="right" orientation="right" stroke="#64748B" fontSize={10} tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(v, n) => (n === "LTV" ? `${v}%` : eur(v))} />
                      <Bar yAxisId="left" dataKey="debito" fill="#DC2626" radius={[4, 4, 0, 0]} name="Debito" />
                      <Line yAxisId="right" type="monotone" dataKey="ltv" stroke="#B45309" strokeWidth={2} name="LTV" />
                      <ReferenceLine yAxisId="right" y={70} stroke="#DC2626" strokeDasharray="4 4" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </SectionCard>

                <SectionCard testId="chart-utile" title="Ricavi · Costi · Utile">
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={chartData.slice(1)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="anno" stroke="#64748B" fontSize={10} />
                      <YAxis stroke="#64748B" fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => eur(v)} />
                      <Bar dataKey="ricavi" fill="#0066FF" name="Ricavi" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="costi" fill="#94A3B8" name="Costi" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="utile" stroke="#059669" strokeWidth={2.5} name="Utile" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </SectionCard>
              </div>

              {/* Year-by-year table */}
              <SectionCard testId="quick-table" title="Anno per anno">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-[#E2E8F0] text-[10px] uppercase tracking-wider text-[#64748B]">
                      <tr>
                        <th className="text-left py-2 px-2">Anno</th>
                        <th className="text-right py-2 px-2">Imm.</th>
                        <th className="text-right py-2 px-2">PN</th>
                        <th className="text-right py-2 px-2">Canone/m</th>
                        <th className="text-right py-2 px-2">Utile</th>
                        <th className="text-right py-2 px-2">CF</th>
                        <th className="text-right py-2 px-2">LTV</th>
                        <th className="text-left py-2 px-2">Alert</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.simulation.snapshots.map((snap, i) => {
                        const alerts = snap.alerts || [];
                        const nCrit = alerts.filter((a) => a.severity === "critical").length;
                        const nWarn = alerts.filter((a) => a.severity === "warning").length;
                        const rowBg = nCrit > 0 ? "bg-[#FEF2F2]" : nWarn > 0 ? "bg-[#FFFBEB]" : "";
                        return (
                          <tr key={i} className={`border-b border-[#F1F5F9] ${rowBg} hover:bg-[#F8FAFC]`}>
                            <td className="py-1.5 px-2 font-medium">{snap.anno === 0 ? "Oggi" : `A${snap.anno}`}</td>
                            <td className="text-right py-1.5 px-2">{snap.numero_immobili}</td>
                            <td className="text-right py-1.5 px-2 font-semibold">{eur(snap.patrimonio_netto)}</td>
                            <td className="text-right py-1.5 px-2">{eur(snap.canone_mensile)}</td>
                            <td className={`text-right py-1.5 px-2 ${snap.utile_netto >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{eur(snap.utile_netto)}</td>
                            <td className={`text-right py-1.5 px-2 ${snap.cash_flow_annuo >= 0 ? "text-[#059669]" : "text-[#DC2626] font-semibold"}`}>{eur(snap.cash_flow_annuo)}</td>
                            <td className={`text-right py-1.5 px-2 ${snap.ltv > 70 ? "text-[#DC2626] font-semibold" : ""}`}>{snap.ltv}%</td>
                            <td className="py-1.5 px-2">
                              {alerts.length === 0 ? <span className="text-[10px] text-[#94A3B8]">—</span> : (
                                <div className="flex items-center gap-1">
                                  {nCrit > 0 && <span title={alerts.filter(a => a.severity === "critical").map(a => a.message).join("\n")} className="text-[10px] font-semibold bg-[#FECACA] text-[#991B1B] px-1.5 py-0.5 rounded cursor-help">{nCrit}c</span>}
                                  {nWarn > 0 && <span title={alerts.filter(a => a.severity === "warning").map(a => a.message).join("\n")} className="text-[10px] font-semibold bg-[#FDE68A] text-[#92400E] px-1.5 py-0.5 rounded cursor-help">{nWarn}w</span>}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              {/* Sensitivity what-if (sliders live, ricalcolo backend debounced) */}
              <SectionCard
                testId="quick-sensitivity"
                title="Stress test · what-if"
                subtitle="Sposta gli slider per vedere come cambia il piano. Calcolo in tempo reale."
                action={
                  <button
                    data-testid="sensitivity-reset"
                    onClick={resetSensitivity}
                    className="inline-flex items-center gap-1 text-[10px] text-[#64748B] hover:text-[#0F172A] transition"
                  >
                    <RotateCcw size={11} /> Reset
                  </button>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mb-4">
                  <SensSlider
                    label="Tasso mutuo"
                    value={sensitivity.delta_tasso_pct}
                    onChange={(v) => setSensitivity({ ...sensitivity, delta_tasso_pct: v })}
                    min={-1.5} max={3} step={0.25} suffix="%"
                    testId="sens-tasso"
                    tone="red"
                  />
                  <SensSlider
                    label="Canone affitto"
                    value={sensitivity.delta_canone_pct}
                    onChange={(v) => setSensitivity({ ...sensitivity, delta_canone_pct: v })}
                    min={-30} max={30} step={5} suffix="%"
                    testId="sens-canone"
                    tone="blue"
                  />
                  <SensSlider
                    label="Rivalutazione"
                    value={sensitivity.delta_rivalutazione_pct}
                    onChange={(v) => setSensitivity({ ...sensitivity, delta_rivalutazione_pct: v })}
                    min={-3} max={3} step={0.5} suffix="%"
                    testId="sens-rival"
                    tone="green"
                  />
                  <SensSlider
                    label="Vacancy"
                    value={sensitivity.vacancy_mesi_anno}
                    onChange={(v) => setSensitivity({ ...sensitivity, vacancy_mesi_anno: Math.round(v) })}
                    min={0} max={6} step={1} suffix=" m/anno"
                    testId="sens-vacancy"
                    tone="orange"
                  />
                </div>

                {/* Confronto Base vs Stress */}
                {sensResult ? (
                  <div data-testid="sens-result" className="grid grid-cols-3 gap-2">
                    <DeltaCard
                      label="PN finale"
                      base={result.simulation.summary.patrimonio_netto_finale}
                      stress={sensResult.summary.patrimonio_netto_finale}
                      eurFmt
                    />
                    <DeltaCard
                      label="Cash flow cum."
                      base={result.simulation.summary.cash_flow_cumulato}
                      stress={sensResult.summary.cash_flow_cumulato}
                      eurFmt
                    />
                    <DeltaCard
                      label="LTV finale"
                      base={result.simulation.summary.ltv_finale}
                      stress={sensResult.summary.ltv_finale}
                      pctFmt
                      reverseGood
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-[#94A3B8] py-2">
                    {sensLoading ? <><Loader2 size={12} className="animate-spin" /> Calcolo…</> : <><Activity size={12} /> Tutti gli slider a 0 — sposta per simulare uno stress</>}
                  </div>
                )}
              </SectionCard>

              {/* Tornado chart */}
              <SectionCard
                testId="quick-tornado"
                title="Tornado · sensibilità ai parametri"
                subtitle="Quale variabile ha l'impatto maggiore sul patrimonio netto finale"
                action={
                  !tornado && (
                    <button
                      data-testid="tornado-run"
                      onClick={runTornado}
                      disabled={tornadoLoading}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#0F172A] hover:bg-[#1E293B] text-white text-[11px] font-semibold disabled:opacity-50 transition"
                    >
                      {tornadoLoading ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                      {tornadoLoading ? "Calcolo…" : "Calcola tornado"}
                    </button>
                  )
                }
              >
                {!tornado && !tornadoLoading && (
                  <div className="text-xs text-[#94A3B8] py-3 text-center">
                    Clicca <b>Calcola tornado</b>: stresso ogni parametro ±range e ti dico quale conta di più.
                  </div>
                )}
                {tornadoLoading && (
                  <div className="flex items-center justify-center gap-2 text-xs text-[#64748B] py-6">
                    <Loader2 size={14} className="animate-spin" /> Calcolo 5 stress test in parallelo…
                  </div>
                )}
                {tornado && (
                  <TornadoChart base={tornado.base_pn} items={tornado.items} />
                )}
              </SectionCard>

              {/* Piano d'Azione AI — cosa fare per raggiungere gli obiettivi */}
              <SectionCard
                testId="quick-action-plan"
                title="Piano d'Azione AI"
                subtitle="Cosa fare nei prossimi 12-18 mesi per raggiungere gli obiettivi della simulazione"
                action={
                  <div className="flex items-center gap-2">
                    {actionPlan && (
                      <button
                        data-testid="accelerate-btn"
                        onClick={accelerateGrowth}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#0066FF] text-[#0066FF] hover:bg-[#EFF6FF] text-[11px] font-semibold disabled:opacity-50 transition"
                      >
                        <Rocket size={11} /> Accelera crescita
                      </button>
                    )}
                    {!actionPlan && (
                      <button
                        data-testid="action-plan-run"
                        onClick={runActionPlan}
                        disabled={actionPlanLoading}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#0066FF] hover:bg-[#2563EB] text-white text-[11px] font-semibold disabled:opacity-50 transition"
                      >
                        {actionPlanLoading ? <Loader2 size={11} className="animate-spin" /> : <Target size={11} />}
                        {actionPlanLoading ? "Generazione AI…" : "Genera piano d'azione"}
                      </button>
                    )}
                  </div>
                }
              >
                {!actionPlan && !actionPlanLoading && (
                  <div className="text-xs text-[#94A3B8] py-3 text-center">
                    {`Clicca `}<b>{`Genera piano d'azione`}</b>{`: l'AI produce 5-7 step concreti con priorità, tempi e KPI da monitorare.`}
                  </div>
                )}
                {actionPlanLoading && (
                  <div className="flex items-center justify-center gap-2 text-xs text-[#64748B] py-6">
                    <Loader2 size={14} className="animate-spin" /> Claude Sonnet 4.6 sta scrivendo il piano…
                  </div>
                )}
                {actionPlan && actionPlan.length > 0 && (
                  <ActionPlanList actions={actionPlan} />
                )}
              </SectionCard>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button data-testid="action-variant" onClick={() => simulate()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-sm text-[#475569] transition">
                  <RefreshCw size={13} /> Genera variante
                </button>
                <button data-testid="action-pdf" onClick={downloadPdf} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold transition">
                  <FileDown size={13} /> Scarica PDF Piano Industriale
                </button>
              </div>

              {/* AI chat about result */}
              <SectionCard testId="quick-ai-chat" title="Chiedi all'AI" subtitle="Domanda libera sul piano simulato" action={<MessageSquare size={14} className="text-[#0066FF]" />}>
                <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
                  {chatHistory.length === 0 && (
                    <div className="text-center text-xs text-[#94A3B8] py-3">
                      {`Domande tipo: `}<i>{`"Qual è l'anno più rischioso?" · "Come riduco l'LTV finale?" · "Cosa cambia se compro 1 in meno?"`}</i>
                    </div>
                  )}
                  {chatHistory.map((m, i) => (
                    <div key={i}>
                      <div className="text-xs bg-[#0066FF] text-white px-3 py-1.5 rounded-lg max-w-[85%] ml-auto mb-1.5">{m.user}</div>
                      {m.reply ? (
                        <div className="text-xs bg-[#F1F5F9] px-3 py-1.5 rounded-lg max-w-[90%] whitespace-pre-wrap leading-relaxed">{m.reply}</div>
                      ) : (
                        <div className="text-xs bg-[#F1F5F9] px-3 py-1.5 rounded-lg w-fit italic text-[#94A3B8]">scrivendo…</div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    data-testid="ai-chat-input"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !chatSending && askAI()}
                    placeholder="Scrivi una domanda…"
                    className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]"
                    disabled={chatSending}
                  />
                  <button onClick={askAI} disabled={chatSending || !chatInput.trim()} className="px-3 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm disabled:opacity-50">
                    {chatSending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                  </button>
                </div>
              </SectionCard>
            </>
          )}
        </div>
      </div>
  );

  if (embedded) return inner;
  return (
    <Layout
      title="Forecast"
      subtitle="Descrivi il tuo piano o usa i parametri rapidi · simulazione + grafici + report in 1 click"
    >
      {inner}
    </Layout>
  );
}

const KpiMini = ({ icon: Icon, label, value, sub, color }) => (
  <div className="bg-white border border-[#E2E8F0] rounded-xl p-3">
    <div className="flex items-center justify-between mb-1">
      <span className="text-[9px] uppercase tracking-wider text-[#64748B]">{label}</span>
      <Icon size={12} className="text-[#0066FF]" />
    </div>
    <div className={`text-lg font-display font-bold ${color === "red" ? "text-[#DC2626]" : color === "green" ? "text-[#059669]" : "text-[#0F172A]"}`}>{value}</div>
    {sub && <div className="text-[10px] text-[#64748B]">{sub}</div>}
  </div>
);

const ParamField = ({ label, v, onChange, type, suffix, testId }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
    <div className="mt-1 flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus-within:border-[#0066FF]">
      <input type={type} value={v ?? ""} onChange={(e) => onChange(e.target.value)} data-testid={testId} className="flex-1 bg-transparent px-2 py-1.5 outline-none text-sm min-w-0" />
      {suffix && <span className="px-2 text-[10px] text-[#64748B]">{suffix}</span>}
    </div>
  </label>
);

const ParamSelect = ({ label, v, onChange, options, testId }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
    <select data-testid={testId} value={v} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2 py-1.5 text-sm outline-none focus:border-[#0066FF]">
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </label>
);


const TONE = {
  red:    { accent: "#DC2626", track: "#FEE2E2" },
  blue:   { accent: "#0066FF", track: "#DBEAFE" },
  green:  { accent: "#059669", track: "#D1FAE5" },
  orange: { accent: "#B45309", track: "#FED7AA" },
};

const SensSlider = ({ label, value, onChange, min, max, step, suffix, testId, tone = "blue" }) => {
  const t = TONE[tone];
  const pctValue = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
        <span className="text-xs font-display font-bold" style={{ color: value !== 0 ? t.accent : "#0F172A" }}>
          {value > 0 ? "+" : ""}{value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        data-testid={testId}
        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${t.accent} 0%, ${t.accent} ${pctValue}%, #E2E8F0 ${pctValue}%, #E2E8F0 100%)`,
          accentColor: t.accent,
        }}
      />
      <div className="flex justify-between text-[9px] text-[#94A3B8] mt-0.5">
        <span>{min > 0 ? "" : ""}{min}{suffix}</span>
        <span>0</span>
        <span>+{max}{suffix}</span>
      </div>
    </div>
  );
};

const DeltaCard = ({ label, base, stress, eurFmt, pctFmt, reverseGood }) => {
  const delta = stress - base;
  const deltaPct = base ? (delta / Math.abs(base)) * 100 : 0;
  const isPositive = delta >= 0;
  const goodColor = "#059669";
  const badColor = "#DC2626";
  const deltaColor = (isPositive !== reverseGood) ? goodColor : badColor;
  const fmt = (v) => eurFmt ? `€ ${Math.round(v).toLocaleString("it-IT")}` : pctFmt ? `${v}%` : v;
  return (
    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-2.5">
      <div className="text-[9px] uppercase tracking-wider text-[#64748B] mb-1">{label}</div>
      <div className="text-xs text-[#94A3B8] line-through">{fmt(base)}</div>
      <div className="text-sm font-display font-bold text-[#0F172A]">{fmt(stress)}</div>
      <div className="text-[10px] font-semibold mt-0.5" style={{ color: deltaColor }}>
        {isPositive ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}%
      </div>
    </div>
  );
};

const TornadoChart = ({ base, items }) => {
  // largest swing first (already sorted by backend). Bars are centered at 0 (= base).
  const maxAbs = Math.max(...items.map((i) => Math.max(Math.abs(i.delta_pn_low), Math.abs(i.delta_pn_high))));
  const eurK = (v) => `${v >= 0 ? "+" : ""}€${Math.round(v / 1000)}k`;
  return (
    <div className="space-y-2">
      <div className="text-[10px] text-[#64748B] mb-2">
        Base PN finale: <b className="text-[#0F172A]">€ {Math.round(base).toLocaleString("it-IT")}</b> · barre = scostamento da base
      </div>
      {items.map((it) => {
        const leftW = (Math.abs(it.delta_pn_low) / maxAbs) * 50;
        const rightW = (Math.abs(it.delta_pn_high) / maxAbs) * 50;
        const leftColor = it.delta_pn_low < 0 ? "#DC2626" : "#059669";
        const rightColor = it.delta_pn_high > 0 ? "#059669" : "#DC2626";
        return (
          <div key={it.param} className="flex items-center gap-2">
            <div className="text-[10px] text-[#475569] w-32 shrink-0 truncate" title={it.param}>{it.param}</div>
            <div className="flex-1 flex h-5 relative">
              {/* LEFT side (low value) */}
              <div className="w-1/2 flex justify-end relative">
                <div
                  className="h-full rounded-l flex items-center justify-end pr-1"
                  style={{ width: `${leftW}%`, background: leftColor, opacity: 0.85 }}
                >
                  {leftW > 12 && <span className="text-[9px] text-white font-semibold">{eurK(it.delta_pn_low)}</span>}
                </div>
              </div>
              {/* center line */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#94A3B8]" />
              {/* RIGHT side (high value) */}
              <div className="w-1/2 flex justify-start relative">
                <div
                  className="h-full rounded-r flex items-center justify-start pl-1"
                  style={{ width: `${rightW}%`, background: rightColor, opacity: 0.85 }}
                >
                  {rightW > 12 && <span className="text-[9px] text-white font-semibold">{eurK(it.delta_pn_high)}</span>}
                </div>
              </div>
            </div>
            <div className="text-[10px] text-[#64748B] w-24 shrink-0 text-right">
              {it.low_value}{it.unit} → {it.high_value}{it.unit}
            </div>
          </div>
        );
      })}
      <div className="mt-3 text-[10px] text-[#64748B] bg-[#F1F5F9] rounded-md p-2">
        💡 La variabile in cima è quella che <b>conta di più</b> per il tuo piano. Quando rifai la simulazione, controlla soprattutto questa.
      </div>
    </div>
  );
};


const PRIO_META = {
  P0: { label: "URGENTE",   bg: "#FEE2E2", text: "#DC2626", border: "#FCA5A5", icon: "⚡" },
  P1: { label: "QUESTO Q",  bg: "#FEF3C7", text: "#B45309", border: "#FCD34D", icon: "◆" },
  P2: { label: "STRATEGICO", bg: "#DBEAFE", text: "#1E40AF", border: "#93C5FD", icon: "○" },
};
const CAT_META = {
  acquisto:      { color: "#059669", label: "Acquisto" },
  finanziamento: { color: "#7C3AED", label: "Finanziamento" },
  gestione:      { color: "#0066FF", label: "Gestione" },
  vendita:       { color: "#DC2626", label: "Vendita" },
  ottimizzazione: { color: "#B45309", label: "Ottimizzazione" },
  monitoraggio:  { color: "#64748B", label: "Monitoraggio" },
};

const ActionPlanList = ({ actions }) => {
  // group by priority
  const grouped = ["P0", "P1", "P2"].reduce((acc, p) => {
    acc[p] = actions.filter((a) => (a.priority || "P1") === p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {["P0", "P1", "P2"].map((p) => {
        const list = grouped[p];
        if (!list || list.length === 0) return null;
        const meta = PRIO_META[p];
        return (
          <div key={p}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded"
                style={{ background: meta.bg, color: meta.text, border: `1px solid ${meta.border}` }}
              >
                {meta.icon} {meta.label}
              </span>
              <div className="flex-1 h-px bg-[#E2E8F0]" />
              <span className="text-[10px] text-[#94A3B8]">{list.length} azion{list.length === 1 ? "e" : "i"}</span>
            </div>
            <div className="space-y-2">
              {list.map((a, i) => {
                const cat = CAT_META[a.category] || CAT_META.monitoraggio;
                return (
                  <div
                    key={`${p}-${i}`}
                    data-testid={`action-${p}-${i}`}
                    className="bg-white border border-[#E2E8F0] rounded-lg p-3 hover:border-[#CBD5E1] transition group"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
                        style={{ background: `${cat.color}15`, color: cat.color, border: `1px solid ${cat.color}40` }}
                      >
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-semibold text-[#0F172A]">{a.title}</span>
                          <span
                            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: `${cat.color}15`, color: cat.color }}
                          >
                            {cat.label}
                          </span>
                          {a.timeline && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-[#64748B]">
                              <Clock size={10} /> {a.timeline}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#475569] leading-relaxed">{a.description}</div>
                        {a.kpi && (
                          <div className="mt-1.5 inline-flex items-start gap-1.5 text-[10px] text-[#64748B]">
                            <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-[#059669]" />
                            <span><b className="text-[#475569]">KPI:</b> {a.kpi}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="text-[10px] text-[#64748B] bg-[#F1F5F9] rounded-md p-2 mt-2">
        💡 <b>P0</b> entro 30gg · <b>P1</b> entro Q corrente · <b>P2</b> orizzonte 12-18 mesi. Premi «<b>Accelera crescita</b>» per ricalcolare con leva massima e operazioni più aggressive.
      </div>
    </div>
  );
};
