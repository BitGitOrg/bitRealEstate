import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { HelpCircle, X } from "lucide-react";

// Mapping path → sezione del manuale
const PATH_TO_SECTION = [
  { match: /^\/manuale/, section: null }, // niente bottone nel manuale stesso
  { match: /^\/login/, section: null },
  { match: /^\/(dashboard)?$/, section: "dashboard" },
  { match: /^\/patrimonio/, section: "patrimonio" },
  { match: /^\/immobile\//, section: "scheda" },
  { match: /^\/affitti/, section: "affitti" },
  { match: /^\/costi-ricavi/, section: "costi-ricavi" },
  { match: /^\/documenti/, section: "documenti" },
  { match: /^\/import/, section: "import" },
  { match: /^\/alert-center/, section: "alert" },
  { match: /^\/forecast/, section: "forecast" },
  { match: /^\/mappa/, section: "mappa" },
  { match: /^\/kpi/, section: "kpi" },
];

const SECTION_LABELS = {
  dashboard: "1. Dashboard",
  patrimonio: "2. Patrimonio",
  scheda: "3. Scheda Immobile",
  affitti: "4. Affitti & Locazioni",
  "costi-ricavi": "5. Costi & Ricavi",
  documenti: "6. Documenti + AI Reader",
  import: "7. Centro Import",
  alert: "8. AI Alert Center",
  forecast: "9. Forecast & Piano AI",
  mappa: "10. Mappa Patrimonio",
  kpi: "11. KPI & Rendimenti",
};

export function HelpButton() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [hover, setHover] = useState(false);

  const match = PATH_TO_SECTION.find((r) => r.match.test(loc.pathname));
  const section = match?.section;
  if (section === null || section === undefined) return null;
  const label = SECTION_LABELS[section] || "Manuale";

  const go = () => navigate(`/manuale?s=${section}`);

  return (
    <button
      data-testid="help-button"
      onClick={go}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="fixed bottom-20 right-6 z-40 flex items-center gap-2 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-full shadow-lg transition-all"
      style={{ padding: hover ? "12px 16px" : "12px", maxWidth: hover ? "320px" : "48px", overflow: "hidden" }}
      title={`Aiuto · ${label}`}
    >
      <HelpCircle size={20} className="shrink-0" />
      {hover && (
        <span className="whitespace-nowrap text-sm font-medium">
          Aiuto · <span className="text-[#94A3B8]">{label}</span>
        </span>
      )}
    </button>
  );
}
