import { useState, useEffect, useMemo } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { movimenti, properties, formatEur } from "../lib/demoData";
import { apiClient } from "../lib/auth";
import { ArrowUpRight, ArrowDownRight, Plus, Upload, Filter, Banknote, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

export default function CostiRicavi() {
  const [tipo, setTipo] = useState("tutti");
  const [origine, setOrigine] = useState("tutte"); // tutte | manuale | banca
  const [bankMovs, setBankMovs] = useState([]);

  useEffect(() => {
    apiClient().get("/import/banca")
      .then(r => setBankMovs(r.data || []))
      .catch(() => {});
  }, []);

  // Normalize bank movements to the same shape as `movimenti`
  const bankNormalized = useMemo(() => bankMovs.map(m => ({
    id: m.id,
    data: (m.data || "").slice(0, 10),
    tipo: m.importo >= 0 ? "ricavo" : "costo",
    categoria: m.match_canone ? "Affitto" : (m.importo >= 0 ? "Bonifico" : "Pagamento"),
    descrizione: m.descrizione || "—",
    immobile_id: m.match_canone?.property_id || null,
    immobile_nome: m.match_canone?.property_nome || null,
    importo: Math.abs(m.importo),
    fromBank: true,
    matched: !!m.match_canone,
  })), [bankMovs]);

  const allMovs = useMemo(() => {
    const arr = [...bankNormalized, ...movimenti.map(m => ({ ...m, fromBank: false }))];
    return arr.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  }, [bankNormalized]);

  const filtered = allMovs.filter(m =>
    (tipo === "tutti" || m.tipo === tipo) &&
    (origine === "tutte" || (origine === "banca" ? m.fromBank : !m.fromBank))
  );

  const totRicavi = allMovs.filter(m => m.tipo === "ricavo").reduce((s, m) => s + m.importo, 0);
  const totCosti = allMovs.filter(m => m.tipo === "costo").reduce((s, m) => s + m.importo, 0);

  return (
    <Layout title="Costi & Ricavi" subtitle={`${allMovs.length} movimenti · ${bankMovs.length} importati da banca`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SectionCard testId="cr-kpi-ricavi">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[rgba(16,185,129,0.10)] border border-[rgba(16,185,129,0.3)] flex items-center justify-center">
              <ArrowUpRight size={18} className="text-[#059669]"/>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#64748B]">Ricavi</div>
              <div className="font-display text-2xl font-bold tabular text-[#059669]">{formatEur(totRicavi)}</div>
            </div>
          </div>
        </SectionCard>
        <SectionCard testId="cr-kpi-costi">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[rgba(239,68,68,0.10)] border border-[rgba(239,68,68,0.3)] flex items-center justify-center">
              <ArrowDownRight size={18} className="text-[#DC2626]"/>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#64748B]">Costi</div>
              <div className="font-display text-2xl font-bold tabular text-[#DC2626]">{formatEur(totCosti)}</div>
            </div>
          </div>
        </SectionCard>
        <SectionCard testId="cr-kpi-saldo">
          <div className="text-[10px] uppercase text-[#64748B]">Saldo netto</div>
          <div className={`font-display text-3xl font-bold tabular mt-1 ${totRicavi - totCosti >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{formatEur(totRicavi - totCosti)}</div>
        </SectionCard>
      </div>

      <SectionCard
        title="Movimenti recenti"
        testId="cr-table"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <select data-testid="cr-filter-tipo" value={tipo} onChange={e => setTipo(e.target.value)} className="bg-white border border-[#E2E8F0] text-xs rounded-lg px-3 py-1.5 outline-none">
              <option value="tutti">Tutti i tipi</option>
              <option value="ricavo">Ricavi</option>
              <option value="costo">Costi</option>
            </select>
            <select data-testid="cr-filter-origine" value={origine} onChange={e => setOrigine(e.target.value)} className="bg-white border border-[#E2E8F0] text-xs rounded-lg px-3 py-1.5 outline-none">
              <option value="tutte">Tutte le origini</option>
              <option value="manuale">Manuali</option>
              <option value="banca">Da banca</option>
            </select>
            <Link to="/import" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:border-[#CBD5E1]"><Upload size={12}/>Import</Link>
            <button className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#0066FF] text-white hover:bg-[#2563EB]"><Plus size={12}/>Nuovo</button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                <th className="py-2">Data</th>
                <th className="py-2">Categoria</th>
                <th className="py-2">Descrizione</th>
                <th className="py-2">Immobile</th>
                <th className="py-2">Origine</th>
                <th className="py-2 text-right">Importo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const p = m.immobile_id ? (properties.find(x => x.id === m.immobile_id)) : null;
                return (
                  <tr key={m.id} className="border-b border-[#E2E8F0] last:border-0">
                    <td className="py-3 text-[#475569] text-xs">{m.data}</td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${m.tipo === "ricavo" ? "border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.10)] text-[#059669]" : "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.10)] text-[#DC2626]"}`}>
                        {m.categoria}
                      </span>
                    </td>
                    <td className="py-3 text-[#0F172A]">{m.descrizione}</td>
                    <td className="py-3 text-[#475569]">{m.immobile_nome || p?.nome || (m.fromBank && !m.matched ? <span className="text-[#64748B] italic text-xs">nessun match</span> : "Generale")}</td>
                    <td className="py-3">
                      {m.fromBank ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-[rgba(0,102,255,0.3)] bg-[rgba(0,102,255,0.08)] text-[#2563EB]" data-testid="badge-banca">
                          <Banknote size={10}/> Banca
                          {m.matched && <CheckCircle2 size={10} className="text-[#059669] ml-0.5"/>}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#64748B]">Manuale</span>
                      )}
                    </td>
                    <td className={`py-3 text-right tabular font-medium ${m.tipo === "ricavo" ? "text-[#059669]" : "text-[#DC2626]"}`}>
                      {m.tipo === "ricavo" ? "+" : "-"}{formatEur(m.importo)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </Layout>
  );
}
