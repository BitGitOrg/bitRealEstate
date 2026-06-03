import { useEffect, useState } from "react";
import axios from "axios";
import { Mail, CheckCircle2, AlertTriangle, Loader2, Inbox, RefreshCw, Trash2, Eye, EyeOff, Save, HelpCircle } from "lucide-react";
import { toast } from "sonner";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PRESETS = [
  { label: "Gmail", host: "imap.gmail.com", port: 993, ssl: true, hint: "Serve App Password (account Google → Sicurezza → Password per le app)" },
  { label: "Aruba", host: "imaps.aruba.it", port: 993, ssl: true, hint: "Usa la password normale della casella" },
  { label: "Outlook / Hotmail", host: "outlook.office365.com", port: 993, ssl: true, hint: "Serve abilitare IMAP nelle impostazioni Outlook" },
  { label: "Libero / Virgilio", host: "imapmail.libero.it", port: 993, ssl: true, hint: "Usa la password normale della casella" },
  { label: "Titan / Hostinger", host: "imap.titan.email", port: 993, ssl: true, hint: "Usa la password normale della casella" },
  { label: "ProtonMail", host: "127.0.0.1", port: 1143, ssl: false, hint: "Richiede ProtonMail Bridge installato in locale (non utilizzabile da server)" },
];

export default function EmailInboxConfig() {
  const tok = () => localStorage.getItem("crr_token");
  const headers = () => ({ Authorization: `Bearer ${tok()}` });

  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState({
    host: "", port: 993, use_ssl: true, username: "", password: "",
    folder: "INBOX", enabled: true, auto_sync_minutes: 0,
  });
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [meta, setMeta] = useState({ configured: false, password_set: false, last_sync_at: null, last_sync_result: null });
  const [presetIdx, setPresetIdx] = useState(-1);

  useEffect(() => { load(); /* eslint-disable-line */ }, []);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_BASE}/email-inbox/config`, { headers: headers() });
      const d = r.data;
      setMeta({
        configured: d.configured, password_set: d.password_set,
        last_sync_at: d.last_sync_at, last_sync_result: d.last_sync_result,
      });
      if (d.configured) {
        setCfg({
          host: d.host || "", port: d.port || 993, use_ssl: d.use_ssl ?? true,
          username: d.username || "", password: "",
          folder: d.folder || "INBOX", enabled: d.enabled ?? true,
          auto_sync_minutes: d.auto_sync_minutes ?? 0,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (i) => {
    setPresetIdx(i);
    if (i < 0) return;
    const p = PRESETS[i];
    setCfg({ ...cfg, host: p.host, port: p.port, use_ssl: p.ssl });
  };

  const save = async () => {
    if (!cfg.host || !cfg.username) {
      toast.error("Host e username sono obbligatori");
      return;
    }
    if (!meta.password_set && !cfg.password) {
      toast.error("La password è obbligatoria alla prima configurazione");
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/email-inbox/config`, cfg, { headers: headers() });
      toast.success("Configurazione salvata");
      setCfg({ ...cfg, password: "" });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await axios.post(`${API_BASE}/email-inbox/test`, {}, { headers: headers() });
      setTestResult({ ok: true, ...r.data });
      toast.success(`Connesso · ${r.data.unseen} email non lette su ${r.data.total} totali`);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Errore connessione";
      setTestResult({ ok: false, error: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await axios.post(`${API_BASE}/email-inbox/sync`, { limit: 20 }, { headers: headers(), timeout: 180000 });
      setSyncResult(r.data);
      if (r.data.deals_creati > 0) {
        toast.success(`${r.data.deals_creati} nuovi deal importati in Pipeline`);
      } else if (r.data.emails_processate > 0) {
        toast(`${r.data.emails_processate} email lette, ma nessun annuncio nuovo da aggiungere`);
      } else {
        toast("Nessuna email non letta da processare");
      }
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore sync");
    } finally {
      setSyncing(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Eliminare la configurazione email? Le credenziali verranno rimosse.")) return;
    try {
      await axios.delete(`${API_BASE}/email-inbox/config`, { headers: headers() });
      toast.success("Configurazione rimossa");
      setCfg({ host: "", port: 993, use_ssl: true, username: "", password: "", folder: "INBOX", enabled: true });
      setMeta({ configured: false, password_set: false, last_sync_at: null, last_sync_result: null });
      setPresetIdx(-1);
    } catch (e) {
      toast.error("Errore eliminazione");
    }
  };

  if (loading) return <div className="p-6 text-center text-[#64748B] text-sm">Caricamento…</div>;

  return (
    <div className="space-y-4" data-testid="email-inbox-config">
      <div className="bg-[#EEF4FF] border border-[#C7D7FE] rounded-lg p-3 text-[11px] text-[#1E3A8A] leading-relaxed flex gap-2">
        <HelpCircle size={14} className="shrink-0 mt-0.5" />
        <div>
          <strong>Come funziona:</strong> imposta sui portali (Immobiliare/Idealista/Casa.it/ecc.) gli <strong>alert per nuovi annunci</strong> che ti interessano e fai recapitare le email in questa casella dedicata.
          Cliccando "Sync inbox" il sistema legge le email non lette, estrae gli annunci con AI e li mette in Pipeline con il Deal Score già calcolato. Le email vengono marcate come "lette".
        </div>
      </div>

      {/* Preset rapido */}
      <div>
        <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Provider rapido</span>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => applyPreset(i)}
              data-testid={`email-preset-${p.label.toLowerCase().split(/[ /]/)[0]}`}
              className={`px-3 py-2 rounded-lg text-sm border text-left transition-colors ${presetIdx === i || cfg.host === p.host ? "border-[#0066FF] bg-[rgba(0,102,255,0.08)] text-[#2563EB]" : "border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1]"}`}
            >
              <div className="font-medium">{p.label}</div>
              <div className="text-[10px] text-[#64748B] truncate">{p.host}</div>
            </button>
          ))}
        </div>
        {presetIdx >= 0 && (
          <div className="mt-2 text-[11px] text-[#92400E] bg-[#FFFBEB] border border-[#FCD34D]/40 rounded p-2 leading-relaxed">
            <strong>{PRESETS[presetIdx].label}:</strong> {PRESETS[presetIdx].hint}
          </div>
        )}
      </div>

      {/* Config form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Server IMAP</span>
          <input data-testid="email-host" type="text" value={cfg.host} onChange={(e) => setCfg({ ...cfg, host: e.target.value })} placeholder="imap.gmail.com" className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]" />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Porta</span>
            <input data-testid="email-port" type="number" value={cfg.port} onChange={(e) => setCfg({ ...cfg, port: parseInt(e.target.value) || 993 })} className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF] tabular" />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">SSL/TLS</span>
            <select data-testid="email-ssl" value={cfg.use_ssl ? "1" : "0"} onChange={(e) => setCfg({ ...cfg, use_ssl: e.target.value === "1" })} className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]">
              <option value="1">Attivo (consigliato)</option>
              <option value="0">Disattivo</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Email / Username</span>
          <input data-testid="email-username" type="text" value={cfg.username} onChange={(e) => setCfg({ ...cfg, username: e.target.value })} placeholder="deals@tuodominio.com" className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]" />
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium flex items-center justify-between">
            Password {meta.password_set && <span className="text-[#059669] normal-case tracking-normal text-[10px]">✓ già impostata (lascia vuota per non cambiarla)</span>}
          </span>
          <div className="mt-1 relative">
            <input data-testid="email-password" type={showPwd ? "text" : "password"} value={cfg.password} onChange={(e) => setCfg({ ...cfg, password: e.target.value })} placeholder={meta.password_set ? "•••••••• (invariata)" : "App password o password casella"} className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 pr-9 text-sm outline-none focus:border-[#0066FF]" />
            <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]">
              {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Cartella</span>
          <input data-testid="email-folder" type="text" value={cfg.folder} onChange={(e) => setCfg({ ...cfg, folder: e.target.value })} placeholder="INBOX" className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]" />
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Sync abilitato</span>
          <select value={cfg.enabled ? "1" : "0"} onChange={(e) => setCfg({ ...cfg, enabled: e.target.value === "1" })} className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066FF]">
            <option value="1">Sì</option>
            <option value="0">No (pausa)</option>
          </select>
        </label>

        <label className="block md:col-span-2">
          <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium flex items-center gap-1.5">
            Sync automatico in background
            {cfg.auto_sync_minutes > 0 && cfg.enabled && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#D1FAE5] text-[#065F46] tabular normal-case tracking-normal">
                ATTIVO · ogni {cfg.auto_sync_minutes}m
              </span>
            )}
          </span>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-6 gap-1.5">
            {[
              { v: 0, l: "Off" },
              { v: 15, l: "15m" },
              { v: 30, l: "30m" },
              { v: 60, l: "1h" },
              { v: 120, l: "2h" },
              { v: 360, l: "6h" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setCfg({ ...cfg, auto_sync_minutes: o.v })}
                data-testid={`email-auto-${o.v}`}
                className={`px-2 py-2 rounded-lg text-xs border transition-colors ${
                  cfg.auto_sync_minutes === o.v
                    ? "border-[#0066FF] bg-[rgba(0,102,255,0.1)] text-[#2563EB] font-semibold"
                    : "border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1]"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] text-[#64748B] leading-relaxed">
            Quando attivo, il server controlla automaticamente la casella all'intervallo scelto. Funziona anche con browser chiuso. Min 15 min · Max 6h.
          </div>
        </label>
      </div>

      {/* Azioni */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-[#E2E8F0]">
        <button onClick={save} disabled={saving} data-testid="email-save" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-medium">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salva
        </button>
        <button onClick={testConnection} disabled={testing || !meta.configured} data-testid="email-test" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E2E8F0] hover:border-[#0066FF] text-[#0F172A] text-sm font-medium disabled:opacity-50">
          {testing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Testa connessione
        </button>
        <button onClick={sync} disabled={syncing || !meta.configured} data-testid="email-sync" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#059669] hover:bg-[#047857] disabled:opacity-50 text-white text-sm font-medium">
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync inbox ora
        </button>
        {meta.configured && (
          <button onClick={remove} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#FECACA] text-[#DC2626] text-sm font-medium hover:bg-[#FEF2F2]">
            <Trash2 size={12} /> Rimuovi
          </button>
        )}
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`rounded-lg p-3 border ${testResult.ok ? "bg-[#F0FDF4] border-[#86EFAC]" : "bg-[#FEF2F2] border-[#FCA5A5]"} text-sm flex items-start gap-2`}>
          {testResult.ok ? <CheckCircle2 size={16} className="text-[#059669] mt-0.5" /> : <AlertTriangle size={16} className="text-[#DC2626] mt-0.5" />}
          <div className="flex-1">
            {testResult.ok ? (
              <>
                <div className="font-medium text-[#065F46]">Connessione riuscita</div>
                <div className="text-xs text-[#047857] mt-0.5 tabular">{testResult.unseen} email non lette su {testResult.total} totali in cartella «{cfg.folder}»</div>
              </>
            ) : (
              <>
                <div className="font-medium text-[#991B1B]">Connessione fallita</div>
                <div className="text-xs text-[#B91C1C] mt-0.5">{testResult.error}</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Last sync */}
      {meta.last_sync_at && (
        <div className="rounded-lg p-3 bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#475569]">
          <div className="flex items-center gap-2">
            <Inbox size={14} className="text-[#0066FF]" />
            <span><strong>Ultimo sync:</strong> {new Date(meta.last_sync_at).toLocaleString("it-IT")}</span>
            {meta.last_sync_result && (
              <span className="ml-auto tabular">
                {meta.last_sync_result.emails} email → {meta.last_sync_result.deals_creati} deal creati
              </span>
            )}
          </div>
        </div>
      )}

      {/* Sync result dettaglio */}
      {syncResult && (
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-3 text-sm" data-testid="email-sync-result">
          <div className="grid grid-cols-4 gap-2 text-center mb-3">
            <div className="bg-[#F8FAFC] rounded p-2">
              <div className="text-[10px] uppercase text-[#64748B]">Email</div>
              <div className="font-display text-lg font-bold tabular">{syncResult.emails_processate}</div>
            </div>
            <div className="bg-[#EEF4FF] rounded p-2">
              <div className="text-[10px] uppercase text-[#1E40AF]">Annunci AI</div>
              <div className="font-display text-lg font-bold tabular text-[#2563EB]">{syncResult.annunci_trovati}</div>
            </div>
            <div className="bg-[#F0FDF4] rounded p-2">
              <div className="text-[10px] uppercase text-[#065F46]">Deal creati</div>
              <div className="font-display text-lg font-bold tabular text-[#059669]">{syncResult.deals_creati}</div>
            </div>
            <div className="bg-[#FEF3C7] rounded p-2">
              <div className="text-[10px] uppercase text-[#92400E]">Skipped</div>
              <div className="font-display text-lg font-bold tabular text-[#B45309]">{syncResult.skipped_no_listing}</div>
            </div>
          </div>
          {syncResult.dettagli?.length > 0 && (
            <div className="max-h-[200px] overflow-y-auto space-y-1">
              {syncResult.dettagli.map((d, i) => (
                <div key={i} className="text-xs text-[#475569] py-1 px-2 hover:bg-[#F8FAFC] rounded flex items-center gap-2">
                  <span className="text-[10px] uppercase font-medium text-[#0066FF] shrink-0">{d.portal}</span>
                  <span className="flex-1 truncate" title={d.subject}>{d.subject || "(no subject)"}</span>
                  <span className="tabular text-[#64748B]">{d.creati}/{d.annunci}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
