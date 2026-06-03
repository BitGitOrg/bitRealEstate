import { useEffect, useState } from "react";
import axios from "axios";
import {
  MessageCircle, CheckCircle2, AlertTriangle, Loader2, Save, Trash2, Copy,
  Eye, EyeOff, Send, ExternalLink, ShieldCheck, Plus, X as XIcon,
  Home, TrendingUp, BarChart3, ListChecks, HelpCircle
} from "lucide-react";
import { toast } from "sonner";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function WhatsAppConfig() {
  const tok = () => localStorage.getItem("crr_token");
  const headers = () => ({ Authorization: `Bearer ${tok()}` });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [meta, setMeta] = useState({
    configured: false, auth_token_set: false, webhook_url: "",
    last_inbound_at: null, last_inbound_summary: null,
  });
  const [cfg, setCfg] = useState({
    account_sid: "",
    auth_token: "",
    whatsapp_number: "whatsapp:+14155238886",
    allowed_senders: [],
    enabled: true,
  });
  const [showTok, setShowTok] = useState(false);
  const [newSender, setNewSender] = useState("");
  const [testTo, setTestTo] = useState("");

  useEffect(() => { load(); /* eslint-disable-line */ }, []);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_BASE}/whatsapp/config`, { headers: headers() });
      const d = r.data;
      setMeta({
        configured: d.configured,
        auth_token_set: d.auth_token_set,
        webhook_url: d.webhook_url,
        last_inbound_at: d.last_inbound_at,
        last_inbound_summary: d.last_inbound_summary,
      });
      if (d.configured) {
        setCfg({
          account_sid: d.account_sid || "",
          auth_token: "",
          whatsapp_number: d.whatsapp_number || "whatsapp:+14155238886",
          allowed_senders: d.allowed_senders || [],
          enabled: d.enabled !== false,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!cfg.account_sid || !cfg.whatsapp_number) {
      toast.error("Account SID e numero WhatsApp obbligatori");
      return;
    }
    if (!meta.auth_token_set && !cfg.auth_token) {
      toast.error("Auth Token obbligatorio alla prima configurazione");
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/whatsapp/config`, cfg, { headers: headers() });
      toast.success("Configurazione salvata");
      setCfg({ ...cfg, auth_token: "" });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Eliminare la configurazione WhatsApp? Le credenziali Twilio verranno rimosse.")) return;
    try {
      await axios.delete(`${API_BASE}/whatsapp/config`, { headers: headers() });
      toast.success("Configurazione rimossa");
      setCfg({ account_sid: "", auth_token: "", whatsapp_number: "whatsapp:+14155238886", allowed_senders: [], enabled: true });
      setMeta({ configured: false, auth_token_set: false, webhook_url: "", last_inbound_at: null, last_inbound_summary: null });
    } catch (e) {
      toast.error("Errore eliminazione");
    }
  };

  const copyWebhook = () => {
    if (!meta.webhook_url) return;
    navigator.clipboard.writeText(meta.webhook_url);
    toast.success("URL webhook copiato negli appunti");
  };

  const testSend = async (template) => {
    if (!testTo) { toast.error("Inserisci il tuo numero WhatsApp per il test"); return; }
    setTesting(true);
    try {
      await axios.post(`${API_BASE}/whatsapp/test-send`, { to: testTo, template: template || "ping" }, { headers: headers() });
      toast.success(template === "help" ? "Menu comandi inviato al tuo WhatsApp." : "Messaggio di test inviato. Controlla WhatsApp.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore invio test");
    } finally {
      setTesting(false);
    }
  };

  const copyTemplate = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Template copiato");
  };

  const addSender = () => {
    const s = newSender.trim();
    if (!s) return;
    if (cfg.allowed_senders.includes(s)) { toast.error("Già presente"); return; }
    setCfg({ ...cfg, allowed_senders: [...cfg.allowed_senders, s] });
    setNewSender("");
  };
  const removeSender = (s) => {
    setCfg({ ...cfg, allowed_senders: cfg.allowed_senders.filter(x => x !== s) });
  };

  if (loading) return <div className="p-6 text-center text-[#64748B] text-sm">Caricamento…</div>;

  return (
    <div className="space-y-4" data-testid="whatsapp-config">
      {/* How-to */}
      <div className="bg-[#ECFDF5] border border-[#A7F3D0] p-3 text-[11px] text-[#065F46] leading-relaxed flex gap-2">
        <MessageCircle size={14} className="shrink-0 mt-0.5" />
        <div>
          <strong>Come funziona:</strong> configura un account Twilio (Sandbox WhatsApp gratuito su <a href="https://console.twilio.com" target="_blank" rel="noreferrer" className="underline">console.twilio.com</a>),
          incolla SID, Auth Token e numero qui sotto. Salva, poi <strong>copia il Webhook URL</strong> e incollalo nel campo "When a message comes in" del tuo sandbox Twilio.
          A quel punto puoi inviarmi messaggi tipo: <em>"Aggiungi via Roma 12 Milano, 180000€"</em> e creerò il deal in Pipeline con AI Score.
        </div>
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block md:col-span-2">
          <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Twilio Account SID</span>
          <input
            data-testid="wa-account-sid"
            type="text" value={cfg.account_sid}
            onChange={(e) => setCfg({ ...cfg, account_sid: e.target.value })}
            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#0066FF] font-mono"
          />
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium flex items-center justify-between">
            Twilio Auth Token
            {meta.auth_token_set && <span className="text-[#059669] normal-case tracking-normal text-[10px]">✓ già impostato</span>}
          </span>
          <div className="mt-1 relative">
            <input
              data-testid="wa-auth-token"
              type={showTok ? "text" : "password"} value={cfg.auth_token}
              onChange={(e) => setCfg({ ...cfg, auth_token: e.target.value })}
              placeholder={meta.auth_token_set ? "•••••••• (lascia vuoto per non cambiarlo)" : "Auth Token Twilio"}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 pr-9 text-sm outline-none focus:border-[#0066FF] font-mono"
            />
            <button type="button" onClick={() => setShowTok(!showTok)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]">
              {showTok ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Numero WhatsApp Twilio</span>
          <input
            data-testid="wa-number"
            type="text" value={cfg.whatsapp_number}
            onChange={(e) => setCfg({ ...cfg, whatsapp_number: e.target.value })}
            placeholder="whatsapp:+14155238886"
            className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#0066FF] font-mono"
          />
          <span className="text-[10px] text-[#64748B] mt-0.5 block">Sandbox di default Twilio: whatsapp:+14155238886</span>
        </label>

        <label className="block md:col-span-2">
          <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium flex items-center gap-1.5">
            <ShieldCheck size={11}/> Numeri autorizzati (whitelist)
          </span>
          <div className="mt-1 flex flex-wrap gap-1.5 items-center">
            {cfg.allowed_senders.map(s => (
              <span key={s} className="inline-flex items-center gap-1 bg-[#EEF4FF] border border-[#C7D7FE] text-[#1E40AF] text-xs px-2 py-1 font-mono">
                {s}
                <button onClick={() => removeSender(s)} className="text-[#1E40AF] hover:text-[#DC2626]" data-testid={`wa-remove-${s}`}><XIcon size={11}/></button>
              </span>
            ))}
            <input
              value={newSender} onChange={(e) => setNewSender(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSender(); } }}
              placeholder="+39333..."
              data-testid="wa-add-sender-input"
              className="flex-1 min-w-[120px] bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-1.5 text-xs outline-none focus:border-[#0066FF] font-mono"
            />
            <button onClick={addSender} data-testid="wa-add-sender" className="inline-flex items-center gap-1 px-2 py-1.5 border border-[#0066FF] text-[#0066FF] text-xs hover:bg-[rgba(0,102,255,0.05)]">
              <Plus size={11}/> Aggiungi
            </button>
          </div>
          <span className="text-[10px] text-[#64748B] mt-1 block">Se vuota, qualunque numero registrato al sandbox può scrivere al bot (sconsigliato in produzione).</span>
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Bot abilitato</span>
          <select
            value={cfg.enabled ? "1" : "0"}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.value === "1" })}
            data-testid="wa-enabled"
            className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#0066FF]"
          >
            <option value="1">Sì (riceve messaggi)</option>
            <option value="0">No (pausa)</option>
          </select>
        </label>
      </div>

      {/* Azioni */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-[#E2E8F0]">
        <button onClick={save} disabled={saving} data-testid="wa-save" className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-medium">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salva
        </button>
        {meta.configured && (
          <button onClick={remove} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 border border-[#FECACA] text-[#DC2626] text-sm font-medium hover:bg-[#FEF2F2]" data-testid="wa-delete">
            <Trash2 size={12} /> Rimuovi
          </button>
        )}
      </div>

      {/* Webhook URL block */}
      {meta.webhook_url && (
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-3 space-y-2" data-testid="wa-webhook-block">
          <div className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">
            🪝 Webhook URL — incolla in Twilio Console → Messaging → WhatsApp Sandbox Settings
          </div>
          <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] px-2 py-1.5">
            <code className="flex-1 text-[11px] text-[#0F172A] font-mono truncate" title={meta.webhook_url}>{meta.webhook_url}</code>
            <button onClick={copyWebhook} data-testid="wa-copy-webhook" className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-[#0066FF] text-[#0066FF] hover:bg-[rgba(0,102,255,0.05)]">
              <Copy size={11}/> Copia
            </button>
            <a href="https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-[#E2E8F0] text-[#475569] hover:border-[#0066FF] hover:text-[#0066FF]">
              <ExternalLink size={11}/> Twilio
            </a>
          </div>
          <div className="text-[10px] text-[#64748B] leading-relaxed">
            Metodo: <strong>POST</strong>. Tipo di evento: <strong>"When a message comes in"</strong>. Twilio firmerà ogni richiesta con il tuo Auth Token e noi la verifichiamo.
          </div>
        </div>
      )}

      {/* Test send */}
      {meta.configured && meta.auth_token_set && (
        <div className="bg-white border border-[#E2E8F0] p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Invia messaggio di test</div>
          <div className="flex gap-2 items-center">
            <input
              value={testTo} onChange={(e) => setTestTo(e.target.value)}
              placeholder="whatsapp:+39333..."
              data-testid="wa-test-to"
              className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#0066FF] font-mono"
            />
            <button onClick={() => testSend("ping")} disabled={testing} data-testid="wa-test-send" className="inline-flex items-center gap-1.5 px-3 py-2 border border-[#059669] text-[#059669] text-sm font-medium hover:bg-[#ECFDF5] disabled:opacity-50">
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Ping di test
            </button>
            <button onClick={() => testSend("help")} disabled={testing} data-testid="wa-send-help" className="inline-flex items-center gap-1.5 px-3 py-2 border border-[#0066FF] text-[#0066FF] text-sm font-medium hover:bg-[rgba(0,102,255,0.05)] disabled:opacity-50">
              {testing ? <Loader2 size={14} className="animate-spin" /> : <HelpCircle size={14} />} Invia menu comandi
            </button>
          </div>
          <span className="text-[10px] text-[#64748B]">Devi prima aver completato il join al sandbox da WhatsApp (comando indicato nella console Twilio).</span>
        </div>
      )}

      {/* Templates di comandi rapidi */}
      {meta.configured && (
        <div className="bg-white border border-[#E2E8F0] p-3 space-y-3" data-testid="wa-templates">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Template comandi rapidi</div>
              <div className="text-[11px] text-[#64748B] mt-0.5">Copia il template e condividilo con i collaboratori sul campo. Funzionano anche scrivendo al bot.</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              {
                key: "create",
                icon: Home,
                color: "#0066FF",
                bg: "rgba(0,102,255,0.06)",
                title: "Crea deal da WhatsApp",
                hint: "Aggiunge un immobile alla Pipeline con AI Score",
                text: "Aggiungi via Roma 12 Milano, 180000€, 55mq, canone 800",
              },
              {
                key: "stage",
                icon: TrendingUp,
                color: "#B45309",
                bg: "rgba(180,83,9,0.06)",
                title: "Aggiorna stage",
                hint: "Sposta il deal nel funnel (visitato → offerta → preliminare → rogito)",
                text: "DEAL-AB1234: offerta inviata a 175000",
              },
              {
                key: "note",
                icon: ListChecks,
                color: "#7C3AED",
                bg: "rgba(124,58,237,0.06)",
                title: "Nota rapida",
                hint: "Aggiungi una nota datata alla timeline di un deal",
                text: "DEAL-AB1234: il proprietario chiede chiusura entro luglio",
              },
              {
                key: "stats",
                icon: BarChart3,
                color: "#059669",
                bg: "rgba(5,150,105,0.06)",
                title: "Statistiche oggi",
                hint: "Pipeline aperti, score medio, valore complessivo, top deal",
                text: "stats",
              },
              {
                key: "list",
                icon: ListChecks,
                color: "#0EA5E9",
                bg: "rgba(14,165,233,0.06)",
                title: "Top 5 deal aperti",
                hint: "I migliori 5 deal ordinati per AI Score",
                text: "lista",
              },
              {
                key: "help",
                icon: HelpCircle,
                color: "#475569",
                bg: "rgba(71,85,105,0.06)",
                title: "Aiuto / menu",
                hint: "Mostra l'elenco completo dei comandi disponibili",
                text: "help",
              },
            ].map((t) => {
              const TIcon = t.icon;
              return (
                <div
                  key={t.key}
                  data-testid={`wa-tpl-${t.key}`}
                  className="border border-[#E2E8F0] p-2.5 hover:border-[#CBD5E1] transition-colors group"
                  style={{ background: t.bg }}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 flex items-center justify-center shrink-0" style={{ background: "#fff", border: `1px solid ${t.color}33`, color: t.color }}>
                      <TIcon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold" style={{ color: t.color }}>{t.title}</div>
                      <div className="text-[10px] text-[#64748B] leading-snug mt-0.5">{t.hint}</div>
                    </div>
                  </div>
                  <code className="block mt-2 text-[10.5px] font-mono text-[#0F172A] bg-white border border-[#E2E8F0] px-2 py-1.5 leading-relaxed break-words">
                    {t.text}
                  </code>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <button
                      onClick={() => copyTemplate(t.text)}
                      data-testid={`wa-tpl-copy-${t.key}`}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] border border-[#E2E8F0] text-[#475569] hover:border-[#0066FF] hover:text-[#0066FF] bg-white"
                    >
                      <Copy size={10}/> Copia
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Last inbound */}
      {meta.last_inbound_at && (
        <div className="bg-white border border-[#E2E8F0] p-3 text-xs text-[#475569]" data-testid="wa-last-inbound">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 size={14} className="text-[#059669]" />
            <span><strong>Ultimo messaggio ricevuto:</strong> {new Date(meta.last_inbound_at).toLocaleString("it-IT")}</span>
          </div>
          {meta.last_inbound_summary && (
            <div className="ml-6 space-y-0.5">
              <div>Da: <span className="font-mono">{meta.last_inbound_summary.from}</span></div>
              <div>Azione AI: <span className="font-semibold text-[#0066FF]">{meta.last_inbound_summary.azione}</span></div>
              <div className="text-[#64748B] italic truncate">"{meta.last_inbound_summary.body}"</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
