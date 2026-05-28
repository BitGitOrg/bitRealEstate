import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { Progress } from "../components/ui/progress";
import { lavori, properties, formatEur } from "../lib/demoData";
import { AlertTriangle, CheckCircle2, Hammer } from "lucide-react";

export default function Lavori() {
  const totBudget = lavori.reduce((s, l) => s + l.budget, 0);
  const totSpeso = lavori.reduce((s, l) => s + l.speso, 0);
  const fuoriBudget = lavori.filter(l => l.speso > l.budget);

  return (
    <Layout title="Lavori & Ristrutturazioni" subtitle={`${lavori.length} cantieri attivi`}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="lavori-kpi-cantieri">
          <div className="text-[10px] uppercase text-[#6B7280]">Cantieri</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{lavori.length}</div>
        </SectionCard>
        <SectionCard testId="lavori-kpi-budget">
          <div className="text-[10px] uppercase text-[#6B7280]">Budget totale</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{formatEur(totBudget)}</div>
        </SectionCard>
        <SectionCard testId="lavori-kpi-speso">
          <div className="text-[10px] uppercase text-[#6B7280]">Speso ad oggi</div>
          <div className={`font-display text-3xl font-bold tabular mt-1 ${totSpeso > totBudget ? "text-[#F87171]" : ""}`}>{formatEur(totSpeso)}</div>
        </SectionCard>
        <SectionCard testId="lavori-kpi-fuori">
          <div className="text-[10px] uppercase text-[#6B7280]">Fuori budget</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#F87171]">{fuoriBudget.length}</div>
        </SectionCard>
      </div>

      <div className="space-y-4">
        {lavori.map(l => {
          const p = properties.find(x => x.id === l.immobile_id);
          const overBudget = l.speso > l.budget;
          const remaining = l.budget - l.speso;
          return (
            <SectionCard key={l.id} testId={`lavoro-${l.id}`}>
              <div className="flex flex-wrap items-start gap-4">
                {p && <img src={p.img} className="w-24 h-24 rounded-lg object-cover" alt="" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="font-display font-semibold">{l.descrizione}</div>
                      <div className="text-xs text-[#9CA3AF]">{p?.nome} · Impresa: {l.impresa}</div>
                      <div className="text-[11px] text-[#6B7280] mt-1">Inizio {l.inizio} · Fine prevista {l.fine_prevista}</div>
                    </div>
                    {overBudget ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.15)] text-[#F87171] text-xs font-medium">
                        <AlertTriangle size={12} /> Fuori budget
                      </span>
                    ) : l.stato === "completato" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[rgba(132,204,22,0.3)] bg-[rgba(132,204,22,0.15)] text-[#A3E635] text-xs font-medium">
                        <CheckCircle2 size={12} /> Completato
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.15)] text-[#FBBF24] text-xs font-medium">
                        <Hammer size={12} /> In corso
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                    <div>
                      <div className="text-[10px] uppercase text-[#6B7280]">Budget</div>
                      <div className="text-sm tabular font-medium">{formatEur(l.budget)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-[#6B7280]">Speso</div>
                      <div className={`text-sm tabular font-medium ${overBudget ? "text-[#F87171]" : ""}`}>{formatEur(l.speso)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-[#6B7280]">Residuo</div>
                      <div className={`text-sm tabular font-medium ${remaining < 0 ? "text-[#F87171]" : "text-[#34D399]"}`}>{formatEur(remaining)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-[#6B7280]">Avanzamento</div>
                      <div className="text-sm tabular font-medium">{l.avanzamento}%</div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <Progress value={l.avanzamento} className="h-2 bg-[#080C11]" />
                  </div>
                </div>
              </div>
            </SectionCard>
          );
        })}
      </div>
    </Layout>
  );
}
