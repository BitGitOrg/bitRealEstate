import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { mutui, properties, portfolioKPI, formatEur } from "../lib/demoData";
import { Banknote, AlertTriangle, TrendingDown } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const tooltipStyle = { backgroundColor: "#080C11", border: "1px solid #212B36", borderRadius: 8, fontSize: 12, color: "#F3F4F6" };

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
          <div className="text-[10px] uppercase text-[#6B7280]">Debito totale</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{formatEur(portfolioKPI.debito_residuo)}</div>
        </SectionCard>
        <SectionCard testId="mut-kpi-rata">
          <div className="text-[10px] uppercase text-[#6B7280]">Rata mensile</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{formatEur(totRata)}</div>
        </SectionCard>
        <SectionCard testId="mut-kpi-ltv">
          <div className="text-[10px] uppercase text-[#6B7280]">Loan-to-Value</div>
          <div className={`font-display text-3xl font-bold tabular mt-1 ${ltv > 70 ? "text-[#F87171]" : "text-[#34D399]"}`}>{ltv.toFixed(1)}%</div>
        </SectionCard>
        <SectionCard testId="mut-kpi-incidenza">
          <div className="text-[10px] uppercase text-[#6B7280]">Incidenza su affitti</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{(totRata / portfolioKPI.ricavi_mensili * 100).toFixed(0)}%</div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <SectionCard testId="mut-chart" title="Debito per immobile" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#212B36" vertical={false} />
              <XAxis dataKey="nome" stroke="#6B7280" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis stroke="#6B7280" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEur(v)} />
              <Bar dataKey="residuo" fill="#0066FF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard testId="mut-alert" title="Alert finanziari" action={<AlertTriangle size={16} className="text-[#FBBF24]"/>}>
          <div className="space-y-3">
            {[
              { txt: "Tasso Villa Como (3,5%) sopra media: opportunità rifinanziamento", icon: TrendingDown, color: "#FBBF24" },
              { txt: "LTV portafoglio sotto 40%: spazio per nuovi acquisti", icon: Banknote, color: "#34D399" },
              { txt: "Rata Villa Como > cash flow generato", icon: AlertTriangle, color: "#F87171" },
            ].map((a, i) => {
              const I = a.icon;
              return (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  <I size={14} style={{ color: a.color }} className="mt-0.5 shrink-0" />
                  <span className="text-[#F3F4F6]">{a.txt}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Anagrafica finanziamenti" testId="mut-table">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B7280] border-b border-[#212B36]">
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
                <tr key={m.id} className="border-b border-[#212B36] last:border-0">
                  <td className="py-3 mono text-[#9CA3AF]">{m.id}</td>
                  <td className="py-3">{p?.nome}</td>
                  <td className="py-3">{m.banca}</td>
                  <td className="py-3 text-[#9CA3AF]">{m.tipo_tasso}</td>
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
