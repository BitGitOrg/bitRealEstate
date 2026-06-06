import { useEffect, useState } from "react";
import { Download, X as XIcon, Share, PlusSquare } from "lucide-react";

const DISMISS_KEY = "pwa_install_dismissed_until";
const DISMISS_DAYS = 14;

/**
 * Mostra un prompt elegante per installare l'app come PWA standalone:
 * - Android/Chrome: usa l'evento `beforeinstallprompt` nativo.
 * - iOS Safari: niente API → mostra istruzioni manuali (Condividi → Aggiungi a Home).
 * - Già installata o dismissed di recente: silenzioso.
 */
export function PWAInstallPrompt() {
  const [event, setEvent] = useState(null);
  const [showIos, setShowIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Già in standalone? skip
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (isStandalone) {
      setInstalled(true);
      return;
    }

    // Dismissed di recente?
    const dismissedUntil = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
    if (dismissedUntil > Date.now()) {
      setDismissed(true);
      return;
    }

    // Android/Chrome flow
    const handler = (e) => {
      e.preventDefault();
      setEvent(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS detection (no beforeinstallprompt support)
    const ua = navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isMobile = window.innerWidth < 1024;
    if (isIos && isMobile) {
      // Mostriamo solo dopo che l'utente è autenticato e ha avuto il tempo di valutare
      const t = setTimeout(() => setShowIos(true), 8000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }

    // App installata
    const installedHandler = () => setInstalled(true);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const dismiss = () => {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
    setEvent(null);
    setShowIos(false);
    setDismissed(true);
  };

  const install = async () => {
    if (!event) return;
    try {
      event.prompt();
      const choice = await event.userChoice;
      if (choice?.outcome === "accepted") {
        setInstalled(true);
      } else {
        dismiss();
      }
    } catch (e) {
      console.warn("[PWA] install failed:", e);
    } finally {
      setEvent(null);
    }
  };

  if (installed || dismissed) return null;

  // Android/Chrome prompt
  if (event) {
    return (
      <div
        className="lg:hidden fixed left-3 right-3 bottom-[72px] z-30 bg-white border border-[#E2E8F0] shadow-[0_8px_30px_rgba(15,23,42,0.18)] p-3 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-200"
        data-testid="pwa-install-android"
      >
        <div className="w-10 h-10 rounded-lg bg-[#0066FF] flex items-center justify-center text-white shrink-0">
          <Download size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[#0F172A]">Installa Control Room</div>
          <div className="text-[11px] text-[#64748B] leading-snug">
            Aggiungila alla home, accesso istantaneo senza browser.
          </div>
        </div>
        <button
          onClick={install}
          data-testid="pwa-install-confirm"
          className="px-3 py-2 bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-semibold transition shrink-0"
        >
          Installa
        </button>
        <button
          onClick={dismiss}
          data-testid="pwa-install-dismiss"
          aria-label="Chiudi"
          className="p-1.5 text-[#94A3B8] hover:text-[#475569] shrink-0"
        >
          <XIcon size={14} />
        </button>
      </div>
    );
  }

  // iOS Safari instructions
  if (showIos) {
    return (
      <div
        className="lg:hidden fixed left-3 right-3 bottom-[72px] z-30 bg-white border border-[#E2E8F0] shadow-[0_8px_30px_rgba(15,23,42,0.18)] p-3 animate-in slide-in-from-bottom-4 duration-200"
        data-testid="pwa-install-ios"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#0066FF] flex items-center justify-center text-white shrink-0">
            <Download size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[#0F172A]">Installa Control Room su iPhone</div>
            <div className="text-[11px] text-[#475569] leading-snug mt-1">
              Tocca{" "}
              <Share size={11} className="inline mb-0.5 text-[#0066FF]" />{" "}
              <span className="font-medium">Condividi</span>, scorri e seleziona{" "}
              <PlusSquare size={11} className="inline mb-0.5 text-[#0066FF]" />{" "}
              <span className="font-medium">{`"Aggiungi a Home"`}</span>.
            </div>
          </div>
          <button
            onClick={dismiss}
            data-testid="pwa-install-dismiss"
            aria-label="Chiudi"
            className="p-1.5 text-[#94A3B8] hover:text-[#475569] shrink-0"
          >
            <XIcon size={14} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
