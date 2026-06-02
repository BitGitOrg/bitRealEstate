import { useEffect, useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { apiClient } from "../lib/auth";
import { formatEur } from "../lib/demoData";
import { toast } from "sonner";
import { Plus, Loader2, X, ChevronRight, Trophy, TrendingDown, Activity, Banknote, ArrowRight, Trash2, Home, Clock } from "lucide-react";

const STAGE_INFO = {
  visionato: { label: "Visionato", icon: "🔍", color: "#94A3B8" },
  visitato: { label: "Visitato", icon: "🏠", color: "#0EA5E9" },
  offerta_inviata: { label: "Offerta", icon: "💌", color: "#3B82F6" },
  trattativa: { label: "Trattativa", icon: "🤝", color: "#8B5CF6" },
  accettato: { label: "Accettato", icon: "✅", color: "#10B981" },
  verifica_doc: { label: "Verifica Doc", icon: "📑", color: "#F59E0B" },
  mutuo_richiesto: { label: "Mutuo", icon: "🏦", color: "#EC4899" },
  preliminare: { label: "Preliminare", icon: "✍️", color: "#14B8A6" },
  rogito: { label: "Rogito", icon: "🎉", color: "#059669" },
};
const STAGES_ORDER = Object.keys(STAGE_INFO);

const EVENTI_PRESET = [
  { tipo: "visita", label: "Registra visita", nuovo_stage: "visitato" },
  { tipo: "offerta", label: "Invia offerta", nuovo_stage: "offerta_inviata", chiediImporto: true },
  { tipo: "controproposta", label: "Controproposta ricevuta", nuovo_stage: "trattativa", chiediImporto: true },
  { tipo: "accettato", label: "Proposta accettata", nuovo_stage: "accettato", chiediImporto: true },
  { tipo: "doc", label: "Verifica documentale", nuovo_stage: "verifica_doc" },
  { tipo: "mutuo", label: "Mutuo richiesto", nuovo_stage: "mutuo_richiesto", chiediBanca: true, chiediImporto: true },
  { tipo: "preliminare", label: "Compromesso firmato", nuovo_stage: "preliminare" },
  { tipo: "rogito", label: "Rogito firmato", nuovo_stage: "rogito" },
  { tipo: "nota", label: "Nota libera" },
];

export default function Pipeline() {
  const [board, setBoard] = useState({});
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [b, m] = await Promise.all([
        apiClient().get("/pipeline/board"),
        apiClient().get("/pipeline/metrics"),
      ]);
      setBoard(b.data || {});
      setMetrics(m.data || null);
    } catch { toast.error("Errore caricamento"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <Layout
      title="Pipeline Acquisizioni"
      subtitle={loading ? "Caricamento…" : `${metrics?.n_attivi ?? 0} deal attivi · ${metrics?.n_chiusi ?? 0} acquistati`}
      actions={
        <button onClick={() => setCreating(true)} data-testid="pipe-add-btn" className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm font-medium">
          <Plus size={14}/> Nuovo deal
        </button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="pipe-kpi-ttc">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[#64748B]"><Clock size={12}/> Time-to-close medio</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{metrics?.time_to_close_medio_gg || "—"}<span className="text-sm text-[#64748B]"> gg</span></div>
        </SectionCard>
        <SectionCard testId="pipe-kpi-sconto">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[#64748B]"><TrendingDown size={12}/> Sconto medio</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#059669]">−{metrics?.sconto_medio_pct || 0}%</div>
        </SectionCard>
        <SectionCard testId="pipe-kpi-conv">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[#64748B]"><Activity size={12}/> Conversion visite→rogito</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{metrics?.conversion_visite_rogito_pct || 0}%</div>
        </SectionCard>
        <SectionCard testId="pipe-kpi-banche">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[#64748B]"><Banknote size={12}/> Banca più veloce</div>
          <div className="font-display text-lg font-bold tabular mt-1 truncate">{metrics?.banche_tempi?.[0]?.banca || "—"}</div>
          <div className="text-[11px] text-[#64748B]">{metrics?.banche_tempi?.[0]?.gg_medi ? `${metrics.banche_tempi[0].gg_medi} gg medi` : "Nessun dato"}</div>
        </SectionCard>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 size={28} className="animate-spin text-[#0066FF]"/></div>
      ) : (
        <div className="overflow-x-auto pb-4" data-testid="pipe-board">
          <div className="flex gap-3 min-w-max">
            {STAGES_ORDER.map(stage => {
              const info = STAGE_INFO[stage];
              const cards = board[stage] || [];
              return (
                <div key={stage} className="w-64 shrink-0">
                  <div className="px-3 py-2 rounded-t-lg flex items-center justify-between" style={{ background: info.color + "20", borderTop: `3px solid ${info.color}` }}>
                    <div className="flex items-center gap-1.5">
                      <span>{info.icon}</span>
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#0F172A]">{info.label}</span>
                    </div>
                    <span className="text-xs tabular text-[#64748B]">{cards.length}</span>
                  </div>
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] border-t-0 rounded-b-lg p-2 min-h-[300px] space-y-2">
                    {cards.length === 0 ? (
                      <div className="text-center py-6 text-[10px] text-[#94A3B8] italic">—</div>
                    ) : cards.map(d => (
                      <button
                        key={d.id}
                        onClick={() => setSelected(d.id)}
                        data-testid={`pipe-card-${d.id}`}
                        className="w-full text-left bg-white border border-[#E2E8F0] rounded-lg p-2.5 hover:border-[#0066FF] hover:shadow-md transition-all"
                      >
                        <div className="text-xs font-semibold text-[#0F172A] truncate">{d.indirizzo}</div>
                        <div className="text-[10px] text-[#64748B] truncate">{d.citta} {d.metratura && `· ${d.metratura}m²`}</div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <div className="font-display text-sm font-bold tabular">{formatEur(d.prezzo_corrente || d.prezzo_richiesto)}</div>
                          {d.sconto_pct > 0 && <span className="text-[9px] text-[#059669] font-semibold">−{d.sconto_pct}%</span>}
                        </div>
                        {d.giorni_in_stage > 0 && (
                          <div className={`text-[10px] mt-1 ${d.giorni_in_stage > 30 ? "text-[#DC2626]" : "text-[#94A3B8]"}`}>
                            {d.giorni_in_stage}gg in questo stage
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {creating && <NewDealModal onClose={() => setCreating(false)} onCreated={(d) => { setCreating(false); setSelected(d.id); load(); }} />}
      {selected && <DealDetail id={selected} onClose={() => setSelected(null)} onUpdated={load} />}
    </Layout>
  );
}

function NewDealModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ indirizzo: "", citta: "", prezzo_richiesto: 0, fonte: "immobiliare", metratura: 0, tipologia: "bilocale", canone_atteso: 0, note: "" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.indirizzo || form.prezzo_richiesto <= 0) { toast.error("Indirizzo e prezzo obbligatori"); return; }
    setSaving(true);
    try {
      const r = await apiClient().post("/pipeline", { ...form, prezzo_richiesto: parseFloat(form.prezzo_richiesto), metratura: parseFloat(form.metratura) || null, canone_atteso: parseFloat(form.canone_atteso) || null });
      toast.success("Deal creato in pipeline");
      onCreated(r.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Errore"); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="pipe-new-modal">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="text-base font-semibold">Nuovo deal · stage Visionato</div>
          <button onClick={onClose}><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          <F label="Indirizzo *" value={form.indirizzo} onChange={(v) => setForm({...form, indirizzo: v})} placeholder="Es. Via Foa 5, Torino" testId="pipe-new-indirizzo" />
          <div className="grid grid-cols-2 gap-3">
            <F label="Città" value={form.citta} onChange={(v) => setForm({...form, citta: v})} placeholder="Torino" />
            <F label="Prezzo richiesto (€) *" type="number" value={form.prezzo_richiesto} onChange={(v) => setForm({...form, prezzo_richiesto: v})} testId="pipe-new-prezzo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Mq" type="number" value={form.metratura} onChange={(v) => setForm({...form, metratura: v})} />
            <F label="Tipologia" type="select" value={form.tipologia} onChange={(v) => setForm({...form, tipologia: v})} options={[{v:"bilocale",l:"Bilocale"},{v:"trilocale",l:"Trilocale"},{v:"quadrilocale",l:"Quadrilocale"},{v:"monolocale",l:"Monolocale"},{v:"negozio",l:"Negozio"},{v:"ufficio",l:"Ufficio"}]} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Fonte" type="select" value={form.fonte} onChange={(v) => setForm({...form, fonte: v})} options={[{v:"immobiliare",l:"Immobiliare.it"},{v:"idealista",l:"Idealista"},{v:"agenzia",l:"Agenzia"},{v:"passaparola",l:"Passaparola"},{v:"altro",l:"Altro"}]} />
            <F label="Canone atteso (€/mese)" type="number" value={form.canone_atteso} onChange={(v) => setForm({...form, canone_atteso: v})} placeholder="Stima" />
          </div>
          <F label="Note" type="textarea" value={form.note} onChange={(v) => setForm({...form, note: v})} placeholder="Note libere" />
        </div>
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-sm text-[#475569]">Annulla</button>
          <button onClick={submit} disabled={saving} data-testid="pipe-new-submit" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-semibold">
            {saving ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>} Crea deal
          </button>
        </div>
      </div>
    </div>
  );
}

function DealDetail({ id, onClose, onUpdated }) {
  const [deal, setDeal] = useState(null);
  const [adding, setAdding] = useState(null);
  const [eventForm, setEventForm] = useState({ importo: 0, banca: "", descrizione: "", tasso: 3.5, durata_anni: 20, rata: 0 });

  const load = async () => {
    try {
      const r = await apiClient().get("/pipeline");
      const found = (r.data || []).find(d => d.id === id);
      setDeal(found);
    } catch { toast.error("Errore"); }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  const aggiungi = async () => {
    const preset = EVENTI_PRESET.find(p => p.tipo === adding);
    if (!preset) return;
    const dati = {};
    if (preset.tipo === "mutuo") {
      dati.importo = parseFloat(eventForm.importo) || 0;
      dati.tasso = parseFloat(eventForm.tasso) || 0;
      dati.durata_anni = parseInt(eventForm.durata_anni) || 20;
      dati.rata = parseFloat(eventForm.rata) || 0;
    }
    try {
      await apiClient().post(`/pipeline/${id}/evento`, {
        tipo: preset.tipo,
        importo: preset.chiediImporto ? parseFloat(eventForm.importo) || null : null,
        banca: preset.chiediBanca ? eventForm.banca : null,
        descrizione: eventForm.descrizione,
        nuovo_stage: preset.nuovo_stage,
        dati,
      });
      toast.success("Evento aggiunto");
      setAdding(null);
      setEventForm({ importo: 0, banca: "", descrizione: "", tasso: 3.5, durata_anni: 20, rata: 0 });
      await load();
      onUpdated();
    } catch (e) { toast.error(e?.response?.data?.detail || "Errore"); }
  };

  const converti = async () => {
    if (!confirm("Convertire questo deal in immobile del patrimonio? L'azione crea anche il mutuo (se presente).")) return;
    try {
      const r = await apiClient().post(`/pipeline/${id}/converti-in-immobile`);
      toast.success(`Immobile creato: ${r.data.property_id}`);
      onUpdated();
      onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Errore"); }
  };

  const elimina = async () => {
    if (!confirm("Eliminare definitivamente questo deal? L'azione è irreversibile.")) return;
    try {
      await apiClient().delete(`/pipeline/${id}`);
      toast.success("Deal eliminato");
      onUpdated();
      onClose();
    } catch { toast.error("Errore"); }
  };

  if (!deal) return null;
  const stageInfo = STAGE_INFO[deal.stage];
  const preset = adding ? EVENTI_PRESET.find(p => p.tipo === adding) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()} data-testid="pipe-detail-modal">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-base font-semibold text-[#0F172A] truncate">{deal.indirizzo}</div>
            <div className="text-xs text-[#64748B]">{deal.citta} · {deal.metratura}m² · Fonte: {deal.fonte}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: stageInfo.color + "20", color: stageInfo.color }}>
              {stageInfo.icon} {stageInfo.label}
            </span>
            <button onClick={onClose}><X size={16}/></button>
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* KPI deal */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#F8FAFC] rounded-lg p-3"><div className="text-[10px] uppercase text-[#64748B]">Prezzo richiesto</div><div className="font-display text-lg font-bold tabular">{formatEur(deal.prezzo_richiesto)}</div></div>
            <div className="bg-[#F8FAFC] rounded-lg p-3"><div className="text-[10px] uppercase text-[#64748B]">Prezzo corrente</div><div className="font-display text-lg font-bold tabular text-[#0066FF]">{formatEur(deal.prezzo_corrente)}</div></div>
            <div className="bg-[#F8FAFC] rounded-lg p-3"><div className="text-[10px] uppercase text-[#64748B]">Sconto</div><div className="font-display text-lg font-bold tabular text-[#059669]">−{deal.sconto_pct}%</div></div>
          </div>

          {/* Azioni rapide eventi */}
          {!adding && deal.stage !== "rogito" && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#475569] font-medium mb-2">Avanza pipeline</div>
              <div className="flex flex-wrap gap-2">
                {EVENTI_PRESET.map(p => (
                  <button key={p.tipo} onClick={() => setAdding(p.tipo)} data-testid={`pipe-evt-${p.tipo}`} className="text-xs px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:border-[#0066FF] hover:bg-[rgba(0,102,255,0.05)] text-[#475569]">
                    {p.label} {p.nuovo_stage && <ArrowRight size={10} className="inline ml-1"/>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {adding && preset && (
            <div className="bg-[rgba(0,102,255,0.06)] border border-[rgba(0,102,255,0.3)] rounded-lg p-4 space-y-3">
              <div className="text-sm font-semibold">{preset.label}</div>
              {preset.chiediImporto && <F label="Importo (€)" type="number" value={eventForm.importo} onChange={(v) => setEventForm({...eventForm, importo: v})} testId="evt-importo" />}
              {preset.chiediBanca && <F label="Banca" value={eventForm.banca} onChange={(v) => setEventForm({...eventForm, banca: v})} placeholder="Es. Intesa Sanpaolo" />}
              {preset.tipo === "mutuo" && (
                <div className="grid grid-cols-3 gap-2">
                  <F label="Tasso %" type="number" value={eventForm.tasso} onChange={(v) => setEventForm({...eventForm, tasso: v})} />
                  <F label="Durata anni" type="number" value={eventForm.durata_anni} onChange={(v) => setEventForm({...eventForm, durata_anni: v})} />
                  <F label="Rata €" type="number" value={eventForm.rata} onChange={(v) => setEventForm({...eventForm, rata: v})} />
                </div>
              )}
              <F label="Note (opzionale)" value={eventForm.descrizione} onChange={(v) => setEventForm({...eventForm, descrizione: v})} />
              <div className="flex justify-end gap-2">
                <button onClick={() => setAdding(null)} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-sm">Annulla</button>
                <button onClick={aggiungi} data-testid="evt-save" className="px-4 py-1.5 rounded-lg bg-[#0066FF] text-white text-sm font-semibold">Conferma</button>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#475569] font-medium mb-2">Timeline ({deal.timeline?.length || 0} eventi)</div>
            <div className="space-y-2">
              {(deal.timeline || []).slice().reverse().map(e => (
                <div key={e.id} className="flex gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3">
                  <div className="text-xs text-[#64748B] shrink-0 w-20 tabular">{e.data}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[#0F172A]">
                      <strong>{e.tipo.replace("_", " ")}</strong>
                      {e.importo && <> · <span className="tabular text-[#0066FF]">{formatEur(e.importo)}</span></>}
                      {e.banca && <> · {e.banca}</>}
                    </div>
                    {e.descrizione && <div className="text-[11px] text-[#475569] mt-0.5">{e.descrizione}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Conversione */}
          {deal.stage === "rogito" && !deal.convertito && (
            <div className="bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.4)] rounded-lg p-4">
              <div className="text-sm font-semibold text-[#0F172A] mb-2">🎉 Pronto per il patrimonio</div>
              <div className="text-xs text-[#475569] mb-3">Il rogito è firmato. Converti il deal in immobile per popolare automaticamente Patrimonio, Mutui, Scadenzario fiscale, Cash flow, Documenti.</div>
              <button onClick={converti} data-testid="pipe-converti" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold">
                <Home size={14}/> Converti in patrimonio
              </button>
            </div>
          )}
          {deal.convertito && (
            <div className="bg-[#F0FDF4] border border-[#86EFAC] rounded-lg p-3 text-xs text-[#065F46]">
              ✓ Deal convertito in immobile <strong>{deal.property_id}</strong>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-between">
          <button onClick={elimina} className="inline-flex items-center gap-1 text-xs text-[#DC2626] hover:underline"><Trash2 size={12}/> Elimina deal</button>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-[#0F172A] text-white text-sm">Chiudi</button>
        </div>
      </div>
    </div>
  );
}

const F = ({ label, value, onChange, type = "text", placeholder, options, testId }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
    {type === "select" ? (
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} data-testid={testId} className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    ) : type === "textarea" ? (
      <textarea rows={2} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF] resize-none" />
    ) : (
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={testId} className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]" />
    )}
  </label>
);
