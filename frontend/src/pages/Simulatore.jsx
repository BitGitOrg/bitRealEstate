import { useMemo, useState, useEffect } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { ScoreGauge } from "../components/ScoreGauge";
import { formatEur } from "../lib/demoData";
import { Sparkles, Loader2, Info, ChevronDown, ChevronUp, Settings as SettingsIcon } from "lucide-react";
import { apiClient } from "../lib/auth";
import { Link } from "react-router-dom";
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
  // Settings caricati dal backend (società)
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    apiClient().get("/settings").then(r => setSettings(r.data)).catch(() => {});
  }, []);

  const [prezzo, setPrezzo] = useState(180000);
  const [notaio, setNotaio] = useState(3500);
  const [agenzia, setAgenzia] = useState(5500);
  const [lavori, setLavori] = useState(22000);
  const [canone, setCanone] = useState(1100);
  const [conMutuo, setConMutuo] = useState(true);   // flag finanziamento
  const [mutuoPct, setMutuoPct] = useState(0.6);
  const [tassoMutuo, setTassoMutuo] = useState(3.2);
  const [durata, setDurata] = useState(20);
  // Vista risultati: lordo (solo canone-rata) vs netto (con spese+tasse)
  const [vista, setVista] = useState("netto"); // "lordo" | "netto"
  // Costi gestione: inizializzati dai settings appena disponibili
  const [imuAnnua, setImuAnnua] = useState(800);
  const [assicurazione, setAssicurazione] = useState(200);
  const [manutenzionePct, setManutenzionePct] = useState(3);
  const [sfittanzaPct, setSfittanzaPct] = useState(4);
  const [userTouchedFiscal, setUserTouchedFiscal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  // Quando arrivano i settings, riempi i default (solo prima volta, se utente non ha già toccato)
  useEffect(() => {
    if (!settings || userTouchedFiscal) return;
    setImuAnnua(settings.imu_media_per_immobile ?? 800);
    setAssicurazione(settings.assicurazione_media_per_immobile ?? 200);
    setManutenzionePct(settings.manutenzione_pct_default ?? 3);
    setSfittanzaPct(settings.sfittanza_pct_default ?? 4);
  }, [settings, userTouchedFiscal]);

  // Aliquota tassazione affitti: dipende dal tipo società/regime
  const aliquotaTasse = useMemo(() => {
    if (!settings) return 0.28;  // default SRL conservativo
    const tipo = settings.tipo_societa || "srl";
    if (tipo === "privato") {
      const reg = settings.regime_affitti || "cedolare_21";
      if (reg === "cedolare_21") return 0.21;
      if (reg === "cedolare_10") return 0.10;
      return 0.30;  // IRPEF ordinario stima 30%
    }
    // SRL / SpA / Holding: IRES + IRAP
    return ((settings.aliquota_ires ?? 24) + (settings.aliquota_irap ?? 3.9)) / 100;
  }, [settings]);

  const labelRegime = useMemo(() => {
    if (!settings) return "IRES+IRAP ~28% (SRL)";
    const tipo = settings.tipo_societa || "srl";
    if (tipo === "privato") {
      const reg = settings.regime_affitti || "cedolare_21";
      if (reg === "cedolare_21") return "Cedolare 21% (Privato)";
      if (reg === "cedolare_10") return "Cedolare 10% (Privato/concordato)";
      return "IRPEF ~30% (Privato ordinario)";
    }
    const eff = ((settings.aliquota_ires ?? 24) + (settings.aliquota_irap ?? 3.9)).toFixed(1);
    return `IRES+IRAP ≈${eff}% (${tipo.toUpperCase()})`;
  }, [settings]);

  const calc = useMemo(() => {
    const costoTotale = prezzo + notaio + agenzia + lavori;
    const canoneAnnuo = canone * 12;
    const isLordo = vista === "lordo";
    const tasseMensili = isLordo ? 0 : (canone * aliquotaTasse);
    // Spese gestione esplicite — in vista LORDO sono azzerate
    const imuMensile = isLordo ? 0 : imuAnnua / 12;
    const assicMensile = isLordo ? 0 : assicurazione / 12;
    const manutMensile = isLordo ? 0 : canone * (manutenzionePct / 100);
    const sfittMensile = isLordo ? 0 : canone * (sfittanzaPct / 100);
    const totSpeseMensili = imuMensile + assicMensile + manutMensile + sfittMensile;
    // Mutuo (può essere disabilitato dal flag)
    const mutuoImporto = conMutuo ? prezzo * mutuoPct : 0;
    const capitaleProprio = costoTotale - mutuoImporto;
    const i = tassoMutuo / 100 / 12;
    const n = durata * 12;
    const rata = conMutuo && mutuoImporto > 0 ? (mutuoImporto * i) / (1 - Math.pow(1 + i, -n)) : 0;
    // Cash flow = canone - rata - spese - tasse
    const cashFlow = canone - rata - totSpeseMensili - tasseMensili;
    // Rendimenti
    const rendLordo = costoTotale > 0 ? (canoneAnnuo / costoTotale) * 100 : 0;
    const ricaviNettiAnnui = (canone - totSpeseMensili - tasseMensili) * 12;
    const rendNetto = costoTotale > 0 ? (ricaviNettiAnnui / costoTotale) * 100 : 0;
    const roi = capitaleProprio > 0 ? (cashFlow * 12) / capitaleProprio * 100 : 0;
    const breakEven = capitaleProprio > 0 && cashFlow > 0 ? capitaleProprio / (cashFlow * 12) : null;

    let score = 55;
    score += Math.min(35, Math.max(-35, (rendNetto - 4) * 7));
    if (cashFlow < 0) score -= 15;
    if (lavori / Math.max(prezzo, 1) > 0.5) score -= 10;
    if (conMutuo && mutuoPct > 0.85) score -= 8;
    if (rendLordo > 8) score += 5;
    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      costoTotale, canoneAnnuo, rendLordo, rendNetto,
      mutuoImporto, capitaleProprio, rata, cashFlow, roi, breakEven, score,
      imuMensile, assicMensile, manutMensile, sfittMensile, totSpeseMensili,
      tasseMensili, isLordo,
    };
  }, [prezzo, notaio, agenzia, lavori, canone, conMutuo, mutuoPct, tassoMutuo, durata, imuAnnua, assicurazione, manutenzionePct, sfittanzaPct, aliquotaTasse, vista]);

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
      {settings && (
        <div data-testid="sim-fiscal-banner" className="mb-4 px-3.5 py-2.5 rounded-lg bg-[rgba(124,58,237,0.06)] border border-[rgba(124,58,237,0.25)] flex items-center justify-between gap-3 flex-wrap text-sm">
          <div className="flex items-center gap-2 text-[#475569]">
            <Info size={14} className="text-[#7C3AED]"/>
            <span>Regime società: <strong className="text-[#0F172A]">{labelRegime}</strong> · IMU media <strong className="tabular text-[#0F172A]">{formatEur(settings.imu_media_per_immobile || 800)}/anno</strong></span>
          </div>
          <Link to="/impostazioni" className="text-xs text-[#7C3AED] hover:underline inline-flex items-center gap-1">
            <SettingsIcon size={11}/> Modifica in Impostazioni
          </Link>
        </div>
      )}
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

            {/* Toggle Mutuo */}
            <div className="pt-2 border-t border-[#E2E8F0]">
              <label className="flex items-center justify-between gap-2 cursor-pointer mb-2">
                <span className="text-xs font-medium text-[#0F172A]">Operazione con finanziamento bancario</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={conMutuo}
                  data-testid="sim-toggle-mutuo"
                  onClick={() => setConMutuo(!conMutuo)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${conMutuo ? "bg-[#0066FF]" : "bg-[#CBD5E1]"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${conMutuo ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </label>
              {conMutuo ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field testId="sim-mutuo" label="Mutuo %" value={Math.round(mutuoPct * 100)} onChange={(v) => setMutuoPct(v / 100)} suffix="%" />
                    <Field testId="sim-tasso" label="Tasso" value={tassoMutuo} onChange={setTassoMutuo} suffix="%" />
                  </div>
                  <Field testId="sim-durata" label="Durata" value={durata} onChange={setDurata} suffix="anni" />
                </div>
              ) : (
                <div className="text-[11px] text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-2.5 leading-relaxed" data-testid="sim-no-mutuo-info">
                  <strong className="text-[#0F172A]">Acquisto in cash:</strong> capitale 100% proprio, nessuna rata mensile, nessun costo interessi.
                </div>
              )}
            </div>

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
                  <Field testId="sim-imu" label="IMU annua" value={imuAnnua} onChange={(v) => { setImuAnnua(v); setUserTouchedFiscal(true); }} suffix="€" hint="Default da Impostazioni" />
                  <Field testId="sim-assic" label="Assicurazione annua" value={assicurazione} onChange={(v) => { setAssicurazione(v); setUserTouchedFiscal(true); }} suffix="€" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field testId="sim-manut" label="Riserva manutenzione" value={manutenzionePct} onChange={(v) => { setManutenzionePct(v); setUserTouchedFiscal(true); }} suffix="%" hint="% del canone" />
                  <Field testId="sim-sfitt" label="Rischio sfittanza" value={sfittanzaPct} onChange={(v) => { setSfittanzaPct(v); setUserTouchedFiscal(true); }} suffix="%" hint="% per mesi sfitto" />
                </div>
                <div className="px-3 py-2.5 bg-[rgba(124,58,237,0.06)] border border-[rgba(124,58,237,0.25)] rounded-lg text-[11px] text-[#475569] leading-relaxed flex items-start gap-2">
                  <Info size={12} className="text-[#7C3AED] shrink-0 mt-0.5"/>
                  <div>
                    <strong className="text-[#0F172A]">Regime fiscale: {labelRegime}</strong><br/>
                    L'aliquota viene applicata sul canone. Per cambiarla, modifica il tipo società da <Link to="/impostazioni" className="text-[#7C3AED] underline">Impostazioni</Link>.
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
          {/* Toggle vista Lordo / Netto */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap" data-testid="sim-view-toggle">
            <div>
              <div className="text-sm font-semibold text-[#0F172A]">Vista risultati</div>
              <div className="text-[11px] text-[#64748B]">
                {vista === "lordo"
                  ? "Solo canone − rata mutuo (no spese, no tasse)"
                  : `Cash flow netto: canone − rata − IMU − assicurazione − riserve − tasse (${labelRegime})`}
              </div>
            </div>
            <div className="flex items-center gap-1 bg-[#F1F5F9] rounded-lg p-0.5">
              <button
                data-testid="sim-view-lordo"
                onClick={() => setVista("lordo")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${vista === "lordo" ? "bg-white text-[#0F172A] shadow-sm" : "text-[#64748B] hover:text-[#0F172A]"}`}
              >
                Lordo
              </button>
              <button
                data-testid="sim-view-netto"
                onClick={() => setVista("netto")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${vista === "netto" ? "bg-white text-[#0F172A] shadow-sm" : "text-[#64748B] hover:text-[#0F172A]"}`}
              >
                Netto (dettagliato)
              </button>
            </div>
          </div>

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
                  <div className="font-display text-xl font-bold tabular">{conMutuo ? formatEur(Math.round(calc.rata)) : "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#64748B]">Cash flow {vista} / mese</div>
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

          {/* Breakdown trasparente del Cash Flow — visibile solo in vista NETTO */}
          {vista === "netto" && (
            <SectionCard testId="sim-cashflow-breakdown" title="Da dove esce il Cash Flow netto mensile" subtitle="Trasparenza totale: ogni euro è tracciato">
              <div className="space-y-1 text-sm">
                <BreakRow label="Canone mensile" value={canone} positive />
                {conMutuo && calc.rata > 0 && (
                  <BreakRow label={`− Rata mutuo (${durata}a @ ${tassoMutuo}%)`} value={-Math.round(calc.rata)} />
                )}
                <BreakRow label={`− IMU mensilizzata (${formatEur(imuAnnua)}/anno)`} value={-Math.round(calc.imuMensile)} muted />
                <BreakRow label={`− Assicurazione mensilizzata (${formatEur(assicurazione)}/anno)`} value={-Math.round(calc.assicMensile)} muted />
                <BreakRow label={`− Riserva manutenzione (${manutenzionePct}% canone)`} value={-Math.round(calc.manutMensile)} muted />
                <BreakRow label={`− Riserva sfittanza (${sfittanzaPct}% canone)`} value={-Math.round(calc.sfittMensile)} muted />
                <BreakRow label={`− Tasse su affitto (${labelRegime})`} value={-Math.round(calc.tasseMensili)} />
                <div className="flex justify-between items-center pt-2 mt-1 border-t-2 border-[#0F172A] font-bold">
                  <span className="text-sm text-[#0F172A]">= Cash flow netto / mese</span>
                  <span className={`font-display text-lg tabular ${calc.cashFlow >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{formatEur(Math.round(calc.cashFlow))}</span>
                </div>
              </div>
              <div className="mt-3 p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[11px] text-[#475569] flex items-start gap-2 leading-relaxed">
                <Info size={13} className="text-[#0066FF] shrink-0 mt-0.5" />
                <span>
                  I costi gestione default arrivano da <Link to="/impostazioni" className="text-[#0066FF] underline">Impostazioni</Link>. Personalizzali da «Costi gestione & fiscalità» nel pannello a sinistra per stime specifiche di questa operazione.
                </span>
              </div>
            </SectionCard>
          )}

          {/* Riepilogo Lordo — visibile solo in vista LORDO */}
          {vista === "lordo" && (
            <SectionCard testId="sim-cashflow-lordo" title="Cash Flow lordo mensile" subtitle="Solo entrate canone meno rata mutuo (no spese, no tasse)">
              <div className="space-y-1 text-sm">
                <BreakRow label="Canone mensile" value={canone} positive />
                {conMutuo && calc.rata > 0 && (
                  <BreakRow label={`− Rata mutuo (${durata}a @ ${tassoMutuo}%)`} value={-Math.round(calc.rata)} />
                )}
                <div className="flex justify-between items-center pt-2 mt-1 border-t-2 border-[#0F172A] font-bold">
                  <span className="text-sm text-[#0F172A]">= Cash flow lordo / mese</span>
                  <span className={`font-display text-lg tabular ${calc.cashFlow >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{formatEur(Math.round(calc.cashFlow))}</span>
                </div>
              </div>
              <div className="mt-3 p-3 bg-[#FFFBEB] border border-[#FCD34D]/40 rounded-lg text-[11px] text-[#92400E] flex items-start gap-2 leading-relaxed">
                <Info size={13} className="text-[#B45309] shrink-0 mt-0.5" />
                <span>
                  <strong>Stima ottimistica:</strong> non considera IMU, assicurazione, manutenzioni, sfittanza e tasse ({labelRegime}). Usa la vista <strong>Netto</strong> per il vero margine post-tasse della società.
                </span>
              </div>
            </SectionCard>
          )}

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
