import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { FileBarChart, Download, Building2, Landmark, Sparkles, BookOpen } from "lucide-react";
import { toast } from "sonner";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

const REPORTS = [
  {
    id: "stato-salute",
    nome: "Stato di Salute della Società",
    desc: "Snapshot completo: KPI, conto economico, top/worst immobili, anomalie, storico bilanci. Il documento più completo per fotografare la salute della società.",
    icon: Building2,
    color: "#0066FF",
  },
  {
    id: "business-plan",
    nome: "Business Plan (per le banche)",
    desc: "Documento destinato a istituti di credito: profilo, patrimonio, struttura del debito, scenari di crescita, indici di solidità, allegato con elenco immobili.",
    icon: Landmark,
    color: "#059669",
  },
  {
    id: "investor-book",
    nome: "Investor Book",
    desc: "Catalogo visivo di tutti gli immobili: per ogni asset una scheda dedicata con foto, anagrafica, dati economici, mutuo, locazione attiva e inquilino. Più pagina di KPI portafoglio e recap finale. Perfetto da condividere con investitori e advisor.",
    icon: BookOpen,
    color: "#7C3AED",
  },
];

export default function Report() {
  const download = async (r) => {
    try {
      const t = localStorage.getItem("crr_token");
      const res = await fetch(`${API_BASE}/report/${r.id}.pdf`, { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        toast.error(err.detail || "Errore download");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${r.id}.pdf`;
      a.click(); URL.revokeObjectURL(url);
      toast.success(`${r.nome} scaricato`);
    } catch { toast.error("Errore download"); }
  };

  return (
    <Layout title="Report Direzionali" subtitle="3 report comprensivi · PDF brandizzati con logo società">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {REPORTS.map(r => {
          const Icon = r.icon;
          return (
            <div key={r.id} data-testid={`report-${r.id}`} className="bg-white border border-[#E2E8F0] rounded-xl p-6 card-hover relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full pointer-events-none" style={{ background: `${r.color}10` }} />
              <div className="relative">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: `${r.color}15`, border: `1px solid ${r.color}40` }}>
                  <Icon size={22} style={{ color: r.color }} />
                </div>
                <h3 className="font-display text-xl font-bold text-[#0F172A] mb-2 tracking-tight">{r.nome}</h3>
                <p className="text-sm text-[#475569] leading-relaxed mb-5 min-h-[60px]">{r.desc}</p>
                <button
                  data-testid={`report-${r.id}-pdf`}
                  onClick={() => download(r)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors"
                  style={{ background: r.color }}
                >
                  <Download size={14}/> Scarica PDF
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <SectionCard testId="report-info" className="mt-6">
        <div className="flex items-start gap-3">
          <Sparkles size={16} className="text-[#2563EB] mt-0.5"/>
          <div>
            <div className="text-sm font-medium text-[#0F172A]">I report sono generati live dai tuoi dati reali</div>
            <div className="text-xs text-[#475569] mt-1 leading-relaxed">
              Lo "Stato di Salute" usa l'ultimo bilancio importato dal Centro Import + tutti gli immobili nel Patrimonio.
              Il "Business Plan" aggiunge proiezioni di crescita su 3 scenari (+2, +5, +10 immobili/anno) basate sul costo medio del tuo portafoglio.
            </div>
          </div>
        </div>
      </SectionCard>
    </Layout>
  );
}
