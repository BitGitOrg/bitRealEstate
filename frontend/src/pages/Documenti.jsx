import { useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { documenti, properties } from "../lib/demoData";
import { FileText, Upload, Download, Search, Sparkles } from "lucide-react";

const TIPI = ["Tutti", "Rogito", "APE", "Contratto", "Fattura", "Planimetria", "Visura"];

export default function Documenti() {
  const [tipo, setTipo] = useState("Tutti");
  const [q, setQ] = useState("");
  const filtered = documenti.filter(d =>
    (tipo === "Tutti" || d.tipo === tipo) &&
    (q === "" || d.nome.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <Layout title="Documenti" subtitle={`${documenti.length} documenti in archivio`}
      actions={
        <button data-testid="doc-upload-btn" className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm font-medium transition-colors">
          <Upload size={14} /> Carica documento
        </button>
      }
    >
      <div className="bg-[#11171F] border border-[#212B36] rounded-xl p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] px-3 py-2 rounded-lg bg-[#080C11] border border-[#212B36]">
          <Search size={14} className="text-[#6B7280]" />
          <input data-testid="doc-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca documento…" className="bg-transparent outline-none text-sm flex-1 placeholder:text-[#6B7280]" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {TIPI.map(t => (
            <button
              key={t}
              data-testid={`doc-filter-${t}`}
              onClick={() => setTipo(t)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${tipo === t ? "bg-[#0066FF] text-white border-[#0066FF]" : "bg-transparent text-[#9CA3AF] border-[#212B36] hover:border-[#334155]"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <SectionCard
        title="Archivio"
        subtitle={`${filtered.length} risultati`}
        testId="doc-list"
        action={
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[rgba(0,102,255,0.3)] bg-[rgba(0,102,255,0.1)] text-[#60A5FA]">
            <Sparkles size={11}/> AI Reader attivo
          </span>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(d => {
            const p = properties.find(x => x.id === d.immobile_id);
            return (
              <div key={d.id} data-testid={`doc-card-${d.id}`} className="p-4 bg-[#080C11] border border-[#212B36] rounded-lg hover:border-[#334155] transition-colors group">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[rgba(0,102,255,0.1)] border border-[rgba(0,102,255,0.3)] flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-[#60A5FA]" />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF] border border-[#212B36] rounded px-1.5 py-0.5">{d.tipo}</span>
                </div>
                <div className="font-medium text-sm text-[#F3F4F6] mb-1 line-clamp-2">{d.nome}</div>
                {p && <div className="text-[11px] text-[#9CA3AF]">{p.nome}</div>}
                <div className="text-[11px] text-[#6B7280] mt-2">{d.dimensione} · {d.caricato}</div>
                <button className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#212B36] hover:bg-[#11171F] text-[#9CA3AF] hover:text-[#F3F4F6] transition-colors">
                  <Download size={12} /> Scarica
                </button>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </Layout>
  );
}
