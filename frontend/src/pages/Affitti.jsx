import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { contratti, incassi, properties, formatEur } from "../lib/demoData";
import { CheckCircle2, Clock, AlertCircle, XCircle } from "lucide-react";

const STATO_INCASSO = {
  pagato: { label: "Pagato", icon: CheckCircle2, color: "#059669" },
  in_ritardo: { label: "In ritardo", icon: Clock, color: "#B45309" },
  non_pagato: { label: "Non pagato", icon: XCircle, color: "#DC2626" },
  sollecitato: { label: "Sollecitato", icon: AlertCircle, color: "#C2410C" },
};

export default function Affitti() {
  const totMensile = contratti.reduce((s, c) => s + (c.stato === "attivo" || c.stato === "in_scadenza" ? c.canone : 0), 0);
  const incassati = incassi.filter(i => i.stato === "pagato").reduce((s, i) => s + i.incassato, 0);
  const occupazione = Math.round(properties.filter(p => p.stato === "affittato").length / properties.filter(p => p.operazione === "reddito").length * 100);

  return (
    <Layout title="Affitti & Locazioni" subtitle={`${contratti.length} contratti attivi · Tasso occupazione ${occupazione}%`}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="affitti-kpi-canone">
          <div className="text-[10px] uppercase text-[#64748B] tracking-wider">Canone mensile atteso</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{formatEur(totMensile)}</div>
        </SectionCard>
        <SectionCard testId="affitti-kpi-incassato">
          <div className="text-[10px] uppercase text-[#64748B] tracking-wider">Incassato (mese)</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#059669]">{formatEur(incassati)}</div>
        </SectionCard>
        <SectionCard testId="affitti-kpi-occupazione">
          <div className="text-[10px] uppercase text-[#64748B] tracking-wider">Tasso occupazione</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{occupazione}%</div>
        </SectionCard>
        <SectionCard testId="affitti-kpi-morosita">
          <div className="text-[10px] uppercase text-[#64748B] tracking-wider">Morosità</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#DC2626]">1</div>
          <div className="text-xs text-[#475569] mt-0.5">contratto in ritardo</div>
        </SectionCard>
      </div>

      <SectionCard title="Contratti di locazione" testId="affitti-contratti" className="mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
              <th className="py-2">Contratto</th>
              <th className="py-2">Immobile</th>
              <th className="py-2">Conduttore</th>
              <th className="py-2">Periodo</th>
              <th className="py-2 text-right">Canone</th>
              <th className="py-2 text-right">Deposito</th>
              <th className="py-2">Stato</th>
            </tr>
          </thead>
          <tbody>
            {contratti.map(c => {
              const p = properties.find(x => x.id === c.immobile_id);
              return (
                <tr key={c.id} className="border-b border-[#E2E8F0] last:border-0">
                  <td className="py-3 font-medium mono text-[#475569]">{c.id}</td>
                  <td className="py-3">{p?.nome || c.immobile_id}</td>
                  <td className="py-3">{c.conduttore}</td>
                  <td className="py-3 text-[#475569] text-xs">{c.inizio} → {c.fine}</td>
                  <td className="py-3 text-right tabular">{formatEur(c.canone)}</td>
                  <td className="py-3 text-right tabular text-[#475569]">{formatEur(c.deposito)}</td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${c.stato === "attivo" ? "border-[rgba(132,204,22,0.3)] text-[#4D7C0F] bg-[rgba(132,204,22,0.15)]" : "border-[rgba(245,158,11,0.3)] text-[#B45309] bg-[rgba(245,158,11,0.15)]"}`}>
                      {c.stato === "attivo" ? "Attivo" : "In scadenza"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Incassi mese corrente" subtitle="Febbraio 2026" testId="affitti-incassi">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
              <th className="py-2">Contratto</th>
              <th className="py-2 text-right">Previsto</th>
              <th className="py-2 text-right">Incassato</th>
              <th className="py-2">Data</th>
              <th className="py-2">Stato</th>
            </tr>
          </thead>
          <tbody>
            {incassi.map(i => {
              const meta = STATO_INCASSO[i.stato];
              const Icon = meta.icon;
              return (
                <tr key={i.contratto_id} className="border-b border-[#E2E8F0] last:border-0">
                  <td className="py-3 mono">{i.contratto_id}</td>
                  <td className="py-3 text-right tabular">{formatEur(i.previsto)}</td>
                  <td className="py-3 text-right tabular">{formatEur(i.incassato)}</td>
                  <td className="py-3 text-[#475569] text-xs">{i.data || "—"}</td>
                  <td className="py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: meta.color }}>
                      <Icon size={14} /> {meta.label}
                    </span>
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
