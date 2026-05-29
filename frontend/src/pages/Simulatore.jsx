import { useMemo, useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { ScoreGauge } from "../components/ScoreGauge";
import { formatEur } from "../lib/demoData";
import { Calculator, Sparkles, Loader2 } from "lucide-react";
import { apiClient } from "../lib/auth";
import { toast } from "sonner";

const Field = ({ label, value, onChange, suffix, type = "number", testId }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
    <div className="mt-1.5 flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg overflow-hidden focus-within:border-[#0066FF] transition-colors">
      <input
        data-testid={testId}
        type={type} value={value}
        onChange={(e) => onChange(type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
        className="flex-1 bg-transparent px-3 py-2 outline-none text-sm tabular"
      />
      {suffix && <span className="px-3 text-xs text-[#64748B]">{suffix}</span>}
    </div>
  </label>
);

export default function Simulatore() {
  const [prezzo, setPrezzo] = useState(180000);
  const [notaio, setNotaio] = useState(3500);
  const [agenzia, setAgenzia] = useState(5500);
  const [lavori, setLavori] = useState(22000);
  const [canone, setCanone] = useState(1100);
  const [mutuoPct, setMutuoPct] = useState(0.6);
  const [tassoMutuo, setTassoMutuo] = useState(3.2);
  const [durata, setDurata] = useState(20);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const calc = useMemo(() => {
    const costoTotale = prezzo + notaio + agenzia + lavori;
    const canoneAnnuo = canone * 12;
    const rendLordo = costoTotale > 0 ? (canoneAnnuo / costoTotale) * 100 : 0;
    const rendNetto = rendLordo * 0.65; // approssimazione
    const mutuoImporto = prezzo * mutuoPct;
    const capitaleProprio = costoTotale - mutuoImporto;
    // Rata stimata (Francese)
    const i = tassoMutuo / 100 / 12;
    const n = durata * 12;
    const rata = mutuoImporto > 0 ? (mutuoImporto * i) / (1 - Math.pow(1 + i, -n)) : 0;
    const speseGestione = canone * 0.15;
    const cashFlow = canone - rata - speseGestione;
    const roi = capitaleProprio > 0 ? (cashFlow * 12) / capitaleProprio * 100 : 0;
    const breakEven = capitaleProprio > 0 && cashFlow > 0 ? capitaleProprio / (cashFlow * 12) : null;

    let score = 50;
    score += Math.min(30, Math.max(-30, (rendNetto - 5) * 6));
    if (lavori / Math.max(prezzo, 1) > 0.5) score -= 10;
    if (mutuoPct > 0.8) score -= 8;
    score = Math.max(0, Math.min(100, Math.round(score)));

    return { costoTotale, canoneAnnuo, rendLordo, rendNetto, mutuoImporto, capitaleProprio, rata, cashFlow, roi, breakEven, score };
  }, [prezzo, notaio, agenzia, lavori, canone, mutuoPct, tassoMutuo, durata]);

  const runAi = async () => {
    setAiLoading(true);
    try {
      const { data } = await apiClient().post("/ai/deal-analyze", {
        prezzo_richiesto: prezzo,
        metratura: 60,
        canone_stimato: canone,
        lavori_previsti: lavori,
        costi_accessori: notaio + agenzia,
        mutuo_pct: mutuoPct,
      });
      setAiResult(data);
      toast.success("Analisi AI completata");
    } catch (e) {
      toast.error("Errore analisi AI");
    } finally { setAiLoading(false); }
  };

  return (
    <Layout title="Simulatore Investimenti" subtitle="Valuta una nuova operazione di acquisto immobiliare">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard testId="sim-input" title="Parametri operazione" subtitle="Inserisci i dati dell'immobile candidato" className="xl:col-span-1">
          <div className="space-y-3">
            <Field testId="sim-prezzo" label="Prezzo di acquisto" value={prezzo} onChange={setPrezzo} suffix="€" />
            <div className="grid grid-cols-2 gap-3">
              <Field testId="sim-notaio" label="Notaio" value={notaio} onChange={setNotaio} suffix="€" />
              <Field testId="sim-agenzia" label="Agenzia" value={agenzia} onChange={setAgenzia} suffix="€" />
            </div>
            <Field testId="sim-lavori" label="Lavori previsti" value={lavori} onChange={setLavori} suffix="€" />
            <Field testId="sim-canone" label="Canone mensile previsto" value={canone} onChange={setCanone} suffix="€/mese" />
            <div className="grid grid-cols-2 gap-3">
              <Field testId="sim-mutuo" label="Mutuo %" value={Math.round(mutuoPct * 100)} onChange={(v) => setMutuoPct(v / 100)} suffix="%" />
              <Field testId="sim-tasso" label="Tasso" value={tassoMutuo} onChange={setTassoMutuo} suffix="%" />
            </div>
            <Field testId="sim-durata" label="Durata" value={durata} onChange={setDurata} suffix="anni" />

            <button
              data-testid="sim-ai-btn"
              onClick={runAi} disabled={aiLoading}
              className="w-full mt-2 py-2.5 px-4 bg-[rgba(0,102,255,0.1)] border border-[rgba(0,102,255,0.3)] text-[#2563EB] hover:bg-[rgba(0,102,255,0.2)] rounded-lg font-medium text-sm transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {aiLoading ? <><Loader2 size={14} className="animate-spin"/> Analisi…</> : <><Sparkles size={14}/> Analizza con AI Autopilot</>}
            </button>
          </div>
        </SectionCard>

        <div className="xl:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard testId="sim-result-summary" title="Risultati operazione">
              <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                <div>
                  <div className="text-[10px] uppercase text-[#64748B]">Costo totale</div>
                  <div className="font-display text-xl font-bold tabular">{formatEur(calc.costoTotale)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#64748B]">Capitale proprio</div>
                  <div className="font-display text-xl font-bold tabular">{formatEur(calc.capitaleProprio)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#64748B]">Rendimento lordo</div>
                  <div className="font-display text-xl font-bold tabular text-[#2563EB]">{calc.rendLordo.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#64748B]">Rendimento netto</div>
                  <div className="font-display text-xl font-bold tabular text-[#059669]">{calc.rendNetto.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#64748B]">Rata mutuo</div>
                  <div className="font-display text-xl font-bold tabular">{formatEur(Math.round(calc.rata))}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#64748B]">Cash flow / mese</div>
                  <div className={`font-display text-xl font-bold tabular ${calc.cashFlow >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{formatEur(Math.round(calc.cashFlow))}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#64748B]">ROI (cash on cash)</div>
                  <div className="font-display text-xl font-bold tabular">{calc.roi.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#64748B]">Break-even</div>
                  <div className="font-display text-xl font-bold tabular">{calc.breakEven ? `${calc.breakEven.toFixed(1)} anni` : "—"}</div>
                </div>
              </div>
            </SectionCard>

            <SectionCard testId="sim-result-score" title="Deal Score">
              <div className="flex flex-col items-center justify-center py-4">
                <ScoreGauge value={calc.score} size={160} dataTestId="sim-score-gauge" />
                <div className="text-xs text-[#475569] text-center mt-4 max-w-[200px]">
                  {calc.score >= 91 ? "Operazione eccellente, procedi."
                    : calc.score >= 76 ? "Buona operazione."
                    : calc.score >= 61 ? "Operazione interessante: valuta margini."
                    : calc.score >= 41 ? "Rischiosa: negozia o passa."
                    : "Sconsigliata."}
                </div>
              </div>
            </SectionCard>
          </div>

          {aiResult && (
            <SectionCard testId="sim-ai-result" title="AI Deal Analyzer" subtitle="Valutazione dettagliata con scenari">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 text-sm">
                  <div><span className="text-[#475569]">Giudizio:</span> <strong className="text-[#0F172A]">{aiResult.giudizio}</strong></div>
                  <div><span className="text-[#475569]">Strategia:</span> <strong>{aiResult.strategia_consigliata}</strong></div>
                  <div><span className="text-[#475569]">Rischio:</span> <strong className={aiResult.rischio === "Basso" ? "text-[#059669]" : aiResult.rischio === "Medio" ? "text-[#B45309]" : "text-[#DC2626]"}>{aiResult.rischio}</strong></div>
                  <div><span className="text-[#475569]">Prezzo max consigliato:</span> <strong className="tabular">{formatEur(aiResult.prezzo_massimo_consigliato)}</strong></div>
                  <div className="mt-3">
                    <div className="text-[10px] uppercase text-[#64748B] mb-2">Punti di attenzione</div>
                    <ul className="space-y-1">
                      {aiResult.punti_attenzione.map((p, i) => <li key={i} className="text-xs text-[#0F172A] flex gap-2"><span className="text-[#B45309]">·</span>{p}</li>)}
                    </ul>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#64748B] mb-2">Scenari</div>
                  {Object.entries(aiResult.scenari).map(([k, v]) => (
                    <div key={k} className="p-3 mb-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs uppercase tracking-wider text-[#475569]">{k}</span>
                        <span className="tabular font-display font-bold text-sm" style={{ color: k === "ottimistico" ? "#059669" : k === "realistico" ? "#2563EB" : "#DC2626" }}>{v.rendimento_netto}%</span>
                      </div>
                      <div className="text-[11px] text-[#64748B]">{v.note}</div>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </Layout>
  );
}
