import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import {
  Wand2, X, CheckCircle2, AlertTriangle, Loader2, ListChecks,
  Target, Save, Sparkles, GitCompare, TrendingUp, Shield, Flame,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api/forecast`;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("crr_token")}` });
const eur = (n) => (isFinite(n) ? `€ ${Math.round(n).toLocaleString("it-IT")}` : "—");

const OP_LABELS = {
  acquisto: "Acquisto", vendita: "Vendita", ristrutturazione: "Ristrutt.",
  rinegoziazione_mutuo: "Rinegoz.", sfitto: "Sfitto", aumento_canone: "Aum. canone",
};
const OP_BADGE = {
  acquisto: "bg-[#ECFDF5] text-[#065F46]",
  vendita: "bg-[#FEF2F2] text-[#991B1B]",
  ristrutturazione: "bg-[#FFFBEB] text-[#92400E]",
  rinegoziazione_mutuo: "bg-[#EFF6FF] text-[#1E40AF]",
  sfitto: "bg-[#F1F5F9] text-[#475569]",
  aumento_canone: "bg-[#F0F9FF] text-[#0369A1]",
};
const PROFILE_ICON = { conservativo: Shield, bilanciato: TrendingUp, aggressivo: Flame };

const Field = ({ label, value, onChange, type = "number", suffix }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
    <div className="mt-1 flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg focus-within:border-[#0066FF]">
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
        className="flex-1 bg-transparent px-3 py-2 outline-none text-sm min-w-0"
      />
      {suffix && <span className="px-3 text-xs text-[#64748B]">{suffix}</span>}
    </div>
  </label>
);

// =============================================================
// PLAN CARD — one of the 3 alternatives, side by side
// =============================================================
const PlanCard = ({ plan, onAccept, savingId }) => {
  const Ico = PROFILE_ICON[plan.profile_id] || TrendingUp;
  const ok = plan.goal_summary.target_raggiunto && plan.goal_summary.ltv_rispettato;
  return (
    <div
      data-testid={`plan-card-${plan.profile_id}`}
      className="bg-white border-2 rounded-xl overflow-hidden flex flex-col"
      style={{ borderColor: plan.profile_color }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2 text-white" style={{ background: plan.profile_color }}>
        <Ico size={18} />
        <div className="flex-1">
          <div className="font-display font-bold">{plan.profile_label}</div>
          <div className="text-[10px] uppercase tracking-wider opacity-90">{plan.profile_propensione} · LTV max {plan.goal_summary.ltv_max}%</div>
        </div>
      </div>

      {/* Goal */}
      <div className={`px-3 py-2.5 flex items-center gap-2 ${ok ? "bg-[#ECFDF5]" : "bg-[#FFFBEB]"}`}>
        {ok ? (
          <CheckCircle2 size={14} className="text-[#059669]" />
        ) : (
          <AlertTriangle size={14} className="text-[#B45309]" />
        )}
        <span className={`text-[11px] font-semibold ${ok ? "text-[#065F46]" : "text-[#92400E]"}`}>
          {ok ? "Obiettivo raggiunto" : "Obiettivo non pieno"}
        </span>
        <span className="text-[10px] text-[#64748B] ml-auto">{plan.goal_summary.gap_pct > 0 ? "+" : ""}{plan.goal_summary.gap_pct}%</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-px bg-[#E2E8F0]">
        <div className="bg-white p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-[#64748B]">PN finale</div>
          <div className="text-sm font-display font-bold text-[#0F172A]">{eur(plan.simulation.summary.patrimonio_netto_finale)}</div>
        </div>
        <div className="bg-white p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-[#64748B]">LTV finale</div>
          <div className={`text-sm font-display font-bold ${plan.simulation.summary.ltv_finale > plan.goal_summary.ltv_max ? "text-[#DC2626]" : "text-[#0F172A]"}`}>{plan.simulation.summary.ltv_finale}%</div>
        </div>
        <div className="bg-white p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-[#64748B]">CF cum.</div>
          <div className={`text-sm font-display font-bold ${plan.simulation.summary.cash_flow_cumulato >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{eur(plan.simulation.summary.cash_flow_cumulato)}</div>
        </div>
        <div className="bg-white p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-[#64748B]">Alert</div>
          <div className="text-sm font-display font-bold">
            <span className="text-[#DC2626]">{plan.simulation.summary.alerts_critical}</span>
            <span className="text-[#64748B] mx-1">·</span>
            <span className="text-[#B45309]">{plan.simulation.summary.alerts_warning}</span>
          </div>
        </div>
      </div>

      {/* Strategy text */}
      <div className="px-3 py-2.5 text-[11px] text-[#475569] leading-relaxed border-b border-[#E2E8F0]">
        {plan.strategy_summary?.slice(0, 220) || "—"}{plan.strategy_summary?.length > 220 ? "…" : ""}
      </div>

      {/* Operations preview (compact) */}
      <div className="px-3 py-2.5 flex-1 overflow-y-auto max-h-44">
        <div className="text-[9px] uppercase tracking-wider text-[#64748B] font-semibold mb-1.5">
          {plan.draft_scenario.operations.length} operazioni
        </div>
        <div className="space-y-1">
          {plan.draft_scenario.operations
            .sort((a, b) => a.anno - b.anno)
            .slice(0, 6)
            .map((op, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px]">
                <span className="shrink-0 w-7 font-semibold text-[#0F172A]">A{op.anno}</span>
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold ${OP_BADGE[op.tipo] || "bg-[#F1F5F9] text-[#475569]"}`}>
                  {OP_LABELS[op.tipo] || op.tipo}
                </span>
                <span className="flex-1 truncate text-[#475569]">{op.label}</span>
              </div>
            ))}
          {plan.draft_scenario.operations.length > 6 && (
            <div className="text-[10px] text-[#94A3B8] italic">+{plan.draft_scenario.operations.length - 6} altre…</div>
          )}
        </div>
      </div>

      {/* Accept */}
      <button
        data-testid={`plan-save-${plan.profile_id}`}
        onClick={() => onAccept(plan.profile_id)}
        disabled={savingId === plan.profile_id}
        className="m-3 px-3 py-2 rounded-lg text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-60 transition"
        style={{ background: plan.profile_color }}
      >
        {savingId === plan.profile_id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
        Salva questo piano
      </button>
    </div>
  );
};

// =============================================================
// MAIN MODAL
// =============================================================
export default function AIStrategistModal({ open, onClose, onAccepted, onAllAccepted }) {
  const [step, setStep] = useState("form"); // form | polling | result
  const [form, setForm] = useState({
    target_patrimonio_netto: 1000000,
    horizon_years: 5,
    max_ltv: 65,
    capitale_disponibile: 250000,
    strategia: "mista",
    vincoli_extra: "",
  });
  const [jobId, setJobId] = useState(null);
  const [jobState, setJobState] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && step !== "polling") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, open]);

  // Cleanup poller on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  if (!open) return null;

  const reset = () => {
    setStep("form");
    setJobId(null);
    setJobState(null);
    setSavingId(null);
    setSavingAll(false);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const close = () => {
    reset();
    onClose();
  };

  const startJob = async () => {
    setStep("polling");
    setJobState({ status: "queued", progress: 0, current_step: "Creazione job…", plans: [] });
    try {
      const r = await fetch(`${API}/auto-optimize/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(form),
      });
      if (r.status !== 202) {
        const err = await r.json().catch(() => ({ detail: "Errore creazione job" }));
        throw new Error(err.detail || "Errore");
      }
      const { job_id } = await r.json();
      setJobId(job_id);
      // start polling
      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`${API}/auto-optimize/jobs/${job_id}`, { headers: authHeaders() });
          if (!sr.ok) return;
          const state = await sr.json();
          setJobState(state);
          if (state.status === "done") {
            clearInterval(pollRef.current);
            setStep("result");
          } else if (state.status === "error") {
            clearInterval(pollRef.current);
            toast.error(state.error || "Errore nella generazione");
            setStep("form");
          }
        } catch (e) { /* keep polling */ }
      }, 3000);
    } catch (e) {
      toast.error(e.message || "Errore avvio AI Strategist");
      setStep("form");
    }
  };

  const acceptOne = async (profileId) => {
    if (!jobId) return;
    setSavingId(profileId);
    try {
      const r = await fetch(`${API}/auto-optimize/jobs/${jobId}/save?profile_id=${profileId}`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: "Errore" }));
        throw new Error(err.detail || "Errore salvataggio");
      }
      const { saved_id, nome } = await r.json();
      toast.success(`Scenario salvato: ${nome}`);
      onAccepted?.(saved_id);
      close();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingId(null);
    }
  };

  const acceptAll = async () => {
    if (!jobId) return;
    setSavingAll(true);
    try {
      const r = await fetch(`${API}/auto-optimize/jobs/${jobId}/save-all`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error("Errore salvataggio multiplo");
      const { saved, count } = await r.json();
      toast.success(`${count} scenari salvati — pronti per il confronto`);
      onAllAccepted?.(saved.map((s) => s.id));
      close();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingAll(false);
    }
  };

  const progressPct = jobState?.progress || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(15,23,42,0.45)] backdrop-blur-sm"
      data-testid="ai-strategist-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== "polling") close();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-gradient-to-r from-[#EFF6FF] to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0066FF] flex items-center justify-center">
              <Wand2 size={18} className="text-white" />
            </div>
            <div>
              <div className="font-display font-bold text-lg text-[#0F172A]">AI Strategist · Multi-Shot</div>
              <div className="text-xs text-[#64748B]">3 piani alternativi (conservativo · bilanciato · aggressivo) generati e simulati in parallelo</div>
            </div>
          </div>
          <button
            data-testid="ai-strategist-close"
            onClick={close}
            disabled={step === "polling"}
            className="p-2 hover:bg-white rounded-lg transition disabled:opacity-30"
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
                  <b>Come funziona</b>: dichiari obiettivo + vincoli, l'AI genera 3 piani alternativi —
                  <span className="font-semibold text-[#059669]"> Conservativo</span> (leva max 50%, basso rischio),
                  <span className="font-semibold text-[#0066FF]"> Bilanciato</span> (leva max 60%, rischio medio),
                  <span className="font-semibold text-[#B45309]"> Aggressivo</span> (leva max 75%, massima crescita).
                  Vedi tutti e tre side-by-side, scegli quello che preferisci o salvali tutti per confrontarli nella tab "Confronta".
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[#64748B] font-semibold mb-2 flex items-center gap-1.5">
                    <Target size={12} /> Obiettivo
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Patrimonio netto target" value={form.target_patrimonio_netto} onChange={(v) => setForm({ ...form, target_patrimonio_netto: v })} suffix="€" />
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
                    <Field label="LTV massimo (cap globale)" value={form.max_ltv} onChange={(v) => setForm({ ...form, max_ltv: v })} suffix="%" />
                  </div>
                  <div className="text-[10px] text-[#94A3B8] mt-1.5">
                    Il piano aggressivo userà fino a questo LTV, gli altri due useranno cap interni più conservativi (50% e 60%).
                  </div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[#64748B] font-semibold mb-2">Risorse e profilo strategico</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Capitale proprio disponibile" value={form.capitale_disponibile} onChange={(v) => setForm({ ...form, capitale_disponibile: v })} suffix="€" />
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
                  </div>
                </div>

                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#64748B] font-semibold mb-2 block">Vincoli aggiuntivi (opzionale)</span>
                  <textarea
                    rows={2}
                    value={form.vincoli_extra}
                    onChange={(e) => setForm({ ...form, vincoli_extra: e.target.value })}
                    placeholder="Es. solo Milano e Bologna, no vendite primi 2 anni, mantenere €50k di liquidità…"
                    className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF] resize-none"
                  />
                </div>
              </div>
            </>
          )}

          {step === "polling" && (
            <div className="py-12 flex flex-col items-center gap-5">
              <Loader2 size={36} className="text-[#0066FF] animate-spin" />
              <div className="text-center max-w-lg">
                <div className="text-sm font-semibold text-[#0F172A]">Generazione 3 piani in corso</div>
                <div className="text-xs text-[#64748B] mt-1">{jobState?.current_step || "Inizializzazione…"}</div>
              </div>
              {/* Progress bar */}
              <div className="w-full max-w-md">
                <div className="flex justify-between text-[10px] text-[#64748B] mb-1.5">
                  <span>{progressPct}%</span>
                  <span>{(jobState?.plans?.length || 0)} di 3 piani pronti</span>
                </div>
                <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                  <div
                    data-testid="strategist-progress-bar"
                    className="h-full bg-gradient-to-r from-[#0066FF] to-[#7C3AED] rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  ></div>
                </div>
                {/* Stage markers */}
                <div className="mt-3 flex justify-between text-[10px]">
                  {["Conservativo", "Bilanciato", "Aggressivo"].map((p, i) => {
                    const done = (jobState?.plans?.length || 0) > i;
                    const active = (jobState?.plans?.length || 0) === i && progressPct < 95;
                    return (
                      <div key={p} className={`flex items-center gap-1 ${done ? "text-[#059669] font-semibold" : active ? "text-[#0066FF] font-semibold" : "text-[#94A3B8]"}`}>
                        {done ? <CheckCircle2 size={11} /> : active ? <Loader2 size={11} className="animate-spin" /> : <span className="w-2.5 h-2.5 rounded-full bg-[#E2E8F0]" />}
                        {p}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="text-[11px] text-[#94A3B8] text-center max-w-md">
                Il backend chiama Claude 3 volte (~20-30s ciascuna). Puoi minimizzare e tornare dopo: il job continua in background.
              </div>
            </div>
          )}

          {step === "result" && jobState?.plans?.length === 3 && (
            <>
              <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="text-sm font-semibold text-[#0F172A]">3 piani alternativi pronti</div>
                  <div className="text-xs text-[#64748B]">Confronta side-by-side e scegli quello che preferisci, oppure salvali tutti per analizzarli nella tab Confronta.</div>
                </div>
                <button
                  data-testid="plan-save-all"
                  onClick={acceptAll}
                  disabled={savingAll}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm font-semibold disabled:opacity-60 transition"
                >
                  {savingAll ? <Loader2 size={14} className="animate-spin" /> : <GitCompare size={14} />}
                  {savingAll ? "Salvataggio…" : "Salva tutti e confronta"}
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {jobState.plans.map((p) => (
                  <PlanCard key={p.profile_id} plan={p} onAccept={acceptOne} savingId={savingId} />
                ))}
              </div>

              {/* Key risks aggregate */}
              <div className="mt-5 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-4">
                <div className="text-[11px] uppercase tracking-wider text-[#92400E] font-semibold mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={12} /> Rischi chiave segnalati dall'AI (aggregati)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {jobState.plans.map((p) => (
                    <div key={p.profile_id}>
                      <div className="text-[10px] font-semibold mb-1" style={{ color: p.profile_color }}>{p.profile_label}</div>
                      <ul className="space-y-1">
                        {(p.key_risks || []).slice(0, 4).map((r, i) => (
                          <li key={i} className="text-[10px] text-[#92400E] leading-relaxed flex gap-1.5">
                            <span className="text-[#B45309] shrink-0">●</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC] flex justify-end gap-2">
          {step === "form" && (
            <>
              <button onClick={close} className="px-4 py-2 text-sm rounded-lg border border-[#E2E8F0] hover:bg-white text-[#475569] transition">
                Annulla
              </button>
              <button
                data-testid="ai-strategist-generate"
                onClick={startJob}
                className="px-4 py-2 text-sm rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white font-medium flex items-center gap-1.5 transition"
              >
                <Wand2 size={14} /> Genera 3 piani
              </button>
            </>
          )}
          {step === "polling" && (
            <button onClick={close} className="px-4 py-2 text-sm rounded-lg border border-[#E2E8F0] hover:bg-white text-[#475569] transition">
              Minimizza (il job continua)
            </button>
          )}
          {step === "result" && (
            <>
              <button
                data-testid="ai-strategist-retry"
                onClick={() => setStep("form")}
                className="px-4 py-2 text-sm rounded-lg border border-[#E2E8F0] hover:bg-white text-[#475569] transition"
              >
                Nuova generazione
              </button>
              <button
                data-testid="ai-strategist-discard"
                onClick={close}
                className="px-4 py-2 text-sm rounded-lg border border-[#E2E8F0] hover:bg-white text-[#475569] transition"
              >
                Chiudi senza salvare
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
