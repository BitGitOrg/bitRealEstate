import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { properties, formatEur } from "../lib/demoData";
import { TrendingUp, Calendar, Trophy } from "lucide-react";

export default function Vendite() {
  const venduti = properties.filter(p => p.stato === "venduto");
  const inVendita = properties.filter(p => p.stato === "in_vendita");

  return (
    <Layout title="Vendite & Rivendite" subtitle="Operazioni di vendita e rivendita immobiliari">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SectionCard testId="vendite-kpi-conclusi">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[rgba(132,204,22,0.15)] border border-[rgba(132,204,22,0.3)] flex items-center justify-center"><Trophy size={18} className="text-[#4D7C0F]"/></div>
            <div>
              <div className="text-[10px] uppercase text-[#64748B]">Operazioni concluse</div>
              <div className="font-display text-2xl font-bold tabular">{venduti.length}</div>
            </div>
          </div>
        </SectionCard>
        <SectionCard testId="vendite-kpi-in-vendita">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[rgba(14,165,233,0.15)] border border-[rgba(14,165,233,0.3)] flex items-center justify-center"><Calendar size={18} className="text-[#38BDF8]"/></div>
            <div>
              <div className="text-[10px] uppercase text-[#64748B]">Attualmente in vendita</div>
              <div className="font-display text-2xl font-bold tabular">{inVendita.length}</div>
            </div>
          </div>
        </SectionCard>
        <SectionCard testId="vendite-kpi-utile">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[rgba(16,185,129,0.15)] border border-[rgba(16,185,129,0.3)] flex items-center justify-center"><TrendingUp size={18} className="text-[#059669]"/></div>
            <div>
              <div className="text-[10px] uppercase text-[#64748B]">Utile netto YTD</div>
              <div className="font-display text-2xl font-bold tabular text-[#059669]">{formatEur(venduti.reduce((s, p) => s + (p.utile_netto || 0), 0))}</div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="In vendita" subtitle="Immobili attualmente sul mercato" testId="vendite-in-corso" className="mb-4">
        {inVendita.length === 0 && <div className="text-sm text-[#475569] py-4">Nessun immobile in vendita.</div>}
        {inVendita.map(p => (
          <div key={p.id} className="flex items-center gap-4 p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg mb-2 last:mb-0">
            <img src={p.img} className="w-16 h-16 rounded object-cover" alt="" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[#0F172A]">{p.nome}</div>
              <div className="text-xs text-[#475569]">{p.citta} · Costo totale {formatEur(p.costo_totale)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase text-[#64748B]">Target vendita</div>
              <div className="font-display text-lg font-bold tabular text-[#059669]">{formatEur(p.prezzo_vendita_target)}</div>
              <div className="text-[11px] text-[#64748B]">Min {formatEur(p.prezzo_minimo)}</div>
            </div>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Storico vendite" subtitle="Operazioni concluse" testId="vendite-storico">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
              <th className="py-2">Immobile</th>
              <th className="py-2">Data vendita</th>
              <th className="py-2 text-right">Costo totale</th>
              <th className="py-2 text-right">Prezzo vendita</th>
              <th className="py-2 text-right">Utile netto</th>
              <th className="py-2 text-right">ROI</th>
              <th className="py-2">Stato</th>
            </tr>
          </thead>
          <tbody>
            {venduti.map(p => (
              <tr key={p.id} className="border-b border-[#E2E8F0] last:border-0">
                <td className="py-3">{p.nome}</td>
                <td className="py-3 text-[#475569]">{p.data_vendita}</td>
                <td className="py-3 text-right tabular">{formatEur(p.costo_totale)}</td>
                <td className="py-3 text-right tabular">{formatEur(p.prezzo_vendita)}</td>
                <td className="py-3 text-right tabular text-[#059669]">{formatEur(p.utile_netto)}</td>
                <td className="py-3 text-right tabular text-[#059669]">+{((p.utile_netto / p.costo_totale) * 100).toFixed(1)}%</td>
                <td className="py-3"><StatusBadge stato={p.stato} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </Layout>
  );
}
