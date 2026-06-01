import { useEffect, useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { KpiCard } from "../components/dashboard/KpiCard";
import { apiClient } from "../lib/auth";
import { toast } from "sonner";
import {
  Banknote, AlertTriangle, TrendingDown, Plus, Upload, Sparkles, Loader2,
  FileText, Trash2, Edit2, X, Wallet, Activity, Percent, Calendar,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { formatEur } from "../lib/demoData";

const tooltipStyle = { backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, color: "#0F172A", boxShadow: "0 4px 12px rgba(15,23,42,0.08)" };

export default function Mutui() {
  const [mutui, setMutui] = useState([]);
  const [aggregato, setAggregato] = useState(null);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingMutuo, setEditingMutuo] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [m, a, p] = await Promise.all([
        apiClient().get("/mutui"),
        apiClient().get("/mutui/aggregato"),
        apiClient().get("/properties"),
      ]);
      setMutui(m.data || []);
      setAggregato(a.data || null);
      setProperties(p.data || []);
    } catch {
      toast.error("Errore caricamento mutui");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!confirm("Eliminare questo mutuo? L'operazione è irreversibile.")) return;
    try {
      await apiClient().delete(`/mutui/${id}`);
      toast.success("Mutuo eliminato");
      load();
    } catch {
      toast.error("Errore eliminazione");
    }
  };

  const chartData = mutui.map((m) => ({
    nome: (m.immobile_nome || m.banca || m.id).substring(0, 16),
    residuo: m.capitale_residuo || 0,
    rata: m.rata_mensile || 0,
  }));

  return (
    <Layout
      title="Mutui & Finanziamenti"
      subtitle={mutui.length > 0 ? `${mutui.length} finanziamenti attivi · dati live` : "Nessun mutuo registrato"}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <button
            data-testid="mutui-import-pdf-btn"
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#2563EB] hover:opacity-90 text-white text-sm font-medium transition-opacity"
          >
            <Sparkles size={14} /> Importa PDF banca (AI)
          </button>
          <button
            data-testid="mutui-add-btn"
            onClick={() => { setEditingMutuo(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm font-medium transition-colors"
          >
            <Plus size={14} /> Nuovo mutuo
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Debito totale" value={formatEur(aggregato?.debito_totale || 0)}
          icon={Banknote} accent="warning" sublabel={`${aggregato?.n_mutui || 0} mutui`}
          info="Somma dei capitali residui di tutti i mutui in essere. Calcolato dal piano di ammortamento alla data odierna."
          testId="mut-kpi-debito"
        />
        <KpiCard
          label="Rata mensile totale" value={formatEur(aggregato?.rata_totale || 0)}
          icon={Wallet} sublabel="Tutti i mutui"
          info="Somma delle rate mensili. Esce ogni mese dal conto corrente e va sottratta dai ricavi affitti per ottenere il cash flow netto."
          testId="mut-kpi-rata"
        />
        <KpiCard
          label="Loan-to-Value" value={aggregato?.ltv_pct != null ? `${aggregato.ltv_pct}%` : "—"}
          icon={Percent} accent={aggregato?.ltv_pct > 70 ? "critical" : aggregato?.ltv_pct > 50 ? "warning" : "positive"}
          sublabel="Debito / Valore immobili"
          info="LTV = Capitale residuo totale / Valore di mercato degli immobili a garanzia × 100. Soglia di attenzione: 70%."
          testId="mut-kpi-ltv"
        />
        <KpiCard
          label="Incidenza su affitti" value={aggregato?.incidenza_rata_su_affitti_pct != null ? `${aggregato.incidenza_rata_su_affitti_pct}%` : "—"}
          icon={Activity} accent={aggregato?.incidenza_rata_su_affitti_pct > 60 ? "critical" : "default"}
          sublabel="Rata / Canoni mensili"
          info="Quanta parte degli affitti incassati serve a pagare le rate. >60% segnala leva alta: poca margine per imprevisti."
          testId="mut-kpi-incidenza"
        />
      </div>

      {mutui.length === 0 && !loading && (
        <SectionCard testId="mut-empty" title="Nessun mutuo registrato" subtitle="Inizia importando il PDF del contratto banca oppure inserendo manualmente.">
          <div className="py-8 text-center">
            <Banknote size={36} className="mx-auto text-[#CBD5E1] mb-3" />
            <div className="text-sm text-[#475569] mb-4">Aggiungi il tuo primo mutuo per iniziare a monitorare debito, rate e piano di ammortamento.</div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#2563EB] text-white text-sm font-medium">
                <Sparkles size={14} /> Carica PDF banca
              </button>
              <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1] text-sm font-medium">
                <Plus size={14} /> Inserisci manualmente
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {mutui.length > 0 && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
            <SectionCard testId="mut-chart" title="Debito residuo per finanziamento" className="xl:col-span-2">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="nome" stroke="#64748B" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEur(v)} />
                  <Bar dataKey="residuo" fill="#0066FF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>

            <SectionCard testId="mut-alert" title="Alert finanziari" action={<AlertTriangle size={16} className="text-[#B45309]" />}>
              <div className="space-y-3">
                {aggregato?.ltv_pct > 70 && (
                  <AlertRow icon={AlertTriangle} color="#DC2626" text={`LTV ${aggregato.ltv_pct}% — oltre soglia di sicurezza 70%`} />
                )}
                {aggregato?.incidenza_rata_su_affitti_pct > 60 && (
                  <AlertRow icon={AlertTriangle} color="#B45309" text={`Le rate assorbono il ${aggregato.incidenza_rata_su_affitti_pct}% degli affitti`} />
                )}
                {mutui.filter(m => m.tasso > 5).map(m => (
                  <AlertRow key={m.id} icon={TrendingDown} color="#B45309" text={`${m.banca}: tasso ${m.tasso}% — valuta surroga`} />
                ))}
                {aggregato?.ltv_pct != null && aggregato.ltv_pct < 40 && (
                  <AlertRow icon={Banknote} color="#059669" text={`LTV ${aggregato.ltv_pct}%: spazio per nuovi finanziamenti`} />
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Anagrafica finanziamenti" testId="mut-table">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                    <th className="py-2 px-2">Codice</th>
                    <th className="py-2 px-2">Banca</th>
                    <th className="py-2 px-2">Immobile</th>
                    <th className="py-2 px-2">Tipo</th>
                    <th className="py-2 px-2 text-right">Tasso</th>
                    <th className="py-2 px-2 text-right">Originario</th>
                    <th className="py-2 px-2 text-right">Residuo</th>
                    <th className="py-2 px-2 text-right">Rata</th>
                    <th className="py-2 px-2 text-right">Rate residue</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {mutui.map((m) => (
                    <tr key={m.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]/50" data-testid={`mut-row-${m.id}`}>
                      <td className="py-3 px-2 mono text-[#475569]">{m.id}</td>
                      <td className="py-3 px-2 font-medium">{m.banca}</td>
                      <td className="py-3 px-2 text-[#475569]">{m.immobile_nome || "—"}</td>
                      <td className="py-3 px-2 text-[#475569] capitalize">{m.tipo_tasso}</td>
                      <td className="py-3 px-2 text-right tabular">{m.tasso}%</td>
                      <td className="py-3 px-2 text-right tabular">{formatEur(m.importo_originario)}</td>
                      <td className="py-3 px-2 text-right tabular font-medium">{formatEur(m.capitale_residuo || 0)}</td>
                      <td className="py-3 px-2 text-right tabular">{formatEur(m.rata_mensile)}</td>
                      <td className="py-3 px-2 text-right tabular text-[#64748B]">{m.rate_residue || "—"}</td>
                      <td className="py-3 px-2 text-right">
                        <div className="inline-flex gap-1">
                          <button onClick={() => { setEditingMutuo(m); setShowForm(true); }} className="p-1.5 rounded hover:bg-[#F1F5F9] text-[#475569]" title="Modifica">
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => remove(m.id)} className="p-1.5 rounded hover:bg-red-50 text-[#DC2626]" title="Elimina">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}

      {showForm && (
        <MutuoFormModal
          mutuo={editingMutuo}
          properties={properties}
          onClose={() => { setShowForm(false); setEditingMutuo(null); }}
          onSaved={() => { setShowForm(false); setEditingMutuo(null); load(); }}
        />
      )}
      {showImport && (
        <ImportPdfModal
          properties={properties}
          onClose={() => setShowImport(false)}
          onParsed={(parsed) => {
            setShowImport(false);
            setEditingMutuo({ _prefill: parsed });  // prefill form
            setShowForm(true);
          }}
        />
      )}
    </Layout>
  );
}

const AlertRow = ({ icon: I, color, text }) => (
  <div className="flex items-start gap-2.5 text-sm">
    <I size={14} style={{ color }} className="mt-0.5 shrink-0" />
    <span className="text-[#0F172A]">{text}</span>
  </div>
);

// ====================== FORM MODAL ======================
function MutuoFormModal({ mutuo, properties, onClose, onSaved }) {
  const isEdit = !!mutuo?.id;
  const prefill = mutuo?._prefill || {};
  const [form, setForm] = useState({
    immobile_id: mutuo?.immobile_id || "",
    banca: mutuo?.banca || prefill.banca || "",
    tipo_tasso: mutuo?.tipo_tasso || prefill.tipo_tasso || "fisso",
    importo_originario: mutuo?.importo_originario ?? prefill.importo_originario ?? 0,
    capitale_residuo: mutuo?.capitale_residuo ?? prefill.capitale_residuo ?? "",
    tasso: mutuo?.tasso ?? prefill.tasso ?? 0,
    spread: mutuo?.spread ?? prefill.spread ?? "",
    parametro_riferimento: mutuo?.parametro_riferimento || prefill.parametro_riferimento || "",
    durata_anni: mutuo?.durata_anni ?? prefill.durata_anni ?? 20,
    rata_mensile: mutuo?.rata_mensile ?? prefill.rata_mensile ?? 0,
    data_inizio: (mutuo?.data_inizio || prefill.data_inizio || "").slice(0, 10),
    data_fine: (mutuo?.data_fine || prefill.data_fine || "").slice(0, 10),
    ipoteca_importo: mutuo?.ipoteca_importo ?? prefill.ipoteca_importo ?? "",
    garanzie: mutuo?.garanzie || prefill.garanzie || "",
    note: mutuo?.note || prefill.note_ai || "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.banca || !form.importo_originario || !form.tasso || !form.durata_anni || !form.rata_mensile) {
      toast.error("Compila banca, importo, tasso, durata e rata.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        immobile_id: form.immobile_id || null,
        capitale_residuo: form.capitale_residuo === "" ? null : parseFloat(form.capitale_residuo),
        spread: form.spread === "" ? null : parseFloat(form.spread),
        ipoteca_importo: form.ipoteca_importo === "" ? null : parseFloat(form.ipoteca_importo),
        importo_originario: parseFloat(form.importo_originario),
        tasso: parseFloat(form.tasso),
        durata_anni: parseInt(form.durata_anni),
        rata_mensile: parseFloat(form.rata_mensile),
      };
      if (isEdit) {
        await apiClient().patch(`/mutui/${mutuo.id}`, body);
        toast.success("Mutuo aggiornato");
      } else {
        await apiClient().post("/mutui", body);
        toast.success("Mutuo creato");
      }
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()} data-testid="mut-form-modal">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-[#0F172A]">{isEdit ? "Modifica mutuo" : "Nuovo mutuo"}</div>
            <div className="text-xs text-[#64748B]">Tutti i campi obbligatori per il calcolo del piano di ammortamento.</div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#F1F5F9] rounded"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label="Banca *" value={form.banca} onChange={(v) => setForm({ ...form, banca: v })} placeholder="Es. Intesa Sanpaolo" testId="mut-form-banca" />
            <FormField label="Immobile collegato" type="select" value={form.immobile_id} onChange={(v) => setForm({ ...form, immobile_id: v })} options={[{ v: "", l: "— Nessuno —" }, ...properties.map(p => ({ v: p.id, l: p.nome }))]} testId="mut-form-immobile" />
            <FormField label="Tipo tasso" type="select" value={form.tipo_tasso} onChange={(v) => setForm({ ...form, tipo_tasso: v })} options={[{ v: "fisso", l: "Fisso" }, { v: "variabile", l: "Variabile" }, { v: "misto", l: "Misto" }]} />
            <FormField label="Parametro (se variabile)" value={form.parametro_riferimento} onChange={(v) => setForm({ ...form, parametro_riferimento: v })} placeholder="Es. EURIBOR 3M, IRS 10Y" />
            <FormField label="Importo originario (€) *" type="number" value={form.importo_originario} onChange={(v) => setForm({ ...form, importo_originario: v })} testId="mut-form-importo" />
            <FormField label="Capitale residuo (€)" type="number" value={form.capitale_residuo} onChange={(v) => setForm({ ...form, capitale_residuo: v })} placeholder="Auto se vuoto" />
            <FormField label="Tasso annuo (%) *" type="number" value={form.tasso} onChange={(v) => setForm({ ...form, tasso: v })} step="0.001" testId="mut-form-tasso" />
            <FormField label="Spread (%)" type="number" value={form.spread} onChange={(v) => setForm({ ...form, spread: v })} step="0.001" />
            <FormField label="Durata (anni) *" type="number" value={form.durata_anni} onChange={(v) => setForm({ ...form, durata_anni: v })} testId="mut-form-durata" />
            <FormField label="Rata mensile (€) *" type="number" value={form.rata_mensile} onChange={(v) => setForm({ ...form, rata_mensile: v })} step="0.01" testId="mut-form-rata" />
            <FormField label="Data inizio" type="date" value={form.data_inizio} onChange={(v) => setForm({ ...form, data_inizio: v })} />
            <FormField label="Data fine" type="date" value={form.data_fine} onChange={(v) => setForm({ ...form, data_fine: v })} placeholder="Auto se vuoto" />
            <FormField label="Ipoteca (€)" type="number" value={form.ipoteca_importo} onChange={(v) => setForm({ ...form, ipoteca_importo: v })} />
            <FormField label="Garanzie" value={form.garanzie} onChange={(v) => setForm({ ...form, garanzie: v })} placeholder="Es. fideiussione coniuge" />
          </div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Note</span>
            <textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Note libere, clausole, penali estinzione anticipata…"
              className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF] resize-none"
            />
          </label>
        </div>
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-sm text-[#475569]">Annulla</button>
          <button
            onClick={submit}
            disabled={saving}
            data-testid="mut-form-save"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-semibold"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : null}
            {isEdit ? "Salva modifiche" : "Crea mutuo"}
          </button>
        </div>
      </div>
    </div>
  );
}

const FormField = ({ label, value, onChange, type = "text", placeholder, options, step, testId }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
    {type === "select" ? (
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]"
      >
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    ) : (
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        step={step}
        data-testid={testId}
        className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]"
      />
    )}
  </label>
);

// ====================== AI PDF IMPORT MODAL ======================
function ImportPdfModal({ properties, onClose, onParsed }) {
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState(null);

  const parse = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiClient().post("/mutui/parse-pdf", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 90000,
      });
      setPreview(r.data.parsed);
      toast.success("PDF analizzato — verifica e conferma");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore analisi PDF");
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-8" onClick={(e) => e.stopPropagation()} data-testid="mut-import-modal">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[#7C3AED]" />
            <div>
              <div className="text-base font-semibold text-[#0F172A]">Importa PDF banca</div>
              <div className="text-xs text-[#64748B]">L'AI estrae automaticamente banca, importo, tasso, durata, rata.</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#F1F5F9] rounded"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          {!preview ? (
            <>
              <label className="block">
                <div className="border-2 border-dashed border-[#CBD5E1] rounded-xl p-6 text-center hover:border-[#0066FF] hover:bg-[#F8FAFC] transition-colors cursor-pointer">
                  <Upload size={28} className="mx-auto text-[#94A3B8] mb-2" />
                  <div className="text-sm font-medium text-[#0F172A]">
                    {file ? file.name : "Trascina o clicca per selezionare il PDF"}
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-1">PDF contratto mutuo · max 15 MB · supporta anche scansioni (OCR)</div>
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                    data-testid="mut-import-file"
                  />
                </div>
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-sm text-[#475569]">Annulla</button>
                <button
                  onClick={parse}
                  disabled={!file || parsing}
                  data-testid="mut-import-parse"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#2563EB] hover:opacity-90 disabled:opacity-50 text-white text-sm font-semibold"
                >
                  {parsing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {parsing ? "Analisi in corso…" : "Analizza con AI"}
                </button>
              </div>
              <div className="text-[11px] text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 leading-relaxed">
                <strong className="text-[#0F172A]">Come funziona:</strong> il sistema estrae il testo dal PDF (o usa OCR se è una scansione) e lo invia a Claude Sonnet 4.6 per riconoscere: <em>banca, tipo tasso, importo, capitale residuo, tasso, spread, durata, rata, date, ipoteca</em>. I dati vengono poi mostrati in anteprima: tu puoi correggerli prima di salvare.
              </div>
            </>
          ) : (
            <>
              <div className="bg-[#ECFDF5] border border-[#10B981]/30 rounded-lg p-3 flex items-start gap-2">
                <Sparkles size={14} className="text-[#059669] mt-0.5 shrink-0" />
                <div className="text-xs text-[#065F46]">
                  <strong>Dati estratti.</strong> Verifica i campi e clicca «Apri form» per completare e salvare.
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <PreviewRow label="Banca" value={preview.banca} />
                <PreviewRow label="Tipo tasso" value={preview.tipo_tasso} />
                <PreviewRow label="Importo" value={preview.importo_originario ? formatEur(preview.importo_originario) : "—"} />
                <PreviewRow label="Capitale residuo" value={preview.capitale_residuo ? formatEur(preview.capitale_residuo) : "—"} />
                <PreviewRow label="Tasso" value={preview.tasso ? `${preview.tasso}%` : "—"} />
                <PreviewRow label="Spread" value={preview.spread ? `${preview.spread}%` : "—"} />
                <PreviewRow label="Durata" value={preview.durata_anni ? `${preview.durata_anni} anni` : "—"} />
                <PreviewRow label="Rata mensile" value={preview.rata_mensile ? formatEur(preview.rata_mensile) : "—"} />
                <PreviewRow label="Data inizio" value={preview.data_inizio || "—"} />
                <PreviewRow label="Data fine" value={preview.data_fine || "—"} />
              </div>
              {preview.note_ai && (
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 text-xs text-[#475569]">
                  <strong className="text-[#0F172A]">Sintesi AI:</strong> {preview.note_ai}
                </div>
              )}
              {Array.isArray(preview.anomalie) && preview.anomalie.length > 0 && (
                <div className="bg-[#FFFBEB] border border-[#FCD34D]/40 rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-[#92400E] font-bold mb-1">Anomalie/Clausole rilevate</div>
                  <ul className="text-xs text-[#0F172A] space-y-1">
                    {preview.anomalie.map((a, i) => <li key={i}>• {a}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button onClick={() => setPreview(null)} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-sm text-[#475569]">Indietro</button>
                <button
                  onClick={() => onParsed(preview)}
                  data-testid="mut-import-confirm"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold"
                >
                  Apri form pre-compilato →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const PreviewRow = ({ label, value }) => (
  <div className="flex justify-between py-1.5 border-b border-[#F1F5F9] last:border-0">
    <span className="text-[#64748B] text-xs uppercase tracking-wider font-medium">{label}</span>
    <span className="text-[#0F172A] font-medium tabular">{value || "—"}</span>
  </div>
);
