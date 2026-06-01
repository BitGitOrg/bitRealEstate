import { useMemo, useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { ScoreGauge } from "../components/ScoreGauge";
import { formatEur } from "../lib/demoData";
import { Sparkles, Loader2, Info, ChevronDown, ChevronUp } from "lucide-react";
import { apiClient } from "../lib/auth";
import { toast } from "sonner";

const Field = ({ label, value, onChange, suffix, type = "number", testId, hint }) => (
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
    {hint && <div className="mt-1 text-[10px] text-[#94A3B8] leading-snug">{hint}</div>}
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
  // Costi gestione separati e configurabili (default realistici italiani)
  const [imuAnnua, setImuAnnua] = useState(450);          // €/anno
  const [assicurazione, setAssicurazione] = useState(180); // €/anno
  const [manutenzionePct, setManutenzionePct] = useState(3); // % del canone (riserva)
  const [sfittanzaPct, setSfittanzaPct] = useState(4);    // % del canone (rischio sfitto)
  const [cedolare, setCedolare] = useState(true);          // true=21%, false=IRPEF stima 30%
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const calc = useMemo(() => {
    const costoTotale = prezzo + notaio + agenzia + lavori;
    const canoneAnnuo = canone * 12;
    // Tasse sull'affitto
    const aliquotaTasse = cedolare ? 0.21 : 0.30;
    const tasseMensili = (canone * aliquotaTasse);
    // Spese gestione esplicite
    const imuMensile = imuAnnua / 12;
    const assicMensile = assicurazione / 12;
    const manutMensile = canone * (manutenzionePct / 100);
    const sfittMensile = canone * (sfittanzaPct / 100);
    const totSpeseMensili = imuMensile + assicMensile + manutMensile + sfittMensile;
    // Mutuo
    const mutuoImporto = prezzo * mutuoPct;
    const capitaleProprio = costoTotale - mutuoImporto;
    const i = tassoMutuo / 100 / 12;
    const n = durata * 12;
    const rata = mutuoImporto > 0 ? (mutuoImporto * i) / (1 - Math.pow(1 + i, -n)) : 0;
    // Cash flow netto = canone - rata - spese - tasse
    const cashFlow = canone - rata - totSpeseMensili - tasseMensili;
    // Rendimenti
    const rendLordo = costoTotale > 0 ? (canoneAnnuo / costoTotale) * 100 : 0;
    const ricaviNettiAnnui = (canone - totSpeseMensili - tasseMensili) * 12;
    const rendNetto = costoTotale > 0 ? (ricaviNettiAnnui / costoTotale) * 100 : 0;
    const roi = capitaleProprio > 0 ? (cashFlow * 12) / capitaleProprio * 100 : 0;
    const breakEven = capitaleProprio > 0 && cashFlow > 0 ? capitaleProprio / (cashFlow * 12) : null;

    // Score più equilibrato
    let score = 55;
    score += Math.min(35, Math.max(-35, (rendNetto - 4) * 7));
    if (cashFlow < 0) score -= 15;
    if (lavori / Math.max(prezzo, 1) > 0.5) score -= 10;
    if (mutuoPct > 0.85) score -= 8;
    if (rendLordo > 8) score += 5; // bonus deal di valore
    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      costoTotale, canoneAnnuo, rendLordo, rendNetto,
      mutuoImporto, capitaleProprio, rata, cashFlow, roi, breakEven, score,
      imuMensile, assicMensile, manutMensile, sfittMensile, totSpeseMensili,
      tasseMensili, aliquotaTasse,
    };
  }, [prezzo, notaio, agenzia, lavori, canone, mutuoPct, tassoMutuo, durata, imuAnnua, assicurazione, manutenzionePct, sfittanzaPct, cedolare]);

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
    } catch {
      toast.error("Errore analisi AI");
    } finally { setAiLoading(false); }
  };

  return (
    <Layout title="Simulatore Investimenti" subtitle="Valuta una nuova operazione — tutti i parametri sono modificabili">
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

            {/* Costi gestione e fiscalità — collassabile */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              data-testid="sim-toggle-advanced"
              className="w-full flex items-center justify-between mt-2 pt-2 border-t border-[#E2E8F0] text-xs text-[#475569] hover:text-[#0F172A]"
            >
              <span className="font-medium">Costi gestione & fiscalità</span>
              {showAdvanced ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>
            {showAdvanced && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <Field testId="sim-imu" label="IMU annua" value={imuAnnua} onChange={setImuAnnua} suffix="€" hint="Stima per immobile a reddito" />
                  <Field testId="sim-assic" label="Assicurazione annua" value={assicurazione} onChange={setAssicurazione} suffix="€" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field testId="sim-manut" label="Riserva manutenzione" value={manutenzionePct} onChange={setManutenzionePct} suffix="%" hint="% del canone accantonato" />
                  <Field testId="sim-sfitt" label="Rischio sfittanza" value={sfittanzaPct} onChange={setSfittanzaPct} suffix="%" hint="% per mesi sfitto/morosità" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Regime fiscale</span>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <button data-testid="sim-tax-ced" onClick={() => setCedolare(true)} className={`px-2 py-2 rounded-lg text-xs border transition-colors ${cedolare ? "border-[#0066FF] bg-[rgba(0,102,255,0.1)] text-[#2563EB] font-medium" : "border-[#E2E8F0] text-[#475569]"}`}>Cedolare 21%</button>
                    <button data-testid="sim-tax-irpef" onClick={() => setCedolare(false)} className={`px-2 py-2 rounded-lg text-xs border transition-colors ${!cedolare ? "border-[#0066FF] bg-[rgba(0,102,255,0.1)] text-[#2563EB] font-medium" : "border-[#E2E8F0] text-[#475569]"}`}>IRPEF ~30%</button>
                  </div>
                </div>
              </div>
            )}

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
                  <div data-testid="sim-cashflow" className={`font-display text-xl font-bold tabular ${calc.cashFlow >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{formatEur(Math.round(calc.cashFlow))}</div>
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

          {/* Breakdown trasparente del Cash Flow */}
          <SectionCard testId="sim-cashflow-breakdown" title="Da dove esce il Cash Flow mensile" subtitle="Trasparenza totale: ogni euro è tracciato">
            <div className="space-y-1 text-sm">
              <BreakRow label="Canone mensile" value={canone} positive />
              <BreakRow label={`− Rata mutuo (${durata}a @ ${tassoMutuo}%)`} value={-Math.round(calc.rata)} />
              <BreakRow label={`− IMU mensilizzata (${formatEur(imuAnnua)}/anno)`} value={-Math.round(calc.imuMensile)} muted />
              <BreakRow label={`− Assicurazione mensilizzata (${formatEur(assicurazione)}/anno)`} value={-Math.round(calc.assicMensile)} muted />
              <BreakRow label={`− Riserva manutenzione (${manutenzionePct}% canone)`} value={-Math.round(calc.manutMensile)} muted />
              <BreakRow label={`− Riserva sfittanza (${sfittanzaPct}% canone)`} value={-Math.round(calc.sfittMensile)} muted />
              <BreakRow label={`− Tasse su affitto (${cedolare ? "Cedolare 21%" : "IRPEF ~30%"})`} value={-Math.round(calc.tasseMensili)} />
              <div className="flex justify-between items-center pt-2 mt-1 border-t-2 border-[#0F172A] font-bold">
                <span className="text-sm text-[#0F172A]">= Cash flow netto / mese</span>
                <span className={`font-display text-lg tabular ${calc.cashFlow >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{formatEur(Math.round(calc.cashFlow))}</span>
              </div>
            </div>
            <div className="mt-3 p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[11px] text-[#475569] flex items-start gap-2 leading-relaxed">
              <Info size={13} className="text-[#0066FF] shrink-0 mt-0.5" />
              <span>
                Tutti i parametri di gestione (IMU, assicurazione, riserve, regime fiscale) sono modificabili dal pannello a sinistra «Costi gestione & fiscalità». Imposta valori reali del tuo immobile per una stima accurata.
                <strong className="text-[#0F172A]"> Se non vuoi conteggiare le spese</strong> mettile a 0 e vedrai il canone "lordo".
              </span>
            </div>
          </SectionCard>

          {aiResult && (
            <SectionCard testId="sim-ai-result" title="AI Deal Analyzer" subtitle="Valutazione dettagliata con scenari">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 text-sm">
                  <div><span className="text-[#475569]">Giudizio:</span> <strong className="text-[#0F172A]">{aiResult.giudizio}</strong></div>
                  <div><span className="text-[#475569]">Strategia:</span> <strong>{aiResult.strategia_consigliata}</strong></div>
                  <div><span className="text-[#475569]">Rischio:</span> <strong className={aiResult.rischio === "Basso" ? "text-[#059669]" : aiResult.rischio === "Medio" ? "text-[#B45309]" : "text-[#DC2626]"}>{aiResult.rischio}</strong></div>
                  <div><span className="text-[#475569]">Prezzo max consigliato:</span> <strong className="tabular">{formatEur(aiResult.prezzo_massimo_consigliato)}</strong></div>
                  <div><span className="text-[#475569]">Deal Score AI:</span> <strong className="tabular">{aiResult.deal_score}/100</strong></div>
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

const BreakRow = ({ label, value, positive, muted }) => (
  <div className={`flex justify-between items-center py-1.5 border-b border-[#F1F5F9] last:border-0 ${muted ? "text-[#94A3B8]" : ""}`}>
    <span className="text-xs text-[#475569]">{label}</span>
    <span className={`tabular text-sm font-medium ${positive ? "text-[#059669]" : value < 0 ? "text-[#DC2626]" : "text-[#0F172A]"}`}>
      {value >= 0 ? "+" : ""}{formatEur(value)}
    </span>
  </div>
);
