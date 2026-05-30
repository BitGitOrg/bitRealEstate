import { useState } from "react";
import { toast } from "sonner";
import { Wand2, X, CheckCircle2, AlertTriangle, Loader2, ListChecks, Target, Save, Sparkles } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api/forecast`;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("crr_token")}` });

const eur = (n) => (isFinite(n) ? `€ ${Math.round(n).toLocaleString("it-IT")}` : "—");

const OP_LABELS = {
  acquisto: "Acquisto",
  vendita: "Vendita",
  ristrutturazione: "Ristrutturazione",
  rinegoziazione_mutuo: "Rinegoz. mutuo",
  sfitto: "Sfitto",
  aumento_canone: "Aumento canone",
};

const OP_BADGE = {
  acquisto: "bg-[#ECFDF5] text-[#065F46]",
  vendita: "bg-[#FEF2F2] text-[#991B1B]",
  ristrutturazione: "bg-[#FFFBEB] text-[#92400E]",
  rinegoziazione_mutuo: "bg-[#EFF6FF] text-[#1E40AF]",
  sfitto: "bg-[#F1F5F9] text-[#475569]",
  aumento_canone: "bg-[#F0F9FF] text-[#0369A1]",
};

const Field = ({ label, value, onChange, type = "number", suffix }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
    <div className="mt-1 flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg focus-within:border-[#0066FF]">
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) =>
          onChange(type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)
        }
        className="flex-1 bg-transparent px-3 py-2 outline-none text-sm min-w-0"
      />
      {suffix && <span className="px-3 text-xs text-[#64748B]">{suffix}</span>}
    </div>
  </label>
);

export default function AIStrategistModal({ open, onClose, onAccepted }) {
  const [step, setStep] = useState("form"); // form | loading | result
  const [form, setForm] = useState({
    target_patrimonio_netto: 1000000,
    horizon_years: 5,
    max_ltv: 60,
    capitale_disponibile: 250000,
    strategia: "mista",
    propensione_rischio: "media",
    vincoli_extra: "",
  });
  const [result, setResult] = useState(null);
  const [savingAccept, setSavingAccept] = useState(false);

  if (!open) return null;

  const reset = () => {
    setStep("form");
    setResult(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const runOptimize = async () => {
    setStep("loading");
    try {
      const r = await fetch(`${API}/auto-optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ...form, save: false }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: "Errore AI Strategist" }));
        throw new Error(err.detail || "Errore");
      }
      const data = await r.json();
      setResult(data);
      setStep("result");
    } catch (e) {
      toast.error(e.message || "Errore AI Strategist");
      setStep("form");
    }
  };

  const acceptAndSave = async () => {
    setSavingAccept(true);
    try {
      const r = await fetch(`${API}/auto-optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ...form, save: true }),
      });
      if (!r.ok) throw new Error("Errore salvataggio");
      const data = await r.json();
      toast.success("Piano salvato come nuovo scenario");
      onAccepted?.(data.saved_id);
      close();
    } catch {
      toast.error("Errore salvataggio scenario");
    } finally {
      setSavingAccept(false);
    }
  };

  const goal = result?.goal_summary;
  const goalOk = goal?.target_raggiunto && goal?.ltv_rispettato;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(15,23,42,0.45)] backdrop-blur-sm" data-testid="ai-strategist-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-gradient-to-r from-[#EFF6FF] to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0066FF] flex items-center justify-center">
              <Wand2 size={18} className="text-white" />
            </div>
            <div>
              <div className="font-display font-bold text-lg text-[#0F172A]">AI Strategist</div>
              <div className="text-xs text-[#64748B]">Genera automaticamente il piano operativo ottimale per il tuo obiettivo</div>
            </div>
          </div>
          <button
            data-testid="ai-strategist-close"
            onClick={close}
            className="p-2 hover:bg-white rounded-lg transition"
          >
            <X size={18} className="text-[#64748B]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === "form" && (
            <>
              <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 mb-5 flex gap-3">
                <Sparkles size={18} className="text-[#0066FF] shrink-0 mt-0.5" />
                <div className="text-xs text-[#1E40AF] leading-relaxed">
                  <b>Come funziona</b>: dichiari obiettivo + vincoli, l'AI analizza lo stato reale della società
                  (immobili, debito, liquidità, settings) e progetta la sequenza ottimale di operazioni anno per anno
                  per raggiungerlo. Il piano generato viene immediatamente simulato così vedi se l'obiettivo è realmente
                  raggiungibile, e poi puoi salvarlo come scenario.
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[#64748B] font-semibold mb-2 flex items-center gap-1.5">
                    <Target size={12} /> Obiettivo
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field
                      label="Patrimonio netto target"
                      value={form.target_patrimonio_netto}
                      onChange={(v) => setForm({ ...form, target_patrimonio_netto: v })}
                      suffix="€"
                    />
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Orizzonte</span>
                      <select
                        value={form.horizon_years}
                        onChange={(e) => setForm({ ...form, horizon_years: parseInt(e.target.value) })}
                        className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]"
                      >
                        <option value={3}>3 anni</option>
                        <option value={5}>5 anni</option>
                        <option value={10}>10 anni</option>
                      </select>
                    </label>
                    <Field
                      label="LTV massimo accettato"
                      value={form.max_ltv}
                      onChange={(v) => setForm({ ...form, max_ltv: v })}
                      suffix="%"
                    />
                  </div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[#64748B] font-semibold mb-2">
                    Risorse e profilo
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field
                      label="Capitale proprio disponibile"
                      value={form.capitale_disponibile}
                      onChange={(v) => setForm({ ...form, capitale_disponibile: v })}
                      suffix="€"
                    />
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Strategia preferita</span>
                      <select
                        value={form.strategia}
                        onChange={(e) => setForm({ ...form, strategia: e.target.value })}
                        className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]"
                      >
                        <option value="reddito">Reddito (affitto a lungo termine)</option>
                        <option value="rivendita">Rivendita (flip)</option>
                        <option value="mista">Mista</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Propensione al rischio</span>
                      <select
                        value={form.propensione_rischio}
                        onChange={(e) => setForm({ ...form, propensione_rischio: e.target.value })}
                        className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]"
                      >
                        <option value="bassa">Bassa (leva ≤50%, 1 op/anno)</option>
                        <option value="media">Media (leva ≤65%, 1-2 op/anno)</option>
                        <option value="alta">Alta (leva fino al max, 2-3 op/anno)</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#64748B] font-semibold mb-2 block">
                    Vincoli aggiuntivi (opzionale)
                  </span>
                  <textarea
                    rows={2}
                    value={form.vincoli_extra}
                    onChange={(e) => setForm({ ...form, vincoli_extra: e.target.value })}
                    placeholder="Es. preferisco solo Milano e Bologna, no vendite nei primi 2 anni, voglio mantenere almeno €50k di liquidità…"
                    className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF] resize-none"
                  />
                </div>
              </div>
            </>
          )}

          {step === "loading" && (
            <div className="py-16 flex flex-col items-center gap-4">
              <Loader2 size={36} className="text-[#0066FF] animate-spin" />
              <div className="text-sm font-medium text-[#0F172A]">AI Strategist al lavoro…</div>
              <div className="text-xs text-[#64748B] text-center max-w-md">
                Sto analizzando il tuo portafoglio attuale (immobili, debito, liquidità) e progettando
                il piano operativo anno per anno che meglio raggiunge l'obiettivo rispettando i vincoli.
                Può richiedere 20-40 secondi.
              </div>
            </div>
          )}

          {step === "result" && result && (
            <>
              {/* Verdict goal */}
              <div
                data-testid="strategist-goal-banner"
                className={`mb-4 rounded-xl px-5 py-4 border flex items-start gap-3 ${goalOk ? "bg-[#ECFDF5] border-[#A7F3D0]" : "bg-[#FFFBEB] border-[#FDE68A]"}`}
              >
                {goalOk ? (
                  <CheckCircle2 size={22} className="text-[#059669] shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={22} className="text-[#B45309] shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className={`text-sm font-semibold ${goalOk ? "text-[#065F46]" : "text-[#92400E]"}`}>
                    {goalOk ? "Obiettivo raggiungibile con questo piano" : "Obiettivo non pienamente raggiunto"}
                  </div>
                  <div className={`text-xs mt-1 ${goalOk ? "text-[#065F46]" : "text-[#92400E]"}`}>
                    Patrimonio netto simulato: <b>{eur(goal.pn_finale_simulato)}</b> · target {eur(goal.target_pn)} ({goal.gap_pct > 0 ? "+" : ""}{goal.gap_pct}%) · LTV finale {goal.ltv_finale}% (max {goal.ltv_max}%)
                  </div>
                </div>
              </div>

              {/* Strategy summary */}
              <div className="mb-4">
                <div className="text-[11px] uppercase tracking-wider text-[#64748B] font-semibold mb-2">Strategia proposta</div>
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 text-xs text-[#0F172A] leading-relaxed">
                  {result.strategy_summary || "—"}
                </div>
              </div>

              {result.expected_outcome && (
                <div className="mb-4">
                  <div className="text-[11px] uppercase tracking-wider text-[#64748B] font-semibold mb-2">Risultato atteso</div>
                  <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg p-3 text-xs text-[#1E40AF] leading-relaxed">
                    {result.expected_outcome}
                  </div>
                </div>
              )}

              {/* Operations preview */}
              <div className="mb-4">
                <div className="text-[11px] uppercase tracking-wider text-[#64748B] font-semibold mb-2 flex items-center gap-1.5">
                  <ListChecks size={12} /> Operazioni generate ({result.draft_scenario.operations.length})
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {result.draft_scenario.operations
                    .sort((a, b) => a.anno - b.anno)
                    .map((op, i) => (
                      <div key={i} className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs">
                        <span className="font-semibold text-[#0F172A] w-10 shrink-0">A{op.anno}</span>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${OP_BADGE[op.tipo] || "bg-[#F1F5F9] text-[#475569]"}`}>
                          {OP_LABELS[op.tipo] || op.tipo}
                        </span>
                        <span className="flex-1 truncate text-[#475569]">{op.label}</span>
                        {op.prezzo > 0 && (
                          <span className="shrink-0 font-medium text-[#0F172A]">{eur(op.prezzo)}</span>
                        )}
                        {op.canone_mensile > 0 && (
                          <span className="shrink-0 text-[#059669]">+{eur(op.canone_mensile)}/m</span>
                        )}
                        {op.mutuo_pct > 0 && (
                          <span className="shrink-0 text-[#64748B] text-[10px]">leva {Math.round(op.mutuo_pct * 100)}%</span>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* Key risks */}
              {result.key_risks?.length > 0 && (
                <div className="mb-4">
                  <div className="text-[11px] uppercase tracking-wider text-[#64748B] font-semibold mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Rischi chiave segnalati dall'AI
                  </div>
                  <ul className="space-y-1">
                    {result.key_risks.map((r, i) => (
                      <li key={i} className="text-xs text-[#475569] flex gap-2">
                        <span className="text-[#B45309] mt-0.5">●</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Simulated summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                <div className="bg-white border border-[#E2E8F0] rounded-lg p-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-[#64748B]">PN finale</div>
                  <div className="text-sm font-display font-bold text-[#0F172A]">{eur(result.simulation.summary.patrimonio_netto_finale)}</div>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-lg p-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-[#64748B]">Cash flow tot.</div>
                  <div className={`text-sm font-display font-bold ${result.simulation.summary.cash_flow_cumulato >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{eur(result.simulation.summary.cash_flow_cumulato)}</div>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-lg p-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-[#64748B]">LTV finale</div>
                  <div className={`text-sm font-display font-bold ${result.simulation.summary.ltv_finale > form.max_ltv ? "text-[#DC2626]" : "text-[#0F172A]"}`}>{result.simulation.summary.ltv_finale}%</div>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-lg p-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-[#64748B]">Alert</div>
                  <div className="text-sm font-display font-bold text-[#0F172A]">
                    <span className="text-[#DC2626]">{result.simulation.summary.alerts_critical}</span>
                    <span className="text-[#64748B] mx-1">·</span>
                    <span className="text-[#B45309]">{result.simulation.summary.alerts_warning}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC] flex justify-end gap-2">
          {step === "form" && (
            <>
              <button
                onClick={close}
                className="px-4 py-2 text-sm rounded-lg border border-[#E2E8F0] hover:bg-white text-[#475569] transition"
              >
                Annulla
              </button>
              <button
                data-testid="ai-strategist-generate"
                onClick={runOptimize}
                className="px-4 py-2 text-sm rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white font-medium flex items-center gap-1.5 transition"
              >
                <Wand2 size={14} /> Genera piano ottimale
              </button>
            </>
          )}
          {step === "loading" && (
            <button disabled className="px-4 py-2 text-sm rounded-lg bg-[#0066FF] text-white font-medium opacity-60 flex items-center gap-1.5">
              <Loader2 size={14} className="animate-spin" /> Generazione…
            </button>
          )}
          {step === "result" && (
            <>
              <button
                data-testid="ai-strategist-retry"
                onClick={() => setStep("form")}
                className="px-4 py-2 text-sm rounded-lg border border-[#E2E8F0] hover:bg-white text-[#475569] transition"
              >
                Modifica obiettivo
              </button>
              <button
                data-testid="ai-strategist-discard"
                onClick={close}
                className="px-4 py-2 text-sm rounded-lg border border-[#E2E8F0] hover:bg-white text-[#475569] transition"
              >
                Scarta
              </button>
              <button
                data-testid="ai-strategist-accept"
                onClick={acceptAndSave}
                disabled={savingAccept}
                className="px-4 py-2 text-sm rounded-lg bg-[#059669] hover:bg-[#047857] text-white font-medium flex items-center gap-1.5 transition disabled:opacity-60"
              >
                {savingAccept ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {savingAccept ? "Salvataggio…" : "Salva come scenario"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
