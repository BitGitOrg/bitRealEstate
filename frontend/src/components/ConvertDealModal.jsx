import { useState } from "react";
import { apiClient } from "../lib/auth";
import { formatEur } from "../lib/demoData";
import { X, Loader2, Sparkles, Building2 } from "lucide-react";
import { toast } from "sonner";

const STATI_OPTS = [
  { v: "in_trattativa", l: "In trattativa" },
  { v: "acquistato", l: "Acquistato" },
  { v: "in_ristrutturazione", l: "In ristrutturazione" },
  { v: "disponibile", l: "Disponibile" },
];

const OP_OPTS = [
  { v: "reddito", l: "Reddito (affitto)" },
  { v: "compra_vendi", l: "Compra-Vendi" },
  { v: "compra_ristruttura_vendi", l: "Compra-Ristruttura-Vendi" },
];

export const ConvertDealModal = ({ deal, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    data_acquisto: new Date().toISOString().slice(0, 10),
    notaio: Math.round(deal.prezzo * 0.02),
    agenzia: Math.round(deal.prezzo * 0.03),
    imposte: Math.round(deal.prezzo * 0.04),
    lavori: 0,
    stato: "in_trattativa",
    operazione: "reddito",
    mutuo_attivo: false,
    mutuo_banca: "",
    mutuo_importo: Math.round(deal.prezzo * 0.6),
    mutuo_rata: Math.round((deal.prezzo * 0.6) * 0.005),
    mutuo_tasso: 3.2,
    note: "",
  });

  const totale = (deal.prezzo || 0) + (parseFloat(form.notaio) || 0) + (parseFloat(form.agenzia) || 0) + (parseFloat(form.imposte) || 0) + (parseFloat(form.lavori) || 0);

  const submit = async (rapid = false) => {
    setLoading(true);
    try {
      const payload = rapid
        ? { stato: "in_trattativa", operazione: "reddito" }
        : {
            data_acquisto: form.data_acquisto,
            notaio: parseFloat(form.notaio) || 0,
            agenzia: parseFloat(form.agenzia) || 0,
            imposte: parseFloat(form.imposte) || 0,
            lavori: parseFloat(form.lavori) || 0,
            stato: form.stato,
            operazione: form.operazione,
            note: form.note,
            mutuo: form.mutuo_attivo
              ? { banca: form.mutuo_banca, residuo: parseFloat(form.mutuo_importo) || 0, rata: parseFloat(form.mutuo_rata) || 0, tasso: parseFloat(form.mutuo_tasso) || 0 }
              : null,
          };
      const { data } = await apiClient().post(`/deals/${deal.id}/convert`, payload);
      toast.success(`${data.nome} aggiunto al Patrimonio (${data.id})`);
      onSuccess?.(data);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore conversione");
    } finally { setLoading(false); }
  };

  const F = ({ label, value, onChange, suffix, type = "number" }) => (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
      <div className="mt-1.5 flex items-center bg-white border border-[#E2E8F0] rounded-lg overflow-hidden focus-within:border-[#0066FF] transition-colors">
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 bg-transparent px-3 py-2 outline-none text-sm tabular text-[#0F172A]" />
        {suffix && <span className="px-3 text-xs text-[#64748B]">{suffix}</span>}
      </div>
    </label>
  );

  return (
    <div data-testid="convert-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.6)] backdrop-blur-sm p-4 fade-up" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[rgba(0,102,255,0.1)] border border-[rgba(0,102,255,0.3)] flex items-center justify-center">
              <Building2 size={18} className="text-[#2563EB]"/>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-[#0F172A]">Converti deal in immobile</h3>
              <p className="text-xs text-[#475569]">{deal.titolo}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]"><X size={16}/></button>
        </div>

        {/* Summary from deal */}
        <div className="px-6 py-4 bg-[#F8FAFC] border-b border-[#E2E8F0]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><div className="text-[10px] uppercase text-[#64748B]">Prezzo</div><div className="tabular font-medium text-[#0F172A]">{formatEur(deal.prezzo)}</div></div>
            <div><div className="text-[10px] uppercase text-[#64748B]">Metratura</div><div className="tabular font-medium text-[#0F172A]">{deal.metratura} m²</div></div>
            <div><div className="text-[10px] uppercase text-[#64748B]">Città</div><div className="font-medium text-[#0F172A]">{deal.citta}</div></div>
            <div><div className="text-[10px] uppercase text-[#64748B]">Canone stim.</div><div className="tabular font-medium text-[#0F172A]">{formatEur(deal.canone_stimato)}/m</div></div>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <F label="Data rogito / preliminare" value={form.data_acquisto} onChange={(v) => setForm({...form, data_acquisto: v})} type="date" />
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Stato iniziale</span>
              <select data-testid="conv-stato" value={form.stato} onChange={(e) => setForm({...form, stato: e.target.value})} className="mt-1.5 w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm outline-none focus:border-[#0066FF] text-[#0F172A]">
                {STATI_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Tipologia operazione</span>
              <select data-testid="conv-op" value={form.operazione} onChange={(e) => setForm({...form, operazione: e.target.value})} className="mt-1.5 w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm outline-none focus:border-[#0066FF] text-[#0F172A]">
                {OP_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </label>
          </div>

          <div className="pt-2">
            <div className="text-[10px] uppercase tracking-wider text-[#475569] font-medium mb-2">Costi accessori</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <F label="Notaio" value={form.notaio} onChange={(v) => setForm({...form, notaio: v})} suffix="€" />
              <F label="Agenzia" value={form.agenzia} onChange={(v) => setForm({...form, agenzia: v})} suffix="€" />
              <F label="Imposte" value={form.imposte} onChange={(v) => setForm({...form, imposte: v})} suffix="€" />
              <F label="Lavori" value={form.lavori} onChange={(v) => setForm({...form, lavori: v})} suffix="€" />
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 text-sm text-[#0F172A] cursor-pointer">
              <input data-testid="conv-mutuo-check" type="checkbox" checked={form.mutuo_attivo} onChange={(e) => setForm({...form, mutuo_attivo: e.target.checked})} className="rounded" />
              <span>L'operazione include un mutuo</span>
            </label>
            {form.mutuo_attivo && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <label className="block md:col-span-2">
                  <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Banca</span>
                  <input value={form.mutuo_banca} onChange={(e) => setForm({...form, mutuo_banca: e.target.value})} placeholder="Intesa Sanpaolo" className="mt-1.5 w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm outline-none focus:border-[#0066FF] text-[#0F172A]" />
                </label>
                <F label="Importo" value={form.mutuo_importo} onChange={(v) => setForm({...form, mutuo_importo: v})} suffix="€" />
                <F label="Rata mensile" value={form.mutuo_rata} onChange={(v) => setForm({...form, mutuo_rata: v})} suffix="€" />
              </div>
            )}
          </div>

          <div className="pt-2 p-3 rounded-lg bg-[rgba(0,102,255,0.05)] border border-[rgba(0,102,255,0.2)] flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#2563EB] font-medium">Costo totale operazione</div>
              <div className="font-display text-2xl font-bold tabular text-[#0F172A] mt-0.5">{formatEur(totale)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-[#475569]">Rend. netto stimato</div>
              <div className="font-display text-2xl font-bold tabular text-[#059669] mt-0.5">
                {totale > 0 && deal.canone_stimato > 0 ? `${((deal.canone_stimato * 12) / totale * 100 * 0.65).toFixed(2)}%` : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-white border-t border-[#E2E8F0] px-6 py-4 flex items-center justify-between gap-3">
          <button data-testid="conv-rapid" onClick={() => submit(true)} disabled={loading} className="text-xs px-3 py-2 rounded-lg border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A] hover:border-[#CBD5E1] inline-flex items-center gap-1.5 transition-colors disabled:opacity-50">
            <Sparkles size={11}/> Converti rapidamente (default)
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg text-[#475569] hover:text-[#0F172A]">Annulla</button>
            <button
              data-testid="conv-detailed"
              onClick={() => submit(false)} disabled={loading}
              className="text-sm px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              {loading ? <><Loader2 size={14} className="animate-spin"/> Conversione…</> : <>Converti con dettagli</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
