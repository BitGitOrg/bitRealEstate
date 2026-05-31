import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Home, ShoppingBag, Hammer, ArrowLeft, ArrowRight, Save, Loader2, Building2, Wallet, Activity } from "lucide-react";
import { apiClient } from "../../lib/auth";

const OPERAZIONI = {
  reddito: { label: "Immobile a reddito", icon: Home, color: "#10B981", desc: "Acquisto finalizzato all'affitto a lungo termine. Ottimizzato per canone mensile e rendimento netto stabile." },
  compra_vendi: { label: "Compra-Vendi", icon: ShoppingBag, color: "#0066FF", desc: "Acquisto finalizzato alla rivendita rapida (entro 24 mesi). Focus su margine e ROI." },
  compra_ristruttura_vendi: { label: "Compra-Ristruttura-Vendi", icon: Hammer, color: "#F59E0B", desc: "Acquisto, lavori di valorizzazione e rivendita. Operazione speculativa a maggior margine ma più rischio." },
};

const STATI = {
  in_valutazione: "In valutazione",
  in_trattativa: "In trattativa",
  acquistato: "Acquistato",
  in_ristrutturazione: "In ristrutturazione",
  disponibile: "Disponibile (sfitto)",
  affittato: "Affittato",
};

const TIPOLOGIE = ["Monolocale", "Bilocale", "Trilocale", "Quadrilocale", "Villa", "Loft", "Attico", "Ufficio", "Negozio", "Altro"];

const Field = ({ label, value, onChange, type = "text", suffix, placeholder, testId, required }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">
      {label} {required && <span className="text-[#DC2626]">*</span>}
    </span>
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

const Select = ({ label, value, onChange, options, testId }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
    <select
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]"
    >
      {options.map((o) => (
        <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>
          {typeof o === "string" ? o : o.label}
        </option>
      ))}
    </select>
  </label>
);

export default function NewPropertyModal({ open, onClose, onCreated, preselectOperazione = null }) {
  const [step, setStep] = useState(preselectOperazione ? 2 : 1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    operazione: preselectOperazione || "reddito",
    stato: "acquistato",
    nome: "",
    indirizzo: "",
    citta: "",
    provincia: "",
    tipologia: "Bilocale",
    metratura: 0,
    piano: "",
    anno_costruzione: 0,
    classe_energetica: "",
    prezzo_acquisto: 0,
    notaio: 0,
    agenzia: 0,
    imposte: 0,
    lavori: 0,
    valore_stimato: 0,
    canone_mensile: 0,
    data_acquisto: "",
    mutuo_banca: "",
    mutuo_residuo: 0,
    mutuo_rata: 0,
    mutuo_tasso: 0,
    note: "",
  });

  // Sync step + form when modal opens (preselect may change between opens)
  useEffect(() => {
    if (open) {
      setStep(preselectOperazione ? 2 : 1);
      setForm((f) => ({ ...f, operazione: preselectOperazione || f.operazione || "reddito" }));
    }
  }, [open, preselectOperazione]);

  if (!open) return null;

  const close = () => {
    setStep(preselectOperazione ? 2 : 1);
    onClose();
  };

  const updateOp = (op) => {
    setForm({ ...form, operazione: op });
    setStep(2);
  };

  const create = async () => {
    if (!form.nome.trim()) {
      toast.error("Nome immobile obbligatorio");
      setStep(2);
      return;
    }
    if (!form.prezzo_acquisto || form.prezzo_acquisto <= 0) {
      toast.error("Prezzo di acquisto obbligatorio");
      setStep(3);
      return;
    }
    setSaving(true);
    try {
      const body = {
        nome: form.nome,
        indirizzo: form.indirizzo,
        citta: form.citta,
        provincia: form.provincia,
        tipologia: form.tipologia,
        metratura: parseFloat(form.metratura) || 0,
        piano: form.piano,
        anno_costruzione: parseInt(form.anno_costruzione) || 0,
        classe_energetica: form.classe_energetica,
        stato: form.stato,
        operazione: form.operazione,
        prezzo_acquisto: parseFloat(form.prezzo_acquisto) || 0,
        notaio: parseFloat(form.notaio) || 0,
        agenzia: parseFloat(form.agenzia) || 0,
        imposte: parseFloat(form.imposte) || 0,
        lavori: parseFloat(form.lavori) || 0,
        valore_stimato: parseFloat(form.valore_stimato) || parseFloat(form.prezzo_acquisto) || 0,
        canone_mensile: parseFloat(form.canone_mensile) || 0,
        data_acquisto: form.data_acquisto || null,
        note: form.note,
      };
      if (form.mutuo_banca && form.mutuo_residuo > 0) {
        body.mutuo = {
          banca: form.mutuo_banca,
          residuo: parseFloat(form.mutuo_residuo) || 0,
          rata: parseFloat(form.mutuo_rata) || 0,
          tasso: parseFloat(form.mutuo_tasso) || 0,
        };
      }
      const r = await apiClient().post("/properties", body);
      toast.success(`Immobile «${r.data.nome}» creato`);
      onCreated?.(r.data);
      close();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore creazione");
    } finally {
      setSaving(false);
    }
  };

  const opMeta = OPERAZIONI[form.operazione];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(15,23,42,0.45)] backdrop-blur-sm"
      data-testid="new-property-modal"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-gradient-to-r from-[#F8FAFC] to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: opMeta.color }}>
              <Building2 size={18} className="text-white" />
            </div>
            <div>
              <div className="font-display font-bold text-lg text-[#0F172A]">Nuovo immobile / operazione</div>
              <div className="text-xs text-[#64748B]">Step {step} di 4 · {step === 1 ? "Tipologia operazione" : step === 2 ? "Anagrafica" : step === 3 ? "Numeri" : "Stato & note"}</div>
            </div>
          </div>
          <button onClick={close} data-testid="new-property-close" className="p-2 hover:bg-white rounded-lg transition">
            <X size={18} className="text-[#64748B]" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 pt-3">
          <div className="h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
            <div className="h-full transition-all duration-300 rounded-full" style={{ width: `${(step / 4) * 100}%`, background: opMeta.color }}></div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* STEP 1 — Tipologia operazione */}
          {step === 1 && (
            <>
              <div className="text-sm text-[#475569] mb-4">Che tipo di operazione vuoi registrare? La scelta determina KPI e logiche di analisi.</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Object.entries(OPERAZIONI).map(([k, m]) => {
                  const Icon = m.icon;
                  const active = form.operazione === k;
                  return (
                    <button
                      key={k}
                      data-testid={`op-card-${k}`}
                      onClick={() => updateOp(k)}
                      className={`text-left rounded-xl border-2 p-4 transition-all hover:shadow-md ${active ? "shadow-md" : ""}`}
                      style={{ borderColor: active ? m.color : "#E2E8F0", background: active ? `${m.color}08` : "white" }}
                    >
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: `${m.color}15`, border: `1px solid ${m.color}40` }}>
                        <Icon size={20} style={{ color: m.color }} />
                      </div>
                      <div className="font-display font-bold text-sm text-[#0F172A] mb-1">{m.label}</div>
                      <div className="text-[11px] text-[#64748B] leading-relaxed">{m.desc}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* STEP 2 — Anagrafica */}
          {step === 2 && (
            <>
              <div className="mb-4 text-xs text-[#64748B]">
                Operazione selezionata: <span className="font-semibold" style={{ color: opMeta.color }}>{opMeta.label}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Nome immobile" required testId="np-nome" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} placeholder="Es. Bilocale Navigli" />
                <Select label="Tipologia" testId="np-tipologia" value={form.tipologia} onChange={(v) => setForm({ ...form, tipologia: v })} options={TIPOLOGIE} />
                <Field label="Indirizzo" testId="np-indirizzo" value={form.indirizzo} onChange={(v) => setForm({ ...form, indirizzo: v })} placeholder="Via, n°" />
                <Field label="Città" testId="np-citta" value={form.citta} onChange={(v) => setForm({ ...form, citta: v })} placeholder="Milano" />
                <Field label="Provincia" testId="np-provincia" value={form.provincia} onChange={(v) => setForm({ ...form, provincia: v })} placeholder="MI" />
                <Field label="Metratura" type="number" testId="np-metratura" value={form.metratura} onChange={(v) => setForm({ ...form, metratura: v })} suffix="m²" />
                <Field label="Piano" testId="np-piano" value={form.piano} onChange={(v) => setForm({ ...form, piano: v })} placeholder="2 / Terra / Att." />
                <Field label="Anno costruzione" type="number" testId="np-anno" value={form.anno_costruzione} onChange={(v) => setForm({ ...form, anno_costruzione: v })} placeholder="1972" />
                <Select label="Classe energetica" testId="np-energetica" value={form.classe_energetica} onChange={(v) => setForm({ ...form, classe_energetica: v })} options={["", "A", "B", "C", "D", "E", "F", "G"].map(c => ({ value: c, label: c || "—" }))} />
                <Field label="Data acquisto" type="date" testId="np-data" value={form.data_acquisto} onChange={(v) => setForm({ ...form, data_acquisto: v })} />
              </div>
            </>
          )}

          {/* STEP 3 — Numeri */}
          {step === 3 && (
            <>
              <div className="mb-4 flex items-center gap-2 text-xs text-[#64748B]">
                <Wallet size={14} /> Inserisci i numeri dell'operazione. Il costo totale viene calcolato automaticamente.
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold mb-2">Acquisto</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Field label="Prezzo acquisto" required type="number" testId="np-prezzo" value={form.prezzo_acquisto} onChange={(v) => setForm({ ...form, prezzo_acquisto: v })} suffix="€" />
                    <Field label="Notaio" type="number" testId="np-notaio" value={form.notaio} onChange={(v) => setForm({ ...form, notaio: v })} suffix="€" />
                    <Field label="Agenzia" type="number" testId="np-agenzia" value={form.agenzia} onChange={(v) => setForm({ ...form, agenzia: v })} suffix="€" />
                    <Field label="Imposte" type="number" testId="np-imposte" value={form.imposte} onChange={(v) => setForm({ ...form, imposte: v })} suffix="€" />
                    <Field label={form.operazione === "compra_ristruttura_vendi" ? "Budget lavori" : "Lavori"} type="number" testId="np-lavori" value={form.lavori} onChange={(v) => setForm({ ...form, lavori: v })} suffix="€" />
                    <Field label="Valore stimato attuale" type="number" testId="np-valore" value={form.valore_stimato} onChange={(v) => setForm({ ...form, valore_stimato: v })} suffix="€" placeholder={String(form.prezzo_acquisto)} />
                  </div>
                </div>

                {form.operazione === "reddito" && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold mb-2">Reddito atteso</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <Field label="Canone mensile atteso" type="number" testId="np-canone" value={form.canone_mensile} onChange={(v) => setForm({ ...form, canone_mensile: v })} suffix="€/m" />
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold mb-2">Finanziamento (opzionale)</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="Banca" testId="np-banca" value={form.mutuo_banca} onChange={(v) => setForm({ ...form, mutuo_banca: v })} placeholder="Intesa Sanpaolo" />
                    <Field label="Capitale residuo" type="number" testId="np-residuo" value={form.mutuo_residuo} onChange={(v) => setForm({ ...form, mutuo_residuo: v })} suffix="€" />
                    <Field label="Rata mensile" type="number" testId="np-rata" value={form.mutuo_rata} onChange={(v) => setForm({ ...form, mutuo_rata: v })} suffix="€/m" />
                    <Field label="Tasso" type="number" testId="np-tasso" value={form.mutuo_tasso} onChange={(v) => setForm({ ...form, mutuo_tasso: v })} suffix="%" />
                  </div>
                </div>

                {/* Live preview */}
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold mb-1">Preview</div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-[10px] text-[#64748B]">Costo totale</div>
                      <div className="font-display font-bold text-[#0F172A]">
                        € {((parseFloat(form.prezzo_acquisto) || 0) + (parseFloat(form.notaio) || 0) + (parseFloat(form.agenzia) || 0) + (parseFloat(form.imposte) || 0) + (parseFloat(form.lavori) || 0)).toLocaleString("it-IT")}
                      </div>
                    </div>
                    {form.operazione === "reddito" && form.canone_mensile > 0 && form.prezzo_acquisto > 0 && (
                      <div>
                        <div className="text-[10px] text-[#64748B]">Rendim. lordo stimato</div>
                        <div className="font-display font-bold text-[#059669]">
                          {((form.canone_mensile * 12) / ((parseFloat(form.prezzo_acquisto) || 0) + (parseFloat(form.notaio) || 0) + (parseFloat(form.agenzia) || 0) + (parseFloat(form.imposte) || 0) + (parseFloat(form.lavori) || 0)) * 100).toFixed(2)}%
                        </div>
                      </div>
                    )}
                    {(form.operazione === "compra_vendi" || form.operazione === "compra_ristruttura_vendi") && form.valore_stimato > 0 && (
                      <div>
                        <div className="text-[10px] text-[#64748B]">Margine atteso</div>
                        <div className="font-display font-bold text-[#0066FF]">
                          € {(parseFloat(form.valore_stimato || 0) - ((parseFloat(form.prezzo_acquisto) || 0) + (parseFloat(form.notaio) || 0) + (parseFloat(form.agenzia) || 0) + (parseFloat(form.imposte) || 0) + (parseFloat(form.lavori) || 0))).toLocaleString("it-IT")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* STEP 4 — Stato & note */}
          {step === 4 && (
            <>
              <div className="mb-4 flex items-center gap-2 text-xs text-[#64748B]">
                <Activity size={14} /> Imposta lo stato iniziale dell'immobile e aggiungi note libere.
              </div>
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Stato attuale</span>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(STATI).map(([k, label]) => (
                      <button
                        key={k}
                        data-testid={`np-stato-${k}`}
                        onClick={() => setForm({ ...form, stato: k })}
                        className={`px-3 py-2.5 text-sm rounded-lg border text-left transition-colors ${form.stato === k ? "border-[#0066FF] bg-[rgba(0,102,255,0.1)] text-[#2563EB]" : "border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1]"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Note (opzionale)</span>
                  <textarea
                    data-testid="np-note"
                    rows={3}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    placeholder="Strategia, vincoli, condizioni particolari…"
                    className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF] resize-none"
                  />
                </label>

                {/* Recap */}
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold mb-2">Recap operazione</div>
                  <div className="flex justify-between text-xs"><span className="text-[#64748B]">Tipologia operazione</span><span className="font-semibold" style={{ color: opMeta.color }}>{opMeta.label}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-[#64748B]">Nome</span><span className="font-semibold text-[#0F172A]">{form.nome || "—"}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-[#64748B]">Località</span><span className="text-[#0F172A]">{[form.indirizzo, form.citta].filter(Boolean).join(", ") || "—"}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-[#64748B]">Prezzo acquisto</span><span className="text-[#0F172A]">€ {(parseFloat(form.prezzo_acquisto) || 0).toLocaleString("it-IT")}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-[#64748B]">Stato iniziale</span><span className="text-[#0F172A]">{STATI[form.stato]}</span></div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC] flex justify-between gap-2">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : close()}
            disabled={step === 1 && preselectOperazione}
            className="px-4 py-2 text-sm rounded-lg border border-[#E2E8F0] hover:bg-white text-[#475569] flex items-center gap-1.5 disabled:opacity-40"
            data-testid="np-back"
          >
            <ArrowLeft size={14} /> {step === 1 ? "Annulla" : "Indietro"}
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              data-testid="np-next"
              className="px-4 py-2 text-sm rounded-lg text-white font-semibold flex items-center gap-1.5 hover:opacity-90 transition"
              style={{ background: opMeta.color }}
            >
              Avanti <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={create}
              disabled={saving}
              data-testid="np-create"
              className="px-4 py-2 text-sm rounded-lg bg-[#059669] hover:bg-[#047857] text-white font-semibold flex items-center gap-1.5 disabled:opacity-60 transition"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Salvataggio…" : "Crea immobile"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
