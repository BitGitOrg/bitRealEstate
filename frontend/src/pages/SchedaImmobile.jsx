import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { ScoreGauge } from "../components/ScoreGauge";
import { getProperty, formatEur, contratti, lavori, documenti, movimenti } from "../lib/demoData";
import { apiClient } from "../lib/auth";
import { ArrowLeft, MapPin, FileText, Download, Calendar, Save, User, Home, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

const Row = ({ label, value }) => (
  <div className="flex justify-between py-2 border-b border-[#E2E8F0] last:border-0 text-sm">
    <span className="text-[#475569]">{label}</span>
    <span className="text-[#0F172A] tabular text-right">{value}</span>
  </div>
);

export default function SchedaImmobile() {
  const { id } = useParams();
  const [remoteP, setRemoteP] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try to fetch from API; fall back to demo
    apiClient().get(`/properties/${id}`)
      .then(r => setRemoteP(r.data))
      .catch(() => setRemoteP(null))
      .finally(() => setLoading(false));
  }, [id]);

  const demoP = getProperty(id);
  const p = remoteP || demoP;
  if (loading) return <Layout title="Caricamento…"><div className="text-[#64748B]">Sto cercando l'immobile…</div></Layout>;
  if (!p) return <Layout title="Immobile non trovato"><Link to="/patrimonio" className="text-[#2563EB]">← Torna al patrimonio</Link></Layout>;

  const contratto = contratti.find(c => c.immobile_id === p.id);
  const lavoroAttivo = lavori.find(l => l.immobile_id === p.id);
  const docs = documenti.filter(d => d.immobile_id === p.id);
  const movs = movimenti.filter(m => m.immobile_id === p.id);

  return (
    <Layout
      title={p.nome}
      subtitle={`${p.id} · ${p.indirizzo}, ${p.citta}`}
      actions={<Link to="/patrimonio" data-testid="back-patrimonio" className="inline-flex items-center gap-1.5 text-sm text-[#475569] hover:text-[#0F172A]"><ArrowLeft size={14}/> Patrimonio</Link>}
    >
      {/* Hero */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <div className="xl:col-span-2 bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl overflow-hidden">
          <img src={p.img} alt={p.nome} className="w-full h-72 object-cover" />
          <div className="p-5 flex flex-wrap items-center gap-3">
            <StatusBadge stato={p.stato} />
            <span className="text-xs text-[#475569] flex items-center gap-1"><MapPin size={12}/> {p.indirizzo}, {p.citta}</span>
            <span className="text-xs text-[#475569]">{p.metratura} m² · {p.tipologia} · Piano {p.piano}</span>
            <span className="text-xs text-[#475569]">Classe {p.classe_energetica}</span>
          </div>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-6 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-widest text-[#64748B] mb-2">Portfolio Score</span>
          <ScoreGauge value={p.portfolio_score} size={140} dataTestId="immobile-score" />
          <div className="grid grid-cols-2 gap-3 w-full mt-5">
            <div className="text-center p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
              <div className="text-[10px] uppercase text-[#64748B]">Rend. netto</div>
              <div className="font-display text-lg font-bold tabular text-[#059669]">{p.rendimento_netto > 0 ? `${p.rendimento_netto}%` : "—"}</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
              <div className="text-[10px] uppercase text-[#64748B]">Cash flow</div>
              <div className={`font-display text-lg font-bold tabular ${p.cash_flow_mensile >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{formatEur(p.cash_flow_mensile)}</div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="anagrafica" className="w-full">
        <TabsList className="bg-[#FFFFFF] border border-[#E2E8F0]" data-testid="immobile-tabs">
          <TabsTrigger value="anagrafica" data-testid="scheda-tab-anagrafica">Anagrafica</TabsTrigger>
          <TabsTrigger value="acquisto" data-testid="scheda-tab-acquisto">Acquisto</TabsTrigger>
          <TabsTrigger value="economico" data-testid="scheda-tab-economico">Economico</TabsTrigger>
          <TabsTrigger value="locazione" data-testid="scheda-tab-locazione">Locazione</TabsTrigger>
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
              <Row label="Rivalutazione stimata" value={<span className="text-[#059669]">{formatEur(p.valore_stimato - p.costo_totale)}</span>} />
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
                <div className="text-sm text-[#475569] py-4">Nessun finanziamento attivo. Capitale 100% proprio.</div>
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
                  <Row label="Speso" value={<span className={lavoroAttivo.speso > lavoroAttivo.budget ? "text-[#DC2626]" : ""}>{formatEur(lavoroAttivo.speso)}</span>} />
                  <Row label="Avanzamento" value={`${lavoroAttivo.avanzamento}%`} />
                </>
              ) : (
                <div className="text-sm text-[#475569] py-4">Nessun cantiere attivo.</div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="locazione" className="mt-4">
          <LocazioneForm p={p} onSaved={setRemoteP} />
        </TabsContent>

        <TabsContent value="documenti" className="mt-4">
          <SectionCard title="Archivio documenti" subtitle={`${docs.length} documenti collegati`} testId="card-documenti">
            <div className="space-y-2">
              {docs.length === 0 && <div className="text-sm text-[#475569] py-4">Nessun documento caricato.</div>}
              {docs.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg hover:border-[#CBD5E1] transition-colors" data-testid={`doc-${d.id}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText size={16} className="text-[#2563EB] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{d.nome}</div>
                      <div className="text-[11px] text-[#64748B]">{d.tipo} · {d.dimensione} · {d.caricato}</div>
                    </div>
                  </div>
                  <button className="p-2 rounded hover:bg-[#FFFFFF] text-[#475569] hover:text-[#0F172A]"><Download size={14} /></button>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="movimenti" className="mt-4">
          <SectionCard title="Movimenti economici" subtitle="Ultimi costi e ricavi" testId="card-movimenti">
            {movs.length === 0 && <div className="text-sm text-[#475569] py-4">Nessun movimento registrato per questo immobile.</div>}
            <table className="w-full text-sm">
              <tbody>
                {movs.map(m => (
                  <tr key={m.id} className="border-b border-[#E2E8F0] last:border-0">
                    <td className="py-3 text-[#475569]"><Calendar size={12} className="inline mr-1" />{m.data}</td>
                    <td className="py-3">{m.categoria}</td>
                    <td className="py-3 text-[#475569]">{m.descrizione}</td>
                    <td className={`py-3 text-right tabular font-medium ${m.tipo === "ricavo" ? "text-[#059669]" : "text-[#DC2626]"}`}>{m.tipo === "ricavo" ? "+" : "-"}{formatEur(m.importo)}</td>
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

// =============================================================
// Locazione form — edit tenant + contract details
// =============================================================
const LocField = ({ label, value, onChange, type = "text", placeholder, testId, suffix }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
    <div className="mt-1 flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg focus-within:border-[#0066FF]">
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className="flex-1 bg-transparent px-3 py-2 outline-none text-sm min-w-0"
      />
      {suffix && <span className="px-3 text-xs text-[#64748B]">{suffix}</span>}
    </div>
  </label>
);

function LocazioneForm({ p, onSaved }) {
  const [form, setForm] = useState({
    inquilino: p.inquilino || "",
    data_inizio_contratto: p.data_inizio_contratto || "",
    scadenza_contratto: p.scadenza_contratto || "",
    deposito_cauzionale: p.deposito_cauzionale || 0,
    durata_contratto_anni: p.durata_contratto_anni || 0,
    rinnovo_automatico: !!p.rinnovo_automatico,
    canone_mensile: p.canone_mensile || 0,
    note_locazione: p.note_locazione || "",
  });
  const [saving, setSaving] = useState(false);

  // Sync form when property changes
  useEffect(() => {
    setForm({
      inquilino: p.inquilino || "",
      data_inizio_contratto: p.data_inizio_contratto || "",
      scadenza_contratto: p.scadenza_contratto || "",
      deposito_cauzionale: p.deposito_cauzionale || 0,
      durata_contratto_anni: p.durata_contratto_anni || 0,
      rinnovo_automatico: !!p.rinnovo_automatico,
      canone_mensile: p.canone_mensile || 0,
      note_locazione: p.note_locazione || "",
    });
  }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true);
    try {
      const r = await apiClient().patch(`/properties/${p.id}/locazione`, form);
      onSaved?.(r.data);
      toast.success("Dati locazione aggiornati");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  // Derived: status badge for contract
  let contractStatus = null;
  if (form.scadenza_contratto) {
    const today = new Date();
    const end = new Date(form.scadenza_contratto);
    const daysLeft = Math.round((end - today) / 86400000);
    if (daysLeft < 0) contractStatus = { label: "Contratto SCADUTO", color: "#DC2626", bg: "#FEF2F2" };
    else if (daysLeft < 90) contractStatus = { label: `Scade tra ${daysLeft} giorni`, color: "#B45309", bg: "#FFFBEB" };
    else contractStatus = { label: `In corso · scade tra ${daysLeft} giorni`, color: "#059669", bg: "#ECFDF5" };
  } else if (form.inquilino) {
    contractStatus = { label: "Locato (scadenza non indicata)", color: "#475569", bg: "#F1F5F9" };
  } else {
    contractStatus = { label: "Nessuna locazione attiva", color: "#94A3B8", bg: "#F8FAFC" };
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-2">
        <SectionCard
          title="Locazione in corso"
          subtitle="Inquilino, contratto, canone e deposito — i dati confluiscono in Affitti, Investor Book e KPI"
          testId="card-locazione-form"
          action={<User size={16} className="text-[#0066FF]" />}
        >
          <div className="space-y-4">
            <LocField label="Inquilino / Conduttore" testId="loc-inquilino" value={form.inquilino} onChange={(v) => setForm({ ...form, inquilino: v })} placeholder="Nome inquilino o ragione sociale" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <LocField label="Data inizio contratto" testId="loc-inizio" type="date" value={form.data_inizio_contratto} onChange={(v) => setForm({ ...form, data_inizio_contratto: v })} />
              <LocField label="Scadenza contratto" testId="loc-scadenza" type="date" value={form.scadenza_contratto} onChange={(v) => setForm({ ...form, scadenza_contratto: v })} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <LocField label="Canone mensile" testId="loc-canone" type="number" value={form.canone_mensile} onChange={(v) => setForm({ ...form, canone_mensile: v })} suffix="€" />
              <LocField label="Deposito cauzionale" testId="loc-deposito" type="number" value={form.deposito_cauzionale} onChange={(v) => setForm({ ...form, deposito_cauzionale: v })} suffix="€" />
              <LocField label="Durata contratto" testId="loc-durata" type="number" value={form.durata_contratto_anni} onChange={(v) => setForm({ ...form, durata_contratto_anni: v })} suffix="anni" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                data-testid="loc-rinnovo"
                checked={!!form.rinnovo_automatico}
                onChange={(e) => setForm({ ...form, rinnovo_automatico: e.target.checked })}
                className="w-4 h-4 rounded border-[#CBD5E1] text-[#0066FF] focus:ring-[#0066FF]"
              />
              <span className="text-sm text-[#0F172A]">Rinnovo automatico alla scadenza</span>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Note locazione (opzionale)</span>
              <textarea
                data-testid="loc-note"
                rows={2}
                value={form.note_locazione}
                onChange={(e) => setForm({ ...form, note_locazione: e.target.value })}
                placeholder="Es. cedolare secca al 21%, garante coniuge, animali ammessi…"
                className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF] resize-none"
              />
            </label>
            <div className="flex justify-end pt-2 border-t border-[#E2E8F0]">
              <button
                data-testid="loc-save"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-sm font-medium disabled:opacity-50 transition"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Salvataggio…" : "Salva locazione"}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="space-y-4">
        <SectionCard title="Stato contratto" testId="card-locazione-status" action={<Home size={16} className="text-[#2563EB]" />}>
          <div
            className="rounded-lg px-3 py-2.5 text-sm font-semibold mb-3"
            style={{ background: contractStatus.bg, color: contractStatus.color }}
            data-testid="loc-status"
          >
            {contractStatus.label}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between py-1 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">Canone annuo</span>
              <span className="font-semibold text-[#0F172A]">{formatEur((form.canone_mensile || 0) * 12)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">Rendimento lordo</span>
              <span className="font-semibold text-[#059669]">{p.rendimento_lordo > 0 ? `${p.rendimento_lordo}%` : "—"}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[#64748B]">Rendimento netto</span>
              <span className="font-semibold text-[#059669]">{p.rendimento_netto > 0 ? `${p.rendimento_netto}%` : "—"}</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Suggerimenti" testId="card-locazione-tips">
          <ul className="text-xs text-[#475569] space-y-2 leading-relaxed">
            <li className="flex gap-2"><Calendar size={12} className="text-[#0066FF] shrink-0 mt-0.5" /><span>Imposta la scadenza per ricevere alert nei 90 giorni precedenti.</span></li>
            <li className="flex gap-2"><FileText size={12} className="text-[#0066FF] shrink-0 mt-0.5" /><span>I dati salvati appaiono automaticamente nell'<strong>Investor Book</strong>.</span></li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
