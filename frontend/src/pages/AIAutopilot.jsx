import { useState, useRef, useEffect } from "react";
import { Layout } from "../components/layout/Layout";
import { Sparkles, Send, Bot, User as UserIcon, Loader2 } from "lucide-react";
import { apiClient } from "../lib/auth";
import { portfolioKPI } from "../lib/demoData";
import { toast } from "sonner";

const SUGGESTIONS = [
  "Quale immobile rende di meno?",
  "Quale immobile dovrei vendere?",
  "Conviene rinegoziare il mutuo della Villa Como?",
  "Quanto posso pagare al massimo un bilocale a Milano per avere il 5% netto?",
  "Riepiloga lo stato del mio portafoglio in 5 punti chiave.",
  "Quali sono i 3 immobili più rischiosi?",
];

export default function AIAutopilot() {
  const [sessionId] = useState(() => `sess-${Date.now()}`);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q) return;
    setInput("");
    const newMsgs = [...messages, { role: "user", text: q }];
    setMessages(newMsgs);
    setLoading(true);
    try {
      const ctx = {
        valore_stimato_totale: portfolioKPI.valore_stimato_totale,
        capitale_investito: portfolioKPI.capitale_investito,
        ricavi_mensili: portfolioKPI.ricavi_mensili,
        cash_flow_mensile: portfolioKPI.cash_flow_mensile,
        debito_residuo: portfolioKPI.debito_residuo,
        rendimento_medio_netto: portfolioKPI.rendimento_medio_netto,
        totale_immobili: portfolioKPI.totale_immobili,
        immobili_sfitti: portfolioKPI.immobili_sfitti,
        immobili_in_lavorazione: portfolioKPI.immobili_in_lavorazione,
      };
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
          <div className="bg-[#11171F] border border-[#212B36] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-[#60A5FA]" />
              <span className="text-[10px] uppercase tracking-widest text-[#9CA3AF]">Domande suggerite</span>
            </div>
            <div className="space-y-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  data-testid={`ai-suggestion-${i}`}
                  className="w-full text-left text-xs px-3 py-2.5 bg-[#080C11] border border-[#212B36] rounded-lg hover:border-[#0066FF] hover:bg-[rgba(0,102,255,0.05)] transition-colors text-[#F3F4F6]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#11171F] border border-[#212B36] rounded-xl p-5">
            <div className="text-[10px] uppercase tracking-widest text-[#9CA3AF] mb-3">Contesto inviato</div>
            <div className="text-[11px] text-[#6B7280] leading-relaxed space-y-1">
              <div>• {portfolioKPI.totale_immobili} immobili totali</div>
              <div>• Capitale: {(portfolioKPI.capitale_investito/1000000).toFixed(2)}M €</div>
              <div>• Cash flow: {portfolioKPI.cash_flow_mensile} €/mese</div>
              <div>• Debito: {(portfolioKPI.debito_residuo/1000).toFixed(0)}k €</div>
              <div>• Rend. netto medio: {portfolioKPI.rendimento_medio_netto}%</div>
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="xl:col-span-3 order-1 xl:order-2">
          <div className="bg-[#11171F] border border-[#212B36] rounded-xl flex flex-col h-[calc(100vh-180px)] min-h-[600px]">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4" data-testid="ai-chat-messages">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0066FF] to-[#10B981] flex items-center justify-center mb-4">
                    <Bot size={26} className="text-white" />
                  </div>
                  <h3 className="font-display text-2xl font-bold mb-2">Ciao, sono AI Autopilot</h3>
                  <p className="text-sm text-[#9CA3AF] max-w-md leading-relaxed">
                    Analizzo il tuo patrimonio in tempo reale per consigliarti su <strong className="text-[#F3F4F6]">vendite, affitti, rifinanziamenti</strong> e nuovi acquisti.
                  </p>
                  <p className="text-xs text-[#6B7280] mt-3">Scegli una domanda dalla colonna a sinistra o scrivimi qui sotto.</p>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.role === "user" ? "bg-[#0066FF]" : "bg-gradient-to-br from-[#0066FF] to-[#10B981]"}`}>
                    {m.role === "user" ? <UserIcon size={14} className="text-white" /> : <Bot size={14} className="text-white" />}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${m.role === "user" ? "bg-[#0066FF] text-white" : "bg-[#161B22] border border-[#212B36] text-[#F3F4F6]"}`}>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-[#0066FF] to-[#10B981]">
                    <Bot size={14} className="text-white" />
                  </div>
                  <div className="bg-[#161B22] border border-[#212B36] rounded-2xl px-4 py-3 inline-flex items-center gap-2 text-sm text-[#9CA3AF]">
                    <Loader2 size={14} className="animate-spin" /> Sto analizzando…
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[#212B36] p-4">
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2 bg-[#080C11] border border-[#212B36] rounded-xl px-3 focus-within:border-[#0066FF] transition-colors" data-testid="ai-chat-form">
                <Sparkles size={16} className="text-[#60A5FA]"/>
                <input
                  data-testid="ai-chat-input"
                  value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder="Chiedi qualsiasi cosa sul tuo portafoglio…"
                  disabled={loading}
                  className="flex-1 bg-transparent py-3 outline-none text-sm placeholder:text-[#6B7280]"
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
