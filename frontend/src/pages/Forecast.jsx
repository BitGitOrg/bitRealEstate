import { useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { toast } from "sonner";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine,
} from "recharts";
import {
  Sparkles, Plus, Trash2, Save, Calculator, FileDown, Copy, Send,
  Bot, GitCompare, TrendingUp, Building2, Wallet, AlertTriangle, Wand2,
} from "lucide-react";
import AIStrategistModal from "../components/forecast/AIStrategistModal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api/forecast`;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("crr_token")}` });

const OP_LABELS = {
  acquisto: "Acquisto immobile",
  vendita: "Vendita immobile",
  ristrutturazione: "Ristrutturazione",
  rinegoziazione_mutuo: "Rinegoziazione mutuo",
  sfitto: "Periodo sfitto",
  aumento_canone: "Aumento canone",
};
const OP_COLORS = {
  acquisto: "#059669",
  vendita: "#DC2626",
  ristrutturazione: "#B45309",
  rinegoziazione_mutuo: "#2563EB",
  sfitto: "#94A3B8",
  aumento_canone: "#0066FF",
};

const eur = (n) =>
  isFinite(n) ? `€ ${Math.round(n).toLocaleString("it-IT")}` : "—";

const blankScenario = () => ({
  nome: "Nuovo scenario",
  descrizione: "",
  horizon_years: 5,
  use_real_baseline: true,
  initial_patrimonio: 0,
  initial_debito: 0,
  initial_liquidita: 50000,
  initial_canone_mensile: 0,
  initial_rata_mutui: 0,
  initial_numero_immobili: 0,
  inflation_rate: 2,
  rivalutazione_immobili: 1.5,
  istat_canoni: 1.5,
  tassazione_pct: 26,
  operations: [],
});

// =============================================================
// Operation row editor
// =============================================================
const Field = ({ label, value, onChange, type = "number", suffix, w = "w-28" }) => (
  <label className="block">
    <span className="text-[9px] uppercase tracking-wider text-[#64748B] font-medium">{label}</span>
    <div className={`mt-1 flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus-within:border-[#0066FF] ${w}`}>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
        className="flex-1 bg-transparent px-2 py-1 outline-none text-xs min-w-0"
      />
      {suffix && <span className="px-1.5 text-[10px] text-[#64748B]">{suffix}</span>}
    </div>
  </label>
);

const OperationRow = ({ op, onChange, onRemove, horizon }) => {
  const upd = (k, v) => onChange({ ...op, [k]: v });
  return (
    <div data-testid={`op-row-${op.id}`} className="border border-[#E2E8F0] rounded-lg p-3 bg-white">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Anno" value={op.anno} onChange={(v) => upd("anno", Math.max(1, Math.min(horizon, parseInt(v) || 1)))} w="w-16" />
        <label className="block">
          <span className="text-[9px] uppercase tracking-wider text-[#64748B] font-medium">Tipo</span>
          <select
            value={op.tipo}
            onChange={(e) => upd("tipo", e.target.value)}
            className="mt-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md text-xs px-2 py-1.5 outline-none focus:border-[#0066FF]"
          >
            {Object.entries(OP_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <Field label="Descrizione" value={op.label} onChange={(v) => upd("label", v)} type="text" w="w-48" />
        {op.tipo === "acquisto" && (
          <>
            <Field label="Prezzo" value={op.prezzo} onChange={(v) => upd("prezzo", v)} suffix="€" />
            <Field label="Lavori" value={op.lavori} onChange={(v) => upd("lavori", v)} suffix="€" />
            <Field label="Canone" value={op.canone_mensile} onChange={(v) => upd("canone_mensile", v)} suffix="€/m" w="w-24" />
            <Field label="Mutuo %" value={op.mutuo_pct} onChange={(v) => upd("mutuo_pct", v)} suffix="0-1" w="w-20" />
            <Field label="Tasso" value={op.tasso_mutuo} onChange={(v) => upd("tasso_mutuo", v)} suffix="%" w="w-20" />
            <Field label="Durata" value={op.durata_mutuo} onChange={(v) => upd("durata_mutuo", v)} suffix="anni" w="w-20" />
          </>
        )}
        {op.tipo === "vendita" && (
          <Field label="Prezzo vendita" value={op.prezzo} onChange={(v) => upd("prezzo", v)} suffix="€" />
        )}
        {op.tipo === "ristrutturazione" && (
          <>
            <Field label="Costo lavori" value={op.lavori} onChange={(v) => upd("lavori", v)} suffix="€" />
            <Field label="Δ Canone" value={op.canone_mensile} onChange={(v) => upd("canone_mensile", v)} suffix="€/m" w="w-24" />
          </>
        )}
        {op.tipo === "rinegoziazione_mutuo" && (
          <>
            <Field label="Tasso attuale" value={op.tasso_mutuo} onChange={(v) => upd("tasso_mutuo", v)} suffix="%" w="w-24" />
            <Field label="Nuovo tasso" value={op.nuovo_tasso} onChange={(v) => upd("nuovo_tasso", v)} suffix="%" w="w-24" />
          </>
        )}
        {op.tipo === "sfitto" && (
          <Field label="Mesi sfitto" value={op.mesi} onChange={(v) => upd("mesi", v)} suffix="mesi" w="w-24" />
        )}
        {op.tipo === "aumento_canone" && (
          <>
            <Field label="Δ Canone €" value={op.canone_mensile} onChange={(v) => upd("canone_mensile", v)} suffix="€/m" w="w-24" />
            <Field label="Δ %" value={op.pct_canone} onChange={(v) => upd("pct_canone", v)} suffix="%" w="w-20" />
          </>
        )}
        <button
          data-testid={`op-remove-${op.id}`}
          onClick={onRemove}
          className="ml-auto p-2 text-[#DC2626] hover:bg-[#FEF2F2] rounded-md"
          title="Rimuovi operazione"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

// =============================================================
// AI Coach chat
// =============================================================
const AICoachPanel = ({ scenarioId }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (!scenarioId) return;
    fetch(`${API}/scenarios/${scenarioId}/ai/history`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setMessages)
      .catch(() => {});
  }, [scenarioId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const ask = async () => {
    if (!input.trim() || !scenarioId) return;
    const msg = input.trim();
    setInput("");
    setMessages((m) => [...m, { user_message: msg, reply: null, ts: new Date().toISOString() }]);
    setSending(true);
    try {
      const r = await fetch(`${API}/scenarios/${scenarioId}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ message: msg }),
      });
      if (!r.ok) throw new Error("AI error");
      const { reply } = await r.json();
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { ...copy[copy.length - 1], reply };
        return copy;
      });
    } catch {
      toast.error("Errore AI Coach");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  const presets = [
    "Lo scenario è sostenibile? Indica il giudizio finale.",
    "Analizza gli alert critici rilevati e dimmi come risolverli.",
    "In che anno è critica la liquidità e perché?",
    "Suggerisci 2 modifiche per portare l'LTV sotto il 60%.",
  ];

  return (
    <div className="flex flex-col h-[480px]">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1" data-testid="ai-coach-messages">
        {messages.length === 0 && (
          <div className="text-center text-xs text-[#94A3B8] mt-12">
            Chiedi all'AI Coach un parere sullo scenario in corso.
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {presets.map((p) => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  className="text-[11px] px-2.5 py-1.5 rounded-full border border-[#E2E8F0] hover:border-[#0066FF] hover:text-[#0066FF] transition"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="space-y-2">
            <div className="bg-[#0066FF] text-white text-xs px-3 py-2 rounded-lg max-w-[85%] ml-auto whitespace-pre-wrap">
              {m.user_message}
            </div>
            {m.reply ? (
              <div className="bg-[#F1F5F9] text-[#0F172A] text-xs px-3 py-2 rounded-lg max-w-[90%] whitespace-pre-wrap leading-relaxed">
                {m.reply}
              </div>
            ) : (
              <div className="bg-[#F1F5F9] text-[#94A3B8] text-xs px-3 py-2 rounded-lg w-fit italic">
                AI Coach sta scrivendo…
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="mt-3 flex gap-2 border-t border-[#E2E8F0] pt-3">
        <input
          data-testid="ai-coach-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !sending && ask()}
          placeholder="Chiedi un parere all'AI Coach…"
          className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]"
          disabled={sending || !scenarioId}
        />
        <button
          data-testid="ai-coach-send"
          onClick={ask}
          disabled={sending || !input.trim() || !scenarioId}
          className="px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
        >
          <Send size={13} /> {sending ? "…" : "Invia"}
        </button>
      </div>
    </div>
  );
};

// =============================================================
// Main page
// =============================================================
export default function Forecast() {
  const [scenarios, setScenarios] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [sim, setSim] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [compareResult, setCompareResult] = useState(null);
  const [activeTab, setActiveTab] = useState("editor");
  const [strategistOpen, setStrategistOpen] = useState(false);

  // ----- load scenarios on mount
  useEffect(() => {
    fetch(`${API}/scenarios`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((list) => {
        setScenarios(list);
        if (list.length > 0) setSelectedId(list[0].id);
      })
      .catch(() => toast.error("Errore caricamento scenari"));
  }, []);

  // ----- when selectedId changes, pull and run simulate
  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      setSim(null);
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${API}/scenarios/${selectedId}`, { headers: authHeaders() });
        if (!r.ok) throw new Error("not found");
        const data = await r.json();
        setDraft(data);
        runSim(selectedId);
      } catch {
        toast.error("Scenario non trovato");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const runSim = async (sid) => {
    setSimulating(true);
    try {
      const r = await fetch(`${API}/scenarios/${sid}/simulate`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error();
      setSim(await r.json());
    } catch {
      toast.error("Errore simulazione");
    } finally {
      setSimulating(false);
    }
  };

  // ----- actions
  const saveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const body = { ...draft };
      delete body.id;
      delete body.user_id;
      delete body.created_at;
      delete body.updated_at;
      const r = await fetch(`${API}/scenarios/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      toast.success("Scenario salvato");
      await runSim(selectedId);
      // refresh list (in case nome changed)
      const list = await (await fetch(`${API}/scenarios`, { headers: authHeaders() })).json();
      setScenarios(list);
    } catch {
      toast.error("Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const createNew = async () => {
    try {
      const r = await fetch(`${API}/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(blankScenario()),
      });
      const created = await r.json();
      const list = await (await fetch(`${API}/scenarios`, { headers: authHeaders() })).json();
      setScenarios(list);
      setSelectedId(created.id);
      toast.success("Scenario creato");
    } catch {
      toast.error("Errore creazione");
    }
  };

  const duplicateScenario = async () => {
    if (!draft) return;
    const body = { ...draft, nome: `${draft.nome} (copia)` };
    delete body.id;
    delete body.user_id;
    delete body.created_at;
    delete body.updated_at;
    try {
      const r = await fetch(`${API}/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      const created = await r.json();
      const list = await (await fetch(`${API}/scenarios`, { headers: authHeaders() })).json();
      setScenarios(list);
      setSelectedId(created.id);
      toast.success("Scenario duplicato");
    } catch {
      toast.error("Errore duplicazione");
    }
  };

  const removeScenario = async () => {
    if (!selectedId) return;
    if (!confirm("Eliminare definitivamente questo scenario?")) return;
    try {
      await fetch(`${API}/scenarios/${selectedId}`, { method: "DELETE", headers: authHeaders() });
      const list = await (await fetch(`${API}/scenarios`, { headers: authHeaders() })).json();
      setScenarios(list);
      setSelectedId(list[0]?.id || null);
      toast.success("Scenario rimosso");
    } catch {
      toast.error("Errore eliminazione");
    }
  };

  const downloadPdf = () => {
    if (!selectedId) return;
    const url = `${API}/scenarios/${selectedId}/pdf`;
    fetch(url, { headers: authHeaders() })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `piano_industriale_${draft?.nome?.replace(/\s+/g, "_") || "scenario"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(() => toast.error("Errore download PDF"));
  };

  const addOperation = () => {
    setDraft((d) => ({
      ...d,
      operations: [
        ...d.operations,
        {
          id: crypto.randomUUID(),
          anno: 1,
          tipo: "acquisto",
          label: "Nuova operazione",
          prezzo: 200000,
          lavori: 0,
          canone_mensile: 900,
          mutuo_pct: 0.7,
          tasso_mutuo: 3.0,
          durata_mutuo: 20,
        },
      ],
    }));
  };

  const runCompare = async () => {
    if (compareIds.length < 2) {
      toast.error("Seleziona almeno 2 scenari");
      return;
    }
    try {
      const r = await fetch(`${API}/scenarios/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ scenario_ids: compareIds }),
      });
      setCompareResult(await r.json());
    } catch {
      toast.error("Errore confronto");
    }
  };

  // -------- derived chart data
  const chartData = useMemo(() => {
    if (!sim) return [];
    return sim.snapshots.map((s) => ({
      anno: s.anno === 0 ? "Oggi" : `A${s.anno}`,
      patrimonio_netto: s.patrimonio_netto,
      valore_immobili: s.valore_immobili,
      debito: s.debito_residuo,
      cash_flow: s.cash_flow_annuo,
      utile: s.utile_netto,
      ricavi: s.ricavi_annui,
      costi: s.costi_annui,
      ltv: s.ltv,
      liquidita: s.liquidita,
      immobili: s.numero_immobili,
    }));
  }, [sim]);

  return (
    <Layout
      title="Forecast & Piano Industriale"
      subtitle="Simulazione pluri-annuale con operazioni, AI Coach e confronto scenari"
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <button
            data-testid="open-ai-strategist"
            onClick={() => setStrategistOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-[#0066FF] to-[#7C3AED] hover:from-[#2563EB] hover:to-[#6D28D9] text-white text-sm font-semibold shadow-sm transition"
          >
            <Wand2 size={14} /> AI Strategist
          </button>
          <select
            data-testid="scenario-picker"
            value={selectedId || ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm min-w-[180px] focus:border-[#0066FF] outline-none"
          >
            {scenarios.length === 0 && <option value="">Nessuno scenario</option>}
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
          <button
            data-testid="scenario-new"
            onClick={createNew}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm font-medium"
          >
            <Plus size={14} /> Nuovo
          </button>
          <button
            data-testid="scenario-duplicate"
            onClick={duplicateScenario}
            disabled={!selectedId}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-sm disabled:opacity-50"
          >
            <Copy size={13} /> Duplica
          </button>
          <button
            data-testid="scenario-pdf"
            onClick={downloadPdf}
            disabled={!selectedId}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-sm disabled:opacity-50"
          >
            <FileDown size={13} /> PDF
          </button>
          <button
            data-testid="scenario-delete"
            onClick={removeScenario}
            disabled={!selectedId}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] hover:bg-[#FEF2F2] hover:border-[#DC2626] text-[#DC2626] text-sm disabled:opacity-50"
          >
            <Trash2 size={13} /> Elimina
          </button>
        </div>
      }
    >
      {/* Empty state */}
      {scenarios.length === 0 && (
        <SectionCard testId="forecast-empty" title="Nessuno scenario ancora">
          <div className="text-center py-10">
            <Sparkles size={32} className="text-[#0066FF] mx-auto mb-3" />
            <p className="text-sm text-[#475569] mb-4">Crea il tuo primo scenario pluri-annuale per simulare come evolverà il portafoglio.</p>
            <button onClick={createNew} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm font-medium">
              <Plus size={14} /> Crea il primo scenario
            </button>
          </div>
        </SectionCard>
      )}

      {/* Tabs */}
      {draft && (
        <>
          <div className="flex gap-1 mb-4 border-b border-[#E2E8F0]">
            {[
              { id: "editor", label: "Editor", icon: Calculator },
              { id: "risultati", label: "Risultati", icon: TrendingUp },
              { id: "ai", label: "AI Coach", icon: Bot, accent: true },
              { id: "compare", label: "Confronta", icon: GitCompare },
            ].map((t) => {
              const Ico = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  data-testid={`forecast-tab-${t.id}`}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${active ? "border-[#0066FF] text-[#0066FF]" : "border-transparent text-[#64748B] hover:text-[#0F172A]"}`}
                >
                  <Ico size={14} /> {t.label}
                  {t.accent && <span className="text-[8px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-[rgba(0,102,255,0.15)] text-[#2563EB]">AI</span>}
                </button>
              );
            })}
          </div>

          {activeTab === "editor" && (
            <>
              <SectionCard testId="scenario-meta" title="Parametri scenario" className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <label className="block md:col-span-2">
                    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Nome scenario</span>
                    <input
                      data-testid="scenario-nome"
                      value={draft.nome}
                      onChange={(e) => setDraft({ ...draft, nome: e.target.value })}
                      className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Orizzonte</span>
                    <select
                      data-testid="scenario-horizon"
                      value={draft.horizon_years}
                      onChange={(e) => setDraft({ ...draft, horizon_years: parseInt(e.target.value) })}
                      className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]"
                    >
                      <option value={3}>3 anni</option>
                      <option value={5}>5 anni</option>
                      <option value={10}>10 anni</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Baseline</span>
                    <select
                      data-testid="scenario-baseline"
                      value={draft.use_real_baseline ? "real" : "custom"}
                      onChange={(e) => setDraft({ ...draft, use_real_baseline: e.target.value === "real" })}
                      className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]"
                    >
                      <option value="real">Dati reali società</option>
                      <option value="custom">Input manuale</option>
                    </select>
                  </label>
                  <label className="block md:col-span-4">
                    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Descrizione (opzionale)</span>
                    <input
                      value={draft.descrizione || ""}
                      onChange={(e) => setDraft({ ...draft, descrizione: e.target.value })}
                      placeholder="Es. acquisto 2 immobili/anno con leva 70%"
                      className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]"
                    />
                  </label>
                </div>

                {!draft.use_real_baseline && (
                  <div className="mt-4 pt-4 border-t border-[#E2E8F0]">
                    <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-medium mb-3">Stato iniziale (input manuale)</div>
                    <div className="flex flex-wrap gap-3">
                      <Field label="N° immobili" value={draft.initial_numero_immobili} onChange={(v) => setDraft({ ...draft, initial_numero_immobili: parseInt(v) || 0 })} />
                      <Field label="Patrimonio" value={draft.initial_patrimonio} onChange={(v) => setDraft({ ...draft, initial_patrimonio: v })} suffix="€" />
                      <Field label="Debito" value={draft.initial_debito} onChange={(v) => setDraft({ ...draft, initial_debito: v })} suffix="€" />
                      <Field label="Liquidità" value={draft.initial_liquidita} onChange={(v) => setDraft({ ...draft, initial_liquidita: v })} suffix="€" />
                      <Field label="Canone/mese" value={draft.initial_canone_mensile} onChange={(v) => setDraft({ ...draft, initial_canone_mensile: v })} suffix="€" />
                      <Field label="Rata mutui/mese" value={draft.initial_rata_mutui} onChange={(v) => setDraft({ ...draft, initial_rata_mutui: v })} suffix="€" />
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-[#E2E8F0]">
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-medium mb-3">Assunzioni macro</div>
                  <div className="flex flex-wrap gap-3">
                    <Field label="Rivalut. immobili" value={draft.rivalutazione_immobili} onChange={(v) => setDraft({ ...draft, rivalutazione_immobili: v })} suffix="%/y" />
                    <Field label="ISTAT canoni" value={draft.istat_canoni} onChange={(v) => setDraft({ ...draft, istat_canoni: v })} suffix="%/y" />
                    <Field label="Inflazione" value={draft.inflation_rate} onChange={(v) => setDraft({ ...draft, inflation_rate: v })} suffix="%/y" />
                    <Field label="Tassazione utile" value={draft.tassazione_pct} onChange={(v) => setDraft({ ...draft, tassazione_pct: v })} suffix="%" />
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                testId="scenario-operations"
                title="Operazioni pianificate"
                subtitle={`${draft.operations.length} operazioni · trascina anno e tipo per personalizzare`}
                action={
                  <button
                    data-testid="op-add"
                    onClick={addOperation}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-medium"
                  >
                    <Plus size={12} /> Aggiungi operazione
                  </button>
                }
                className="mb-4"
              >
                {draft.operations.length === 0 ? (
                  <div className="text-center py-8 text-sm text-[#94A3B8]">
                    Nessuna operazione. Inizia ad aggiungerne una per vedere l'effetto sul forecast.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...draft.operations]
                      .sort((a, b) => a.anno - b.anno)
                      .map((op) => (
                        <OperationRow
                          key={op.id}
                          op={op}
                          horizon={draft.horizon_years}
                          onChange={(updated) =>
                            setDraft((d) => ({
                              ...d,
                              operations: d.operations.map((o) => (o.id === op.id ? updated : o)),
                            }))
                          }
                          onRemove={() =>
                            setDraft((d) => ({
                              ...d,
                              operations: d.operations.filter((o) => o.id !== op.id),
                            }))
                          }
                        />
                      ))}
                  </div>
                )}
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button
                  data-testid="scenario-save"
                  onClick={saveDraft}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-sm font-medium disabled:opacity-50"
                >
                  <Save size={14} /> {saving ? "Salvataggio…" : "Salva e simula"}
                </button>
              </div>
            </>
          )}

          {activeTab === "risultati" && (
            <ResultsView sim={sim} chartData={chartData} loading={simulating} />
          )}

          {activeTab === "ai" && (
            <SectionCard testId="ai-coach" title="AI Coach" subtitle="Discuti lo scenario con Claude — ha accesso a tutti i dati della proiezione" action={<Bot size={16} className="text-[#0066FF]" />}>
              <AICoachPanel scenarioId={selectedId} />
            </SectionCard>
          )}

          {activeTab === "compare" && (
            <CompareView
              scenarios={scenarios}
              compareIds={compareIds}
              setCompareIds={setCompareIds}
              compareResult={compareResult}
              runCompare={runCompare}
            />
          )}
        </>
      )}

      <AIStrategistModal
        open={strategistOpen}
        onClose={() => setStrategistOpen(false)}
        onAccepted={async (newId) => {
          // refresh list & switch to the new scenario
          const list = await (await fetch(`${API}/scenarios`, { headers: authHeaders() })).json();
          setScenarios(list);
          if (newId) setSelectedId(newId);
          setActiveTab("risultati");
        }}
        onAllAccepted={async (newIds) => {
          // refresh list, pre-select all 3 for comparison and switch to Compare tab
          const list = await (await fetch(`${API}/scenarios`, { headers: authHeaders() })).json();
          setScenarios(list);
          setCompareIds(newIds);
          // immediately run compare
          try {
            const r = await fetch(`${API}/scenarios/compare`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify({ scenario_ids: newIds }),
            });
            setCompareResult(await r.json());
          } catch (_) { /* no-op */ }
          setActiveTab("compare");
        }}
      />
    </Layout>
  );
}

// =============================================================
// Results view
// =============================================================
const KpiCard = ({ icon: Icon, label, value, sub, accent }) => (
  <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[10px] uppercase tracking-wider text-[#64748B]">{label}</span>
      <Icon size={14} className="text-[#0066FF]" />
    </div>
    <div className={`text-xl font-display font-bold ${accent === "red" ? "text-[#DC2626]" : accent === "green" ? "text-[#059669]" : "text-[#0F172A]"}`}>{value}</div>
    {sub && <div className="text-[11px] text-[#64748B] mt-0.5">{sub}</div>}
  </div>
);

const ResultsView = ({ sim, chartData, loading }) => {
  if (loading) return <SectionCard><div className="text-center py-8 text-sm text-[#94A3B8]">Calcolo proiezione…</div></SectionCard>;
  if (!sim) return <SectionCard><div className="text-center py-8 text-sm text-[#94A3B8]">Nessuna simulazione disponibile</div></SectionCard>;
  const s = sim.summary;
  const growthColor = s.crescita_pct >= 0 ? "green" : "red";
  const verdictTone = s.verdict_severity === "critical"
    ? { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", icon: "#DC2626" }
    : s.verdict_severity === "warning"
      ? { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", icon: "#B45309" }
      : { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", icon: "#059669" };
  return (
    <>
      {/* Verdict + alert summary banner */}
      <div
        data-testid="verdict-banner"
        className="mb-4 rounded-xl px-5 py-4 border flex items-start gap-3"
        style={{ background: verdictTone.bg, borderColor: verdictTone.border }}
      >
        <AlertTriangle size={20} className="shrink-0 mt-0.5" style={{ color: verdictTone.icon }} />
        <div className="flex-1">
          <div className="text-sm font-semibold" style={{ color: verdictTone.text }}>{s.verdict}</div>
          <div className="text-xs mt-1" style={{ color: verdictTone.text, opacity: 0.85 }}>
            {s.alerts_critical} alert critici · {s.alerts_warning} warning ·
            {s.years_with_high_ltv?.length > 0 && <> LTV sopra soglia: anni {s.years_with_high_ltv.join(", ")} ·</>}
            {s.years_with_neg_cash_flow?.length > 0 && <> CF negativo: anni {s.years_with_neg_cash_flow.join(", ")} ·</>}
            {s.first_year_negative_liquidity && <> liquidità negativa dall'anno {s.first_year_negative_liquidity}</>}
            {!s.years_with_high_ltv?.length && !s.years_with_neg_cash_flow?.length && !s.first_year_negative_liquidity && (
              <> nessuna criticità grave rilevata</>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard icon={TrendingUp} label="Patrimonio finale" value={eur(s.patrimonio_netto_finale)} sub={`Δ ${s.crescita_pct > 0 ? "+" : ""}${s.crescita_pct}%`} accent={growthColor} />
        <KpiCard icon={Building2} label="Immobili finali" value={s.numero_immobili_finale} sub={`da ${sim.snapshots[0].numero_immobili}`} />
        <KpiCard icon={Wallet} label="Cash flow cumulato" value={eur(s.cash_flow_cumulato)} sub={`Ricavi ${eur(s.ricavi_totali_periodo)}`} accent={s.cash_flow_cumulato >= 0 ? "green" : "red"} />
        <KpiCard icon={AlertTriangle} label="LTV finale" value={`${s.ltv_finale}%`} sub={s.ltv_finale > 70 ? "Sopra soglia 70%" : "Sostenibile"} accent={s.ltv_finale > 70 ? "red" : "green"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard testId="chart-patrimonio" title="Patrimonio netto pluri-anno">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0066FF" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0066FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="anno" stroke="#64748B" fontSize={11} />
              <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => eur(v)} />
              <Area type="monotone" dataKey="patrimonio_netto" stroke="#0066FF" strokeWidth={2} fill="url(#g1)" name="Patrimonio netto" />
            </AreaChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard testId="chart-cashflow" title="Cash flow annuale">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="anno" stroke="#64748B" fontSize={11} />
              <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => eur(v)} />
              <Bar dataKey="cash_flow" fill="#059669" radius={[4, 4, 0, 0]} name="Cash flow netto" />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard testId="chart-debito" title="Esposizione debitoria e LTV">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="anno" stroke="#64748B" fontSize={11} />
              <YAxis yAxisId="left" stroke="#64748B" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" stroke="#64748B" fontSize={11} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v, n) => (n === "LTV" ? `${v}%` : eur(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="debito" fill="#DC2626" radius={[4, 4, 0, 0]} name="Debito residuo" />
              <Line yAxisId="right" type="monotone" dataKey="ltv" stroke="#B45309" strokeWidth={2} name="LTV" />
              <ReferenceLine yAxisId="right" y={70} stroke="#DC2626" strokeDasharray="4 4" label={{ value: "Soglia LTV 70%", fill: "#DC2626", fontSize: 10, position: "insideTopRight" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard testId="chart-ricavi-utile" title="Ricavi · Costi · Utile">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData.slice(1)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="anno" stroke="#64748B" fontSize={11} />
              <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => eur(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="ricavi" fill="#0066FF" name="Ricavi" radius={[4, 4, 0, 0]} />
              <Bar dataKey="costi" fill="#94A3B8" name="Costi" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="utile" stroke="#059669" strokeWidth={2.5} name="Utile netto" />
              <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="3 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <SectionCard testId="yearly-table" title="Dettaglio anno per anno" subtitle="Le righe critiche sono evidenziate. Passa con il mouse sui badge alert per vedere i dettagli.">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-[#E2E8F0] text-[10px] uppercase tracking-wider text-[#64748B]">
              <tr>
                <th className="text-left py-2 px-2">Anno</th>
                <th className="text-right py-2 px-2">Immobili</th>
                <th className="text-right py-2 px-2">Val. patrimonio</th>
                <th className="text-right py-2 px-2">Debito</th>
                <th className="text-right py-2 px-2">Patrimonio netto</th>
                <th className="text-right py-2 px-2">Canone/mese</th>
                <th className="text-right py-2 px-2">Utile netto</th>
                <th className="text-right py-2 px-2">Cash flow</th>
                <th className="text-right py-2 px-2">LTV</th>
                <th className="text-left py-2 px-2">Alert</th>
              </tr>
            </thead>
            <tbody>
              {sim.snapshots.map((snap, i) => {
                const alerts = snap.alerts || [];
                const nCrit = alerts.filter((a) => a.severity === "critical").length;
                const nWarn = alerts.filter((a) => a.severity === "warning").length;
                const rowBg = nCrit > 0 ? "bg-[#FEF2F2]" : nWarn > 0 ? "bg-[#FFFBEB]" : "hover:bg-[#F8FAFC]";
                return (
                  <tr key={i} className={`border-b border-[#F1F5F9] ${rowBg}`} data-testid={`year-row-${snap.anno}`}>
                    <td className="py-2 px-2 font-medium">{snap.anno === 0 ? "Oggi" : `Anno ${snap.anno}`}</td>
                    <td className="text-right py-2 px-2">{snap.numero_immobili}</td>
                    <td className="text-right py-2 px-2">{eur(snap.valore_immobili)}</td>
                    <td className="text-right py-2 px-2 text-[#DC2626]">{eur(snap.debito_residuo)}</td>
                    <td className="text-right py-2 px-2 font-semibold">{eur(snap.patrimonio_netto)}</td>
                    <td className="text-right py-2 px-2">{eur(snap.canone_mensile)}</td>
                    <td className={`text-right py-2 px-2 ${snap.utile_netto >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{eur(snap.utile_netto)}</td>
                    <td className={`text-right py-2 px-2 ${snap.cash_flow_annuo >= 0 ? "text-[#059669]" : "text-[#DC2626] font-semibold"}`}>{eur(snap.cash_flow_annuo)}</td>
                    <td className={`text-right py-2 px-2 ${snap.ltv > 70 ? "text-[#DC2626] font-semibold" : "text-[#0F172A]"}`}>{snap.ltv}%</td>
                    <td className="py-2 px-2">
                      {alerts.length === 0 ? (
                        <span className="text-[10px] text-[#94A3B8]">—</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          {nCrit > 0 && (
                            <span
                              title={alerts.filter((a) => a.severity === "critical").map((a) => a.message).join("\n")}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FECACA] text-[#991B1B] cursor-help"
                              data-testid={`alert-critical-${snap.anno}`}
                            >
                              <AlertTriangle size={9} /> {nCrit}
                            </span>
                          )}
                          {nWarn > 0 && (
                            <span
                              title={alerts.filter((a) => a.severity === "warning").map((a) => a.message).join("\n")}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FDE68A] text-[#92400E] cursor-help"
                              data-testid={`alert-warning-${snap.anno}`}
                            >
                              <AlertTriangle size={9} /> {nWarn}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Detailed alert list below the table */}
        {(s.alerts_critical > 0 || s.alerts_warning > 0) && (
          <div className="mt-4 pt-4 border-t border-[#E2E8F0]" data-testid="alert-detail-list">
            <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-medium mb-2">Tutti gli alert proattivi rilevati</div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {sim.snapshots.flatMap((snap) =>
                (snap.alerts || []).map((a, idx) => (
                  <div
                    key={`${snap.anno}-${idx}`}
                    className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded ${a.severity === "critical" ? "bg-[#FEF2F2] text-[#991B1B]" : "bg-[#FFFBEB] text-[#92400E]"}`}
                  >
                    <span className={`shrink-0 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${a.severity === "critical" ? "bg-[#FECACA]" : "bg-[#FDE68A]"}`}>
                      {a.severity === "critical" ? "Critical" : "Warning"}
                    </span>
                    <span className="shrink-0 text-[10px] font-medium text-[#64748B]">{snap.anno === 0 ? "Oggi" : `Anno ${snap.anno}`}</span>
                    <span className="flex-1">{a.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </SectionCard>
    </>
  );
};

// =============================================================
// Compare view
// =============================================================
const CompareView = ({ scenarios, compareIds, setCompareIds, compareResult, runCompare }) => {
  const toggle = (sid) => {
    setCompareIds((arr) =>
      arr.includes(sid) ? arr.filter((x) => x !== sid) : arr.length >= 3 ? arr : [...arr, sid]
    );
  };
  const colors = ["#0066FF", "#059669", "#B45309", "#DC2626"];
  return (
    <>
      <SectionCard testId="compare-picker" title="Seleziona scenari da confrontare" subtitle="Massimo 3 scenari" className="mb-4">
        <div className="flex flex-wrap gap-2">
          {scenarios.map((s) => {
            const active = compareIds.includes(s.id);
            return (
              <button
                key={s.id}
                data-testid={`compare-pick-${s.id}`}
                onClick={() => toggle(s.id)}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${active ? "bg-[#0066FF] text-white border-[#0066FF]" : "border-[#E2E8F0] text-[#475569] hover:border-[#0066FF]"}`}
              >
                {s.nome}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            data-testid="compare-run"
            onClick={runCompare}
            disabled={compareIds.length < 2}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-medium"
          >
            <GitCompare size={14} /> Confronta {compareIds.length} scenari
          </button>
        </div>
      </SectionCard>

      {compareResult && compareResult.scenarios.length > 0 && (
        <>
          <SectionCard testId="compare-summary" title="Riepilogo confronto" className="mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-[#E2E8F0] text-[10px] uppercase tracking-wider text-[#64748B]">
                  <tr>
                    <th className="text-left py-2 px-2">Scenario</th>
                    <th className="text-right py-2 px-2">PN iniziale</th>
                    <th className="text-right py-2 px-2">PN finale</th>
                    <th className="text-right py-2 px-2">Crescita %</th>
                    <th className="text-right py-2 px-2">Utile totale</th>
                    <th className="text-right py-2 px-2">CF cumulato</th>
                    <th className="text-right py-2 px-2">LTV finale</th>
                    <th className="text-right py-2 px-2">Immobili</th>
                  </tr>
                </thead>
                <tbody>
                  {compareResult.scenarios.map((s, idx) => (
                    <tr key={s.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                      <td className="py-2 px-2 font-medium flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ background: colors[idx] }}></span>
                        {s.nome}
                      </td>
                      <td className="text-right py-2 px-2">{eur(s.result.summary.patrimonio_netto_iniziale)}</td>
                      <td className="text-right py-2 px-2 font-semibold">{eur(s.result.summary.patrimonio_netto_finale)}</td>
                      <td className={`text-right py-2 px-2 ${s.result.summary.crescita_pct >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{s.result.summary.crescita_pct}%</td>
                      <td className="text-right py-2 px-2">{eur(s.result.summary.utile_totale_periodo)}</td>
                      <td className="text-right py-2 px-2">{eur(s.result.summary.cash_flow_cumulato)}</td>
                      <td className={`text-right py-2 px-2 ${s.result.summary.ltv_finale > 70 ? "text-[#DC2626]" : ""}`}>{s.result.summary.ltv_finale}%</td>
                      <td className="text-right py-2 px-2">{s.result.summary.numero_immobili_finale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard testId="compare-chart" title="Evoluzione patrimonio netto a confronto">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="anno" stroke="#64748B" fontSize={11} type="category" allowDuplicatedCategory={false} />
                <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => eur(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {compareResult.scenarios.map((s, idx) => (
                  <Line
                    key={s.id}
                    data={s.result.snapshots.map((sn) => ({
                      anno: sn.anno === 0 ? "Oggi" : `A${sn.anno}`,
                      pn: sn.patrimonio_netto,
                    }))}
                    dataKey="pn"
                    stroke={colors[idx]}
                    strokeWidth={2.5}
                    name={s.nome}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>
        </>
      )}
    </>
  );
};
