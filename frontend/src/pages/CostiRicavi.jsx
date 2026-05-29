import { useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { movimenti, properties, formatEur } from "../lib/demoData";
import { ArrowUpRight, ArrowDownRight, Plus, Upload, Filter } from "lucide-react";

export default function CostiRicavi() {
  const [tipo, setTipo] = useState("tutti");
  const filtered = movimenti.filter(m => tipo === "tutti" || m.tipo === tipo);
  const totRicavi = movimenti.filter(m => m.tipo === "ricavo").reduce((s, m) => s + m.importo, 0);
  const totCosti = movimenti.filter(m => m.tipo === "costo").reduce((s, m) => s + m.importo, 0);

  return (
    <Layout title="Costi & Ricavi" subtitle="Movimenti economici di portafoglio">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SectionCard testId="cr-kpi-ricavi">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[rgba(16,185,129,0.15)] border border-[rgba(16,185,129,0.3)] flex items-center justify-center">
              <ArrowUpRight size={18} className="text-[#059669]"/>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#64748B]">Ricavi (60 gg)</div>
              <div className="font-display text-2xl font-bold tabular text-[#059669]">{formatEur(totRicavi)}</div>
            </div>
          </div>
        </SectionCard>
        <SectionCard testId="cr-kpi-costi">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] flex items-center justify-center">
              <ArrowDownRight size={18} className="text-[#DC2626]"/>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#64748B]">Costi (60 gg)</div>
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
          <div className="flex items-center gap-2">
            <select data-testid="cr-filter-tipo" value={tipo} onChange={e => setTipo(e.target.value)} className="bg-[#F8FAFC] border border-[#E2E8F0] text-xs rounded-lg px-3 py-1.5 outline-none">
              <option value="tutti">Tutti</option>
              <option value="ricavo">Ricavi</option>
              <option value="costo">Costi</option>
            </select>
            <button className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC]"><Upload size={12}/>Import</button>
            <button className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#0066FF] text-white hover:bg-[#2563EB]"><Plus size={12}/>Nuovo</button>
          </div>
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
              <th className="py-2">Data</th>
              <th className="py-2">Categoria</th>
              <th className="py-2">Descrizione</th>
              <th className="py-2">Immobile</th>
              <th className="py-2 text-right">Importo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => {
              const p = m.immobile_id ? properties.find(x => x.id === m.immobile_id) : null;
              return (
                <tr key={m.id} className="border-b border-[#E2E8F0] last:border-0">
                  <td className="py-3 text-[#475569] text-xs">{m.data}</td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${m.tipo === "ricavo" ? "border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.15)] text-[#059669]" : "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.15)] text-[#DC2626]"}`}>
                      {m.categoria}
                    </span>
                  </td>
                  <td className="py-3">{m.descrizione}</td>
                  <td className="py-3 text-[#475569]">{p?.nome || "Generale"}</td>
                  <td className={`py-3 text-right tabular font-medium ${m.tipo === "ricavo" ? "text-[#059669]" : "text-[#DC2626]"}`}>
                    {m.tipo === "ricavo" ? "+" : "-"}{formatEur(m.importo)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>
    </Layout>
  );
}
