import { STATI } from "../lib/demoData";

const STYLES = {
  in_valutazione: "bg-[rgba(59,130,246,0.15)] text-[#60A5FA] border-[rgba(59,130,246,0.3)]",
  in_trattativa: "bg-[rgba(245,158,11,0.15)] text-[#FBBF24] border-[rgba(245,158,11,0.3)]",
  acquistato: "bg-[rgba(16,185,129,0.15)] text-[#34D399] border-[rgba(16,185,129,0.3)]",
  in_ristrutturazione: "bg-[rgba(249,115,22,0.15)] text-[#FB923C] border-[rgba(249,115,22,0.3)]",
  disponibile: "bg-[rgba(6,182,212,0.15)] text-[#22D3EE] border-[rgba(6,182,212,0.3)]",
  affittato: "bg-[rgba(132,204,22,0.15)] text-[#A3E635] border-[rgba(132,204,22,0.3)]",
  sfitto: "bg-[rgba(239,68,68,0.15)] text-[#F87171] border-[rgba(239,68,68,0.3)]",
  in_vendita: "bg-[rgba(14,165,233,0.15)] text-[#38BDF8] border-[rgba(14,165,233,0.3)]",
  venduto: "bg-[rgba(100,116,139,0.15)] text-[#94A3B8] border-[rgba(100,116,139,0.3)]",
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
    alta: "bg-[rgba(239,68,68,0.15)] text-[#F87171] border-[rgba(239,68,68,0.3)]",
    media: "bg-[rgba(245,158,11,0.15)] text-[#FBBF24] border-[rgba(245,158,11,0.3)]",
    bassa: "bg-[rgba(59,130,246,0.15)] text-[#60A5FA] border-[rgba(59,130,246,0.3)]",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${map[severity]}`}>{severity.toUpperCase()}</span>;
};
