import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { mutui, properties, portfolioKPI, formatEur } from "../lib/demoData";
import { Banknote, AlertTriangle, TrendingDown } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const tooltipStyle = { backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, color: "#0F172A" };

export default function Mutui() {
  const totRata = mutui.reduce((s, m) => s + m.rata, 0);
  const ltv = portfolioKPI.debito_residuo / portfolioKPI.valore_stimato_totale * 100;
  const chartData = mutui.map(m => {
    const p = properties.find(x => x.id === m.immobile_id);
    return { nome: p?.nome.substring(0, 14) || m.id, residuo: m.capitale_residuo, rata: m.rata };
  });

  return (
    <Layout title="Mutui & Finanziamenti" subtitle="Esposizione debitoria del portafoglio">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="mut-kpi-debito">
          <div className="text-[10px] uppercase text-[#64748B]">Debito totale</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{formatEur(portfolioKPI.debito_residuo)}</div>
        </SectionCard>
        <SectionCard testId="mut-kpi-rata">
          <div className="text-[10px] uppercase text-[#64748B]">Rata mensile</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{formatEur(totRata)}</div>
        </SectionCard>
        <SectionCard testId="mut-kpi-ltv">
          <div className="text-[10px] uppercase text-[#64748B]">Loan-to-Value</div>
          <div className={`font-display text-3xl font-bold tabular mt-1 ${ltv > 70 ? "text-[#DC2626]" : "text-[#059669]"}`}>{ltv.toFixed(1)}%</div>
        </SectionCard>
        <SectionCard testId="mut-kpi-incidenza">
          <div className="text-[10px] uppercase text-[#64748B]">Incidenza su affitti</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{(totRata / portfolioKPI.ricavi_mensili * 100).toFixed(0)}%</div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <SectionCard testId="mut-chart" title="Debito per immobile" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="nome" stroke="#64748B" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis stroke="#64748B" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEur(v)} />
              <Bar dataKey="residuo" fill="#0066FF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard testId="mut-alert" title="Alert finanziari" action={<AlertTriangle size={16} className="text-[#B45309]"/>}>
          <div className="space-y-3">
            {[
              { txt: "Tasso Villa Como (3,5%) sopra media: opportunità rifinanziamento", icon: TrendingDown, color: "#B45309" },
              { txt: "LTV portafoglio sotto 40%: spazio per nuovi acquisti", icon: Banknote, color: "#059669" },
              { txt: "Rata Villa Como > cash flow generato", icon: AlertTriangle, color: "#DC2626" },
            ].map((a, i) => {
              const I = a.icon;
              return (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  <I size={14} style={{ color: a.color }} className="mt-0.5 shrink-0" />
                  <span className="text-[#0F172A]">{a.txt}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Anagrafica finanziamenti" testId="mut-table">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
              <th className="py-2">Mutuo</th>
              <th className="py-2">Immobile</th>
              <th className="py-2">Banca</th>
              <th className="py-2">Tipo</th>
              <th className="py-2 text-right">Tasso</th>
              <th className="py-2 text-right">Originario</th>
              <th className="py-2 text-right">Residuo</th>
              <th className="py-2 text-right">Rata</th>
            </tr>
          </thead>
          <tbody>
            {mutui.map(m => {
              const p = properties.find(x => x.id === m.immobile_id);
              return (
                <tr key={m.id} className="border-b border-[#E2E8F0] last:border-0">
                  <td className="py-3 mono text-[#475569]">{m.id}</td>
                  <td className="py-3">{p?.nome}</td>
                  <td className="py-3">{m.banca}</td>
                  <td className="py-3 text-[#475569]">{m.tipo_tasso}</td>
                  <td className="py-3 text-right tabular">{m.tasso}%</td>
                  <td className="py-3 text-right tabular">{formatEur(m.importo_originario)}</td>
                  <td className="py-3 text-right tabular">{formatEur(m.capitale_residuo)}</td>
                  <td className="py-3 text-right tabular">{formatEur(m.rata)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>
    </Layout>
  );
}
