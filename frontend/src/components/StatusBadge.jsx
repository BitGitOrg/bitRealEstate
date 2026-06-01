import { STATI } from "../lib/demoData";

const STYLES = {
  in_valutazione: "bg-[rgba(59,130,246,0.15)] text-[#2563EB] border-[rgba(59,130,246,0.3)]",
  in_trattativa: "bg-[rgba(245,158,11,0.15)] text-[#B45309] border-[rgba(245,158,11,0.3)]",
  acquistato: "bg-[rgba(16,185,129,0.15)] text-[#059669] border-[rgba(16,185,129,0.3)]",
  in_ristrutturazione: "bg-[rgba(249,115,22,0.15)] text-[#C2410C] border-[rgba(249,115,22,0.3)]",
  disponibile: "bg-[rgba(6,182,212,0.15)] text-[#22D3EE] border-[rgba(6,182,212,0.3)]",
  affittato: "bg-[rgba(132,204,22,0.15)] text-[#4D7C0F] border-[rgba(132,204,22,0.3)]",
  sfitto: "bg-[rgba(239,68,68,0.15)] text-[#DC2626] border-[rgba(239,68,68,0.3)]",
  in_vendita: "bg-[rgba(14,165,233,0.15)] text-[#38BDF8] border-[rgba(14,165,233,0.3)]",
  venduto: "bg-[rgba(100,116,139,0.15)] text-[#475569] border-[rgba(100,116,139,0.3)]",
  archiviato: "bg-[rgba(63,63,70,0.15)] text-[#A1A1AA] border-[rgba(63,63,70,0.3)]",
};

export const StatusBadge = ({ stato, dataTestId }) => (
  <span
    data-testid={dataTestId || `status-badge-${stato}`}
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${STYLES[stato] || STYLES.archiviato}`}
  >
    {STATI[stato] || stato}
  </span>
);

export const SeverityBadge = ({ severity }) => {
  const map = {
    alta: "bg-[rgba(239,68,68,0.15)] text-[#DC2626] border-[rgba(239,68,68,0.3)]",
    media: "bg-[rgba(245,158,11,0.15)] text-[#B45309] border-[rgba(245,158,11,0.3)]",
    bassa: "bg-[rgba(59,130,246,0.15)] text-[#2563EB] border-[rgba(59,130,246,0.3)]",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${map[severity]}`}>{severity.toUpperCase()}</span>;
};

/**
 * Badge "In disdetta" — mostrato accanto allo StatusBadge quando l'immobile ha una disdetta registrata.
 * Mostra anche giorni residui se la data uscita prevista è valorizzata.
 */
export const DisdettaBadge = ({ dataUscita, dataTestId, compact = false }) => {
  if (!dataUscita) return null;
  let dayInfo = "";
  try {
    const d = new Date(dataUscita);
    const days = Math.round((d - new Date()) / 86400000);
    if (days < 0) dayInfo = "scaduta";
    else if (days === 0) dayInfo = "oggi";
    else if (days < 60) dayInfo = `tra ${days}gg`;
    else dayInfo = `${d.toLocaleDateString("it-IT", { month: "short", year: "numeric" })}`;
  } catch {}
  return (
    <span
      data-testid={dataTestId || "disdetta-badge"}
      title={`Disdetta in corso · uscita ${dataUscita}`}
      className={`inline-flex items-center gap-1 rounded-full ${compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"} font-medium border bg-[rgba(245,158,11,0.12)] text-[#B45309] border-[rgba(245,158,11,0.35)]`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#B45309] animate-pulse" />
      In disdetta · {dayInfo}
    </span>
  );
};
