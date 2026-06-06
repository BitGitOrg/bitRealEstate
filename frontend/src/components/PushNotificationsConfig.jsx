import { useEffect, useState } from "react";
import axios from "axios";
import { Bell, BellOff, Loader2, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

function urlB64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const b64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export default function PushNotificationsConfig() {
  const tok = () => localStorage.getItem("crr_token");
  const headers = () => ({ Authorization: `Bearer ${tok()}` });

  const [supported, setSupported] = useState(true);
  const [reasonNotSupported, setReasonNotSupported] = useState("");
  const [permission, setPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "default");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const [serverEnabled, setServerEnabled] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) {
      setSupported(false);
      setReasonNotSupported("Il tuo browser non supporta i service worker.");
      return;
    }
    if (!("PushManager" in window)) {
      setSupported(false);
      setReasonNotSupported("Il tuo browser non supporta le Web Push API. Su iPhone devi prima installare l'app dalla home (Aggiungi a Home).");
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      // In dev il service worker non è registrato → mostriamo info ma permettiamo simulazione
      // (lasciamo supported=true ma con un warning)
    }
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const r = await axios.get(`${API_BASE}/push/status`, { headers: headers() });
      setServerEnabled(!!r.data?.enabled);
      setActiveCount(r.data?.active_subscriptions || 0);
    } catch (e) {
      // status endpoint ok ma magari user non auth
    }
  };

  const enable = async () => {
    setBusy(true);
    try {
      // 1. Richiedi permesso
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast.error("Permesso notifiche negato dal browser");
        return;
      }
      // 2. Registra (o trova) il SW
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        if (process.env.NODE_ENV !== "production") {
          toast.error("Service Worker non registrato in dev. Pubblica in produzione per testare push.");
          return;
        }
        reg = await navigator.serviceWorker.register("/service-worker.js");
        await navigator.serviceWorker.ready;
      }
      // 3. Ottieni VAPID public key
      const keyResp = await axios.get(`${API_BASE}/push/public-key`, { headers: headers() });
      const publicKey = keyResp.data?.publicKey;
      if (!publicKey) throw new Error("VAPID public key non disponibile");
      // 4. Subscribe
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(publicKey),
        });
      }
      const j = sub.toJSON();
      // 5. Invia al backend
      await axios.post(`${API_BASE}/push/subscribe`, {
        endpoint: j.endpoint,
        keys: j.keys,
        user_agent: navigator.userAgent,
      }, { headers: headers() });
      toast.success("Notifiche push attive su questo dispositivo");
      loadStatus();
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || e?.message || "Errore attivazione push");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      const endpoint = sub?.endpoint;
      if (sub) await sub.unsubscribe();
      // Pulisci anche lato server (questa o tutte)
      await axios.delete(`${API_BASE}/push/subscribe`, {
        headers: headers(),
        data: endpoint ? { endpoint } : {},
      });
      toast.success("Notifiche push disattivate");
      loadStatus();
    } catch (e) {
      toast.error("Errore disattivazione");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const r = await axios.post(`${API_BASE}/push/test`, {}, { headers: headers() });
      toast.success(`Push test inviata (${r.data?.delivered || 0} device)`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore invio test");
    } finally {
      setTesting(false);
    }
  };

  if (!supported) {
    return (
      <div className="bg-[#FFFBEB] border border-[#FDE68A] p-3 text-[12px] text-[#92400E] flex gap-2" data-testid="push-not-supported">
        <AlertCircle size={14} className="shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">Push non supportate su questo dispositivo</div>
          <div className="text-[11px] mt-0.5">{reasonNotSupported}</div>
        </div>
      </div>
    );
  }

  if (!serverEnabled) {
    return (
      <div className="bg-[#FEF2F2] border border-[#FECACA] p-3 text-[12px] text-[#991B1B] flex gap-2" data-testid="push-server-disabled">
        <AlertCircle size={14} className="shrink-0 mt-0.5" />
        <span>Push notifications non configurate sul server (VAPID keys mancanti).</span>
      </div>
    );
  }

  const isEnabled = activeCount > 0 && permission === "granted";

  return (
    <div className="space-y-3" data-testid="push-config">
      <div className="bg-[#EFF6FF] border border-[#BFDBFE] p-3 text-[11px] text-[#1E3A8A] leading-relaxed flex gap-2">
        <Bell size={14} className="shrink-0 mt-0.5" />
        <div>
          <strong>Cosa riceverai:</strong> push istantanea quando arriva un nuovo deal dal bot WhatsApp,
          {` quando l'Alert Center rileva canoni non incassati / contratti in scadenza / DSCR sotto soglia,
          o quando AI Autopilot genera un'analisi critica. Funziona anche con app chiusa (PWA installata).`}
        </div>
      </div>

      <div className="flex items-center justify-between bg-white border border-[#E2E8F0] p-3">
        <div className="flex items-center gap-3">
          {isEnabled ? (
            <div className="w-9 h-9 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center">
              <CheckCircle2 size={16} className="text-[#059669]" />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center">
              <BellOff size={16} className="text-[#64748B]" />
            </div>
          )}
          <div>
            <div className="text-[13px] font-semibold text-[#0F172A]" data-testid="push-status-label">
              {isEnabled ? "Notifiche attive" : "Notifiche disattivate"}
            </div>
            <div className="text-[10.5px] text-[#64748B]">
              {permission === "denied"
                ? "Permesso bloccato dal browser. Sblocca dalle impostazioni del sito."
                : `${activeCount} dispositivi registrati · Permesso: ${permission}`}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {isEnabled ? (
            <>
              <button onClick={sendTest} disabled={testing} data-testid="push-test"
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-[#0066FF] text-[#0066FF] text-xs font-semibold hover:bg-[rgba(0,102,255,0.05)] disabled:opacity-60">
                {testing ? <Loader2 size={12} className="animate-spin"/> : <Send size={12}/>} Test
              </button>
              <button onClick={disable} disabled={busy} data-testid="push-disable"
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-[#FECACA] text-[#DC2626] text-xs font-semibold hover:bg-[#FEF2F2] disabled:opacity-60">
                {busy ? <Loader2 size={12} className="animate-spin"/> : <BellOff size={12}/>} Disattiva
              </button>
            </>
          ) : (
            <button onClick={enable} disabled={busy || permission === "denied"} data-testid="push-enable"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-semibold disabled:opacity-60">
              {busy ? <Loader2 size={12} className="animate-spin"/> : <Bell size={12}/>} Attiva notifiche
            </button>
          )}
        </div>
      </div>

      {process.env.NODE_ENV !== "production" && (
        <div className="text-[10px] text-[#64748B] italic">
          ⚠️ In ambiente dev il service worker non viene registrato. Le push funzionano solo in produzione.
        </div>
      )}
    </div>
  );
}
