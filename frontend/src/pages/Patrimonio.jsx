import { useState, useMemo, useEffect } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { properties, STATI, formatEur } from "../lib/demoData";
import { Search, Plus, LayoutGrid, List, MapPin, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { apiClient } from "../lib/auth";

export default function Patrimonio() {
  const [q, setQ] = useState("");
  const [stato, setStato] = useState("tutti");
  const [view, setView] = useState("table");
  const [dealsInTrattativa, setDealsInTrattativa] = useState([]);

  useEffect(() => {
    apiClient().get("/deals?status=in_trattativa")
      .then(r => setDealsInTrattativa(r.data || []))
      .catch(() => {});
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

  const allProperties = useMemo(() => [...dealProperties, ...properties], [dealProperties]);

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
      subtitle={`${filtered.length} immobili in elenco${dealsInTrattativa.length > 0 ? ` · ${dealsInTrattativa.length} dal Deal Inbox` : ""}`}
      actions={
        <div className="hidden md:flex items-center gap-2">
          <Link to="/deal-inbox" data-testid="goto-deal-inbox" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgba(0,102,255,0.1)] border border-[rgba(0,102,255,0.3)] text-[#60A5FA] hover:bg-[rgba(0,102,255,0.2)] text-sm font-medium transition-colors">
            <Sparkles size={14}/> AI Deal Scout
          </Link>
          <button data-testid="add-property-btn" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm font-medium transition-colors">
            <Plus size={14} /> Nuovo immobile
          </button>
        </div>
      }
    >
      {/* Filters */}
      <div className="bg-[#11171F] border border-[#212B36] rounded-xl p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] px-3 py-2 rounded-lg bg-[#080C11] border border-[#212B36]">
          <Search size={14} className="text-[#6B7280]" />
          <input
            data-testid="patrimonio-search"
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca per nome, indirizzo, codice…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-[#6B7280]"
          />
        </div>

        <select data-testid="filter-stato" value={stato} onChange={e => setStato(e.target.value)} className="bg-[#080C11] border border-[#212B36] text-sm rounded-lg px-3 py-2 outline-none">
          <option value="tutti">Tutti gli stati</option>
          {Object.entries(STATI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select data-testid="filter-citta" value={citta} onChange={e => setCitta(e.target.value)} className="bg-[#080C11] border border-[#212B36] text-sm rounded-lg px-3 py-2 outline-none">
          <option value="tutte">Tutte le città</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="flex border border-[#212B36] rounded-lg overflow-hidden">
          <button data-testid="view-table" onClick={() => setView("table")} className={`p-2 ${view === "table" ? "bg-[#080C11] text-[#60A5FA]" : "text-[#9CA3AF]"}`}><List size={14} /></button>
          <button data-testid="view-grid" onClick={() => setView("grid")} className={`p-2 ${view === "grid" ? "bg-[#080C11] text-[#60A5FA]" : "text-[#9CA3AF]"}`}><LayoutGrid size={14} /></button>
        </div>
      </div>

      {view === "table" ? (
        <SectionCard testId="patrimonio-table">
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B7280] border-b border-[#212B36]">
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
                  <tr key={p.id} className="border-b border-[#212B36] last:border-0 hover:bg-[#080C11]/50 transition-colors">
                    <td className="px-2 py-3">
                      <Link to={p.fromDeal ? "/deal-inbox" : `/immobile/${p.id}`} className="flex items-center gap-3 hover:text-[#60A5FA]" data-testid={`property-link-${p.id}`}>
                        <img src={p.img} className="w-10 h-10 rounded object-cover" alt="" />
                        <div>
                          <div className="font-medium text-[#F3F4F6] flex items-center gap-2">
                            {p.nome}
                            {p.fromDeal && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(0,102,255,0.15)] text-[#60A5FA] border border-[rgba(0,102,255,0.3)]">Deal Inbox</span>}
                          </div>
                          <div className="text-[11px] text-[#6B7280]">{p.id} · {p.indirizzo}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-[#9CA3AF]">{p.tipologia}</td>
                    <td className="px-2 py-3 text-[#9CA3AF]">{p.citta}</td>
                    <td className="px-2 py-3"><StatusBadge stato={p.stato} /></td>
                    <td className="px-2 py-3 text-right tabular">{formatEur(p.costo_totale)}</td>
                    <td className="px-2 py-3 text-right tabular">{formatEur(p.valore_stimato)}</td>
                    <td className="px-2 py-3 text-right tabular">{p.canone_mensile ? formatEur(p.canone_mensile) : "—"}</td>
                    <td className="px-2 py-3 text-right tabular">{p.rendimento_netto > 0 ? <span className="text-[#34D399]">{p.rendimento_netto}%</span> : "—"}</td>
                    <td className={`px-2 py-3 text-right tabular ${p.cash_flow_mensile >= 0 ? "text-[#34D399]" : "text-[#F87171]"}`}>{formatEur(p.cash_flow_mensile)}</td>
                    <td className="px-2 py-3 text-right">
                      <span className={`tabular font-medium ${p.portfolio_score >= 71 ? "text-[#34D399]" : p.portfolio_score >= 41 ? "text-[#FBBF24]" : "text-[#F87171]"}`}>{p.portfolio_score}</span>
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
            <Link key={p.id} to={p.fromDeal ? "/deal-inbox" : `/immobile/${p.id}`} data-testid={`property-card-${p.id}`} className="bg-[#11171F] border border-[#212B36] rounded-xl overflow-hidden card-hover group">
              <div className="relative h-44">
                <img src={p.img} alt={p.nome} className="w-full h-full object-cover" />
                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                  <StatusBadge stato={p.stato} />
                  {p.fromDeal && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(0,102,255,0.85)] text-white font-semibold">Deal Inbox</span>}
                </div>
                <div className="absolute bottom-3 right-3 bg-[#080C11]/90 backdrop-blur border border-[#212B36] rounded-full px-2 py-1 text-[11px] tabular">
                  <span className={`font-bold ${p.portfolio_score >= 71 ? "text-[#34D399]" : p.portfolio_score >= 41 ? "text-[#FBBF24]" : "text-[#F87171]"}`}>{p.portfolio_score}</span>
                  <span className="text-[#6B7280]">/100</span>
                </div>
              </div>
              <div className="p-4">
                <div className="font-display font-semibold text-[#F3F4F6] group-hover:text-[#60A5FA] transition-colors">{p.nome}</div>
                <div className="text-xs text-[#9CA3AF] mt-0.5 flex items-center gap-1"><MapPin size={10}/> {p.indirizzo}, {p.citta}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 pt-3 border-t border-[#212B36]">
                  <div>
                    <div className="text-[10px] text-[#6B7280] uppercase">Canone</div>
                    <div className="text-sm tabular text-[#F3F4F6]">{p.canone_mensile ? formatEur(p.canone_mensile) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#6B7280] uppercase">Netto</div>
                    <div className="text-sm tabular text-[#34D399]">{p.rendimento_netto > 0 ? `${p.rendimento_netto}%` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#6B7280] uppercase">Cash flow</div>
                    <div className={`text-sm tabular ${p.cash_flow_mensile >= 0 ? "text-[#34D399]" : "text-[#F87171]"}`}>{formatEur(p.cash_flow_mensile)}</div>
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
