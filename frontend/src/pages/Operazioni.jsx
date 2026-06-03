import { useState, useEffect } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { formatEur } from "../lib/demoData";
import { apiClient } from "../lib/auth";
import { Home, ShoppingBag, Hammer, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import NewPropertyModal from "../components/property/NewPropertyModal";

const OPERAZIONI = {
  reddito: { label: "Immobile a reddito", icon: Home, color: "#10B981", desc: "Acquisto finalizzato all'affitto" },
  compra_vendi: { label: "Compra-Vendi", icon: ShoppingBag, color: "#0066FF", desc: "Acquisto finalizzato alla rivendita" },
  compra_ristruttura_vendi: { label: "Compra-Ristruttura-Vendi", icon: Hammer, color: "#F59E0B", desc: "Acquisto, lavori e rivendita" },
};

export default function Operazioni() {
  const [realProps, setRealProps] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [preselect, setPreselect] = useState(null);

  const load = () => apiClient().get("/properties").then(r => setRealProps(r.data || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  // Se ho properties reali nel DB → uso solo quelle. Altrimenti fallback demo.
  const allProperties = realProps.length > 0 ? realProps : [];
  const grouped = Object.keys(OPERAZIONI).map(k => ({
    key: k, meta: OPERAZIONI[k], items: allProperties.filter(p => p.operazione === k),
  }));

  const openModal = (op) => { setPreselect(op); setModalOpen(true); };

  return (
    <Layout
      title="Operazioni Immobiliari"
      subtitle="Gestione delle tipologie di operazione attive"
      actions={
        <button
          data-testid="new-operation-btn"
          onClick={() => openModal(null)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm font-medium transition-colors"
        >
          <Plus size={14} /> Nuova operazione
        </button>
      }
    >
      <NewPropertyModal
        open={modalOpen}
        preselectOperazione={preselect}
        onClose={() => { setModalOpen(false); setPreselect(null); }}
        onCreated={() => load()}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {grouped.map(g => {
          const Icon = g.meta.icon;
          const totale = g.items.reduce((s, x) => s + (x.costo_totale || 0), 0);
          return (
            <SectionCard key={g.key} testId={`op-summary-${g.key}`}>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${g.meta.color}20`, border: `1px solid ${g.meta.color}40` }}>
                  <Icon size={18} style={{ color: g.meta.color }} />
                </div>
                <div className="flex-1">
                  <div className="font-display font-semibold text-[#0F172A]">{g.meta.label}</div>
                  <div className="text-xs text-[#475569]">{g.meta.desc}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#E2E8F0]">
                <div>
                  <div className="text-[10px] uppercase text-[#64748B]">Immobili</div>
                  <div className="font-display text-2xl font-bold tabular">{g.items.length}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#64748B]">Capitale</div>
                  <div className="font-display text-2xl font-bold tabular">{formatEur(totale)}</div>
                </div>
              </div>
              <button
                data-testid={`op-add-${g.key}`}
                onClick={() => openModal(g.key)}
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition"
                style={{ background: g.meta.color }}
              >
                <Plus size={12} /> Aggiungi {g.meta.label.toLowerCase()}
              </button>
            </SectionCard>
          );
        })}
      </div>

      {grouped.map(g => g.items.length > 0 && (
        <SectionCard key={g.key} title={g.meta.label} subtitle={`${g.items.length} operazioni`} testId={`op-list-${g.key}`} className="mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                <th className="py-2">Immobile</th>
                <th className="py-2">Stato</th>
                <th className="py-2 text-right">Costo totale</th>
                <th className="py-2 text-right">Valore</th>
                <th className="py-2 text-right">Canone</th>
                <th className="py-2 text-right">Margine atteso</th>
              </tr>
            </thead>
            <tbody>
              {g.items.map(p => {
                const margine = (p.valore_stimato || 0) - p.costo_totale;
                return (
                  <tr key={p.id} className="border-b border-[#E2E8F0] last:border-0">
                    <td className="py-3"><Link to={`/immobile/${p.id}`} className="hover:text-[#2563EB]">{p.nome}</Link></td>
                    <td className="py-3"><StatusBadge stato={p.stato} /></td>
                    <td className="py-3 text-right tabular">{formatEur(p.costo_totale)}</td>
                    <td className="py-3 text-right tabular">{formatEur(p.valore_stimato)}</td>
                    <td className="py-3 text-right tabular">{p.canone_mensile ? formatEur(p.canone_mensile) : "—"}</td>
                    <td className={`py-3 text-right tabular ${margine >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{formatEur(margine)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>
      ))}
    </Layout>
  );
}
