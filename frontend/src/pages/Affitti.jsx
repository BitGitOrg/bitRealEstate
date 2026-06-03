import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { formatEur } from "../lib/demoData";
import { apiClient } from "../lib/auth";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  CheckCircle2, Clock, AlertCircle, XCircle, RefreshCw, Loader2, Edit2,
  Calendar, ExternalLink, Search, Filter, X, FileText, AlertTriangle, Save,
} from "lucide-react";

const STATO_INCASSO = {
  pagato: { label: "Pagato", icon: CheckCircle2, color: "#059669", bg: "#D1FAE5" },
  parzialmente_pagato: { label: "Parziale", icon: AlertCircle, color: "#B45309", bg: "#FEF3C7" },
  previsto: { label: "Previsto", icon: Clock, color: "#475569", bg: "#F1F5F9" },
  in_ritardo: { label: "In ritardo", icon: Clock, color: "#B45309", bg: "#FEF3C7" },
  non_pagato: { label: "Non pagato", icon: XCircle, color: "#DC2626", bg: "#FEE2E2" },
};

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export default function Affitti() {
  const [props, setProps] = useState([]);
  const [incassi, setIncassi] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [markPaidModal, setMarkPaidModal] = useState(null);
  const [editContract, setEditContract] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [pr, inc, st] = await Promise.all([
        apiClient().get("/properties"),
        apiClient().get("/incassi"),
        apiClient().get("/incassi/stats"),
      ]);
      setProps(pr.data || []);
      setIncassi(inc.data || []);
      setStats(st.data);
    } catch {
      toast.error("Errore caricamento");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const reconcile = async () => {
    setReconciling(true);
    try {
      const r = await apiClient().post("/incassi/reconcile");
      const m = r.data.matched || 0;
      toast.success(m > 0 ? `${m} incassi abbinati ai movimenti bancari` : "Nessun nuovo abbinamento trovato.");
      load();
    } catch {
      toast.error("Errore riconciliazione");
    } finally {
      setReconciling(false);
    }
  };

  // KPI
  const propsReddito = props.filter(p => p.operazione === "reddito" || !p.operazione);
  const affittati = propsReddito.filter(p => p.stato === "affittato" || (p.canone_mensile > 0 && p.inquilino));
  const totMensile = affittati.reduce((s, p) => s + (p.canone_mensile || 0), 0);
  const occupazione = propsReddito.length ? Math.round(affittati.length / propsReddito.length * 100) : 0;

  const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const morosi = incassi.filter(i => {
    const key = `${i.anno}-${String(i.mese).padStart(2, "0")}`;
    if (key > todayKey) return false;
    return ["in_ritardo", "non_pagato", "parzialmente_pagato"].includes(i.stato);
  }).length;

  return (
    <Layout
      title="Affitti & Locazioni"
      subtitle={`${affittati.length} contratti attivi · Tasso occupazione ${occupazione}%`}
      actions={
        <button
          data-testid="reconcile-btn"
          onClick={reconcile}
          disabled={reconciling}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {reconciling ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {reconciling ? "Riconciliazione…" : "Riconcilia con banca"}
        </button>
      }
    >
      {markPaidModal && (
        <MarkPaidModal incasso={markPaidModal} property={props.find(p => p.id === markPaidModal.immobile_id)} onClose={() => setMarkPaidModal(null)} onSaved={load} />
      )}
      {editContract && (
        <EditContractModal property={editContract} onClose={() => setEditContract(null)} onSaved={load} />
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="affitti-kpi-canone">
          <div className="text-[10px] uppercase text-[#64748B] tracking-wider">Canone mensile atteso</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{formatEur(totMensile)}</div>
        </SectionCard>
        <SectionCard testId="affitti-kpi-incassato">
          <div className="text-[10px] uppercase text-[#64748B] tracking-wider">Incassato {stats?.current_month || "mese"}</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#059669]">{formatEur(stats?.paid_eur || 0)}</div>
          {stats && (
            <div className="text-[11px] text-[#475569] mt-0.5">{stats.paid_count}/{stats.expected_count} pagamenti · {stats.completion_pct}%</div>
          )}
        </SectionCard>
        <SectionCard testId="affitti-kpi-occupazione">
          <div className="text-[10px] uppercase text-[#64748B] tracking-wider">Tasso occupazione</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{occupazione}%</div>
        </SectionCard>
        <SectionCard testId="affitti-kpi-morosita">
          <div className="text-[10px] uppercase text-[#64748B] tracking-wider">Morosità</div>
          <div className={`font-display text-3xl font-bold tabular mt-1 ${morosi > 0 ? "text-[#DC2626]" : "text-[#0F172A]"}`}>{morosi}</div>
          <div className="text-xs text-[#475569] mt-0.5">incass{morosi === 1 ? "o" : "i"} non a posto</div>
        </SectionCard>
      </div>

      {/* TABS */}
      <Tabs defaultValue="contratti" className="w-full">
        <TabsList className="bg-white border border-[#E2E8F0]" data-testid="affitti-tabs">
          <TabsTrigger value="contratti" data-testid="tab-contratti">
            Contratti di locazione ({affittati.length})
          </TabsTrigger>
          <TabsTrigger value="incassi" data-testid="tab-incassi">
            Incassi ({incassi.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contratti" className="mt-4">
          <ContrattiTab
            properties={props}
            affittati={affittati}
            loading={loading}
            onEdit={(p) => setEditContract(p)}
            onChanged={load}
          />
        </TabsContent>

        <TabsContent value="incassi" className="mt-4">
          <IncassiTab
            incassi={incassi}
            properties={props}
            loading={loading}
            onMarkPaid={(i) => setMarkPaidModal(i)}
          />
        </TabsContent>
      </Tabs>
    </Layout>
  );
}

// ============================================================================
// TAB 1 — CONTRATTI
// ============================================================================
function ContrattiTab({ properties, affittati, loading, onEdit, onChanged }) {
  const [search, setSearch] = useState("");
  const [statoFilter, setStatoFilter] = useState("attivi");
  const [showAddModal, setShowAddModal] = useState(false);

  const filtered = useMemo(() => {
    let list = [];
    if (statoFilter === "attivi") {
      list = affittati;
    } else if (statoFilter === "sfitti") {
      list = properties.filter(p =>
        (p.operazione === "reddito" || !p.operazione) &&
        !(p.stato === "affittato" || (p.canone_mensile > 0 && p.inquilino))
      );
    } else {
      list = properties.filter(p => p.operazione === "reddito" || !p.operazione);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(p =>
        (p.nome || "").toLowerCase().includes(s) ||
        (p.inquilino || "").toLowerCase().includes(s) ||
        (p.indirizzo || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [affittati, properties, statoFilter, search]);

  if (loading) {
    return <SectionCard><div className="py-10 text-center text-sm text-[#475569]">Caricamento…</div></SectionCard>;
  }

  return (
    <>
      {showAddModal && (
        <AddContractModal properties={properties} onClose={() => setShowAddModal(false)} onSaved={() => { setShowAddModal(false); onChanged(); }} />
      )}

      <SectionCard
        title="Contratti di locazione"
        subtitle="Tutti i contratti attivi con CRUD diretto"
        testId="affitti-contratti"
        action={
          <button
            onClick={() => setShowAddModal(true)}
            data-testid="add-contract-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-semibold"
          >
            + Nuovo contratto
          </button>
        }
      >
        {/* Filtri */}
        <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-[#E2E8F0]">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca immobile, inquilino, indirizzo…"
              data-testid="search-contratti"
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg pl-8 pr-3 py-1.5 text-sm outline-none focus:border-[#0066FF]"
            />
          </div>
          <div className="flex gap-1">
            {[
              { v: "attivi", l: "Attivi", c: affittati.length },
              { v: "sfitti", l: "Sfitti", c: properties.filter(p => (p.operazione === "reddito" || !p.operazione) && !(p.stato === "affittato" || (p.canone_mensile > 0 && p.inquilino))).length },
              { v: "tutti", l: "Tutti", c: properties.filter(p => p.operazione === "reddito" || !p.operazione).length },
            ].map(o => (
              <button
                key={o.v}
                onClick={() => setStatoFilter(o.v)}
                data-testid={`filter-${o.v}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statoFilter === o.v
                    ? "bg-[#0066FF] text-white"
                    : "border border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1]"
                }`}
              >
                {o.l} ({o.c})
              </button>
            ))}
          </div>
        </div>

        {/* Tabella */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                <th className="py-2 pr-2">Immobile</th>
                <th className="py-2 pr-2">Inquilino</th>
                <th className="py-2 pr-2">Contatti</th>
                <th className="py-2 pr-2">Periodo</th>
                <th className="py-2 pr-2 text-right">Canone</th>
                <th className="py-2 pr-2 text-right">Deposito</th>
                <th className="py-2 pr-2">Stato</th>
                <th className="py-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isAttivo = p.stato === "affittato" || (p.canone_mensile > 0 && p.inquilino);
                const scadenza = p.scadenza_contratto || p.contratto_data_fine;
                const oggi = new Date();
                const giorniScad = scadenza ? Math.round((new Date(scadenza) - oggi) / (1000 * 60 * 60 * 24)) : null;
                const inScadenza = giorniScad !== null && giorniScad > 0 && giorniScad < 90;
                return (
                  <tr key={p.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC] transition-colors" data-testid={`contract-row-${p.id}`}>
                    <td className="py-3 pr-2">
                      <Link to={`/immobile/${p.id}`} className="font-medium text-[#0F172A] hover:text-[#0066FF] inline-flex items-center gap-1">
                        {p.nome}
                        <ExternalLink size={11} className="opacity-50" />
                      </Link>
                      <div className="text-[11px] text-[#64748B] truncate max-w-[200px]">{p.indirizzo}</div>
                    </td>
                    <td className="py-3 pr-2">{p.inquilino || "—"}</td>
                    <td className="py-3 pr-2 text-[11px] text-[#475569]">
                      {p.inquilino_email && <div className="truncate max-w-[160px]" title={p.inquilino_email}>{p.inquilino_email}</div>}
                      {p.inquilino_telefono && <div>{p.inquilino_telefono}</div>}
                      {!p.inquilino_email && !p.inquilino_telefono && <span className="text-[#94A3B8]">—</span>}
                    </td>
                    <td className="py-3 pr-2 text-xs text-[#475569]">
                      <div>{p.data_inizio_contratto || p.contratto_data_inizio || "—"}</div>
                      <div className={inScadenza ? "text-[#B45309] font-medium" : ""}>
                        → {scadenza || "—"}
                        {inScadenza && <span className="ml-1 text-[10px]">({giorniScad}gg)</span>}
                      </div>
                    </td>
                    <td className="py-3 pr-2 text-right tabular font-medium">{formatEur(p.canone_mensile)}</td>
                    <td className="py-3 pr-2 text-right tabular text-[#475569]">{formatEur(p.deposito_cauzionale || p.deposito || 0)}</td>
                    <td className="py-3 pr-2">
                      {isAttivo ? (
                        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[#D1FAE5] text-[#059669]">
                          <CheckCircle2 size={11} /> Attivo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#475569]">
                          <XCircle size={11} /> Sfitto
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => onEdit(p)}
                        data-testid={`edit-contract-${p.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs text-[#0066FF] hover:bg-[rgba(0,102,255,0.08)] font-medium"
                      >
                        <Edit2 size={11} /> Modifica
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-sm text-[#475569]">
                  {search ? "Nessun risultato con questi filtri." : "Nessun contratto. Click su «Nuovo contratto» per iniziare."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}

// ============================================================================
// TAB 2 — INCASSI con filtri
// ============================================================================
function IncassiTab({ incassi, properties, loading, onMarkPaid }) {
  const [search, setSearch] = useState("");
  const [statoFilter, setStatoFilter] = useState("tutti");
  const [meseFilter, setMeseFilter] = useState("tutti");
  const [annoFilter, setAnnoFilter] = useState("tutti");
  const [immobileFilter, setImmobileFilter] = useState("tutti");

  const propsMap = useMemo(() => {
    const m = {};
    properties.forEach(p => { m[p.id] = p; });
    return m;
  }, [properties]);

  // Calcola opzioni filtri da dati reali
  const anni = useMemo(() => [...new Set(incassi.map(i => i.anno).filter(Boolean))].sort((a, b) => b - a), [incassi]);
  const immobiliConIncassi = useMemo(() => {
    const ids = [...new Set(incassi.map(i => i.immobile_id).filter(Boolean))];
    return ids.map(id => ({ id, nome: propsMap[id]?.nome || id })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [incassi, propsMap]);

  const filtered = useMemo(() => {
    let list = incassi;
    if (statoFilter !== "tutti") list = list.filter(i => i.stato === statoFilter);
    if (meseFilter !== "tutti") list = list.filter(i => i.mese === parseInt(meseFilter));
    if (annoFilter !== "tutti") list = list.filter(i => i.anno === parseInt(annoFilter));
    if (immobileFilter !== "tutti") list = list.filter(i => i.immobile_id === immobileFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(i => {
        const p = propsMap[i.immobile_id];
        return (p?.nome || "").toLowerCase().includes(s) ||
               (p?.inquilino || "").toLowerCase().includes(s) ||
               (p?.indirizzo || "").toLowerCase().includes(s);
      });
    }
    // ordina per anno desc, mese desc
    return list.slice().sort((a, b) => {
      if ((b.anno || 0) !== (a.anno || 0)) return (b.anno || 0) - (a.anno || 0);
      return (b.mese || 0) - (a.mese || 0);
    });
  }, [incassi, statoFilter, meseFilter, annoFilter, immobileFilter, search, propsMap]);

  const totPrevisto = filtered.reduce((s, i) => s + (i.previsto || 0), 0);
  const totIncassato = filtered.reduce((s, i) => s + (i.incassato || 0), 0);

  const resetFilters = () => {
    setSearch(""); setStatoFilter("tutti"); setMeseFilter("tutti");
    setAnnoFilter("tutti"); setImmobileFilter("tutti");
  };
  const hasActiveFilters = search || statoFilter !== "tutti" || meseFilter !== "tutti" || annoFilter !== "tutti" || immobileFilter !== "tutti";

  if (loading) {
    return <SectionCard><div className="py-10 text-center text-sm text-[#475569]">Caricamento…</div></SectionCard>;
  }

  return (
    <SectionCard
      title="Incassi affitti"
      subtitle={`${filtered.length} incassi · ${formatEur(totIncassato)} su ${formatEur(totPrevisto)} previsti`}
      testId="affitti-incassi"
    >
      {/* Filtri */}
      <div className="space-y-3 mb-4 pb-3 border-b border-[#E2E8F0]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca immobile, inquilino, indirizzo…"
              data-testid="search-incassi"
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg pl-8 pr-3 py-1.5 text-sm outline-none focus:border-[#0066FF]"
            />
          </div>
          {hasActiveFilters && (
            <button onClick={resetFilters} data-testid="reset-filters" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-[#DC2626] hover:bg-[#FEF2F2]">
              <X size={12} /> Reset filtri
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={12} className="text-[#94A3B8]" />
          <select value={statoFilter} onChange={(e) => setStatoFilter(e.target.value)} data-testid="filter-stato" className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2 py-1 text-xs outline-none focus:border-[#0066FF]">
            <option value="tutti">Stato: tutti</option>
            <option value="pagato">Pagato</option>
            <option value="parzialmente_pagato">Parziale</option>
            <option value="previsto">Previsto</option>
            <option value="in_ritardo">In ritardo</option>
            <option value="non_pagato">Non pagato</option>
          </select>
          <select value={annoFilter} onChange={(e) => setAnnoFilter(e.target.value)} data-testid="filter-anno" className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2 py-1 text-xs outline-none focus:border-[#0066FF]">
            <option value="tutti">Anno: tutti</option>
            {anni.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={meseFilter} onChange={(e) => setMeseFilter(e.target.value)} data-testid="filter-mese" className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2 py-1 text-xs outline-none focus:border-[#0066FF]">
            <option value="tutti">Mese: tutti</option>
            {MESI.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={immobileFilter} onChange={(e) => setImmobileFilter(e.target.value)} data-testid="filter-immobile" className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2 py-1 text-xs outline-none focus:border-[#0066FF] max-w-[200px]">
            <option value="tutti">Immobile: tutti</option>
            {immobiliConIncassi.map(im => <option key={im.id} value={im.id}>{im.nome}</option>)}
          </select>
        </div>
      </div>

      {/* Tabella */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
              <th className="py-2 pr-2">Mese</th>
              <th className="py-2 pr-2">Immobile</th>
              <th className="py-2 pr-2">Inquilino</th>
              <th className="py-2 pr-2 text-right">Previsto</th>
              <th className="py-2 pr-2 text-right">Incassato</th>
              <th className="py-2 pr-2">Data incasso</th>
              <th className="py-2 pr-2">Metodo</th>
              <th className="py-2 pr-2">Stato</th>
              <th className="py-2 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(i => {
              const meta = STATO_INCASSO[i.stato] || STATO_INCASSO.previsto;
              const Icon = meta.icon;
              const p = propsMap[i.immobile_id];
              return (
                <tr key={i.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC] transition-colors" data-testid={`incasso-row-${i.id}`}>
                  <td className="py-3 pr-2 text-xs text-[#475569] tabular whitespace-nowrap">{MESI[(i.mese || 1) - 1]} {i.anno}</td>
                  <td className="py-3 pr-2">
                    {p ? (
                      <Link to={`/immobile/${p.id}`} className="text-[#0F172A] hover:text-[#0066FF] font-medium">
                        {p.nome}
                      </Link>
                    ) : (
                      <span className="text-[#94A3B8]">{i.immobile_id}</span>
                    )}
                  </td>
                  <td className="py-3 pr-2 text-[#475569]">{p?.inquilino || "—"}</td>
                  <td className="py-3 pr-2 text-right tabular">{formatEur(i.previsto)}</td>
                  <td className="py-3 pr-2 text-right tabular font-medium" style={{ color: i.incassato > 0 ? "#059669" : "#94A3B8" }}>{formatEur(i.incassato)}</td>
                  <td className="py-3 pr-2 text-xs text-[#475569]">{i.data_incasso || "—"}</td>
                  <td className="py-3 pr-2 text-xs text-[#475569]">{i.metodo || "—"}</td>
                  <td className="py-3 pr-2">
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: meta.bg, color: meta.color }}>
                      <Icon size={11} /> {meta.label}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    {i.stato !== "pagato" && (
                      <button
                        onClick={() => onMarkPaid(i)}
                        data-testid={`markpaid-${i.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs text-[#0066FF] hover:bg-[rgba(0,102,255,0.08)] font-medium"
                      >
                        <CheckCircle2 size={11} /> Segna pagato
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-sm text-[#475569]">
                {incassi.length === 0
                  ? "Nessun incasso. Salva un contratto di locazione per generare gli incassi previsti automaticamente."
                  : "Nessun risultato con questi filtri."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer totali */}
      {filtered.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#E2E8F0] flex justify-end gap-6 text-xs text-[#475569]">
          <span>Totale previsto: <strong className="text-[#0F172A] tabular">{formatEur(totPrevisto)}</strong></span>
          <span>Totale incassato: <strong className="text-[#059669] tabular">{formatEur(totIncassato)}</strong></span>
          <span>Delta: <strong className={`tabular ${totIncassato - totPrevisto < 0 ? "text-[#DC2626]" : "text-[#059669]"}`}>{formatEur(totIncassato - totPrevisto)}</strong></span>
        </div>
      )}
    </SectionCard>
  );
}

// ============================================================================
// MODAL: Modifica contratto (CRUD inline)
// ============================================================================
function EditContractModal({ property, onClose, onSaved }) {
  const [form, setForm] = useState({
    inquilino: property.inquilino || "",
    inquilino_email: property.inquilino_email || "",
    inquilino_telefono: property.inquilino_telefono || "",
    data_inizio_contratto: property.data_inizio_contratto || property.contratto_data_inizio || "",
    scadenza_contratto: property.scadenza_contratto || property.contratto_data_fine || "",
    canone_mensile: property.canone_mensile || "",
    deposito_cauzionale: property.deposito_cauzionale || property.deposito || "",
    spese_condominiali: property.spese_condominiali || "",
    stato: property.stato || "affittato",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await apiClient().patch(`/properties/${property.id}/locazione`, {
        ...form,
        canone_mensile: parseFloat(form.canone_mensile) || 0,
        deposito_cauzionale: parseFloat(form.deposito_cauzionale) || 0,
        spese_condominiali: parseFloat(form.spese_condominiali) || 0,
      });
      toast.success("Contratto aggiornato");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="edit-contract-modal">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-[#0F172A]">Modifica contratto</div>
            <div className="text-xs text-[#64748B]">{property.nome} · {property.indirizzo}</div>
          </div>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-[#EEF4FF] border border-[#C7D7FE] rounded-lg p-3 text-[11px] text-[#1E3A8A] flex gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <div>Email e telefono sono <strong>fondamentali</strong> per i solleciti automatici WhatsApp/Email T+5/15/30 giorni dalla scadenza canone.</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <F label="Inquilino — Nome" value={form.inquilino} onChange={(v) => setForm({ ...form, inquilino: v })} testId="edit-inquilino" />
            <F label="Stato" type="select" value={form.stato} onChange={(v) => setForm({ ...form, stato: v })} options={[
              { v: "affittato", l: "Affittato" }, { v: "sfitto", l: "Sfitto" },
              { v: "disponibile", l: "Disponibile" }, { v: "in_vendita", l: "In vendita" },
            ]} />
            <F label="Email inquilino" value={form.inquilino_email} onChange={(v) => setForm({ ...form, inquilino_email: v })} type="email" testId="edit-email" placeholder="mario@example.com" />
            <F label="Telefono (WhatsApp)" value={form.inquilino_telefono} onChange={(v) => setForm({ ...form, inquilino_telefono: v })} testId="edit-tel" placeholder="+393331234567" />
            <F label="Data inizio contratto" value={form.data_inizio_contratto} onChange={(v) => setForm({ ...form, data_inizio_contratto: v })} type="date" />
            <F label="Data scadenza contratto" value={form.scadenza_contratto} onChange={(v) => setForm({ ...form, scadenza_contratto: v })} type="date" />
            <F label="Canone mensile (€)" value={form.canone_mensile} onChange={(v) => setForm({ ...form, canone_mensile: v })} type="number" testId="edit-canone" />
            <F label="Deposito cauzionale (€)" value={form.deposito_cauzionale} onChange={(v) => setForm({ ...form, deposito_cauzionale: v })} type="number" />
            <F label="Spese condominiali mensili (€)" value={form.spese_condominiali} onChange={(v) => setForm({ ...form, spese_condominiali: v })} type="number" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-between items-center">
          <Link to={`/immobile/${property.id}`} className="text-xs text-[#0066FF] hover:underline inline-flex items-center gap-1">
            <ExternalLink size={11} /> Vai alla scheda immobile completa
          </Link>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-sm text-[#475569]">Annulla</button>
            <button onClick={submit} disabled={saving} data-testid="save-contract" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-semibold">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salva
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MODAL: Nuovo contratto
// ============================================================================
function AddContractModal({ properties, onClose, onSaved }) {
  const sfitti = properties.filter(p =>
    (p.operazione === "reddito" || !p.operazione) &&
    !(p.stato === "affittato" || (p.canone_mensile > 0 && p.inquilino))
  );
  const [selectedId, setSelectedId] = useState(sfitti[0]?.id || "");
  const [form, setForm] = useState({
    inquilino: "", inquilino_email: "", inquilino_telefono: "",
    data_inizio_contratto: new Date().toISOString().slice(0, 10),
    scadenza_contratto: "",
    canone_mensile: "", deposito_cauzionale: "", spese_condominiali: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!selectedId) { toast.error("Seleziona un immobile"); return; }
    if (!form.inquilino) { toast.error("Nome inquilino obbligatorio"); return; }
    if (!form.canone_mensile) { toast.error("Canone obbligatorio"); return; }
    setSaving(true);
    try {
      await apiClient().patch(`/properties/${selectedId}/locazione`, {
        ...form,
        canone_mensile: parseFloat(form.canone_mensile) || 0,
        deposito_cauzionale: parseFloat(form.deposito_cauzionale) || 0,
        spese_condominiali: parseFloat(form.spese_condominiali) || 0,
        stato: "affittato",
      });
      toast.success("Contratto creato + incassi previsti generati");
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore creazione");
    } finally {
      setSaving(false);
    }
  };

  if (sfitti.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center" onClick={(e) => e.stopPropagation()}>
          <AlertTriangle size={32} className="text-[#B45309] mx-auto mb-3" />
          <div className="text-base font-semibold mb-1">Nessun immobile sfitto disponibile</div>
          <div className="text-sm text-[#475569] mb-4">Tutti gli immobili a reddito hanno già un contratto attivo. Aggiungi un nuovo immobile dal menu Patrimonio.</div>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-[#0066FF] text-white text-sm">Chiudi</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="add-contract-modal">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="text-base font-semibold text-[#0F172A]">Nuovo contratto di locazione</div>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <F label="Immobile sfitto" type="select" value={selectedId} onChange={setSelectedId} options={sfitti.map(p => ({ v: p.id, l: `${p.nome} · ${p.indirizzo}` }))} testId="new-contract-property" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <F label="Inquilino — Nome *" value={form.inquilino} onChange={(v) => setForm({ ...form, inquilino: v })} testId="new-inquilino" />
            <F label="Email inquilino" value={form.inquilino_email} onChange={(v) => setForm({ ...form, inquilino_email: v })} type="email" placeholder="mario@example.com" />
            <F label="Telefono (WhatsApp)" value={form.inquilino_telefono} onChange={(v) => setForm({ ...form, inquilino_telefono: v })} placeholder="+393331234567" />
            <F label="Data inizio" value={form.data_inizio_contratto} onChange={(v) => setForm({ ...form, data_inizio_contratto: v })} type="date" />
            <F label="Data scadenza" value={form.scadenza_contratto} onChange={(v) => setForm({ ...form, scadenza_contratto: v })} type="date" />
            <F label="Canone mensile (€) *" value={form.canone_mensile} onChange={(v) => setForm({ ...form, canone_mensile: v })} type="number" testId="new-canone" />
            <F label="Deposito cauzionale (€)" value={form.deposito_cauzionale} onChange={(v) => setForm({ ...form, deposito_cauzionale: v })} type="number" />
            <F label="Spese condominiali mensili (€)" value={form.spese_condominiali} onChange={(v) => setForm({ ...form, spese_condominiali: v })} type="number" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-sm text-[#475569]">Annulla</button>
          <button onClick={submit} disabled={saving} data-testid="save-new-contract" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-semibold">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} Crea contratto
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MODAL: segna pagato
// ============================================================================
function MarkPaidModal({ incasso, property, onClose, onSaved }) {
  const [incassato, setIncassato] = useState(incasso.previsto);
  const [dataInc, setDataInc] = useState(new Date().toISOString().slice(0, 10));
  const [metodo, setMetodo] = useState("bonifico");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await apiClient().post(`/incassi/${incasso.id}/mark-paid`, {
        incassato: parseFloat(incassato), data_incasso: dataInc, metodo,
      });
      toast.success("Incasso registrato");
      onSaved(); onClose();
    } catch {
      toast.error("Errore");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <div className="text-sm font-semibold text-[#0F172A]">Segna come pagato</div>
          <div className="text-xs text-[#64748B]">{MESI[(incasso.mese || 1) - 1]} {incasso.anno} · {property?.nome || incasso.immobile_id} · Previsto {formatEur(incasso.previsto)}</div>
        </div>
        <div className="p-5 space-y-3">
          <F label="Importo incassato (€)" value={incassato} onChange={setIncassato} type="number" testId="markpaid-importo" />
          <F label="Data incasso" value={dataInc} onChange={setDataInc} type="date" testId="markpaid-data" />
          <F label="Metodo" type="select" value={metodo} onChange={setMetodo} options={[
            { v: "bonifico", l: "Bonifico" }, { v: "contanti", l: "Contanti" },
            { v: "assegno", l: "Assegno" }, { v: "altro", l: "Altro" },
          ]} />
        </div>
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-sm text-[#475569]">Annulla</button>
          <button onClick={submit} disabled={saving} data-testid="markpaid-save" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-semibold">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Calendar size={12} />} Salva
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Field component
// ============================================================================
function F({ label, value, onChange, type = "text", placeholder, options, testId }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
      {type === "select" ? (
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} data-testid={testId} className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]">
          {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      ) : (
        <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={testId} className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]" />
      )}
    </label>
  );
}
