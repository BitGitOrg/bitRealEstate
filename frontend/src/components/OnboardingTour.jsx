import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles, X, ChevronRight, ChevronLeft } from "lucide-react";

/* Tour guidato al primo login. Si mostra solo se localStorage.tour_completed != "1". */

const STEPS = [
  {
    id: "welcome",
    type: "center",
    title: "Benvenuto in Control Room",
    body: "Ti faccio un tour rapido di 30 secondi sulle 5 sezioni più importanti. Puoi saltarlo in qualsiasi momento.",
    cta: "Iniziamo →",
  },
  {
    id: "patrimonio",
    target: 'a[href="/patrimonio"]',
    placement: "right",
    title: "Patrimonio",
    body: "Qui aggiungi i tuoi immobili (a reddito, compra-vendi, ristrutturazione). Click su «+ Nuovo immobile» per il wizard guidato.",
  },
  {
    id: "documenti",
    target: 'a[href="/documenti"]',
    placement: "right",
    title: "Documenti + AI Reader",
    body: "Carica rogiti, contratti, APE, fatture o foto di documenti scansionati. L'AI estrae automaticamente i dati strutturati e genera alert su anomalie/scadenze.",
  },
  {
    id: "import",
    target: 'a[href="/import"]',
    placement: "right",
    title: "Centro Import",
    body: "Importa bilanci dal commercialista o estratti conto bancari. L'AI categorizza i movimenti e li collega agli immobili.",
  },
  {
    id: "forecast",
    target: 'a[href="/forecast"]',
    placement: "right",
    title: "Forecast & Piano AI",
    body: "Simula piani di crescita pluriennali in linguaggio naturale. L'AI Strategist produce proiezioni, stress test e un Piano d'Azione concreto con priorità.",
  },
  {
    id: "help",
    target: '[data-testid="help-button"]',
    placement: "left",
    title: "Aiuto contestuale",
    body: "In ogni pagina trovi questo bottone «Aiuto» in basso a destra: ti porta direttamente alla sezione del manuale che riguarda la pagina in cui sei.",
  },
  {
    id: "end",
    type: "center",
    title: "Pronto!",
    body: "Per iniziare: vai su Patrimonio → '+ Nuovo immobile'. Se vuoi rivedere questa guida o esplorare tutte le funzionalità, cliccami nel menu su «Manuale d'uso».",
    cta: "Vai a Patrimonio",
    finalAction: "/patrimonio",
  },
];

export function OnboardingTour() {
  const navigate = useNavigate();
  const loc = useLocation();
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (loc.pathname === "/login") return;
    const done = localStorage.getItem("tour_completed") === "1";
    if (!done) {
      // piccolo delay per essere sicuri che la sidebar sia montata
      const t = setTimeout(() => setShow(true), 800);
      return () => clearTimeout(t);
    }
  }, [loc.pathname]);

  const step = STEPS[idx];

  // Calcola la bounding box del target attuale ad ogni step (e su resize)
  useLayoutEffect(() => {
    if (!show || !step?.target) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(step.target);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setRect(null);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [show, idx, step?.target]);

  const close = (completed = true) => {
    setShow(false);
    if (completed) localStorage.setItem("tour_completed", "1");
  };
  const skip = () => close(true);
  const next = () => {
    if (idx === STEPS.length - 1) {
      close(true);
      if (step.finalAction) navigate(step.finalAction);
    } else {
      setIdx(idx + 1);
    }
  };
  const prev = () => idx > 0 && setIdx(idx - 1);

  if (!show) return null;

  // Coordinate per la card del tooltip
  const padding = 12;
  const cardW = 360;
  let cardStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  if (rect && step.placement === "right") {
    cardStyle = { top: rect.top + rect.height / 2, left: rect.left + rect.width + padding, transform: "translateY(-50%)" };
  } else if (rect && step.placement === "left") {
    cardStyle = { top: rect.top + rect.height / 2, left: rect.left - cardW - padding, transform: "translateY(-50%)" };
  } else if (rect && step.placement === "bottom") {
    cardStyle = { top: rect.top + rect.height + padding, left: rect.left + rect.width / 2, transform: "translateX(-50%)" };
  }

  return (
    <div className="fixed inset-0 z-[60]" data-testid="onboarding-tour">
      {/* Overlay con spotlight ritagliato */}
      <SpotlightOverlay rect={rect} onClick={skip} />

      {/* Tooltip card */}
      <div
        ref={cardRef}
        className="fixed z-[61] bg-white rounded-2xl shadow-2xl p-5 animate-in fade-in"
        style={{ ...cardStyle, width: cardW, maxWidth: "calc(100vw - 32px)" }}
        data-testid={`tour-step-${step.id}`}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center">
              <Sparkles size={14} className="text-[#1E40AF]" />
            </div>
            <span className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold">
              Tour {idx + 1}/{STEPS.length}
            </span>
          </div>
          <button onClick={skip} className="p-1 rounded-md hover:bg-[#F1F5F9] text-[#64748B]" title="Salta tour">
            <X size={14} />
          </button>
        </div>
        <h3 className="font-display text-base font-bold text-[#0F172A] mb-1.5">{step.title}</h3>
        <p className="text-sm text-[#475569] leading-relaxed mb-4">{step.body}</p>

        {/* Progress dots */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="h-1 rounded-full transition-all"
              style={{ width: i === idx ? 24 : 8, background: i <= idx ? "#0066FF" : "#E2E8F0" }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={skip}
            className="text-[11px] text-[#64748B] hover:text-[#0F172A] underline decoration-dotted"
            data-testid="tour-skip"
          >
            Salta il tour
          </button>
          <div className="flex items-center gap-2">
            {idx > 0 && (
              <button onClick={prev} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#475569]">
                <ChevronLeft size={12} /> Indietro
              </button>
            )}
            <button
              onClick={next}
              data-testid="tour-next"
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-[#0066FF] hover:bg-[#2563EB] text-white font-semibold"
            >
              {step.cta || (idx === STEPS.length - 1 ? "Fine" : "Avanti")}
              {!step.cta && idx < STEPS.length - 1 && <ChevronRight size={12} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpotlightOverlay({ rect, onClick }) {
  // Se non c'è un rect (step centrato), faccio overlay pieno scuro.
  if (!rect) {
    return (
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClick} />
    );
  }
  // Spotlight: uso 4 div esterni per oscurare tutto tranne il rect (più performante e cross-browser dell'svg mask)
  const pad = 8;
  const cs = { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  return (
    <>
      <div className="absolute bg-black/55 backdrop-blur-[2px]" style={{ top: 0, left: 0, right: 0, height: cs.top }} onClick={onClick} />
      <div className="absolute bg-black/55 backdrop-blur-[2px]" style={{ top: cs.top, left: 0, width: cs.left, height: cs.height }} onClick={onClick} />
      <div className="absolute bg-black/55 backdrop-blur-[2px]" style={{ top: cs.top, left: cs.left + cs.width, right: 0, height: cs.height }} onClick={onClick} />
      <div className="absolute bg-black/55 backdrop-blur-[2px]" style={{ top: cs.top + cs.height, left: 0, right: 0, bottom: 0 }} onClick={onClick} />
      {/* Anello evidenziatore animato */}
      <div
        className="absolute rounded-lg pointer-events-none animate-pulse"
        style={{
          top: cs.top, left: cs.left, width: cs.width, height: cs.height,
          boxShadow: "0 0 0 3px rgba(0,102,255,0.7), 0 0 0 6px rgba(0,102,255,0.25)",
        }}
      />
    </>
  );
}

// Helper esposto: bottone "Rifai tour" usabile dal Manuale o dalle Impostazioni
export function restartTour() {
  localStorage.removeItem("tour_completed");
  window.location.href = "/dashboard";
}
