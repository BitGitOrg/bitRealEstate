import { useEffect, useState } from "react";
import { Info, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown, Wallet, Building2, Banknote, Scale } from "lucide-react";
import { apiClient } from "../lib/auth";
import { formatEur } from "../lib/demoData";

// Soglie tolleranza riconciliazione liquidità
const LIQ_TOLERANCE_EUR = 1000;
const LIQ_TOLERANCE_PCT = 0.05;

/**
 * Hook condiviso per caricare i dati di riconciliazione finanziaria.
 * Restituisce `null` finché in caricamento o se non ci sono bilanci.
 */
export function useFinanzaReconcile() {
  const [data, setData] = useState(null);
  useEffect(() => {
    apiClient().get("/finanza/reconcile").then(r => setData(r.data || null)).catch(() => setData(null));
  }, []);
  return data;
}

/**
 * Banner riconciliazione liquidità bilancio↔conto corrente live.
 * Renderizza null se:
 *  - dati non ancora pronti
 *  - bilancio non caricato (lo stato A è già coperto da Patrimonio/Mutui banner)
 *  - bilancio.liquidita = 0 e nessun movimento post-bilancio (nulla da mostrare)
 */
export function LiquiditaReconcileBanner({ data }) {
  if (!data?.bilancio_caricato || !data.bilancio) return null;
  const bilLiq = Number(data.bilancio.liquidita || 0);
  const liqLive = Number(data.liquidita_live || 0);
  const delta = liqLive - bilLiq;
  const absDelta = Math.abs(delta);
  const baseRef = Math.max(bilLiq, 1); // evita divisione per 0
  const pctDelta = absDelta / baseRef;
  const nPost = data.n_movimenti_post_bilancio || 0;
  const periodo = data.bilancio_periodo;

  // Caso edge: bilancio.liquidita = 0 e nessun movimento → nulla da dire
  if (bilLiq === 0 && nPost === 0) return null;

  let tone, Icon, title, msg;
  if (absDelta <= LIQ_TOLERANCE_EUR || pctDelta <= LIQ_TOLERANCE_PCT) {
    tone = { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", strong: "#059669" };
    Icon = CheckCircle2;
    title = "Liquidità allineata col bilancio";
    msg = nPost > 0
      ? `${nPost} movimenti bancari registrati dopo ${periodo}: cassa stabile entro la tolleranza.`
      : `Nessun movimento bancario successivo al bilancio ${periodo}. Cassa stimata = cassa a bilancio.`;
  } else if (delta > 0) {
    tone = { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", strong: "#059669" };
    Icon = TrendingUp;
    title = `Cassa cresciuta di ${formatEur(absDelta)} dopo ${periodo}`;
    msg = `${nPost} movimenti netti positivi importati dall'estratto conto. Liquidità stimata attuale: ${formatEur(liqLive)}.`;
  } else {
    tone = pctDelta > 0.30
      ? { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", strong: "#DC2626" }
      : { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", strong: "#B45309" };
    Icon = TrendingDown;
    title = `Cassa scesa di ${formatEur(absDelta)} dopo ${periodo}`;
    msg = `${nPost} movimenti netti in uscita dall'estratto conto. Liquidità stimata attuale: ${formatEur(liqLive)}.`;
  }

  return (
    <div data-testid="liq-banner-reconcile" className="mb-5 p-3.5 border" style={{ background: tone.bg, borderColor: tone.border }}>
      <div className="flex items-start gap-3">
        <Icon size={18} className="shrink-0 mt-0.5" style={{ color: tone.strong }} />
        <div className="flex-1">
          <div className="text-[13px] font-semibold" style={{ color: tone.text }}>{title}</div>
          <div className="text-[12px] mt-0.5" style={{ color: tone.text }}>{msg}</div>
          <div className="flex flex-wrap gap-4 mt-2.5 text-[11px]">
            <div>
              <span className="text-[#64748B] uppercase tracking-wider">Bilancio {periodo}:</span>{" "}
              <span className="font-semibold tabular" style={{ color: tone.strong }}>{formatEur(bilLiq)}</span>
            </div>
            <div>
              <span className="text-[#64748B] uppercase tracking-wider">Live ({nPost} mov.):</span>{" "}
              <span className="font-semibold tabular" style={{ color: tone.strong }}>{formatEur(liqLive)}</span>
            </div>
            <div>
              <span className="text-[#64748B] uppercase tracking-wider">Δ:</span>{" "}
              <span className="font-semibold tabular" style={{ color: tone.strong }}>
                {delta >= 0 ? "+" : "-"}{formatEur(absDelta)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Card "Patrimonio Netto Reale": calcolo live (immobili + cassa - debiti) confrontato col bilancio.
 * Renderizza null se manca il bilancio.
 */
export function PatrimonioNettoRealeCard({ data }) {
  if (!data?.bilancio_caricato || !data.bilancio || !data.gestionale) return null;
  const bil = data.bilancio;
  const gest = data.gestionale;
  const pnReale = Number(data.patrimonio_netto_reale || 0);
  const bilPN = Number(bil.patrimonio_netto || 0);
  const dPN = pnReale - bilPN;
  const absD = Math.abs(dPN);
  const pctD = bilPN > 0 ? absD / bilPN : 1;

  let pnTone, pnIcon;
  if (absD <= 5000 || pctD <= 0.05) {
    pnTone = { bg: "#ECFDF5", border: "#A7F3D0", strong: "#059669" };
    pnIcon = CheckCircle2;
  } else if (pctD <= 0.15) {
    pnTone = { bg: "#FFFBEB", border: "#FDE68A", strong: "#B45309" };
    pnIcon = AlertTriangle;
  } else {
    pnTone = { bg: "#FEF2F2", border: "#FECACA", strong: "#DC2626" };
    pnIcon = AlertTriangle;
  }
  const PnIcon = pnIcon;

  return (
    <div data-testid="pn-reale-card" className="bg-white border border-[#E2E8F0] p-4 mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#64748B] font-semibold">Patrimonio Netto Reale</div>
          <div className="text-[12px] text-[#64748B] mt-0.5">
            Confronto bilancio {data.bilancio_periodo} vs ricalcolo live dal gestionale
          </div>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1 text-[11px] font-semibold" style={{ background: pnTone.bg, border: `1px solid ${pnTone.border}`, color: pnTone.strong }}>
          <PnIcon size={13} />
          {`Δ ${dPN >= 0 ? "+" : "-"}${formatEur(absD)}`}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Tile icon={Building2} label="Immobili (gestionale)" value={formatEur(gest.valore_immobili)} sub={`${gest.n_immobili} unità`} />
        <Tile icon={Wallet} label="Cassa stimata oggi" value={formatEur(data.liquidita_live)} sub={data.n_movimenti_post_bilancio > 0 ? `${data.n_movimenti_post_bilancio} movimenti post-bilancio` : "nessun movimento successivo"} />
        <Tile icon={Banknote} label="Debito mutui residuo" value={formatEur(-gest.debito_mutui)} sub={`${gest.n_mutui} piani caricati`} negative />
        <Tile icon={Scale} label="PN Reale stimato" value={formatEur(pnReale)} sub={`Bilancio: ${formatEur(bilPN)}`} highlighted color={pnTone.strong} />
      </div>

      <div className="text-[11px] text-[#64748B] leading-relaxed">
        <strong>Formula:</strong>{` valore immobili gestionale + liquidità live (cassa bilancio + movimenti post) − debito residuo dai piani caricati = patrimonio netto reale.
        Confrontato col patrimonio netto a bilancio per evidenziare scostamenti dovuti a immobili non caricati, mutui da aggiornare o liquidità non riconciliata.`}
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub, negative, highlighted, color }) {
  return (
    <div className={`p-3 border ${highlighted ? "border-2" : "border-[#E2E8F0]"}`} style={highlighted && color ? { borderColor: color } : undefined}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#64748B] font-semibold mb-1.5">
        <Icon size={12} /> {label}
      </div>
      <div className={`font-display text-xl tabular ${highlighted ? "" : negative ? "text-[#DC2626]" : "text-[#0F172A]"}`} style={highlighted && color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-[#94A3B8] mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * Banner blu informativo se non è ancora stato caricato alcun bilancio.
 */
export function FinanzaNoBilancioHint({ data, page = "dashboard" }) {
  if (data === null) return null; // ancora in loading
  if (data?.bilancio_caricato) return null;
  return (
    <div data-testid={`fin-banner-no-bilancio-${page}`} className="mb-5 flex items-start gap-3 p-3.5 bg-[#EFF6FF] border border-[#BFDBFE]">
      <Info size={18} className="shrink-0 mt-0.5 text-[#2563EB]" />
      <div className="flex-1">
        <div className="text-[13px] font-semibold text-[#1E40AF]">Riconciliazione finanziaria non disponibile</div>
        <div className="text-[12px] text-[#1E3A8A] mt-0.5">
          {`Carica un bilancio in Impostazioni → Centro Import per attivare la riconciliazione automatica di liquidità, debiti e patrimonio netto reale.`}
        </div>
      </div>
    </div>
  );
}
