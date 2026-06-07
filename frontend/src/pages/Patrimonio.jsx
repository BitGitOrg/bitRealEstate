import { useState, useMemo, useEffect } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { StatusBadge, DisdettaBadge } from "../components/StatusBadge";
import { ScoreBadge } from "../components/ScoreBadge";
import { STATI, formatEur } from "../lib/demoData";
import { Search, Plus, LayoutGrid, List, MapPin, Sparkles, Info, CheckCircle2, AlertTriangle, FileWarning } from "lucide-react";
import { Link } from "react-router-dom";
import { apiClient } from "../lib/auth";
import NewPropertyModal from "../components/property/NewPropertyModal";

// Soglie tolleranza riconciliazione bilancio↔gestionale (valore immobili)
const RECONCILE_TOLERANCE_EUR = 5000;
const RECONCILE_TOLERANCE_PCT = 0.05;

function computeBannerState(reconcile, propsCount) {
  if (!reconcile?.bilancio_caricato) return "no-bilancio";
  const bilVal = Number(reconcile?.bilancio_valore_immobili || 0);
  if (bilVal === 0 && propsCount === 0) return "no-immobili";
  if (bilVal > 0 && propsCount === 0) return "alert-missing";
  return "reconcile";
}

function PatrimonioReconcileBanner({ state, reconcile, propsCount, onAddClick }) {
  const periodo = reconcile?.bilancio_periodo;
  const bilVal = Number(reconcile?.bilancio_valore_immobili || 0);
  const gestVal = Number(reconcile?.gestionale_valore_immobili || 0);

  if (state === "no-bilancio") {
    return (
      <div data-testid="patr-banner-no-bilancio" className="mb-5 flex items-start gap-3 p-3.5 bg-[#EFF6FF] border border-[#BFDBFE]">
        <Info size={18} className="shrink-0 mt-0.5 text-[#2563EB]" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-[#1E40AF]">Riconciliazione bilancio non disponibile</div>
          <div className="text-[12px] text-[#1E3A8A] mt-0.5">
            {`Carica almeno un bilancio in Impostazioni → Centro Import per confrontare automaticamente il valore degli immobili a bilancio con il totale del gestionale.`}
          </div>
        </div>
      </div>
    );
  }

  if (state === "no-immobili") {
    return (
      <div data-testid="patr-banner-no-immobili" className="mb-5 flex items-start gap-3 p-3.5 bg-[#ECFDF5] border border-[#A7F3D0]">
        <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-[#059669]" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-[#065F46]">{`Nessun immobile a bilancio ${periodo || ""}`}</div>
          <div className="text-[12px] text-[#047857] mt-0.5">
            {`Lo stato patrimoniale del bilancio più recente non riporta immobili. Carica prima un bilancio aggiornato per registrare nuovi immobili nel gestionale.`}
          </div>
        </div>
      </div>
    );
  }

  if (state === "alert-missing") {
    return (
      <div data-testid="patr-banner-alert-missing" className="mb-5 p-4 bg-[#FEF2F2] border-2 border-[#FCA5A5]">
        <div className="flex items-start gap-3">
          <FileWarning size={20} className="shrink-0 mt-0.5 text-[#DC2626]" />
          <div className="flex-1">
            <div className="text-[14px] font-bold text-[#991B1B]">{`Immobili a bilancio ${periodo || ""}: ${formatEur(bilVal)}`}</div>
            <div className="text-[12.5px] text-[#7F1D1D] mt-1 leading-relaxed">
              {`Lo stato patrimoniale riporta immobili per ${formatEur(bilVal)} ma il gestionale è vuoto.`}
              <strong> {`Carica i tuoi immobili`} </strong>
              {`per allineare la rappresentazione e ottenere KPI, cash flow e portfolio score accurati.`}
            </div>
            <button
              onClick={onAddClick}
              data-testid="patr-banner-add-cta"
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold uppercase tracking-wider transition-colors"
            >
              <Plus size={13} /> Aggiungi il primo immobile
            </button>
          </div>
        </div>
      </div>
    );
  }

  // state === 'reconcile'
  const delta = bilVal - gestVal;
  const absDelta = Math.abs(delta);
  const pctDelta = bilVal > 0 ? absDelta / bilVal : 1;
  let tone, msg, Icon;
  if (bilVal === 0 && gestVal > 0) {
    tone = { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", strong: "#B45309" };
    Icon = AlertTriangle;
    msg = `Il bilancio ${periodo || ""} non riporta immobili a libro, ma in gestionale ne hai ${propsCount} per ${formatEur(gestVal)}. Verifica i dati del bilancio.`;
  } else if (absDelta <= RECONCILE_TOLERANCE_EUR || pctDelta <= RECONCILE_TOLERANCE_PCT) {
    tone = { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", strong: "#059669" };
    Icon = CheckCircle2;
    msg = `Patrimonio allineato (${propsCount} immobili · scostamento ${formatEur(absDelta)}).`;
  } else if (pctDelta <= 0.15) {
    tone = { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", strong: "#B45309" };
    Icon = AlertTriangle;
    msg = `Scostamento moderato bilancio↔gestionale: ${formatEur(absDelta)} (${(pctDelta * 100).toFixed(1)}%). Verifica eventuali immobili mancanti o valori non aggiornati.`;
  } else {
    tone = { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", strong: "#DC2626" };
    Icon = AlertTriangle;
    msg = `Forte scostamento bilancio↔gestionale: ${formatEur(absDelta)} (${(pctDelta * 100).toFixed(1)}%). Possibile immobile mancante o valutazione disallineata.`;
  }

  return (
    <div
      data-testid="patr-banner-reconcile"
      className="mb-5 p-3.5 border"
      style={{ background: tone.bg, borderColor: tone.border }}
    >
      <div className="flex items-start gap-3">
        <Icon size={18} className="shrink-0 mt-0.5" style={{ color: tone.strong }} />
        <div className="flex-1">
          <div className="text-[13px] font-semibold" style={{ color: tone.text }}>
            {`Riconciliazione bilancio ↔ gestionale`}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: tone.text }}>{msg}</div>
          <div className="flex flex-wrap gap-4 mt-2.5 text-[11px]">
            <div>
              <span className="text-[#64748B] uppercase tracking-wider">Bilancio {periodo || ""}:</span>{" "}
              <span className="font-semibold tabular" style={{ color: tone.strong }}>{formatEur(bilVal)}</span>
            </div>
            <div>
              <span className="text-[#64748B] uppercase tracking-wider">Gestionale ({propsCount} immobili):</span>{" "}
              <span className="font-semibold tabular" style={{ color: tone.strong }}>{formatEur(gestVal)}</span>
            </div>
            <div>
              <span className="text-[#64748B] uppercase tracking-wider">Δ:</span>{" "}
              <span className="font-semibold tabular" style={{ color: tone.strong }}>
                {formatEur(absDelta)}
                {delta !== 0 ? ` (${delta > 0 ? "↑ bilancio" : "↑ gestionale"})` : ""}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Patrimonio() {
  const [q, setQ] = useState("");
  const [stato, setStato] = useState("tutti");
  const [view, setView] = useState("table");
  const [dealsInTrattativa, setDealsInTrattativa] = useState([]);
  const [realProps, setRealProps] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [reconcile, setReconcile] = useState(null);

  const loadProps = () => apiClient().get("/properties").then(r => setRealProps(r.data || [])).catch(() => {});
  const loadReconcile = () => apiClient().get("/patrimonio/reconcile").then(r => setReconcile(r.data || null)).catch(() => {});

  useEffect(() => {
    apiClient().get("/deals?status=in_trattativa")
      .then(r => setDealsInTrattativa(r.data || []))
      .catch(() => {});
    loadProps();
    loadReconcile();
  }, []);

  // Convert deals into property-like rows
  const dealProperties = useMemo(() => dealsInTrattativa.map(d => ({
    id: `DEAL-${d.id.slice(0, 6)}`,
    nome: d.titolo,
    indirizzo: d.zona || "—",
    citta: d.citta || "—",
    tipologia: d.tipologia || "—",
    stato: "in_trattativa",
    costo_totale: d.prezzo,
    valore_stimato: d.prezzo,
    canone_mensile: d.canone_stimato,
    rendimento_netto: d.rendimento_netto,
    cash_flow_mensile: 0,
    portfolio_score: d.deal_score,
    metratura: d.metratura,
    img: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?crop=entropy&cs=srgb&fm=jpg&w=400",
    fromDeal: true,
    dealId: d.id,
  })), [dealsInTrattativa]);

  const allProperties = useMemo(() => {
    return [...realProps, ...dealProperties];
  }, [realProps, dealProperties]);

  const cities = useMemo(() => Array.from(new Set(allProperties.map(p => p.citta))).filter(Boolean), [allProperties]);
  const [citta, setCitta] = useState("tutte");

  const filtered = allProperties.filter(p =>
    (q === "" || p.nome.toLowerCase().includes(q.toLowerCase()) || (p.indirizzo || "").toLowerCase().includes(q.toLowerCase()) || p.id.toLowerCase().includes(q.toLowerCase()))
    && (stato === "tutti" || p.stato === stato)
    && (citta === "tutte" || p.citta === citta)
  );

  return (
    <Layout
      title="Patrimonio Immobiliare"
      subtitle={`${filtered.length} immobili${dealsInTrattativa.length > 0 ? ` · ${dealsInTrattativa.length} in trattativa` : ""}`}
      actions={
        <div className="hidden md:flex items-center gap-2">
          <Link to="/pipeline" data-testid="goto-pipeline" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgba(0,102,255,0.1)] border border-[rgba(0,102,255,0.3)] text-[#2563EB] hover:bg-[rgba(0,102,255,0.2)] text-sm font-medium transition-colors">
            <Sparkles size={14}/> AI Deal Scout
          </Link>
          <button data-testid="add-property-btn" onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm font-medium transition-colors">
            <Plus size={14} /> Nuovo immobile
          </button>
        </div>
      }
    >
      <NewPropertyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => { loadProps(); loadReconcile(); }}
      />

      {/* Banner riconciliazione bilancio↔gestionale */}
      {reconcile && (
        <PatrimonioReconcileBanner
          state={computeBannerState(reconcile, realProps.length)}
          reconcile={reconcile}
          propsCount={realProps.length}
          onAddClick={() => setModalOpen(true)}
        />
      )}

      {/* Filters */}
      <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
          <Search size={14} className="text-[#64748B]" />
          <input
            data-testid="patrimonio-search"
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca per nome, indirizzo, codice…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-[#64748B]"
          />
        </div>

        <select data-testid="filter-stato" value={stato} onChange={e => setStato(e.target.value)} className="bg-[#F8FAFC] border border-[#E2E8F0] text-sm rounded-lg px-3 py-2 outline-none">
          <option value="tutti">Tutti gli stati</option>
          {Object.entries(STATI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select data-testid="filter-citta" value={citta} onChange={e => setCitta(e.target.value)} className="bg-[#F8FAFC] border border-[#E2E8F0] text-sm rounded-lg px-3 py-2 outline-none">
          <option value="tutte">Tutte le città</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="flex border border-[#E2E8F0] rounded-lg overflow-hidden">
          <button data-testid="view-table" onClick={() => setView("table")} className={`p-2 ${view === "table" ? "bg-[#F8FAFC] text-[#2563EB]" : "text-[#475569]"}`}><List size={14} /></button>
          <button data-testid="view-grid" onClick={() => setView("grid")} className={`p-2 ${view === "grid" ? "bg-[#F8FAFC] text-[#2563EB]" : "text-[#475569]"}`}><LayoutGrid size={14} /></button>
        </div>
      </div>

      {view === "table" ? (
        <SectionCard testId="patrimonio-table">
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                  <th className="px-2 py-2 font-medium">Immobile</th>
                  <th className="px-2 py-2 font-medium">Tipologia</th>
                  <th className="px-2 py-2 font-medium">Città</th>
                  <th className="px-2 py-2 font-medium">Stato</th>
                  <th className="px-2 py-2 font-medium text-right">Costo totale</th>
                  <th className="px-2 py-2 font-medium text-right">Valore</th>
                  <th className="px-2 py-2 font-medium text-right">Canone</th>
                  <th className="px-2 py-2 font-medium text-right">Netto %</th>
                  <th className="px-2 py-2 font-medium text-right">Cash flow</th>
                  <th className="px-2 py-2 font-medium text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]/50 transition-colors">
                    <td className="px-2 py-3">
                      <Link to={p.id?.startsWith('DEAL-') ? "/pipeline" : `/immobile/${p.id}`} className="flex items-center gap-3 hover:text-[#2563EB]" data-testid={`property-link-${p.id}`}>
                        <img src={p.img} className="w-10 h-10 rounded object-cover" alt="" />
                        <div>
                          <div className="font-medium text-[#0F172A] flex items-center gap-2">
                            {p.nome}
                            {p.fromDeal && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(0,102,255,0.15)] text-[#2563EB] border border-[rgba(0,102,255,0.3)]">Deal Inbox</span>}
                          </div>
                          <div className="text-[11px] text-[#64748B]">{p.id} · {p.indirizzo}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-[#475569]">{p.tipologia}</td>
                    <td className="px-2 py-3 text-[#475569]">{p.citta}</td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusBadge stato={p.stato} />
                        {p.disdetta_ricevuta_il && <DisdettaBadge dataUscita={p.data_uscita_prevista} compact testId={`row-disdetta-${p.id}`} />}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right tabular">{formatEur(p.costo_totale)}</td>
                    <td className="px-2 py-3 text-right tabular">{formatEur(p.valore_stimato)}</td>
                    <td className="px-2 py-3 text-right tabular">{p.canone_mensile ? formatEur(p.canone_mensile) : "—"}</td>
                    <td className="px-2 py-3 text-right tabular">{p.rendimento_netto > 0 ? <span className="text-[#059669]">{p.rendimento_netto}%</span> : "—"}</td>
                    <td className={`px-2 py-3 text-right tabular ${p.cash_flow_mensile >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{formatEur(p.cash_flow_mensile)}</td>
                    <td className="px-2 py-3 text-right">
                      <ScoreBadge score={p.portfolio_score} breakdown={p.score_breakdown} testId={`score-${p.id}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => (
            <Link key={p.id} to={p.id?.startsWith('DEAL-') ? "/pipeline" : `/immobile/${p.id}`} data-testid={`property-card-${p.id}`} className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl overflow-hidden card-hover group">
              <div className="relative h-44">
                <img src={p.img} alt={p.nome} className="w-full h-full object-cover" />
                <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap">
                  <StatusBadge stato={p.stato} />
                  {p.disdetta_ricevuta_il && <DisdettaBadge dataUscita={p.data_uscita_prevista} compact />}
                  {p.fromDeal && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(0,102,255,0.85)] text-white font-semibold">Deal Inbox</span>}
                </div>
                <div className="absolute bottom-3 right-3 bg-[#F8FAFC]/90 backdrop-blur border border-[#E2E8F0] rounded-full px-2 py-1 text-[11px] tabular" onClick={(e) => e.preventDefault()}>
                  <ScoreBadge score={p.portfolio_score} breakdown={p.score_breakdown} size="sm" testId={`score-card-${p.id}`} />
                  <span className="text-[#64748B] ml-0.5">/100</span>
                </div>
              </div>
              <div className="p-4">
                <div className="font-display font-semibold text-[#0F172A] group-hover:text-[#2563EB] transition-colors">{p.nome}</div>
                <div className="text-xs text-[#475569] mt-0.5 flex items-center gap-1"><MapPin size={10}/> {p.indirizzo}, {p.citta}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 pt-3 border-t border-[#E2E8F0]">
                  <div>
                    <div className="text-[10px] text-[#64748B] uppercase">Canone</div>
                    <div className="text-sm tabular text-[#0F172A]">{p.canone_mensile ? formatEur(p.canone_mensile) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#64748B] uppercase">Netto</div>
                    <div className="text-sm tabular text-[#059669]">{p.rendimento_netto > 0 ? `${p.rendimento_netto}%` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#64748B] uppercase">Cash flow</div>
                    <div className={`text-sm tabular ${p.cash_flow_mensile >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{formatEur(p.cash_flow_mensile)}</div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
