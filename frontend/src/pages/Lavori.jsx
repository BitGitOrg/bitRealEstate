import { useEffect, useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { Progress } from "../components/ui/progress";
import { apiClient } from "../lib/auth";
import { formatEur } from "../lib/demoData";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Hammer, Plus, Loader2, X, Edit2, Trash2 } from "lucide-react";
import { MiniSparkline } from "../components/MiniSparkline";

const CATEGORIE = ["Muratura", "Impianto elettrico", "Impianto idraulico", "Serramenti", "Pavimenti", "Bagno", "Cucina", "Tinteggiatura", "Arredamento", "Pratiche tecniche", "Direzione lavori", "Imprevisti", "Generico"];

export default function Lavori() {
  const [items, setItems] = useState([]);
  const [agg, setAgg] = useState(null);
  const [props, setProps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [l, a, p] = await Promise.all([
        apiClient().get("/lavori"),
        apiClient().get("/lavori/aggregato"),
        apiClient().get("/properties"),
      ]);
      setItems(l.data || []);
      setAgg(a.data || null);
      setProps(p.data || []);
    } catch { toast.error("Errore caricamento"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!confirm("Eliminare questo cantiere?")) return;
    try {
      await apiClient().delete(`/lavori/${id}`);
      toast.success("Eliminato");
      load();
    } catch { toast.error("Errore"); }
  };

  return (
    <Layout
      title="Lavori & Ristrutturazioni"
      subtitle={loading ? "Caricamento…" : `${agg?.n_cantieri || 0} cantieri · ${agg?.n_in_corso || 0} in corso · ${agg?.n_completati || 0} completati`}
      actions={
        <button onClick={() => { setEditing(null); setShowForm(true); }} data-testid="lavori-add-btn" className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm font-medium">
          <Plus size={14}/> Nuovo cantiere
        </button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="lavori-kpi-cantieri">
          <div className="text-[10px] uppercase text-[#64748B]">Cantieri attivi</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{agg?.n_in_corso ?? 0}</div>
          <MiniSparkline value={(agg?.n_in_corso || 1)} accent={'brand'} seed="cantieri" />
        </SectionCard>
        <SectionCard testId="lavori-kpi-budget">
          <div className="text-[10px] uppercase text-[#64748B]">Budget totale</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{formatEur(agg?.tot_budget || 0)}</div>
          <MiniSparkline value={(agg?.tot_budget || 1)} accent={'default'} seed="budget" />
        </SectionCard>
        <SectionCard testId="lavori-kpi-speso">
          <div className="text-[10px] uppercase text-[#64748B]">Speso ad oggi</div>
          <div className={`font-display text-3xl font-bold tabular mt-1 ${(agg?.tot_speso || 0) > (agg?.tot_budget || 0) ? "text-[#DC2626]" : ""}`}>{formatEur(agg?.tot_speso || 0)}</div>
          <MiniSparkline value={(agg?.tot_speso || 1)} accent={((agg?.tot_speso||0) > (agg?.tot_budget||0)) ? 'critical' : 'positive'} seed="speso" />
        </SectionCard>
        <SectionCard testId="lavori-kpi-fuori">
          <div className="text-[10px] uppercase text-[#64748B]">Fuori budget</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#DC2626]">{agg?.fuori_budget ?? 0}</div>
          <MiniSparkline value={((agg?.fuori_budget || 0) + 1)} accent={'critical'} seed="fuoribudget" />
        </SectionCard>
      </div>

      {items.length === 0 && !loading && (
        <SectionCard testId="lavori-empty">
          <div className="py-10 text-center">
            <Hammer size={36} className="mx-auto text-[#CBD5E1] mb-3" />
            <div className="text-sm text-[#475569] mb-4">Nessun cantiere registrato. Crea il primo per tracciare budget, avanzamento e scostamenti.</div>
            <button onClick={() => { setEditing(null); setShowForm(true); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0066FF] text-white text-sm font-medium">
              <Plus size={14}/> Crea cantiere
            </button>
          </div>
        </SectionCard>
      )}

      <div className="space-y-4">
        {items.map(l => {
          const over = l.over_budget;
          return (
            <SectionCard key={l.id} testId={`lavoro-${l.id}`}>
              <div className="flex flex-wrap items-start gap-4">
                {l.immobile_img && <img src={l.immobile_img} className="w-24 h-24 rounded-lg object-cover" alt="" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-display font-semibold">{l.descrizione}</div>
                      <div className="text-xs text-[#475569]">{l.immobile_nome || "Generale"} · Impresa: {l.impresa || "—"} · {l.categoria}</div>
                      <div className="text-[11px] text-[#64748B] mt-1">
                        Inizio {l.data_inizio || "—"} · Fine prevista {l.data_fine_prevista || "—"}
                        {l.data_fine_effettiva && ` · Completato il ${l.data_fine_effettiva}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {over ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.15)] text-[#DC2626] text-xs font-medium">
                          <AlertTriangle size={12}/> Fuori budget +{l.scostamento_pct}%
                        </span>
                      ) : l.stato === "completato" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[rgba(132,204,22,0.3)] bg-[rgba(132,204,22,0.15)] text-[#4D7C0F] text-xs font-medium">
                          <CheckCircle2 size={12}/> Completato
                        </span>
                      ) : l.stato === "sospeso" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[rgba(148,163,184,0.3)] bg-[rgba(148,163,184,0.15)] text-[#475569] text-xs font-medium">
                          Sospeso
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.15)] text-[#B45309] text-xs font-medium">
                          <Hammer size={12}/> In corso
                        </span>
                      )}
                      <button onClick={() => { setEditing(l); setShowForm(true); }} className="p-1.5 rounded hover:bg-[#F1F5F9] text-[#475569]" title="Modifica"><Edit2 size={13}/></button>
                      <button onClick={() => remove(l.id)} className="p-1.5 rounded hover:bg-red-50 text-[#DC2626]" title="Elimina"><Trash2 size={13}/></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                    <div><div className="text-[10px] uppercase text-[#64748B]">Budget</div><div className="text-sm tabular font-medium">{formatEur(l.budget)}</div></div>
                    <div><div className="text-[10px] uppercase text-[#64748B]">Speso</div><div className={`text-sm tabular font-medium ${over ? "text-[#DC2626]" : ""}`}>{formatEur(l.speso)}</div></div>
                    <div><div className="text-[10px] uppercase text-[#64748B]">Residuo</div><div className={`text-sm tabular font-medium ${l.residuo < 0 ? "text-[#DC2626]" : "text-[#059669]"}`}>{formatEur(l.residuo)}</div></div>
                    <div><div className="text-[10px] uppercase text-[#64748B]">Avanzamento</div><div className="text-sm tabular font-medium">{l.avanzamento}%</div></div>
                  </div>
                  <div className="mt-3"><Progress value={l.avanzamento} className="h-2 bg-[#F1F5F9]" /></div>
                  {l.note && <div className="text-xs text-[#475569] mt-2 italic">«{l.note}»</div>}
                </div>
              </div>
            </SectionCard>
          );
        })}
      </div>

      {showForm && <LavoroFormModal lavoro={editing} properties={props} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); load(); }} />}
    </Layout>
  );
}

function LavoroFormModal({ lavoro, properties, onClose, onSaved }) {
  const isEdit = !!lavoro?.id;
  const [form, setForm] = useState({
    immobile_id: lavoro?.immobile_id || "",
    descrizione: lavoro?.descrizione || "",
    categoria: lavoro?.categoria || "Generico",
    impresa: lavoro?.impresa || "",
    tecnico: lavoro?.tecnico || "",
    data_inizio: (lavoro?.data_inizio || "").slice(0, 10),
    data_fine_prevista: (lavoro?.data_fine_prevista || "").slice(0, 10),
    data_fine_effettiva: (lavoro?.data_fine_effettiva || "").slice(0, 10),
    budget: lavoro?.budget || 0,
    speso: lavoro?.speso || 0,
    avanzamento: lavoro?.avanzamento || 0,
    stato: lavoro?.stato || "in_corso",
    note: lavoro?.note || "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.descrizione || form.budget <= 0) {
      toast.error("Descrizione e budget sono obbligatori");
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        immobile_id: form.immobile_id || null,
        budget: parseFloat(form.budget) || 0,
        speso: parseFloat(form.speso) || 0,
        avanzamento: parseInt(form.avanzamento) || 0,
      };
      if (isEdit) await apiClient().patch(`/lavori/${lavoro.id}`, body);
      else await apiClient().post("/lavori", body);
      toast.success(isEdit ? "Cantiere aggiornato" : "Cantiere creato");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Errore"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()} data-testid="lavoro-form-modal">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-[#0F172A]">{isEdit ? "Modifica cantiere" : "Nuovo cantiere"}</div>
            <div className="text-xs text-[#64748B]">Traccia budget, avanzamento e scostamenti</div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#F1F5F9] rounded"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SimpleField label="Descrizione *" value={form.descrizione} onChange={(v) => setForm({...form, descrizione: v})} placeholder="Es. Ristrutturazione bagno" testId="lavoro-descrizione" />
            <SimpleField label="Categoria" type="select" value={form.categoria} onChange={(v) => setForm({...form, categoria: v})} options={CATEGORIE.map(c => ({v: c, l: c}))} />
            <SimpleField label="Immobile" type="select" value={form.immobile_id} onChange={(v) => setForm({...form, immobile_id: v})} options={[{v: "", l: "— Generale —"}, ...properties.map(p => ({v: p.id, l: p.nome}))]} />
            <SimpleField label="Stato" type="select" value={form.stato} onChange={(v) => setForm({...form, stato: v})} options={[{v: "in_corso", l: "In corso"}, {v: "completato", l: "Completato"}, {v: "sospeso", l: "Sospeso"}]} />
            <SimpleField label="Impresa" value={form.impresa} onChange={(v) => setForm({...form, impresa: v})} />
            <SimpleField label="Tecnico/DL" value={form.tecnico} onChange={(v) => setForm({...form, tecnico: v})} />
            <SimpleField label="Data inizio" type="date" value={form.data_inizio} onChange={(v) => setForm({...form, data_inizio: v})} />
            <SimpleField label="Data fine prevista" type="date" value={form.data_fine_prevista} onChange={(v) => setForm({...form, data_fine_prevista: v})} />
            <SimpleField label="Budget (€) *" type="number" value={form.budget} onChange={(v) => setForm({...form, budget: v})} testId="lavoro-budget" />
            <SimpleField label="Speso ad oggi (€)" type="number" value={form.speso} onChange={(v) => setForm({...form, speso: v})} />
            <SimpleField label="Avanzamento %" type="number" value={form.avanzamento} onChange={(v) => setForm({...form, avanzamento: v})} />
            {form.stato === "completato" && <SimpleField label="Data fine effettiva" type="date" value={form.data_fine_effettiva} onChange={(v) => setForm({...form, data_fine_effettiva: v})} />}
          </div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Note</span>
            <textarea rows={2} value={form.note} onChange={(e) => setForm({...form, note: e.target.value})} placeholder="Note libere, dettagli imprevisti…" className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF] resize-none" />
          </label>
        </div>
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-sm text-[#475569]">Annulla</button>
          <button onClick={submit} disabled={saving} data-testid="lavoro-form-save" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-semibold">
            {saving ? <Loader2 size={12} className="animate-spin"/> : null}
            {isEdit ? "Salva modifiche" : "Crea cantiere"}
          </button>
        </div>
      </div>
    </div>
  );
}

const SimpleField = ({ label, value, onChange, type = "text", placeholder, options, testId }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
    {type === "select" ? (
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} data-testid={testId}
        className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    ) : (
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={testId}
        className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]" />
    )}
  </label>
);
