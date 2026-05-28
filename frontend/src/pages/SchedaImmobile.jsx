import { useParams, Link } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { ScoreGauge } from "../components/ScoreGauge";
import { getProperty, formatEur, contratti, lavori, documenti, movimenti } from "../lib/demoData";
import { ArrowLeft, MapPin, FileText, Download, Wallet, TrendingUp, Calendar, Building2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

const Row = ({ label, value }) => (
  <div className="flex justify-between py-2 border-b border-[#212B36] last:border-0 text-sm">
    <span className="text-[#9CA3AF]">{label}</span>
    <span className="text-[#F3F4F6] tabular text-right">{value}</span>
  </div>
);

export default function SchedaImmobile() {
  const { id } = useParams();
  const p = getProperty(id);
  if (!p) return <Layout title="Immobile non trovato"><Link to="/patrimonio" className="text-[#60A5FA]">← Torna al patrimonio</Link></Layout>;

  const contratto = contratti.find(c => c.immobile_id === p.id);
  const lavoroAttivo = lavori.find(l => l.immobile_id === p.id);
  const docs = documenti.filter(d => d.immobile_id === p.id);
  const movs = movimenti.filter(m => m.immobile_id === p.id);

  return (
    <Layout
      title={p.nome}
      subtitle={`${p.id} · ${p.indirizzo}, ${p.citta}`}
      actions={<Link to="/patrimonio" data-testid="back-patrimonio" className="inline-flex items-center gap-1.5 text-sm text-[#9CA3AF] hover:text-[#F3F4F6]"><ArrowLeft size={14}/> Patrimonio</Link>}
    >
      {/* Hero */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <div className="xl:col-span-2 bg-[#11171F] border border-[#212B36] rounded-xl overflow-hidden">
          <img src={p.img} alt={p.nome} className="w-full h-72 object-cover" />
          <div className="p-5 flex flex-wrap items-center gap-3">
            <StatusBadge stato={p.stato} />
            <span className="text-xs text-[#9CA3AF] flex items-center gap-1"><MapPin size={12}/> {p.indirizzo}, {p.citta}</span>
            <span className="text-xs text-[#9CA3AF]">{p.metratura} m² · {p.tipologia} · Piano {p.piano}</span>
            <span className="text-xs text-[#9CA3AF]">Classe {p.classe_energetica}</span>
          </div>
        </div>
        <div className="bg-[#11171F] border border-[#212B36] rounded-xl p-6 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-widest text-[#6B7280] mb-2">Portfolio Score</span>
          <ScoreGauge value={p.portfolio_score} size={140} dataTestId="immobile-score" />
          <div className="grid grid-cols-2 gap-3 w-full mt-5">
            <div className="text-center p-2 rounded-lg bg-[#080C11] border border-[#212B36]">
              <div className="text-[10px] uppercase text-[#6B7280]">Rend. netto</div>
              <div className="font-display text-lg font-bold tabular text-[#34D399]">{p.rendimento_netto > 0 ? `${p.rendimento_netto}%` : "—"}</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-[#080C11] border border-[#212B36]">
              <div className="text-[10px] uppercase text-[#6B7280]">Cash flow</div>
              <div className={`font-display text-lg font-bold tabular ${p.cash_flow_mensile >= 0 ? "text-[#34D399]" : "text-[#F87171]"}`}>{formatEur(p.cash_flow_mensile)}</div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="anagrafica" className="w-full">
        <TabsList className="bg-[#11171F] border border-[#212B36]" data-testid="immobile-tabs">
          <TabsTrigger value="anagrafica" data-testid="scheda-tab-anagrafica">Anagrafica</TabsTrigger>
          <TabsTrigger value="acquisto" data-testid="scheda-tab-acquisto">Acquisto</TabsTrigger>
          <TabsTrigger value="economico" data-testid="scheda-tab-economico">Economico</TabsTrigger>
          <TabsTrigger value="documenti" data-testid="scheda-tab-documenti">Documenti</TabsTrigger>
          <TabsTrigger value="movimenti" data-testid="scheda-tab-movimenti">Movimenti</TabsTrigger>
        </TabsList>

        <TabsContent value="anagrafica" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Anagrafica" testId="card-anagrafica">
              <Row label="Nome" value={p.nome} />
              <Row label="Codice interno" value={p.id} />
              <Row label="Indirizzo" value={p.indirizzo} />
              <Row label="Comune" value={`${p.citta} (${p.provincia})`} />
              <Row label="Tipologia" value={p.tipologia} />
              <Row label="Superficie" value={`${p.metratura} m²`} />
              <Row label="Piano" value={p.piano} />
              <Row label="Anno costruzione" value={p.anno_costruzione} />
              <Row label="Classe energetica" value={p.classe_energetica} />
            </SectionCard>
            <SectionCard title="Valore" testId="card-valore">
              <Row label="Valore di mercato stimato" value={formatEur(p.valore_stimato)} />
              <Row label="Costo totale investimento" value={formatEur(p.costo_totale)} />
              <Row label="Rivalutazione stimata" value={<span className="text-[#34D399]">{formatEur(p.valore_stimato - p.costo_totale)}</span>} />
              <Row label="Stato locazione" value={<StatusBadge stato={p.stato} />} />
              <Row label="Tipologia operazione" value={p.operazione.replace(/_/g, " ")} />
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="acquisto" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Dati di acquisto" testId="card-acquisto">
              <Row label="Data rogito" value={p.data_acquisto || "—"} />
              <Row label="Prezzo di acquisto" value={formatEur(p.prezzo_acquisto)} />
              <Row label="Notaio" value={formatEur(p.notaio)} />
              <Row label="Agenzia" value={formatEur(p.agenzia)} />
              <Row label="Imposte" value={formatEur(p.imposte)} />
              <Row label="Lavori" value={formatEur(p.lavori)} />
              <Row label="Totale" value={<strong>{formatEur(p.costo_totale)}</strong>} />
            </SectionCard>
            <SectionCard title="Finanziamento" testId="card-mutuo">
              {p.mutuo ? (
                <>
                  <Row label="Banca" value={p.mutuo.banca} />
                  <Row label="Capitale residuo" value={formatEur(p.mutuo.residuo)} />
                  <Row label="Rata mensile" value={formatEur(p.mutuo.rata)} />
                  <Row label="Tasso" value={`${p.mutuo.tasso}%`} />
                </>
              ) : (
                <div className="text-sm text-[#9CA3AF] py-4">Nessun finanziamento attivo. Capitale 100% proprio.</div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="economico" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SectionCard title="Ricavi" testId="card-ricavi" >
              <Row label="Canone mensile" value={formatEur(p.canone_mensile)} />
              <Row label="Canone annuo" value={formatEur(p.canone_mensile * 12)} />
              {contratto && <>
                <Row label="Conduttore" value={contratto.conduttore} />
                <Row label="Contratto" value={`${contratto.inizio} → ${contratto.fine}`} />
              </>}
            </SectionCard>
            <SectionCard title="Rendimento" testId="card-rendimento">
              <Row label="Lordo" value={p.rendimento_lordo > 0 ? `${p.rendimento_lordo}%` : "—"} />
              <Row label="Netto" value={p.rendimento_netto > 0 ? `${p.rendimento_netto}%` : "—"} />
              <Row label="ROI" value={p.rendimento_netto > 0 ? `${(p.rendimento_netto * 1.4).toFixed(1)}%` : "—"} />
              <Row label="Cash flow / mese" value={formatEur(p.cash_flow_mensile)} />
            </SectionCard>
            <SectionCard title="Lavori in corso" testId="card-lavori">
              {lavoroAttivo ? (
                <>
                  <Row label="Descrizione" value={lavoroAttivo.descrizione} />
                  <Row label="Impresa" value={lavoroAttivo.impresa} />
                  <Row label="Budget" value={formatEur(lavoroAttivo.budget)} />
                  <Row label="Speso" value={<span className={lavoroAttivo.speso > lavoroAttivo.budget ? "text-[#F87171]" : ""}>{formatEur(lavoroAttivo.speso)}</span>} />
                  <Row label="Avanzamento" value={`${lavoroAttivo.avanzamento}%`} />
                </>
              ) : (
                <div className="text-sm text-[#9CA3AF] py-4">Nessun cantiere attivo.</div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="documenti" className="mt-4">
          <SectionCard title="Archivio documenti" subtitle={`${docs.length} documenti collegati`} testId="card-documenti">
            <div className="space-y-2">
              {docs.length === 0 && <div className="text-sm text-[#9CA3AF] py-4">Nessun documento caricato.</div>}
              {docs.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3 bg-[#080C11] border border-[#212B36] rounded-lg hover:border-[#334155] transition-colors" data-testid={`doc-${d.id}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText size={16} className="text-[#60A5FA] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{d.nome}</div>
                      <div className="text-[11px] text-[#6B7280]">{d.tipo} · {d.dimensione} · {d.caricato}</div>
                    </div>
                  </div>
                  <button className="p-2 rounded hover:bg-[#11171F] text-[#9CA3AF] hover:text-[#F3F4F6]"><Download size={14} /></button>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="movimenti" className="mt-4">
          <SectionCard title="Movimenti economici" subtitle="Ultimi costi e ricavi" testId="card-movimenti">
            {movs.length === 0 && <div className="text-sm text-[#9CA3AF] py-4">Nessun movimento registrato per questo immobile.</div>}
            <table className="w-full text-sm">
              <tbody>
                {movs.map(m => (
                  <tr key={m.id} className="border-b border-[#212B36] last:border-0">
                    <td className="py-3 text-[#9CA3AF]"><Calendar size={12} className="inline mr-1" />{m.data}</td>
                    <td className="py-3">{m.categoria}</td>
                    <td className="py-3 text-[#9CA3AF]">{m.descrizione}</td>
                    <td className={`py-3 text-right tabular font-medium ${m.tipo === "ricavo" ? "text-[#34D399]" : "text-[#F87171]"}`}>{m.tipo === "ricavo" ? "+" : "-"}{formatEur(m.importo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
