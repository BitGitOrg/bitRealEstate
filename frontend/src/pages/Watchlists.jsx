import { useEffect, useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { apiClient } from "../lib/auth";
import { formatEur } from "../lib/demoData";
import { Plus, Trash2, Filter, Loader2, MapPin, Home, TrendingUp, Bell } from "lucide-react";
import { toast } from "sonner";

const TIPOLOGIE = ["Qualsiasi", "Bilocale", "Trilocale", "Quadrilocale", "Monolocale", "Villa", "Loft", "Attico"];

export default function Watchlists() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nome: "", citta: "", tipologia: "Qualsiasi",
    prezzo_max: "", metratura_min: "", rendimento_min: "",
  });
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    try {
      const { data } = await apiClient().get("/watchlists");
      setItems(data);
    } catch { toast.error("Errore caricamento watchlists"); }
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Inserisci un nome"); return; }
    setLoading(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        citta: form.citta.trim() || null,
        tipologia: form.tipologia === "Qualsiasi" ? null : form.tipologia,
        prezzo_max: form.prezzo_max ? parseFloat(form.prezzo_max) : null,
        metratura_min: form.metratura_min ? parseFloat(form.metratura_min) : null,
        rendimento_min: form.rendimento_min ? parseFloat(form.rendimento_min) : null,
        attiva: true,
      };
      const { data } = await apiClient().post("/watchlists", payload);
      setItems([data, ...items]);
      setForm({ nome: "", citta: "", tipologia: "Qualsiasi", prezzo_max: "", metratura_min: "", rendimento_min: "" });
      setShowForm(false);
      toast.success("Watchlist creata. L'AI Scout cercherà match nei nuovi deal.");
    } catch (err) { toast.error(err?.response?.data?.detail || "Errore"); }
    finally { setLoading(false); }
  };

  const remove = async (w) => {
    if (!confirm(`Eliminare la watchlist "${w.nome}"?`)) return;
    try {
      await apiClient().delete(`/watchlists/${w.id}`);
      setItems(items.filter(x => x.id !== w.id));
      toast.success("Watchlist eliminata");
    } catch { toast.error("Errore"); }
  };

  return (
    <Layout title="Watchlists" subtitle="Salva filtri di ricerca · L'AI ti avvisa quando un nuovo deal matcha i tuoi criteri"
      actions={
        <button data-testid="add-watchlist-btn" onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm font-medium transition-colors">
          <Plus size={14}/> Nuova watchlist
        </button>
      }
    >
      {showForm && (
        <SectionCard testId="watchlist-form" className="mb-6">
          <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block md:col-span-3">
              <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-medium">Nome watchlist *</span>
              <input
                data-testid="wl-nome"
                value={form.nome} onChange={(e) => setForm({...form, nome: e.target.value})}
                placeholder="Es: Bilocali Milano sotto 250k con rendimento 5%"
                className="mt-1.5 w-full px-3 py-2 bg-[#080C11] border border-[#212B36] rounded-lg text-sm outline-none focus:border-[#0066FF]"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-medium">Città</span>
              <input
                data-testid="wl-citta"
                value={form.citta} onChange={(e) => setForm({...form, citta: e.target.value})}
                placeholder="Milano"
                className="mt-1.5 w-full px-3 py-2 bg-[#080C11] border border-[#212B36] rounded-lg text-sm outline-none focus:border-[#0066FF]"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-medium">Tipologia</span>
              <select
                data-testid="wl-tipologia"
                value={form.tipologia} onChange={(e) => setForm({...form, tipologia: e.target.value})}
                className="mt-1.5 w-full px-3 py-2 bg-[#080C11] border border-[#212B36] rounded-lg text-sm outline-none focus:border-[#0066FF]"
              >
                {TIPOLOGIE.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-medium">Prezzo max (€)</span>
              <input
                data-testid="wl-prezzo-max"
                type="number" value={form.prezzo_max} onChange={(e) => setForm({...form, prezzo_max: e.target.value})}
                placeholder="250000"
                className="mt-1.5 w-full px-3 py-2 bg-[#080C11] border border-[#212B36] rounded-lg text-sm outline-none focus:border-[#0066FF]"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-medium">Metratura min (m²)</span>
              <input
                data-testid="wl-metratura-min"
                type="number" value={form.metratura_min} onChange={(e) => setForm({...form, metratura_min: e.target.value})}
                placeholder="50"
                className="mt-1.5 w-full px-3 py-2 bg-[#080C11] border border-[#212B36] rounded-lg text-sm outline-none focus:border-[#0066FF]"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-medium">Rendimento netto min (%)</span>
              <input
                data-testid="wl-rendimento-min"
                type="number" step="0.1" value={form.rendimento_min} onChange={(e) => setForm({...form, rendimento_min: e.target.value})}
                placeholder="5"
                className="mt-1.5 w-full px-3 py-2 bg-[#080C11] border border-[#212B36] rounded-lg text-sm outline-none focus:border-[#0066FF]"
              />
            </label>
            <div className="md:col-span-3 flex items-center gap-2 mt-2">
              <button
                data-testid="wl-submit"
                type="submit" disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {loading ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>} Crea watchlist
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-[#212B36] text-[#9CA3AF] hover:text-[#F3F4F6] text-sm">Annulla</button>
            </div>
          </form>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.length === 0 && !showForm && (
          <SectionCard testId="wl-empty" className="md:col-span-2 xl:col-span-3 text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-[#161B22] border border-[#212B36] flex items-center justify-center mx-auto mb-4">
              <Filter size={22} className="text-[#60A5FA]"/>
            </div>
            <h4 className="font-display text-lg font-semibold">Nessuna watchlist</h4>
            <p className="text-sm text-[#9CA3AF] mt-2 max-w-md mx-auto">Crea filtri salvabili: l'AI Scout segnerà automaticamente i deal che matchano i tuoi criteri.</p>
            <button onClick={() => setShowForm(true)} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm rounded-lg">
              <Plus size={14}/> Crea la prima
            </button>
          </SectionCard>
        )}

        {items.map(w => (
          <div key={w.id} data-testid={`wl-card-${w.id}`} className="bg-[#11171F] border border-[#212B36] rounded-xl p-5 card-hover">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[rgba(0,102,255,0.1)] border border-[rgba(0,102,255,0.3)] flex items-center justify-center shrink-0">
                  <Bell size={18} className="text-[#60A5FA]"/>
                </div>
                <div className="min-w-0">
                  <div className="font-display font-semibold text-[#F3F4F6] truncate">{w.nome}</div>
                  <div className="text-[10px] uppercase tracking-wider text-[#34D399] mt-0.5 pulse-dot inline-block">Attiva</div>
                </div>
              </div>
              <button
                onClick={() => remove(w)} data-testid={`wl-delete-${w.id}`}
                className="p-1.5 rounded text-[#6B7280] hover:text-[#F87171] hover:bg-[rgba(239,68,68,0.1)]"
              >
                <Trash2 size={14}/>
              </button>
            </div>
            <div className="space-y-1.5 text-sm">
              {w.citta && <div className="flex items-center gap-2 text-[#9CA3AF]"><MapPin size={12} className="text-[#6B7280]"/> {w.citta}</div>}
              {w.tipologia && <div className="flex items-center gap-2 text-[#9CA3AF]"><Home size={12} className="text-[#6B7280]"/> {w.tipologia}</div>}
              {w.prezzo_max && <div className="flex items-center gap-2 text-[#9CA3AF]"><span className="text-[#6B7280] mono text-[10px]">≤€</span> Max {formatEur(w.prezzo_max)}</div>}
              {w.metratura_min && <div className="flex items-center gap-2 text-[#9CA3AF]"><span className="text-[#6B7280] mono text-[10px]">≥m²</span> Min {w.metratura_min} m²</div>}
              {w.rendimento_min && <div className="flex items-center gap-2 text-[#9CA3AF]"><TrendingUp size={12} className="text-[#34D399]"/> Min {w.rendimento_min}% netto</div>}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
