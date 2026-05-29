import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { FileBarChart, Download, FileText, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

const REPORTS = [
  { id: "patrimonio", nome: "Report Patrimonio Completo", desc: "Vista d'insieme di tutto il portafoglio + snapshot da bilancio", formats: ["pdf", "xlsx", "csv"], real: true },
  { id: "bilancio", nome: "Bilancio (ultimo importato)", desc: "Conto Economico + Stato Patrimoniale dell'ultimo bilancio caricato", formats: ["pdf"], real: true },
  { id: "rendimento", nome: "Report Rendimento per Immobile", desc: "Rendimento lordo, netto e ROI", formats: ["pdf", "xlsx"], real: false },
  { id: "affitti", nome: "Report Affitti & Locazioni", desc: "Contratti, incassi, morosità", formats: ["pdf", "xlsx"], real: false },
  { id: "vendite", nome: "Report Vendite & Rivendite", desc: "Operazioni concluse e margini", formats: ["pdf", "xlsx"], real: false },
  { id: "lavori", nome: "Report Lavori e Ristrutturazioni", desc: "Budget vs effettivo per cantiere", formats: ["pdf", "xlsx"], real: false },
  { id: "cashflow", nome: "Report Cash Flow 12 mesi", desc: "Storico + forecast", formats: ["pdf", "xlsx"], real: false },
  { id: "mutui", nome: "Report Mutui & Esposizione", desc: "LTV, rate, scadenze", formats: ["pdf", "xlsx"], real: false },
];

export default function Report() {
  const downloadReal = async (reportId, fmt, nome) => {
    try {
      const t = localStorage.getItem("crr_token");
      const r = await fetch(`${API_BASE}/report/${reportId}.${fmt}`, { headers: { Authorization: `Bearer ${t}` } });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: "Errore download" }));
        toast.error(err.detail || `Errore ${r.status}`);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportId}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${nome} scaricato`);
    } catch { toast.error("Errore download"); }
  };

  const dlMock = (fmt, nome) => toast.info(`Report "${nome}" in ${fmt.toUpperCase()} — mockup, sarà attivato in fase successiva`);

  return (
    <Layout title="Report Direzionali" subtitle="Esporta i dati del portafoglio in PDF, Excel o CSV">
      <SectionCard
        testId="report-ai-monthly"
        className="mb-6 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-[#0066FF]/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-6 flex-wrap">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#2563EB] mb-2">
              <Sparkles size={11} /> Report AI Mensile · Generato il 03/02/2026
            </div>
            <h3 className="font-display text-2xl font-bold tracking-tight mb-2">Andamento di Gennaio 2026</h3>
            <p className="text-sm text-[#475569] leading-relaxed">
              Il portafoglio ha generato <strong className="text-[#059669]">€3.440 di cash flow netto</strong>, in linea con la media trimestrale.
              <strong className="text-[#DC2626]"> 1 immobile critico</strong> (Monolocale Torino, sfitto da 4 mesi) e
              <strong className="text-[#B45309]"> 1 cantiere fuori budget</strong> (Villa Como, +17k€).
              Opportunità identificate: rinegoziazione mutuo Bovisa (-280€/mese) e valutazione vendita IMM-005.
            </p>
            <div className="flex items-center gap-2 mt-4">
              <button data-testid="report-bilancio-pdf" onClick={() => downloadReal("bilancio", "pdf", "Bilancio")} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white"><Download size={12}/>Scarica bilancio PDF</button>
              <button data-testid="report-patrimonio-pdf" onClick={() => downloadReal("patrimonio", "pdf", "Patrimonio")} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A]">Patrimonio completo</button>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {REPORTS.map(r => (
          <div key={r.id} data-testid={`report-${r.id}`} className="bg-white border border-[#E2E8F0] rounded-xl p-5 card-hover">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center">
                <FileBarChart size={18} className="text-[#2563EB]" />
              </div>
              <div className="flex-1">
                <div className="font-display font-semibold text-[#0F172A] flex items-center gap-2">
                  {r.nome}
                  {!r.real && <span title="Mockup: download non ancora attivo" className="inline-flex items-center gap-0.5 text-[9px] uppercase font-medium tracking-wider px-1.5 py-0.5 rounded bg-[rgba(180,83,9,0.10)] text-[#B45309] border border-[rgba(180,83,9,0.3)]"><AlertTriangle size={9}/> Mockup</span>}
                </div>
                <div className="text-xs text-[#475569] mt-0.5">{r.desc}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {r.formats.map(fmt => (
                <button
                  key={fmt}
                  data-testid={`report-${r.id}-${fmt}`}
                  onClick={() => r.real ? downloadReal(r.id, fmt, r.nome) : dlMock(fmt, r.nome)}
                  className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#CBD5E1] text-[#0F172A] inline-flex items-center justify-center gap-1.5"
                >
                  <FileText size={11}/> {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
