import { useEffect, useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { ScoreGauge } from "../components/ScoreGauge";
import { ConvertDealModal } from "../components/ConvertDealModal";
import { apiClient } from "../lib/auth";
import { formatEur } from "../lib/demoData";
import {
  Sparkles, Loader2, Link2, FileText, Heart, X, Handshake,
  MapPin, Home, AlertTriangle, Star, Trash2, ExternalLink, Eye, Filter, Building2, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const STATUS_META = {
  nuovo: { label: "Nuovo", color: "#2563EB", bg: "rgba(0,102,255,0.10)", border: "rgba(0,102,255,0.3)" },
  interessato: { label: "Interessato", color: "#B45309", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.35)" },
  scartato: { label: "Scartato", color: "#475569", bg: "rgba(100,116,139,0.10)", border: "rgba(100,116,139,0.3)" },
  in_trattativa: { label: "In trattativa", color: "#059669", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.35)" },
  convertito: { label: "Nel Patrimonio", color: "#0F172A", bg: "rgba(15,23,42,0.06)", border: "rgba(15,23,42,0.2)" },
};

const TIPOLOGIE = ["", "Bilocale", "Trilocale", "Quadrilocale", "Monolocale", "Villa", "Loft", "Attico", "Altro"];

export default function DealInbox() {
  const [deals, setDeals] = useState([]);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("tutti");
  const [selected, setSelected] = useState(null);
  const [watchlists, setWatchlists] = useState([]);

  const load = async () => {
    try {
      const [{ data: d }, { data: w }] = await Promise.all([
        apiClient().get("/deals"),
        apiClient().get("/watchlists"),
      ]);
      setDeals(d);
      setWatchlists(w);
    } catch (e) { toast.error("Errore caricamento deals"); }
  };
  useEffect(() => { load(); }, []);

  const analyze = async (e) => {
    e?.preventDefault?.();
    if (!url && !text) { toast.error("Inserisci URL o testo dell'annuncio"); return; }
    setLoading(true);
    try {
      const { data } = await apiClient().post("/deals/analyze", { url: url || null, text: text || null });
      setDeals([data, ...deals]);
      setUrl(""); setText("");
      setSelected(data);
      toast.success(`Deal Score: ${data.deal_score}/100 · ${data.giudizio}`);
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Errore analisi annuncio");
    } finally { setLoading(false); }
  };

  const updateStatus = async (deal, newStatus) => {
    try {
      const { data } = await apiClient().patch(`/deals/${deal.id}/status`, { status: newStatus });
      setDeals(deals.map(d => d.id === deal.id ? data : d));
      if (selected?.id === deal.id) setSelected(data);
      if (newStatus === "in_trattativa") {
        toast.success("Aggiunto al Patrimonio come 'In trattativa'");
      } else {
        toast.success(`Stato aggiornato: ${STATUS_META[newStatus].label}`);
      }
    } catch { toast.error("Errore aggiornamento"); }
  };

  const remove = async (deal) => {
    if (!confirm(`Eliminare definitivamente "${deal.titolo}"?`)) return;
    try {
      await apiClient().delete(`/deals/${deal.id}`);
      setDeals(deals.filter(d => d.id !== deal.id));
      if (selected?.id === deal.id) setSelected(null);
      toast.success("Deal eliminato");
    } catch { toast.error("Errore"); }
  };

  const filtered = statusFilter === "tutti" ? deals : deals.filter(d => d.status === statusFilter);
  const counts = ["nuovo", "interessato", "in_trattativa", "convertito", "scartato"].reduce(
    (acc, s) => ({ ...acc, [s]: deals.filter(d => d.status === s).length }), {}
  );

  const [convertModal, setConvertModal] = useState(null);

  const quickConvert = async (deal) => {
    try {
      const { data } = await apiClient().post(`/deals/${deal.id}/convert`, {
        stato: "in_trattativa", operazione: "reddito"
      });
      toast.success(`${data.nome} aggiunto al Patrimonio (${data.id})`);
      // refresh
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore conversione");
    }
  };

  return (
    <Layout title="Deal Inbox" subtitle="AI Scout · L'analista che valuta ogni annuncio prima di te"
      actions={
        <Link to="/watchlists" data-testid="goto-watchlists" className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFFFFF] border border-[#E2E8F0] hover:border-[#CBD5E1] text-[#475569] hover:text-[#0F172A] text-sm font-medium transition-colors">
          <Filter size={14} /> Watchlists ({watchlists.length})
        </Link>
      }
    >
      {/* Hero — Incolla annuncio */}
      <SectionCard testId="deal-input" className="mb-6 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-[#0066FF]/10 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#2563EB] mb-2">
            <Sparkles size={11} /> AI Deal Scout · Claude Sonnet 4.6
          </div>
          <h3 className="font-display text-xl font-bold tracking-tight mb-1">Hai trovato un annuncio interessante?</h3>
          <p className="text-sm text-[#475569] mb-4">Incolla l'URL (Immobiliare.it, Idealista, Subito…) <strong className="text-[#0F172A]">oppure</strong> il testo dell'annuncio. L'AI estrarrà i dati e calcolerà il Deal Score in ~10 secondi.</p>

          <form onSubmit={analyze} className="space-y-3">
            <div className="flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg overflow-hidden focus-within:border-[#0066FF] transition-colors">
              <Link2 size={14} className="ml-3 text-[#64748B]" />
              <input
                data-testid="deal-url-input"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.immobiliare.it/annunci/…"
                className="flex-1 bg-transparent px-3 py-2.5 outline-none text-sm placeholder:text-[#64748B]"
              />
            </div>
            <div className="text-center text-[10px] uppercase tracking-widest text-[#64748B]">— oppure —</div>
            <textarea
              data-testid="deal-text-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Incolla qui il testo dell'annuncio (titolo, prezzo, descrizione, m², zona…)"
              rows={4}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2.5 outline-none text-sm focus:border-[#0066FF] transition-colors placeholder:text-[#64748B] resize-none"
            />
            <button
              data-testid="deal-analyze-btn"
              type="submit" disabled={loading || (!url && !text)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors"
            >
              {loading ? <><Loader2 size={14} className="animate-spin" /> AI sta analizzando…</> : <><Sparkles size={14} /> Analizza con AI Scout</>}
            </button>
          </form>
        </div>
      </SectionCard>

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {["tutti", "nuovo", "interessato", "in_trattativa", "convertito", "scartato"].map(s => (
          <button
            key={s}
            data-testid={`deal-filter-${s}`}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${statusFilter === s ? "bg-[#0066FF] text-white border-[#0066FF]" : "bg-[#FFFFFF] text-[#475569] border-[#E2E8F0] hover:border-[#CBD5E1]"}`}
          >
            {s === "tutti" ? `Tutti (${deals.length})` : `${STATUS_META[s]?.label || s} (${counts[s] || 0})`}
          </button>
        ))}
      </div>

      {/* Grid: list + detail */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-3">
          {filtered.length === 0 && (
            <SectionCard className="text-center py-12" testId="deal-empty">
              <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center mx-auto mb-4">
                <Sparkles size={22} className="text-[#2563EB]" />
              </div>
              <h4 className="font-display text-lg font-semibold">Nessun deal {statusFilter !== "tutti" ? `con stato "${STATUS_META[statusFilter]?.label}"` : "ancora"}</h4>
              <p className="text-sm text-[#475569] mt-2 max-w-md mx-auto">Incolla il primo annuncio sopra e lascia che l'AI lo analizzi al posto tuo.</p>
            </SectionCard>
          )}

          {filtered.map(d => {
            const meta = STATUS_META[d.status] || STATUS_META.nuovo;
            const matched = (d.watchlist_matches || []).length;
            return (
              <div
                key={d.id}
                data-testid={`deal-card-${d.id}`}
                onClick={() => setSelected(d)}
                className={`bg-[#FFFFFF] border rounded-xl p-4 cursor-pointer transition-all ${selected?.id === d.id ? "border-[#0066FF]" : "border-[#E2E8F0] hover:border-[#CBD5E1]"}`}
              >
                <div className="flex items-start gap-4">
                  {/* Score */}
                  <ScoreGauge value={d.deal_score} size={72} dataTestId={`deal-score-${d.id}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-display font-semibold text-[#0F172A] truncate">{d.titolo}</div>
                        <div className="text-xs text-[#475569] flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1"><MapPin size={10}/> {d.zona ? `${d.zona}, ` : ""}{d.citta}</span>
                          <span className="flex items-center gap-1"><Home size={10}/> {d.tipologia} · {d.metratura} m²</span>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full border font-medium shrink-0" style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}>{meta.label}</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-[#E2E8F0]">
                      <div>
                        <div className="text-[9px] uppercase text-[#64748B]">Prezzo</div>
                        <div className="text-sm tabular font-medium">{formatEur(d.prezzo)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase text-[#64748B]">Canone stim.</div>
                        <div className="text-sm tabular font-medium">{formatEur(d.canone_stimato)}/m</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase text-[#64748B]">Rend. netto</div>
                        <div className={`text-sm tabular font-medium ${d.rendimento_netto >= 5 ? "text-[#059669]" : d.rendimento_netto >= 3 ? "text-[#B45309]" : "text-[#DC2626]"}`}>{d.rendimento_netto}%</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase text-[#64748B]">Giudizio</div>
                        <div className="text-sm font-medium text-[#0F172A]">{d.giudizio}</div>
                      </div>
                    </div>

                    {matched > 0 && (
                      <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.1)] text-[#B45309]">
                        <Star size={10}/> Matcha {matched} watchlist
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="xl:col-span-1">
          {selected ? (
            <SectionCard testId="deal-detail" className="sticky top-24">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#64748B]">Dettaglio deal</div>
                  <div className="font-display text-base font-semibold mt-0.5 truncate">{selected.titolo}</div>
                </div>
                <button onClick={() => setSelected(null)} className="p-1 rounded text-[#64748B] hover:text-[#0F172A]"><X size={14}/></button>
              </div>

              <div className="flex flex-col items-center my-4">
                <ScoreGauge value={selected.deal_score} size={130} />
                <div className="text-sm font-medium mt-3 text-center">{selected.giudizio}</div>
                <div className="text-xs text-[#475569] mt-1">Strategia: <span className="text-[#0F172A]">{selected.strategia}</span></div>
                <div className="text-xs text-[#475569] mt-0.5">Rischio: <span className={selected.rischio === "Basso" ? "text-[#059669]" : selected.rischio === "Medio" ? "text-[#B45309]" : "text-[#DC2626]"}>{selected.rischio}</span></div>
              </div>

              <div className="space-y-2 text-sm border-t border-[#E2E8F0] pt-3">
                <div className="flex justify-between"><span className="text-[#475569]">Prezzo</span><span className="tabular">{formatEur(selected.prezzo)}</span></div>
                <div className="flex justify-between"><span className="text-[#475569]">€/m²</span><span className="tabular">{selected.metratura ? formatEur(Math.round(selected.prezzo / selected.metratura)) : "—"}</span></div>
                <div className="flex justify-between"><span className="text-[#475569]">Canone stim.</span><span className="tabular">{formatEur(selected.canone_stimato)}/mese</span></div>
                <div className="flex justify-between"><span className="text-[#475569]">Rend. lordo</span><span className="tabular">{selected.rendimento_lordo}%</span></div>
                <div className="flex justify-between"><span className="text-[#475569]">Rend. netto</span><span className={`tabular ${selected.rendimento_netto >= 5 ? "text-[#059669]" : "text-[#B45309]"}`}>{selected.rendimento_netto}%</span></div>
              </div>

              {selected.punti_forza?.length > 0 && (
                <div className="mt-4">
                  <div className="text-[10px] uppercase tracking-wider text-[#059669] mb-2">Punti di forza</div>
                  <ul className="space-y-1">
                    {selected.punti_forza.map((p, i) => <li key={i} className="text-xs text-[#0F172A] flex gap-2"><span className="text-[#059669]">+</span>{p}</li>)}
                  </ul>
                </div>
              )}

              {selected.punti_attenzione?.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wider text-[#B45309] mb-2">Attenzione</div>
                  <ul className="space-y-1">
                    {selected.punti_attenzione.map((p, i) => <li key={i} className="text-xs text-[#0F172A] flex gap-2"><AlertTriangle size={10} className="text-[#B45309] mt-0.5 shrink-0"/>{p}</li>)}
                  </ul>
                </div>
              )}

              {selected.source_url && (
                <a href={selected.source_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline">
                  <ExternalLink size={10}/> Apri annuncio originale
                </a>
              )}

              {/* Actions */}
              <div className="mt-4 pt-4 border-t border-[#E2E8F0] space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-[#475569] mb-1">Azioni</div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    data-testid="deal-action-interessato"
                    onClick={() => updateStatus(selected, "interessato")}
                    className={`px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${selected.status === "interessato" ? "bg-[rgba(245,158,11,0.2)] border-[rgba(245,158,11,0.5)] text-[#B45309]" : "border-[#E2E8F0] text-[#475569] hover:border-[rgba(245,158,11,0.4)] hover:text-[#B45309]"}`}
                  >
                    <Heart size={12} className="inline mr-1"/> Interessato
                  </button>
                  <button
                    data-testid="deal-action-trattativa"
                    onClick={() => updateStatus(selected, "in_trattativa")}
                    className={`px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${selected.status === "in_trattativa" ? "bg-[rgba(16,185,129,0.2)] border-[rgba(16,185,129,0.5)] text-[#059669]" : "border-[#E2E8F0] text-[#475569] hover:border-[rgba(16,185,129,0.4)] hover:text-[#059669]"}`}
                  >
                    <Handshake size={12} className="inline mr-1"/> Trattativa
                  </button>
                  <button
                    data-testid="deal-action-scartato"
                    onClick={() => updateStatus(selected, "scartato")}
                    className={`px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${selected.status === "scartato" ? "bg-[rgba(100,116,139,0.2)] border-[rgba(100,116,139,0.5)] text-[#475569]" : "border-[#E2E8F0] text-[#475569] hover:border-[#475569]"}`}
                  >
                    <X size={12} className="inline mr-1"/> Scarta
                  </button>
                </div>
                {selected.status === "in_trattativa" && (
                  <div className="mt-3 p-3 rounded-lg bg-[rgba(0,102,255,0.05)] border border-[rgba(0,102,255,0.2)]">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#2563EB] mb-2">
                      <Building2 size={12}/> Pronto per la conversione in immobile
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        data-testid="deal-convert-quick"
                        onClick={() => quickConvert(selected)}
                        className="text-xs px-2 py-1.5 rounded-lg border border-[#E2E8F0] hover:border-[#0066FF] hover:bg-[rgba(0,102,255,0.05)] text-[#475569] hover:text-[#2563EB] transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        <Sparkles size={11}/> Converti rapidamente
                      </button>
                      <button
                        data-testid="deal-convert-detailed"
                        onClick={() => setConvertModal(selected)}
                        className="text-xs px-2 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white font-medium transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        <Building2 size={11}/> Converti con dettagli…
                      </button>
                    </div>
                  </div>
                )}
                {selected.status === "convertito" && (
                  <div className="mt-3 p-3 rounded-lg bg-[rgba(16,185,129,0.05)] border border-[rgba(16,185,129,0.25)] text-center">
                    <div className="flex items-center justify-center gap-2 text-xs font-medium text-[#059669] mb-1">
                      <CheckCircle2 size={12}/> Convertito in immobile
                    </div>
                    <Link to="/patrimonio" className="text-xs text-[#2563EB] hover:underline">→ Vai al Patrimonio</Link>
                  </div>
                )}
                <button
                  data-testid="deal-action-delete"
                  onClick={() => remove(selected)}
                  className="w-full mt-2 px-2 py-1.5 rounded-lg text-xs border border-[#E2E8F0] text-[#64748B] hover:text-[#DC2626] hover:border-[rgba(239,68,68,0.4)] transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={11}/> Elimina deal
                </button>
              </div>
            </SectionCard>
          ) : (
            <SectionCard testId="deal-detail-empty" className="text-center py-12 sticky top-24">
              <Eye size={28} className="mx-auto text-[#64748B] mb-3" />
              <div className="font-display font-semibold text-[#0F172A]">Seleziona un deal</div>
              <div className="text-xs text-[#475569] mt-1">Click su una card per i dettagli</div>
            </SectionCard>
          )}
        </div>
      </div>
    </Layout>
  );
}
