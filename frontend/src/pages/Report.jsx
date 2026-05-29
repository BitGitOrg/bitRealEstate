import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { FileBarChart, Download, FileText, Sparkles } from "lucide-react";
import { toast } from "sonner";

const REPORTS = [
  { id: "r1", nome: "Report Patrimonio Completo", desc: "Vista d'insieme di tutto il portafoglio", icon: FileBarChart },
  { id: "r2", nome: "Report Rendimento per Immobile", desc: "Rendimento lordo, netto e ROI", icon: FileBarChart },
  { id: "r3", nome: "Report Affitti & Locazioni", desc: "Contratti, incassi, morosità", icon: FileBarChart },
  { id: "r4", nome: "Report Vendite & Rivendite", desc: "Operazioni concluse e margini", icon: FileBarChart },
  { id: "r5", nome: "Report Lavori e Ristrutturazioni", desc: "Budget vs effettivo per cantiere", icon: FileBarChart },
  { id: "r6", nome: "Report Cash Flow 12 mesi", desc: "Storico + forecast", icon: FileBarChart },
  { id: "r7", nome: "Report Mutui & Esposizione", desc: "LTV, rate, scadenze", icon: FileBarChart },
  { id: "r8", nome: "Report Direzionale Società", desc: "P&L sintetico annuale", icon: FileBarChart },
];

export default function Report() {
  const dl = (fmt, nome) => toast.success(`Report "${nome}" generato in ${fmt} (mockup)`);

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
              <button data-testid="report-ai-pdf" onClick={() => dl("PDF", "Report AI Mensile")} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white"><Download size={12}/>Scarica PDF</button>
              <button data-testid="report-ai-full" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A]">Leggi analisi completa</button>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {REPORTS.map(r => {
          const Icon = r.icon;
          return (
            <div key={r.id} data-testid={`report-${r.id}`} className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-5 card-hover">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center">
                  <Icon size={18} className="text-[#2563EB]" />
                </div>
                <div>
                  <div className="font-display font-semibold text-[#0F172A]">{r.nome}</div>
                  <div className="text-xs text-[#475569] mt-0.5">{r.desc}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => dl("PDF", r.nome)} className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#CBD5E1] text-[#0F172A] inline-flex items-center justify-center gap-1.5">
                  <FileText size={11}/> PDF
                </button>
                <button onClick={() => dl("Excel", r.nome)} className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#CBD5E1] text-[#0F172A]">Excel</button>
                <button onClick={() => dl("CSV", r.nome)} className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#CBD5E1] text-[#0F172A]">CSV</button>
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
