import { useState, useEffect } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { contratti as demoContratti, incassi as demoIncassi, properties as demoProps, formatEur } from "../lib/demoData";
import { apiClient } from "../lib/auth";
import { toast } from "sonner";
import { CheckCircle2, Clock, AlertCircle, XCircle, RefreshCw, Loader2, Edit2, Calendar } from "lucide-react";

const STATO_INCASSO = {
  pagato: { label: "Pagato", icon: CheckCircle2, color: "#059669", bg: "#D1FAE5" },
  parzialmente_pagato: { label: "Parziale", icon: AlertCircle, color: "#B45309", bg: "#FEF3C7" },
  previsto: { label: "Previsto", icon: Clock, color: "#475569", bg: "#F1F5F9" },
  in_ritardo: { label: "In ritardo", icon: Clock, color: "#B45309", bg: "#FEF3C7" },
  non_pagato: { label: "Non pagato", icon: XCircle, color: "#DC2626", bg: "#FEE2E2" },
};

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export default function Affitti() {
  const [realProps, setRealProps] = useState([]);
  const [realIncassi, setRealIncassi] = useState([]);
  const [stats, setStats] = useState(null);
  const [reconciling, setReconciling] = useState(false);
  const [markPaidModal, setMarkPaidModal] = useState(null);

  const load = async () => {
    try {
      const [props, inc, st] = await Promise.all([
        apiClient().get("/properties"),
        apiClient().get("/incassi"),
        apiClient().get("/incassi/stats"),
      ]);
      setRealProps(props.data || []);
      setRealIncassi(inc.data || []);
      setStats(st.data);
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const reconcile = async () => {
    setReconciling(true);
    try {
      const r = await apiClient().post("/incassi/reconcile");
      const m = r.data.matched || 0;
      toast.success(m > 0 ? `${m} incassi abbinati ai movimenti bancari` : "Nessun nuovo abbinamento trovato. Importa l'estratto conto dal Centro Import.");
      load();
    } catch {
      toast.error("Errore riconciliazione");
    } finally {
      setReconciling(false);
    }
  };

  const useReal = realIncassi.length > 0;
  const props = useReal ? realProps : demoProps;
  const incassi = useReal ? realIncassi : demoIncassi;

  // KPI calcolo
  const propsReddito = props.filter(p => p.operazione === "reddito" || !p.operazione);
  const affittati = propsReddito.filter(p => p.stato === "affittato" || p.canone_mensile > 0);
  const totMensile = affittati.reduce((s, p) => s + (p.canone_mensile || 0), 0);
  const occupazione = propsReddito.length ? Math.round(affittati.length / propsReddito.length * 100) : 0;

  // Mesi unici per raggruppare
  const monthGroups = {};
  incassi.forEach(i => {
    const key = useReal ? `${i.anno}-${String(i.mese).padStart(2, "0")}` : (i.mese || "Feb 2026");
    const label = useReal ? `${MESI[i.mese - 1]} ${i.anno}` : (i.mese || "");
    if (!monthGroups[key]) monthGroups[key] = { label, items: [] };
    monthGroups[key].items.push(i);
  });
  const sortedMonthKeys = Object.keys(monthGroups).sort().reverse();

  // Morosi = solo incassi del passato/corrente non pagati (non i previsti futuri)
  const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const morosi = incassi.filter(i => {
    const key = useReal ? `${i.anno}-${String(i.mese).padStart(2, "0")}` : todayKey;
    if (key > todayKey) return false; // mesi futuri ignorati
    return i.stato === "in_ritardo" || i.stato === "non_pagato" || i.stato === "parzialmente_pagato";
  }).length;

  return (
    <Layout
      title="Affitti & Locazioni"
      subtitle={`${affittati.length} contratti attivi · Tasso occupazione ${occupazione}%${useReal ? " · dati live" : " · demo"}`}
      actions={useReal && (
        <button
          data-testid="reconcile-btn"
          onClick={reconcile}
          disabled={reconciling}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {reconciling ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {reconciling ? "Riconciliazione…" : "Riconcilia con banca"}
        </button>
      )}
    >
      {markPaidModal && (
        <MarkPaidModal incasso={markPaidModal} onClose={() => setMarkPaidModal(null)} onSaved={load} />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="affitti-kpi-canone">
          <div className="text-[10px] uppercase text-[#64748B] tracking-wider">Canone mensile atteso</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{formatEur(totMensile)}</div>
        </SectionCard>
        <SectionCard testId="affitti-kpi-incassato">
          <div className="text-[10px] uppercase text-[#64748B] tracking-wider">Incassato {stats?.current_month || "mese"}</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#059669]">{formatEur(stats?.paid_eur || 0)}</div>
          {stats && (
            <div className="text-[11px] text-[#475569] mt-0.5">{stats.paid_count}/{stats.expected_count} pagamenti · {stats.completion_pct}%</div>
          )}
        </SectionCard>
        <SectionCard testId="affitti-kpi-occupazione">
          <div className="text-[10px] uppercase text-[#64748B] tracking-wider">Tasso occupazione</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{occupazione}%</div>
        </SectionCard>
        <SectionCard testId="affitti-kpi-morosita">
          <div className="text-[10px] uppercase text-[#64748B] tracking-wider">Morosità</div>
          <div className={`font-display text-3xl font-bold tabular mt-1 ${morosi > 0 ? "text-[#DC2626]" : "text-[#0F172A]"}`}>{morosi}</div>
          <div className="text-xs text-[#475569] mt-0.5">incass{morosi === 1 ? "o" : "i"} non a posto</div>
        </SectionCard>
      </div>

      {/* Contratti */}
      <SectionCard title="Contratti di locazione" testId="affitti-contratti" className="mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
              <th className="py-2">Immobile</th>
              <th className="py-2">Conduttore</th>
              <th className="py-2">Periodo</th>
              <th className="py-2 text-right">Canone</th>
              <th className="py-2 text-right">Deposito</th>
              <th className="py-2">Stato</th>
            </tr>
          </thead>
          <tbody>
            {affittati.map(p => (
              <tr key={p.id} className="border-b border-[#E2E8F0] last:border-0">
                <td className="py-3">{p.nome}</td>
                <td className="py-3">{p.inquilino || "—"}</td>
                <td className="py-3 text-xs text-[#475569]">
                  {p.data_inizio_contratto || "—"} → {p.scadenza_contratto || "—"}
                </td>
                <td className="py-3 text-right tabular font-medium">{formatEur(p.canone_mensile)}</td>
                <td className="py-3 text-right tabular text-[#475569]">{formatEur(p.deposito_cauzionale || 0)}</td>
                <td className="py-3">
                  <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[#D1FAE5] text-[#059669]">
                    <CheckCircle2 size={11} /> Attivo
                  </span>
                </td>
              </tr>
            ))}
            {affittati.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-sm text-[#475569]">Nessun contratto attivo.</td></tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      {/* Incassi per mese */}
      {sortedMonthKeys.length === 0 ? (
        <SectionCard title="Incassi" subtitle="Nessun incasso previsto">
          <div className="py-6 text-center text-sm text-[#475569]">
            Salva il contratto di locazione di un immobile per generare automaticamente gli incassi previsti.
          </div>
        </SectionCard>
      ) : (
        sortedMonthKeys.slice(0, 4).map(key => {
          const grp = monthGroups[key];
          const items = grp.items;
          const tot_prev = items.reduce((s, i) => s + (i.previsto || 0), 0);
          const tot_inc = items.reduce((s, i) => s + (i.incassato || 0), 0);
          return (
            <SectionCard key={key} title={`Incassi ${grp.label}`} subtitle={`${items.length} previsti · ${formatEur(tot_inc)} / ${formatEur(tot_prev)}`} className="mb-3" testId={`incassi-${key}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                    <th className="py-2">Immobile</th>
                    <th className="py-2 text-right">Previsto</th>
                    <th className="py-2 text-right">Incassato</th>
                    <th className="py-2">Data</th>
                    <th className="py-2">Stato</th>
                    {useReal && <th className="py-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map(i => {
                    const meta = STATO_INCASSO[i.stato] || STATO_INCASSO.previsto;
                    const Icon = meta.icon;
                    const p = props.find(x => x.id === i.immobile_id);
                    return (
                      <tr key={i.id || i.contratto_id} className="border-b border-[#E2E8F0] last:border-0">
                        <td className="py-3">{p?.nome || i.immobile_id || i.contratto_id}</td>
                        <td className="py-3 text-right tabular">{formatEur(i.previsto)}</td>
                        <td className="py-3 text-right tabular font-medium" style={{ color: i.incassato > 0 ? "#059669" : "#94A3B8" }}>{formatEur(i.incassato)}</td>
                        <td className="py-3 text-[#475569] text-xs">{i.data_incasso || i.data || "—"}</td>
                        <td className="py-3">
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: meta.bg, color: meta.color }}>
                            <Icon size={11} /> {meta.label}
                          </span>
                        </td>
                        {useReal && (
                          <td className="py-3 text-right">
                            {i.stato !== "pagato" && (
                              <button onClick={() => setMarkPaidModal(i)} className="text-[11px] text-[#0066FF] hover:underline inline-flex items-center gap-1">
                                <Edit2 size={10} /> Segna pagato
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </SectionCard>
          );
        })
      )}
    </Layout>
  );
}

function MarkPaidModal({ incasso, onClose, onSaved }) {
  const [incassato, setIncassato] = useState(incasso.previsto);
  const [dataInc, setDataInc] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await apiClient().post(`/incassi/${incasso.id}/mark-paid`, {
        incassato: parseFloat(incassato), data_incasso: dataInc,
      });
      toast.success("Incasso registrato");
      onSaved(); onClose();
    } catch {
      toast.error("Errore");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <div className="text-sm font-semibold text-[#0F172A]">Segna come pagato</div>
          <div className="text-xs text-[#64748B]">{incasso.mese_label} · {incasso.immobile_id} · Previsto €{incasso.previsto}</div>
        </div>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Importo incassato (€)</span>
            <input data-testid="markpaid-importo" type="number" value={incassato} onChange={(e) => setIncassato(e.target.value)} step="0.01"
              className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2 text-sm outline-none focus:border-[#0066FF]" />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Data incasso</span>
            <input type="date" value={dataInc} onChange={(e) => setDataInc(e.target.value)}
              className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2 text-sm outline-none focus:border-[#0066FF]" />
          </label>
        </div>
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-sm text-[#475569]">Annulla</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-semibold">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Calendar size={12} />}
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}
