import { useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { useAuth } from "../lib/auth";
import { Save, Building2, Target, Sparkles, Shield } from "lucide-react";
import { toast } from "sonner";

const Field = ({ label, value, onChange, type = "text", suffix }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
    <div className="mt-1.5 flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg overflow-hidden focus-within:border-[#0066FF] transition-colors">
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 bg-transparent px-3 py-2 outline-none text-sm" />
      {suffix && <span className="px-3 text-xs text-[#64748B]">{suffix}</span>}
    </div>
  </label>
);

export default function Impostazioni() {
  const { user } = useAuth();
  const [nomeSocieta, setNomeSocieta] = useState("Control Room Real Estate SRL");
  const [valuta, setValuta] = useState("EUR");
  const [targetNetto, setTargetNetto] = useState(5);
  const [targetRoi, setTargetRoi] = useState(8);
  const [cashFlowMin, setCashFlowMin] = useState(0);
  const [propensione, setPropensione] = useState("media");
  const [strategia, setStrategia] = useState("mista");
  const [capitale, setCapitale] = useState(250000);
  const [limiteIndebitamento, setLimiteIndebitamento] = useState(60);

  const save = () => toast.success("Impostazioni salvate");

  return (
    <Layout title="Impostazioni" subtitle="Parametri società e configurazione AI"
      actions={
        <button data-testid="settings-save" onClick={save} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm font-medium transition-colors">
          <Save size={14} /> Salva modifiche
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <SectionCard testId="settings-azienda" title="Anagrafica società" action={<Building2 size={16} className="text-[#2563EB]"/>}>
          <div className="space-y-3">
            <Field label="Nome società" value={nomeSocieta} onChange={setNomeSocieta} />
            <Field label="Valuta" value={valuta} onChange={setValuta} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Soglia rendimento minimo" value={targetNetto} onChange={(v) => setTargetNetto(parseFloat(v) || 0)} type="number" suffix="%" />
              <Field label="Cash flow minimo / mese" value={cashFlowMin} onChange={(v) => setCashFlowMin(parseFloat(v) || 0)} type="number" suffix="€" />
            </div>
          </div>
        </SectionCard>

        <SectionCard testId="settings-target" title="Target di portafoglio" action={<Target size={16} className="text-[#059669]"/>}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target rendimento netto" value={targetNetto} onChange={(v) => setTargetNetto(parseFloat(v) || 0)} type="number" suffix="%" />
              <Field label="Target ROI" value={targetRoi} onChange={(v) => setTargetRoi(parseFloat(v) || 0)} type="number" suffix="%" />
            </div>
            <Field label="Capitale disponibile" value={capitale} onChange={(v) => setCapitale(parseFloat(v) || 0)} type="number" suffix="€" />
            <Field label="Limite indebitamento (LTV)" value={limiteIndebitamento} onChange={(v) => setLimiteIndebitamento(parseFloat(v) || 0)} type="number" suffix="%" />
          </div>
        </SectionCard>
      </div>

      <SectionCard testId="settings-ai" title="Parametri AI Autopilot" subtitle="Personalizza il comportamento dell'assistente strategico" action={<Sparkles size={16} className="text-[#2563EB]"/>} className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Propensione al rischio</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { v: "bassa", l: "Conservativa", c: "#059669" },
                { v: "media", l: "Bilanciata", c: "#2563EB" },
                { v: "alta", l: "Aggressiva", c: "#B45309" },
              ].map(o => (
                <button
                  key={o.v}
                  data-testid={`risk-${o.v}`}
                  onClick={() => setPropensione(o.v)}
                  className={`px-3 py-2.5 rounded-lg text-sm border transition-colors ${propensione === o.v ? "border-[#0066FF] bg-[rgba(0,102,255,0.1)] text-[#2563EB]" : "border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1]"}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Strategia preferita</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { v: "affitto", l: "Reddito" },
                { v: "vendita", l: "Rivendita" },
                { v: "mista", l: "Mista" },
              ].map(o => (
                <button
                  key={o.v}
                  data-testid={`strategy-${o.v}`}
                  onClick={() => setStrategia(o.v)}
                  className={`px-3 py-2.5 rounded-lg text-sm border transition-colors ${strategia === o.v ? "border-[#0066FF] bg-[rgba(0,102,255,0.1)] text-[#2563EB]" : "border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1]"}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard testId="settings-user" title="Account & ruoli" action={<Shield size={16} className="text-[#B45309]"/>}>
        <div className="flex items-center gap-4 p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0066FF] to-[#10B981] flex items-center justify-center text-white font-display font-bold">{user?.name?.charAt(0)}</div>
          <div>
            <div className="font-medium">{user?.name}</div>
            <div className="text-xs text-[#475569]">{user?.email}</div>
            <div className="text-[10px] uppercase tracking-wider mt-1 text-[#2563EB]">Ruolo: {user?.role}</div>
          </div>
        </div>
      </SectionCard>
    </Layout>
  );
}
