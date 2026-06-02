import { useEffect, useState, useMemo } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { apiClient } from "../lib/auth";
import { formatEur } from "../lib/demoData";
import { toast } from "sonner";
import { Calendar, AlertTriangle, Receipt, Loader2, ChevronRight, Settings as SettingsIcon } from "lucide-react";
import { Link } from "react-router-dom";

const TIPO_COLORS = {
  "IMU": { bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
  "TARI": { bg: "#FEE2E2", color: "#991B1B", border: "#FECACA" },
  "IRES/IRAP": { bg: "#DBEAFE", color: "#1E3A8A", border: "#BFDBFE" },
  "IVA": { bg: "#E0F2FE", color: "#075985", border: "#BAE6FD" },
  "Dichiarazione": { bg: "#FCE7F3", color: "#9D174D", border: "#FBCFE8" },
  "Cedolare": { bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
};

const STATO_LABEL = {
  scaduta: { label: "Scaduta", color: "#DC2626", bg: "#FEF2F2" },
  imminente: { label: "Imminente", color: "#B45309", bg: "#FFFBEB" },
  in_arrivo: { label: "In arrivo", color: "#2563EB", bg: "#EFF6FF" },
  futura: { label: "Futura", color: "#64748B", bg: "#F8FAFC" },
};

const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export default function Scadenzario() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiClient().get(`/tax-calendar/annuale?anno=${anno}`);
      setData(r.data);
    } catch { toast.error("Errore caricamento"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [anno]); // eslint-disable-line

  const byMonth = useMemo(() => {
    if (!data?.scadenze) return {};
    const m = {};
    data.scadenze.forEach(s => {
      const mese = parseInt(s.data.slice(5, 7));
      m[mese] = m[mese] || [];
      m[mese].push(s);
    });
    return m;
  }, [data]);

  const imminenti = data?.imminenti_30gg || [];
  const scadute = data?.scadute_non_pagate || [];

  return (
    <Layout
      title="Scadenzario Fiscale"
      subtitle={loading ? "Caricamento…" : `${data?.scadenze?.length || 0} scadenze ${anno} · Regime ${data?.tipo_societa?.toUpperCase()}`}
      actions={
        <div className="flex items-center gap-2">
          <select value={anno} onChange={(e) => setAnno(parseInt(e.target.value))} className="px-3 py-2 rounded-lg bg-white border border-[#E2E8F0] text-sm">
            {[anno-1, anno, anno+1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Link to="/impostazioni" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#475569] hover:bg-[#F8FAFC]" title="Modifica aliquote IMU, TARI, IRES, IRAP">
            <SettingsIcon size={14}/> Aliquote
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="sc-kpi-imu">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[#64748B]"><Receipt size={12}/> IMU stimata {anno}</div>
          <div className="font-display text-2xl font-bold tabular mt-1">{formatEur(data?.imu_totale_anno || 0)}</div>
          <div className="text-[11px] text-[#64748B]">Acconto 16 giu · Saldo 16 dic</div>
        </SectionCard>
        <SectionCard testId="sc-kpi-tari">
          <div className="text-[10px] uppercase text-[#64748B]">TARI stimata {anno}</div>
          <div className="font-display text-2xl font-bold tabular mt-1">{formatEur(data?.tari_totale_anno || 0)}</div>
          <div className="text-[11px] text-[#64748B]">2 rate annuali</div>
        </SectionCard>
        <SectionCard testId="sc-kpi-imminenti">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[#64748B]"><AlertTriangle size={12}/> Imminenti (30 gg)</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#B45309]">{imminenti.length}</div>
        </SectionCard>
        <SectionCard testId="sc-kpi-scadute">
          <div className="text-[10px] uppercase text-[#64748B]">Scadute non pagate</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#DC2626]">{scadute.length}</div>
        </SectionCard>
      </div>

      {imminenti.length > 0 && (
        <SectionCard
          title="⚠ Scadenze nei prossimi 30 giorni"
          subtitle="Da preparare con il commercialista"
          testId="sc-imminenti"
          className="mb-4"
        >
          <div className="space-y-2">
            {imminenti.map(s => (
              <ScadenzaRow key={s.id} s={s} expanded={expanded === s.id} onToggle={() => setExpanded(expanded === s.id ? null : s.id)} />
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title={`Calendario fiscale ${anno}`} subtitle="Vista mese per mese — clicca una scadenza per il dettaglio" testId="sc-calendario">
        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 size={24} className="animate-spin text-[#0066FF]"/></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
              <div key={m} className={`rounded-lg border ${byMonth[m] ? "border-[#E2E8F0] bg-[#F8FAFC]" : "border-[#F1F5F9] bg-white"} p-3`}>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={14} className="text-[#475569]"/>
                  <span className="text-sm font-semibold text-[#0F172A]">{MESI[m-1]}</span>
                  {byMonth[m] && <span className="text-[10px] text-[#64748B]">· {byMonth[m].length} scadenze</span>}
                </div>
                {byMonth[m] ? (
                  <div className="space-y-1.5">
                    {byMonth[m].map(s => (
                      <ScadenzaRow key={s.id} s={s} compact expanded={expanded === s.id} onToggle={() => setExpanded(expanded === s.id ? null : s.id)} />
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[#94A3B8] italic">Nessuna scadenza</div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </Layout>
  );
}

function ScadenzaRow({ s, compact, expanded, onToggle }) {
  const tipoStyle = TIPO_COLORS[s.tipo] || { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" };
  const statoStyle = STATO_LABEL[s.stato] || STATO_LABEL.futura;
  const dataF = new Date(s.data).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
      <button onClick={onToggle} className="w-full p-2.5 flex items-center gap-2 hover:bg-[#F8FAFC] transition-colors text-left" data-testid={`sc-row-${s.id}`}>
        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold" style={{ background: tipoStyle.bg, color: tipoStyle.color, border: `1px solid ${tipoStyle.border}` }}>{s.tipo}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium text-[#0F172A] truncate ${compact ? "text-xs" : ""}`}>{s.descrizione}</div>
          <div className="text-[11px] text-[#64748B]">
            {dataF} · <span style={{ color: statoStyle.color }}>{statoStyle.label}</span>
            {s.importo != null && <> · <strong className="text-[#0F172A]">{formatEur(s.importo)}</strong></>}
          </div>
        </div>
        {(s.dettaglio || s.codice_tributo || s.note) && <ChevronRight size={14} className={`text-[#64748B] transition-transform ${expanded ? "rotate-90" : ""}`}/>}
      </button>
      {expanded && (
        <div className="px-3 py-2.5 bg-[#F8FAFC] border-t border-[#E2E8F0] text-xs space-y-1">
          {s.codice_tributo && <div><strong className="text-[#475569]">Codice tributo F24:</strong> <span className="font-mono">{s.codice_tributo}</span></div>}
          {s.note && <div className="text-[#475569]">{s.note}</div>}
          {s.dettaglio && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[#2563EB] hover:underline">Dettaglio per immobile</summary>
              <div className="mt-2 space-y-1">
                {s.dettaglio.map(d => (
                  <div key={d.id} className="flex justify-between text-[11px] py-1 border-b border-[#E2E8F0] last:border-0">
                    <span className="text-[#475569]">{d.nome} ({d.categoria})</span>
                    <span className="tabular text-[#0F172A]">{formatEur(d.acconto)} / {formatEur(d.saldo)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
