import { useState, useRef, useEffect, useMemo } from "react";
import { Layout } from "../components/layout/Layout";
import { Sparkles, Send, Bot, User as UserIcon, Loader2, Database } from "lucide-react";
import { apiClient } from "../lib/auth";
import { toast } from "sonner";

const SUGGESTIONS = [
  "Quale immobile rende di meno?",
  "Quale immobile dovrei vendere per liberare capitale?",
  "Conviene rinegoziare i miei mutui agli attuali tassi di mercato?",
  "Quanto posso pagare al massimo un bilocale a Torino per avere il 5% netto?",
  "Riepiloga lo stato del mio portafoglio in 5 punti chiave.",
  "Quali sono i 3 immobili più rischiosi?",
];

export default function AIAutopilot() {
  const [sessionId] = useState(() => `sess-${Date.now()}`);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [props, setProps] = useState([]);
  const [mutuiAgg, setMutuiAgg] = useState(null);
  const [cfAgg, setCfAgg] = useState(null);
  const [liquidity, setLiquidity] = useState(null);
  const [settings, setSettings] = useState(null);
  const scrollRef = useRef(null);

  // Carica TUTTI i dati reali del portafoglio per fornire il contesto all'AI
  useEffect(() => {
    Promise.all([
      apiClient().get("/properties").catch(() => ({ data: [] })),
      apiClient().get("/mutui/aggregato").catch(() => ({ data: null })),
      apiClient().get("/cashflow/aggregato").catch(() => ({ data: null })),
      apiClient().get("/finance/liquidity").catch(() => ({ data: null })),
      apiClient().get("/settings").catch(() => ({ data: null })),
    ]).then(([p, m, c, l, s]) => {
      setProps(p.data || []);
      setMutuiAgg(m.data);
      setCfAgg(c.data);
      setLiquidity(l.data);
      setSettings(s.data);
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // KPI calcolati live (in linea con Dashboard)
  const kpi = useMemo(() => {
    if (!props.length) return null;
    const tot_valore = props.reduce((s, p) => s + (p.valore_stimato || 0), 0);
    const tot_costo = props.reduce((s, p) => s + (p.costo_totale || 0), 0);
    const ricavi_m = props.reduce((s, p) => s + (p.canone_mensile || 0), 0);
    const cf_m = props.reduce((s, p) => s + (p.cash_flow_mensile || 0), 0);
    const reddito = props.filter(p => p.canone_mensile > 0 && p.rendimento_netto > 0);
    const wSum = reddito.reduce((s, p) => s + p.rendimento_netto * p.costo_totale, 0);
    const tc = reddito.reduce((s, p) => s + p.costo_totale, 0);
    const rend_medio_netto = tc > 0 ? wSum / tc : 0;
    const sfitti = props.filter(p => (p.stato === "sfitto" || p.stato === "disponibile") && !p.canone_mensile);
    const in_lav = props.filter(p => p.stato === "in_ristrutturazione");
    const in_vendita = props.filter(p => p.stato === "in_vendita");
    return {
      totale_immobili: props.length,
      valore_stimato_totale: Math.round(tot_valore),
      capitale_investito: Math.round(tot_costo - (mutuiAgg?.debito_totale || 0)),
      ricavi_mensili: Math.round(ricavi_m),
      cash_flow_mensile: Math.round(cf_m),
      debito_residuo: Math.round(mutuiAgg?.debito_totale || 0),
      rendimento_medio_netto: +rend_medio_netto.toFixed(2),
      immobili_sfitti: sfitti.length,
      immobili_in_lavorazione: in_lav.length,
      immobili_in_vendita: in_vendita.length,
      liquidita_disponibile: Math.round(liquidity?.liquidita || 0),
      ltv_pct: mutuiAgg?.ltv_pct ?? null,
      incidenza_rata_pct: mutuiAgg?.incidenza_rata_su_affitti_pct ?? null,
      saldo_corrente_mese: cfAgg?.saldo_corrente ?? null,
      mesi_tensione_prossimi_12: cfAgg?.mesi_tensione_prossimi_12 ?? 0,
      regime_fiscale: settings?.tipo_societa
        ? (settings.tipo_societa === "privato" ? `Privato ${settings.regime_affitti}` : `${settings.tipo_societa.toUpperCase()} (IRES+IRAP ${((settings.aliquota_ires ?? 24) + (settings.aliquota_irap ?? 3.9)).toFixed(1)}%)`)
        : "SRL",
      target_netto: settings?.target_netto ?? 4.5,
    };
  }, [props, mutuiAgg, cfAgg, liquidity, settings]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q) return;
    setInput("");
    const newMsgs = [...messages, { role: "user", text: q }];
    setMessages(newMsgs);
    setLoading(true);
    try {
      // Contesto ricco e REALE: KPI portafoglio + lista immobili sintetica
      const property_summary = props.slice(0, 20).map(p => ({
        id: p.id,
        nome: p.nome,
        citta: p.citta,
        stato: p.stato,
        prezzo_acquisto: p.prezzo_acquisto,
        costo_totale: p.costo_totale,
        valore_stimato: p.valore_stimato,
        canone_mensile: p.canone_mensile,
        rendimento_lordo: p.rendimento_lordo,
        rendimento_netto: p.rendimento_netto,
        cash_flow_mensile: p.cash_flow_mensile,
        portfolio_score: p.portfolio_score,
        inquilino: p.inquilino,
        scadenza_contratto: p.scadenza_contratto,
        disdetta_ricevuta_il: p.disdetta_ricevuta_il,
        mutuo: p.mutuo ? {
          banca: p.mutuo.banca,
          residuo: p.mutuo.residuo,
          rata: p.mutuo.rata,
          tasso: p.mutuo.tasso,
        } : null,
      }));
      const ctx = { ...kpi, properties: property_summary };
      const { data } = await apiClient().post("/ai/chat", {
        session_id: sessionId,
        message: q,
        context: ctx,
      });
      setMessages([...newMsgs, { role: "ai", text: data.reply }]);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === "string"
        ? detail
        : Array.isArray(detail) ? detail.map(d => d?.msg || "errore").join(", ") : "Errore AI";
      toast.error(msg);
      setMessages([...newMsgs, { role: "ai", text: "⚠ Impossibile ottenere risposta. Riprova tra poco.", error: true }]);
    } finally { setLoading(false); }
  };

  return (
    <Layout title="AI Autopilot" subtitle="Il tuo analista strategico immobiliare · powered by Claude Sonnet 4.6">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Suggestions */}
        <div className="xl:col-span-1 space-y-3 order-2 xl:order-1">
          <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-[#2563EB]" />
              <span className="text-[10px] uppercase tracking-widest text-[#475569]">Domande suggerite</span>
            </div>
            <div className="space-y-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  data-testid={`ai-suggestion-${i}`}
                  className="w-full text-left text-xs px-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg hover:border-[#0066FF] hover:bg-[rgba(0,102,255,0.05)] transition-colors text-[#0F172A]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Database size={12} className="text-[#059669]" />
              <span className="text-[10px] uppercase tracking-widest text-[#475569]">Contesto live</span>
            </div>
            {kpi ? (
              <div className="text-[11px] text-[#64748B] leading-relaxed space-y-1">
                <div>• <strong className="text-[#0F172A]">{kpi.totale_immobili}</strong> immobili in portafoglio</div>
                <div>• Valore: <strong className="text-[#0F172A] tabular">{(kpi.valore_stimato_totale/1000).toFixed(0)}k €</strong></div>
                <div>• Ricavi: <strong className="text-[#0F172A] tabular">{kpi.ricavi_mensili} €/mese</strong></div>
                <div>• Cash flow: <strong className="text-[#0F172A] tabular">{kpi.cash_flow_mensile} €/mese</strong></div>
                <div>• Debito: <strong className="text-[#0F172A] tabular">{(kpi.debito_residuo/1000).toFixed(1)}k €</strong></div>
                <div>• Rend. netto medio: <strong className="text-[#059669] tabular">{kpi.rendimento_medio_netto}%</strong></div>
                <div>• Regime: <strong className="text-[#0F172A]">{kpi.regime_fiscale}</strong></div>
                <div>• Liquidità: <strong className="text-[#0F172A] tabular">{kpi.liquidita_disponibile} €</strong></div>
              </div>
            ) : (
              <div className="text-[11px] text-[#94A3B8] italic">Caricamento dati live…</div>
            )}
            <div className="mt-3 pt-3 border-t border-[#E2E8F0] text-[10px] text-[#64748B] leading-snug">
              L'AI usa <strong className="text-[#059669]">dati reali</strong> dal tuo DB: KPI, mutui, cash flow, regime fiscale e ogni immobile (canoni, contratti, scadenze).
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="xl:col-span-3 order-1 xl:order-2">
          <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl flex flex-col h-[calc(100vh-180px)] min-h-[600px]">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4" data-testid="ai-chat-messages">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0066FF] to-[#10B981] flex items-center justify-center mb-4">
                    <Bot size={26} className="text-white" />
                  </div>
                  <h3 className="font-display text-2xl font-bold mb-2">Ciao, sono AI Autopilot</h3>
                  <p className="text-sm text-[#475569] max-w-md leading-relaxed">
                    Analizzo il tuo patrimonio in tempo reale per consigliarti su <strong className="text-[#0F172A]">vendite, affitti, rifinanziamenti</strong> e nuovi acquisti.
                  </p>
                  <p className="text-xs text-[#64748B] mt-3">Scegli una domanda dalla colonna a sinistra o scrivimi qui sotto.</p>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.role === "user" ? "bg-[#0066FF]" : "bg-gradient-to-br from-[#0066FF] to-[#10B981]"}`}>
                    {m.role === "user" ? <UserIcon size={14} className="text-white" /> : <Bot size={14} className="text-white" />}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${m.role === "user" ? "bg-[#0066FF] text-white" : "bg-[#F1F5F9] border border-[#E2E8F0] text-[#0F172A]"}`}>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-[#0066FF] to-[#10B981]">
                    <Bot size={14} className="text-white" />
                  </div>
                  <div className="bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl px-4 py-3 inline-flex items-center gap-2 text-sm text-[#475569]">
                    <Loader2 size={14} className="animate-spin" /> Sto analizzando…
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[#E2E8F0] p-4">
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 focus-within:border-[#0066FF] transition-colors" data-testid="ai-chat-form">
                <Sparkles size={16} className="text-[#2563EB]"/>
                <input
                  data-testid="ai-chat-input"
                  value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder="Chiedi qualsiasi cosa sul tuo portafoglio…"
                  disabled={loading}
                  className="flex-1 bg-transparent py-3 outline-none text-sm placeholder:text-[#64748B]"
                />
                <button
                  type="submit" disabled={loading || !input.trim()}
                  data-testid="ai-chat-send"
                  className="p-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-40 text-white transition-colors"
                >
                  <Send size={14} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
