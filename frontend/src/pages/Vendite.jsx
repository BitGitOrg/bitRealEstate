import { useEffect, useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { apiClient } from "../lib/auth";
import { formatEur } from "../lib/demoData";
import { toast } from "sonner";
import { TrendingUp, Calendar, Trophy, Loader2, X, Tag, CheckCircle2, ArrowLeftCircle } from "lucide-react";

export default function Vendite() {
  const [agg, setAgg] = useState(null);
  const [props, setProps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMetti, setShowMetti] = useState(null);     // property obj
  const [showRegistra, setShowRegistra] = useState(null); // property obj

  const load = async () => {
    setLoading(true);
    try {
      const [a, p] = await Promise.all([
        apiClient().get("/vendite/aggregato"),
        apiClient().get("/properties"),
      ]);
      setAgg(a.data || null);
      setProps(p.data || []);
    } catch {
      toast.error("Errore caricamento");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const candidati = props.filter(p => !["venduto", "in_vendita", "in_ristrutturazione"].includes(p.stato));
  const inVendita = agg?.in_vendita || [];
  const venduti = agg?.venduti || [];

  const ritira = async (pid) => {
    if (!confirm("Ritirare l'immobile dal mercato?")) return;
    try {
      await apiClient().post(`/properties/${pid}/ritira-da-vendita`);
      toast.success("Ritirato");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Errore"); }
  };

  return (
    <Layout
      title="Vendite & Rivendite"
      subtitle={loading ? "Caricamento…" : `${agg?.n_concluse || 0} concluse · ${agg?.n_in_vendita || 0} in vendita`}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="vendite-kpi-conclusi">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[rgba(132,204,22,0.15)] border border-[rgba(132,204,22,0.3)] flex items-center justify-center"><Trophy size={18} className="text-[#4D7C0F]"/></div>
            <div>
              <div className="text-[10px] uppercase text-[#64748B]">Operazioni concluse</div>
              <div className="font-display text-2xl font-bold tabular">{agg?.n_concluse ?? 0}</div>
            </div>
          </div>
        </SectionCard>
        <SectionCard testId="vendite-kpi-in-vendita">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[rgba(14,165,233,0.15)] border border-[rgba(14,165,233,0.3)] flex items-center justify-center"><Calendar size={18} className="text-[#38BDF8]"/></div>
            <div>
              <div className="text-[10px] uppercase text-[#64748B]">Sul mercato</div>
              <div className="font-display text-2xl font-bold tabular">{agg?.n_in_vendita ?? 0}</div>
            </div>
          </div>
        </SectionCard>
        <SectionCard testId="vendite-kpi-utile-ytd">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[rgba(16,185,129,0.15)] border border-[rgba(16,185,129,0.3)] flex items-center justify-center"><TrendingUp size={18} className="text-[#059669]"/></div>
            <div>
              <div className="text-[10px] uppercase text-[#64748B]">Utile netto YTD</div>
              <div className="font-display text-2xl font-bold tabular text-[#059669]">{formatEur(agg?.utile_ytd || 0)}</div>
            </div>
          </div>
        </SectionCard>
        <SectionCard testId="vendite-kpi-roi-medio">
          <div className="text-[10px] uppercase text-[#64748B]">ROI medio operazioni</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#059669]">{agg?.roi_medio_pct || 0}%</div>
        </SectionCard>
      </div>

      <SectionCard
        title="Immobili in vendita"
        subtitle="Attualmente sul mercato — clicca per registrare la vendita o ritirare"
        testId="vendite-in-corso"
        className="mb-4"
      >
        {inVendita.length === 0 && <div className="text-sm text-[#475569] py-4">Nessun immobile in vendita. Seleziona un immobile dalla lista «Candidati» qui sotto per metterlo sul mercato.</div>}
        {inVendita.map(p => (
          <div key={p.id} className="flex items-center gap-4 p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg mb-2 last:mb-0" data-testid={`in-vendita-${p.id}`}>
            <img src={p.img} className="w-16 h-16 rounded object-cover" alt="" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[#0F172A]">{p.nome}</div>
              <div className="text-xs text-[#475569]">{p.citta} · Costo totale {formatEur(p.costo_totale)}</div>
              <div className="text-[11px] text-[#64748B] mt-0.5">In vendita dal {p.data_messa_in_vendita || "—"}{p.agenzia_vendita ? ` · ${p.agenzia_vendita}` : ""}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase text-[#64748B]">Target</div>
              <div className="font-display text-lg font-bold tabular text-[#059669]">{formatEur(p.prezzo_vendita_target || 0)}</div>
              <div className="text-[11px] text-[#64748B]">Min {formatEur(p.prezzo_minimo || 0)}</div>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button onClick={() => setShowRegistra(p)} data-testid={`registra-vendita-${p.id}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-xs font-medium">
                <CheckCircle2 size={12}/> Registra vendita
              </button>
              <button onClick={() => ritira(p.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC] text-xs">
                <ArrowLeftCircle size={12}/> Ritira
              </button>
            </div>
          </div>
        ))}
      </SectionCard>

      {candidati.length > 0 && inVendita.length < 5 && (
        <SectionCard title="Candidati alla vendita" subtitle="Immobili che puoi mettere sul mercato" testId="vendite-candidati" className="mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {candidati.slice(0, 6).map(p => (
              <button
                key={p.id}
                onClick={() => setShowMetti(p)}
                data-testid={`candidato-${p.id}`}
                className="flex items-center gap-3 p-3 bg-white border border-[#E2E8F0] rounded-lg hover:border-[#0066FF] hover:shadow-md text-left transition-all"
              >
                <img src={p.img} className="w-12 h-12 rounded object-cover" alt="" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#0F172A] truncate">{p.nome}</div>
                  <div className="text-[11px] text-[#64748B]">{p.citta} · {formatEur(p.valore_stimato || p.costo_totale)}</div>
                </div>
                <Tag size={14} className="text-[#0066FF] shrink-0"/>
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Storico vendite" subtitle={`${venduti.length} operazioni concluse`} testId="vendite-storico">
        {venduti.length === 0 ? (
          <div className="text-sm text-[#475569] py-4">Nessuna vendita registrata.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                  <th className="py-2">Immobile</th>
                  <th className="py-2">Data vendita</th>
                  <th className="py-2 text-right">Costo totale</th>
                  <th className="py-2 text-right">Prezzo vendita</th>
                  <th className="py-2 text-right">Plus. lorda</th>
                  <th className="py-2 text-right">Tasse</th>
                  <th className="py-2 text-right">Utile netto</th>
                  <th className="py-2 text-right">ROI</th>
                </tr>
              </thead>
              <tbody>
                {venduti.map(p => (
                  <tr key={p.id} className="border-b border-[#E2E8F0] last:border-0">
                    <td className="py-3 font-medium">{p.nome}</td>
                    <td className="py-3 text-[#475569] text-xs">{p.data_vendita || "—"}</td>
                    <td className="py-3 text-right tabular">{formatEur(p.costo_totale || 0)}</td>
                    <td className="py-3 text-right tabular">{formatEur(p.prezzo_vendita || 0)}</td>
                    <td className="py-3 text-right tabular">{formatEur(p.plusvalenza_lorda || 0)}</td>
                    <td className="py-3 text-right tabular text-[#DC2626]">{formatEur(p.tasse_plusvalenza || 0)}</td>
                    <td className="py-3 text-right tabular text-[#059669] font-semibold">{formatEur(p.utile_netto || 0)}</td>
                    <td className="py-3 text-right tabular text-[#059669]">+{p.roi_finale_pct || 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {showMetti && <MettiInVenditaModal p={showMetti} onClose={() => setShowMetti(null)} onDone={() => { setShowMetti(null); load(); }} />}
      {showRegistra && <RegistraVenditaModal p={showRegistra} onClose={() => setShowRegistra(null)} onDone={() => { setShowRegistra(null); load(); }} />}
    </Layout>
  );
}

function MettiInVenditaModal({ p, onClose, onDone }) {
  const [form, setForm] = useState({
    prezzo_richiesto: p.valore_stimato || p.costo_totale || 0,
    prezzo_minimo: 0,
    data_messa_in_vendita: new Date().toISOString().slice(0, 10),
    agenzia: "",
    provvigione_pct: 3,
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await apiClient().post(`/properties/${p.id}/metti-in-vendita`, form);
      toast.success("Immobile messo sul mercato");
      onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || "Errore"); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="metti-vendita-modal">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[#0F172A]">Metti in vendita</div>
            <div className="text-xs text-[#64748B]">{p.nome}</div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#F1F5F9] rounded"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          <SimpleField label="Prezzo richiesto (€)" type="number" value={form.prezzo_richiesto} onChange={(v) => setForm({...form, prezzo_richiesto: parseFloat(v) || 0})} testId="metti-prezzo" />
          <SimpleField label="Prezzo minimo accettabile (€)" type="number" value={form.prezzo_minimo} onChange={(v) => setForm({...form, prezzo_minimo: parseFloat(v) || 0})} placeholder="Auto: 92% del richiesto"/>
          <SimpleField label="Data messa in vendita" type="date" value={form.data_messa_in_vendita} onChange={(v) => setForm({...form, data_messa_in_vendita: v})} />
          <SimpleField label="Agenzia (opzionale)" value={form.agenzia} onChange={(v) => setForm({...form, agenzia: v})} />
          <SimpleField label="Provvigione %" type="number" value={form.provvigione_pct} onChange={(v) => setForm({...form, provvigione_pct: parseFloat(v) || 0})} />
        </div>
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-sm text-[#475569]">Annulla</button>
          <button onClick={submit} disabled={saving} data-testid="metti-vendita-submit" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-semibold">
            {saving ? <Loader2 size={12} className="animate-spin"/> : <Tag size={12}/>}
            Conferma
          </button>
        </div>
      </div>
    </div>
  );
}

function RegistraVenditaModal({ p, onClose, onDone }) {
  const target = p.prezzo_vendita_target || p.valore_stimato || 0;
  const [form, setForm] = useState({
    prezzo_vendita: target,
    data_compromesso: "",
    data_rogito: new Date().toISOString().slice(0, 10),
    provvigione_eur: target * (p.provvigione_pct || 3) / 100,
    altri_costi_vendita: 500,
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const margine = (parseFloat(form.prezzo_vendita) || 0) - (p.costo_totale || 0) - (parseFloat(form.provvigione_eur) || 0) - (parseFloat(form.altri_costi_vendita) || 0);
  const submit = async () => {
    if (!confirm(`Confermi la vendita di "${p.nome}" a ${formatEur(form.prezzo_vendita)}? L'operazione è irreversibile.`)) return;
    setSaving(true);
    try {
      await apiClient().post(`/properties/${p.id}/registra-vendita`, form);
      toast.success("Vendita registrata · operazione conclusa");
      onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || "Errore"); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="registra-vendita-modal">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[#0F172A]">Registra vendita</div>
            <div className="text-xs text-[#64748B]">{p.nome} · Costo totale {formatEur(p.costo_totale || 0)}</div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#F1F5F9] rounded"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          <SimpleField label="Prezzo vendita effettivo (€)" type="number" value={form.prezzo_vendita} onChange={(v) => setForm({...form, prezzo_vendita: parseFloat(v) || 0})} testId="registra-prezzo" />
          <div className="grid grid-cols-2 gap-3">
            <SimpleField label="Data compromesso" type="date" value={form.data_compromesso} onChange={(v) => setForm({...form, data_compromesso: v})} />
            <SimpleField label="Data rogito" type="date" value={form.data_rogito} onChange={(v) => setForm({...form, data_rogito: v})} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SimpleField label="Provvigione (€)" type="number" value={form.provvigione_eur} onChange={(v) => setForm({...form, provvigione_eur: parseFloat(v) || 0})} />
            <SimpleField label="Altri costi (€)" type="number" value={form.altri_costi_vendita} onChange={(v) => setForm({...form, altri_costi_vendita: parseFloat(v) || 0})} />
          </div>
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 text-xs">
            <div className="flex justify-between"><span className="text-[#64748B]">Margine lordo (al netto provvigione e costi):</span><span className={`tabular font-semibold ${margine > 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{formatEur(margine)}</span></div>
            <div className="text-[10px] text-[#94A3B8] mt-1">Le tasse sulla plusvalenza saranno calcolate al salvataggio in base al regime società.</div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-sm text-[#475569]">Annulla</button>
          <button onClick={submit} disabled={saving} data-testid="registra-vendita-submit" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#059669] hover:bg-[#047857] disabled:opacity-50 text-white text-sm font-semibold">
            {saving ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>}
            Conferma vendita
          </button>
        </div>
      </div>
    </div>
  );
}

const SimpleField = ({ label, value, onChange, type = "text", placeholder, testId }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
    <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={testId}
      className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]" />
  </label>
);
