import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import {
  Database, Calculator, FileText, Settings as SettingsIcon, Building2,
  Receipt, Wallet, TrendingUp, Banknote, Activity, ChevronRight, AlertCircle, Info, ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Data Lineage: per ogni pagina/KPI mostriamo
 *  - formula di calcolo
 *  - collection MongoDB di origine
 *  - endpoint API
 *  - dipendenze (impostazioni utente, baseline reale vs demo, ecc.)
 */

const PAGES = [
  {
    id: "dashboard",
    route: "/",
    title: "Dashboard",
    icon: Activity,
    kpis: [
      {
        nome: "Valore patrimonio",
        formula: "Σ properties.valore_stimato (di tutti gli immobili)",
        endpoint: "GET /api/properties",
        collection: "properties.valore_stimato",
        fallback: "Se è importato un bilancio recente: bilanci.stato_patrimoniale.valore_immobili (prevalente).",
      },
      {
        nome: "Patrimonio netto",
        formula: "Attivo totale − Debito mutui",
        endpoint: "GET /api/import/bilanci/latest",
        collection: "bilanci.stato_patrimoniale (sp.totale_attivo − sp.debito_mutui)",
        fallback: "Mostra «Capitale investito» (= costo totale − debito) se nessun bilancio importato.",
      },
      {
        nome: "Ricavi mensili",
        formula: "Media ricavi mensili degli ultimi 12 mesi da movimenti banca",
        endpoint: "GET /api/import/banca/cashflow-mensile",
        collection: "bank_movements.tipo='entrata' raggruppati per mese",
        fallback: "Se nessun estratto conto importato: Σ properties.canone_mensile / 12 dal bilancio.",
      },
      {
        nome: "Cash flow netto",
        formula: "Ricavi mese − Uscite mese (rate, IMU, condominio, lavori)",
        endpoint: "GET /api/import/banca/cashflow-mensile",
        collection: "bank_movements (entrata − uscita) per mese",
        fallback: "Se demo: utile anno / 12 dal bilancio.",
      },
      {
        nome: "Debito residuo",
        formula: "Σ mutui.capitale_residuo di tutti i mutui attivi",
        endpoint: "GET /api/mutui",
        collection: "mutui.capitale_residuo",
        fallback: "Se importato bilancio: bilanci.sp.debito_mutui.",
      },
      {
        nome: "Rendimento medio netto",
        formula: "Media pesata: Σ (canone×12 × (1−aliquota)) ÷ Σ costo_totale × 100",
        endpoint: "GET /api/properties (con enrich)",
        collection: "properties.canone_mensile + properties.costo_totale + settings.tipo_societa",
        fallback: "Aliquota: IRES+IRAP 30,9% se SRL · 21% cedolare se privato (modificabili in Impostazioni).",
      },
      {
        nome: "Liquidità",
        formula: "Liquidità iniziale (Impostazioni) + Σ saldo movimenti bancari",
        endpoint: "GET /api/finance/liquidity",
        collection: "settings.liquidita_iniziale + bank_movements.importo",
        fallback: "Se importato bilancio: bilanci.sp.liquidita prevale.",
      },
      {
        nome: "Liquidità a 90 giorni",
        formula: "Liquidità attuale + Σ saldo_previsto dei prossimi 3 mesi",
        endpoint: "GET /api/cashflow/aggregato + /api/cashflow/forecast",
        collection: "settings + incassi previsti + rate mutui + scadenze fiscali",
        fallback: "Proiezione automatica basata su canoni attivi e impegni periodici.",
      },
      {
        nome: "Immobili critici",
        formula: "Conteggio immobili con rendimento netto < target_netto OPPURE stato='sfitto'",
        endpoint: "GET /api/properties (con enrich)",
        collection: "properties + settings.target_netto (default 4,5%)",
      },
      {
        nome: "Grafico Cash Flow (12 mesi)",
        formula: "Per mese: Σ entrate − Σ uscite",
        endpoint: "GET /api/import/banca/cashflow-mensile?months=12",
        collection: "bank_movements raggruppati per (anno, mese)",
        fallback: "Se non ci sono almeno 2 mesi di dati banca → mostrato seed demo.",
      },
      {
        nome: "Grafico Ricavi vs Costi",
        formula: "Per mese: ricavi=Σ entrate · costi=Σ uscite",
        endpoint: "Stesso /cashflow-mensile",
        collection: "bank_movements",
        fallback: "Se demo: dataset hardcoded `ricaviCostiAnnuali`.",
      },
    ],
  },
  {
    id: "patrimonio",
    route: "/patrimonio",
    title: "Patrimonio",
    icon: Building2,
    kpis: [
      {
        nome: "Lista immobili",
        formula: "Tutti gli immobili dell'utente",
        endpoint: "GET /api/properties",
        collection: "properties",
      },
      {
        nome: "Costo totale (per immobile)",
        formula: "prezzo_acquisto + notaio + agenzia + imposte + spese_tecniche + lavori",
        endpoint: "stessa /properties (campo `costo_totale` aggiunto da enrich_property)",
        collection: "properties.* (campi acquisto)",
      },
      {
        nome: "Rendimento lordo",
        formula: "(canone_mensile × 12) / costo_totale × 100",
        endpoint: "stessa /properties (campo `rendimento_lordo`)",
        collection: "properties.canone_mensile + costo_totale",
      },
      {
        nome: "Rendimento netto",
        formula: "(canone_annuo × (1 − aliquota_tasse) − costi_gestione) / costo_totale × 100",
        endpoint: "stessa /properties (campo `rendimento_netto`)",
        collection: "settings.tipo_societa + properties",
      },
      {
        nome: "Cash flow mensile (per immobile)",
        formula: "(canone × (1 − tasse)) − rata_mutuo − costi_gestione_stim",
        endpoint: "stessa /properties (campo `cash_flow_mensile`)",
        collection: "properties + properties.mutuo.rata + settings",
      },
      {
        nome: "Portfolio Score",
        formula: "Punteggio 0-100 ponderato: rendimento netto (40%) + cash flow (30%) + rischio LTV (15%) + occupazione (15%)",
        endpoint: "stessa /properties (campo `portfolio_score`)",
        collection: "properties + mutui + incassi",
      },
    ],
  },
  {
    id: "scheda",
    route: "/patrimonio",
    title: "Scheda Immobile",
    icon: FileText,
    kpis: [
      {
        nome: "Tab Anagrafica",
        formula: "Campi diretti dalla collection",
        endpoint: "GET /api/properties/{id}",
        collection: "properties (tutti i campi anagrafica + valore_stimato)",
      },
      {
        nome: "Tab Acquisto",
        formula: "Campi diretti + somma costo_totale",
        endpoint: "GET /api/properties/{id}",
        collection: "properties.data_acquisto + prezzo + notaio + agenzia + imposte + spese_tecniche + lavori",
      },
      {
        nome: "Tab Economico — Rendimento",
        formula: "Stessi calcoli della pagina Patrimonio applicati al singolo immobile",
        endpoint: "GET /api/properties/{id} (enrich)",
        collection: "properties + settings",
      },
      {
        nome: "Tab Locazione",
        formula: "Contratto attivo: inquilino + email/tel + date + canone + deposito",
        endpoint: "PATCH /api/properties/{id}/locazione",
        collection: "properties (campi inquilino_*, contratto_*, canone_mensile)",
      },
      {
        nome: "Tab Documenti",
        formula: "Documenti collegati a immobile_id",
        endpoint: "GET /api/documents?immobile_id={id}",
        collection: "documents.immobile_id",
      },
      {
        nome: "Tab Movimenti",
        formula: "Incassi previsti/ricevuti + costi sostenuti dell'immobile",
        endpoint: "GET /api/incassi?immobile_id={id} + /api/costi-ricavi?immobile_id={id}",
        collection: "incassi + costi_ricavi filtrati per immobile_id",
      },
      {
        nome: "Tab Alert",
        formula: "Alert attivi che coinvolgono questo immobile",
        endpoint: "GET /api/alerts?immobile_id={id}",
        collection: "alerts.immobile_id",
      },
    ],
  },
  {
    id: "affitti",
    route: "/affitti",
    title: "Affitti & Locazioni",
    icon: Wallet,
    kpis: [
      {
        nome: "Canone mensile atteso",
        formula: "Σ properties.canone_mensile WHERE stato='affittato' OR (canone>0 AND inquilino)",
        endpoint: "GET /api/properties",
        collection: "properties",
      },
      {
        nome: "Incassato del mese",
        formula: "Σ incassi.incassato WHERE stato='pagato' AND anno=current AND mese=current",
        endpoint: "GET /api/incassi/stats",
        collection: "incassi (filtrato per current month)",
      },
      {
        nome: "Tasso occupazione",
        formula: "Affittati / Totale immobili a reddito × 100",
        endpoint: "GET /api/properties + filtro frontend",
        collection: "properties WHERE operazione='reddito'",
      },
      {
        nome: "Morosità",
        formula: "Conteggio incassi con stato IN ['in_ritardo','non_pagato','parzialmente_pagato'] e mese ≤ current",
        endpoint: "GET /api/incassi",
        collection: "incassi.stato",
      },
      {
        nome: "Tab Contratti",
        formula: "Properties con operazione=reddito + filtri attivi/sfitti",
        endpoint: "GET /api/properties + PATCH /api/properties/{id}/locazione",
        collection: "properties",
      },
      {
        nome: "Tab Incassi",
        formula: "Tutti gli incassi con filtri (stato, anno, mese, immobile)",
        endpoint: "GET /api/incassi + POST /api/incassi/{id}/mark-paid",
        collection: "incassi",
      },
    ],
  },
  {
    id: "vendite",
    route: "/vendite",
    title: "Vendite & Rivendite",
    icon: TrendingUp,
    kpis: [
      {
        nome: "Operazioni concluse",
        formula: "Conteggio properties WHERE stato='venduto'",
        endpoint: "GET /api/vendite/aggregato",
        collection: "properties WHERE stato='venduto'",
      },
      {
        nome: "In vendita",
        formula: "Conteggio properties WHERE stato='in_vendita'",
        endpoint: "GET /api/vendite/aggregato",
        collection: "properties WHERE stato='in_vendita'",
      },
      {
        nome: "Utile YTD",
        formula: "Σ (prezzo_vendita − costo_totale − costi_vendita) per vendite dell'anno corrente",
        endpoint: "GET /api/vendite/aggregato",
        collection: "properties + vendite.prezzo_finale",
      },
      {
        nome: "ROI medio",
        formula: "Media: (utile_netto / capitale_investito × 100) per ogni vendita",
        endpoint: "GET /api/vendite/aggregato",
        collection: "properties (campi acquisto + vendita)",
      },
    ],
  },
  {
    id: "lavori",
    route: "/lavori",
    title: "Lavori & Ristrutturazioni",
    icon: Activity,
    kpis: [
      {
        nome: "Cantieri in corso",
        formula: "Conteggio lavori.stato='in_corso'",
        endpoint: "GET /api/lavori",
        collection: "lavori",
      },
      {
        nome: "Budget totale",
        formula: "Σ lavori.budget di tutti i cantieri (anche chiusi YTD)",
        endpoint: "GET /api/lavori/aggregato",
        collection: "lavori.budget",
      },
      {
        nome: "Speso effettivo",
        formula: "Σ lavori.costo_effettivo",
        endpoint: "GET /api/lavori/aggregato",
        collection: "lavori.costo_effettivo",
      },
      {
        nome: "Fuori budget",
        formula: "Conteggio lavori dove costo_effettivo > budget × 1.10",
        endpoint: "GET /api/lavori/aggregato",
        collection: "lavori",
      },
    ],
  },
  {
    id: "costi-ricavi",
    route: "/costi-ricavi",
    title: "Costi & Ricavi",
    icon: Receipt,
    kpis: [
      {
        nome: "Totale ricavi (periodo)",
        formula: "Σ costi_ricavi.importo WHERE tipo='ricavo' AND data nel periodo",
        endpoint: "GET /api/costi-ricavi",
        collection: "costi_ricavi.tipo='ricavo'",
      },
      {
        nome: "Totale costi (periodo)",
        formula: "Σ costi_ricavi.importo WHERE tipo='costo' AND data nel periodo",
        endpoint: "GET /api/costi-ricavi",
        collection: "costi_ricavi.tipo='costo' + bank_movements categorizzati",
      },
      {
        nome: "Saldo",
        formula: "Ricavi − Costi (del periodo selezionato)",
        endpoint: "Calcolato frontend",
        collection: "costi_ricavi (aggregato lato client)",
      },
    ],
  },
  {
    id: "cashflow",
    route: "/cash-flow",
    title: "Cash Flow",
    icon: Wallet,
    kpis: [
      {
        nome: "Saldo corrente",
        formula: "Liquidità di oggi (mese corrente)",
        endpoint: "GET /api/cashflow/aggregato",
        collection: "settings.liquidita_iniziale + bank_movements del mese corrente",
      },
      {
        nome: "Saldo medio (12m)",
        formula: "Media saldo mensile ultimi 12 mesi",
        endpoint: "GET /api/cashflow/aggregato",
        collection: "bank_movements aggregati per mese",
      },
      {
        nome: "Liquidità a 90 giorni",
        formula: "Liquidità attuale + Σ saldo_previsto prossimi 3 mesi",
        endpoint: "GET /api/cashflow/aggregato + /api/cashflow/forecast",
        collection: "incassi attesi + rate mutui + scadenze fiscali (auto-generate)",
      },
      {
        nome: "Mesi tensione (12m)",
        formula: "Conteggio mesi con saldo_previsto < 0 nei prossimi 12 mesi",
        endpoint: "GET /api/cashflow/forecast?months=12",
        collection: "forecast generato",
      },
    ],
  },
  {
    id: "kpi",
    route: "/kpi",
    title: "KPI & Rendimenti",
    icon: TrendingUp,
    kpis: [
      {
        nome: "Valore patrimonio",
        formula: "Σ properties.valore_stimato (uguale a Dashboard)",
        endpoint: "GET /api/properties",
        collection: "properties",
      },
      {
        nome: "Rendimento medio netto",
        formula: "Σ (canone_annuo_netto) / Σ costo_totale × 100",
        endpoint: "GET /api/properties (enrich)",
        collection: "properties + settings",
      },
      {
        nome: "ROI medio (cash/equity)",
        formula: "Σ cash_flow_annuo / Σ capitale_proprio_investito × 100",
        endpoint: "GET /api/kpi/aggregato",
        collection: "properties.costo_totale − mutuo.residuo",
      },
      {
        nome: "Leva finanziaria",
        formula: "Σ debito_residuo / Σ patrimonio_netto",
        endpoint: "GET /api/kpi/aggregato",
        collection: "mutui + properties",
      },
    ],
  },
  {
    id: "mutui",
    route: "/mutui",
    title: "Mutui & Finanziamenti",
    icon: Banknote,
    kpis: [
      {
        nome: "Debito totale residuo",
        formula: "Σ mutui.capitale_residuo",
        endpoint: "GET /api/mutui",
        collection: "mutui",
      },
      {
        nome: "Rata mensile totale",
        formula: "Σ mutui.rata",
        endpoint: "GET /api/mutui",
        collection: "mutui",
      },
      {
        nome: "LTV per immobile",
        formula: "mutuo.capitale_residuo / property.valore_stimato × 100",
        endpoint: "GET /api/mutui",
        collection: "mutui + properties",
      },
    ],
  },
  {
    id: "forecast",
    route: "/forecast",
    title: "Forecast (Simulatore Scenari)",
    icon: Calculator,
    kpis: [
      {
        nome: "Baseline (Anno 0)",
        formula: "Stato attuale REALE: Σ valore_stimato, Σ debito, liquidità, canone, rata, ricavi, costi",
        endpoint: "POST /api/forecast/scenarios/{sid}/simulate (build_baseline)",
        collection: "properties + mutui + bilanci (se importato) + settings",
      },
      {
        nome: "Valore immobili (proiettato)",
        formula: "valore_anno_n = valore_anno_(n-1) × (1 + rivalutazione_pct/100)",
        endpoint: "Stessa simulate",
        collection: "Parametro scenario `rivalutazione_immobili` (default 2%/anno)",
      },
      {
        nome: "Canone mensile (proiettato)",
        formula: "canone_anno_n = canone_anno_(n-1) × (1 + ISTAT/100)",
        endpoint: "Stessa simulate",
        collection: "Parametro scenario `istat_canoni` (default 1,8%/anno)",
      },
      {
        nome: "Interessi annui",
        formula: "debito_residuo × tasso_medio_pesato / 100",
        endpoint: "Stessa simulate",
        collection: "Tasso medio pesato CALCOLATO dai tuoi mutui reali (campo `_tasso_medio_reale`). Override possibile con modifier `tasso_medio_pct`.",
      },
      {
        nome: "Tasse",
        formula: "max(0, utile_lordo) × aliquota/100",
        endpoint: "Stessa simulate",
        collection: "Aliquota PRESA DALLE TUE IMPOSTAZIONI: tipo_societa + regime_affitti. Default SRL ≈30.9% (IRES+IRAP), privato ≈21% (cedolare).",
      },
      {
        nome: "Cash flow annuo",
        formula: "ricavi_annui − costi_gestione − rata_annua − tasse",
        endpoint: "Stessa simulate",
        collection: "Calcolo run-time",
      },
      {
        nome: "LTV proiettato",
        formula: "debito_residuo / valore_immobili × 100",
        endpoint: "Stessa simulate",
        collection: "Calcolo run-time",
      },
      {
        nome: "Verdetto scenario",
        formula: "Aggregazione alert per severity (critical ≥3 → critico, ≥1 → rischioso, 2 warning → attenzione, altrimenti sostenibile)",
        endpoint: "Stessa simulate",
        collection: "Generato da `compute_snapshot_alerts` + settings.limite_indebitamento + target_netto",
      },
    ],
  },
  {
    id: "pipeline",
    route: "/pipeline",
    title: "Pipeline Acquisizioni",
    icon: Building2,
    kpis: [
      {
        nome: "Deal in pipeline (per stage)",
        formula: "Conteggio deals.stage IN ('visionato','visitato',...) WHERE convertito=false",
        endpoint: "GET /api/pipeline/board",
        collection: "deals (non convertiti)",
      },
      {
        nome: "AI Deal Score (0-100)",
        formula: "Algoritmo: score=55 + (rendimento_netto−4)×7 (range 0..100). +6 se lordo≥8%, +3 se ≥6.5%, −10 se canone mancante.",
        endpoint: "POST /api/pipeline (calcolato automaticamente)",
        collection: "deals + settings.tipo_societa per calcolare tassazione e netto",
      },
      {
        nome: "Time-to-close medio",
        formula: "Media giorni: data_conversione − created_at (su deal convertiti)",
        endpoint: "GET /api/pipeline/metrics",
        collection: "deals (filtro convertito=true)",
      },
      {
        nome: "Sconto medio negoziato",
        formula: "Media (prezzo_richiesto_iniziale − prezzo_finale) / prezzo_richiesto × 100",
        endpoint: "GET /api/pipeline/metrics",
        collection: "deals.timeline_events (eventi offerta/controproposta)",
      },
    ],
  },
];

const SETTINGS_USED = [
  { key: "tipo_societa", default: "srl", usato_in: "Calcolo tasse (rendimento netto, forecast, deal score)" },
  { key: "regime_affitti", default: "ordinario", usato_in: "Aliquota: cedolare 21% / cedolare 10% / ordinario IRES+IRAP" },
  { key: "target_netto", default: "4.5%", usato_in: "Definisce immobili 'critici' + alert nella dashboard" },
  { key: "limite_indebitamento", default: "70%", usato_in: "Trigger alert LTV nel forecast" },
  { key: "liquidita_iniziale", default: "0", usato_in: "Punto di partenza calcolo Liquidità (sommata ai bonifici)" },
  { key: "sollecito_cortese_gg / fermo_gg / intimazione_gg", default: "5/15/30", usato_in: "Soglie per categorizzare ritardi affitti" },
  { key: "imu_media_pct", default: "0.86%", usato_in: "Generazione automatica scadenze IMU nel Scadenzario" },
];

export default function DataLineage() {
  const [active, setActive] = useState("dashboard");
  const navigate = useNavigate();
  const page = PAGES.find(p => p.id === active);

  const goTo = (route, kpiName) => {
    if (!route) return;
    const slug = (kpiName || "")
      .toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (slug) navigate(`${route}?highlight=${slug}`);
    else navigate(route);
  };

  return (
    <Layout title="Data Lineage" subtitle="Da dove arriva ogni numero che vedi nell'app">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Sidebar */}
        <SectionCard testId="lineage-pages-nav" title="Pagine">
          <nav className="space-y-1">
            {PAGES.map(p => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => setActive(p.id)}
                  data-testid={`lineage-nav-${p.id}`}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm border transition-colors ${
                    active === p.id
                      ? "bg-[#0066FF] text-white border-[#0066FF]"
                      : "border-transparent hover:bg-[#F8FAFC] text-[#475569]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon size={14} />
                    {p.title}
                  </span>
                  <ChevronRight size={12} className={active === p.id ? "opacity-100" : "opacity-30"} />
                </button>
              );
            })}
          </nav>
        </SectionCard>

        {/* Detail */}
        <div className="space-y-4">
          <SectionCard
            testId={`lineage-detail-${page.id}`}
            title={page.title}
            subtitle={`${page.kpis.length} elementi tracciati`}
            action={
              <div className="flex items-center gap-2">
                {page.route && (
                  <button
                    onClick={() => goTo(page.route)}
                    data-testid={`lineage-open-${page.id}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#0066FF] hover:bg-[rgba(0,102,255,0.08)] border border-[#0066FF]"
                  >
                    <ExternalLink size={11}/> Apri pagina
                  </button>
                )}
                <page.icon size={18} className="text-[#0066FF]" />
              </div>
            }
          >
            <div className="bg-[#EEF4FF] border border-[#C7D7FE] p-3 text-[11px] text-[#1E3A8A] flex gap-2 mb-4">
              <Info size={14} className="shrink-0 mt-0.5" />
              <div>Ogni numero che vedi nelle pagine dell'app è tracciabile. Clicca una riga per <strong>aprire la pagina</strong> ed essere portato direttamente al KPI corrispondente.</div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                    <th className="py-2 pr-3 w-[180px]">KPI / Grafico</th>
                    <th className="py-2 pr-3">Formula</th>
                    <th className="py-2 pr-3 w-[240px]">Endpoint / Collection</th>
                    <th className="py-2 w-[60px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {page.kpis.map((k, i) => (
                    <tr
                      key={i}
                      onClick={() => goTo(page.route, k.nome)}
                      className={`border-b border-[#E2E8F0] last:border-0 hover:bg-[#F0F7FF] transition-colors group ${page.route ? "cursor-pointer" : ""}`}
                      data-testid={`lineage-kpi-${i}`}
                    >
                      <td className="py-3 pr-3 font-medium text-[#0F172A] align-top">{k.nome}</td>
                      <td className="py-3 pr-3 text-[#475569] align-top">
                        <div className="font-mono text-[11px] bg-[#F8FAFC] p-1.5 border border-[#E2E8F0] leading-relaxed">{k.formula}</div>
                        {k.fallback && (
                          <div className="text-[10px] text-[#92400E] mt-1 flex items-start gap-1">
                            <AlertCircle size={10} className="shrink-0 mt-0.5" />
                            <span>{k.fallback}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-3 align-top">
                        <div className="text-[10px] font-mono text-[#0066FF] mb-0.5">{k.endpoint}</div>
                        <div className="text-[10px] text-[#64748B]">📂 {k.collection}</div>
                      </td>
                      <td className="py-3 text-right align-top">
                        {page.route && (
                          <ExternalLink size={14} className="text-[#94A3B8] group-hover:text-[#0066FF] inline-block" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Settings used */}
          <SectionCard
            testId="lineage-settings"
            title="Impostazioni utente usate nei calcoli"
            subtitle="Modificabili in Impostazioni → influiscono su tutta l'app"
            action={<SettingsIcon size={16} className="text-[#B45309]" />}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                  <th className="py-2 pr-3">Setting</th>
                  <th className="py-2 pr-3">Default</th>
                  <th className="py-2">Dove viene usato</th>
                </tr>
              </thead>
              <tbody>
                {SETTINGS_USED.map((s, i) => (
                  <tr key={i} className="border-b border-[#E2E8F0] last:border-0">
                    <td className="py-2 pr-3 font-mono text-[11px] text-[#0066FF]">{s.key}</td>
                    <td className="py-2 pr-3 text-[#475569] text-xs">{s.default}</td>
                    <td className="py-2 text-[#475569] text-xs">{s.usato_in}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>

          {/* MongoDB collections legenda */}
          <SectionCard
            testId="lineage-collections"
            title="Collections MongoDB"
            subtitle="Le 'tabelle' che contengono i tuoi dati"
            action={<Database size={16} className="text-[#0066FF]" />}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {[
                ["properties", "Tutti i tuoi immobili (anagrafica, acquisto, valore, locazione)"],
                ["mutui", "Mutui attivi con piano di ammortamento"],
                ["contratti", "Contratti di locazione storici e attivi"],
                ["incassi", "Incassi previsti e ricevuti mese per mese"],
                ["costi_ricavi", "Costi e ricavi manuali (manutenzioni, IMU, ecc.)"],
                ["bank_movements", "Movimenti bancari importati da estratto conto"],
                ["bilanci", "Bilanci aziendali importati dal commercialista"],
                ["documents", "Documenti caricati (rogiti, contratti, fatture, ecc.)"],
                ["alerts", "Avvisi generati automaticamente"],
                ["scenarios", "Scenari di forecast salvati"],
                ["deals", "Pipeline acquisizioni (deal in lavorazione)"],
                ["vendite", "Operazioni di vendita concluse"],
                ["lavori", "Cantieri/ristrutturazioni"],
                ["settings", "Impostazioni utente (fiscali + soglie)"],
                ["users", "Account utenti con ruoli"],
                ["email_inbox_config", "Configurazione IMAP per import annunci"],
              ].map(([name, desc]) => (
                <div key={name} className="p-2 bg-[#F8FAFC] border border-[#E2E8F0] flex items-start gap-2">
                  <Database size={12} className="text-[#0066FF] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-mono text-[#0066FF] text-[11px]">{name}</div>
                    <div className="text-[10px] text-[#64748B]">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </Layout>
  );
}
