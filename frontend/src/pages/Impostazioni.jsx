import { useEffect, useRef, useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { useAuth } from "../lib/auth";
import { Save, Building2, Target, Sparkles, Shield, Image as ImageIcon, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Field = ({ label, value, onChange, type = "text", suffix }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">{label}</span>
    <div className="mt-1.5 flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg overflow-hidden focus-within:border-[#0066FF] transition-colors">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent px-3 py-2 outline-none text-sm"
      />
      {suffix && <span className="px-3 text-xs text-[#64748B]">{suffix}</span>}
    </div>
  </label>
);

export default function Impostazioni() {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Settings state — populated from backend
  const [nomeSocieta, setNomeSocieta] = useState("");
  const [valuta, setValuta] = useState("EUR");
  const [targetNetto, setTargetNetto] = useState(5);
  const [targetRoi, setTargetRoi] = useState(8);
  const [cashFlowMin, setCashFlowMin] = useState(0);
  const [propensione, setPropensione] = useState("media");
  const [strategia, setStrategia] = useState("mista");
  const [capitale, setCapitale] = useState(250000);
  const [limiteIndebitamento, setLimiteIndebitamento] = useState(60);
  const [logoBase64, setLogoBase64] = useState(null);
  const [logoMime, setLogoMime] = useState(null);
  const [liquiditaIniziale, setLiquiditaIniziale] = useState(35000);

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("crr_token")}` });

  // Load settings on mount
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/settings`, { headers: authHeaders() });
        if (r.ok) {
          const s = await r.json();
          setNomeSocieta(s.nome_societa || "");
          setValuta(s.valuta || "EUR");
          setTargetNetto(s.target_netto ?? 5);
          setTargetRoi(s.target_roi ?? 8);
          setCashFlowMin(s.cash_flow_min ?? 0);
          setPropensione(s.propensione || "media");
          setStrategia(s.strategia || "mista");
          setCapitale(s.capitale_disponibile ?? 250000);
          setLimiteIndebitamento(s.limite_indebitamento ?? 60);
          setLogoBase64(s.logo_base64 || null);
          setLogoMime(s.logo_mime || null);
          setLiquiditaIniziale(s.liquidita_iniziale ?? 35000);
        }
      } catch {
        toast.error("Impossibile caricare le impostazioni");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        nome_societa: nomeSocieta,
        valuta,
        target_netto: parseFloat(targetNetto) || 0,
        target_roi: parseFloat(targetRoi) || 0,
        cash_flow_min: parseFloat(cashFlowMin) || 0,
        propensione,
        strategia,
        capitale_disponibile: parseFloat(capitale) || 0,
        limite_indebitamento: parseFloat(limiteIndebitamento) || 0,
        liquidita_iniziale: parseFloat(liquiditaIniziale) || 0,
      };
      const r = await fetch(`${API_BASE}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("save failed");
      toast.success("Impostazioni salvate");
    } catch {
      toast.error("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Carica un'immagine (PNG, JPG, SVG)");
      return;
    }
    if (f.size > 1_048_576) {
      toast.error("Logo troppo grande (max 1 MB)");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch(`${API_BASE}/settings/logo`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: "errore" }));
        throw new Error(err.detail || "upload failed");
      }
      // re-fetch settings to display logo
      const s = await (await fetch(`${API_BASE}/settings`, { headers: authHeaders() })).json();
      setLogoBase64(s.logo_base64);
      setLogoMime(s.logo_mime);
      toast.success("Logo caricato — verrà mostrato nei report PDF");
    } catch (err) {
      toast.error(err.message || "Errore upload logo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeLogo = async () => {
    try {
      const r = await fetch(`${API_BASE}/settings/logo`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error("delete failed");
      setLogoBase64(null);
      setLogoMime(null);
      toast.success("Logo rimosso");
    } catch {
      toast.error("Errore rimozione logo");
    }
  };

  const logoSrc = logoBase64 && logoMime ? `data:${logoMime};base64,${logoBase64}` : null;

  return (
    <Layout
      title="Impostazioni"
      subtitle="Parametri società, AI e branding dei report"
      actions={
        <button
          data-testid="settings-save"
          onClick={save}
          disabled={saving || loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          <Save size={14} /> {saving ? "Salvataggio…" : "Salva modifiche"}
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <SectionCard testId="settings-azienda" title="Anagrafica società" action={<Building2 size={16} className="text-[#2563EB]" />}>
          <div className="space-y-3">
            <Field label="Nome società" value={nomeSocieta} onChange={setNomeSocieta} />
            <Field label="Valuta" value={valuta} onChange={setValuta} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Soglia rendimento minimo" value={targetNetto} onChange={(v) => setTargetNetto(parseFloat(v) || 0)} type="number" suffix="%" />
              <Field label="Cash flow minimo / mese" value={cashFlowMin} onChange={(v) => setCashFlowMin(parseFloat(v) || 0)} type="number" suffix="€" />
            </div>
          </div>
        </SectionCard>

        <SectionCard testId="settings-target" title="Target di portafoglio" action={<Target size={16} className="text-[#059669]" />}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target rendimento netto" value={targetNetto} onChange={(v) => setTargetNetto(parseFloat(v) || 0)} type="number" suffix="%" />
              <Field label="Target ROI" value={targetRoi} onChange={(v) => setTargetRoi(parseFloat(v) || 0)} type="number" suffix="%" />
            </div>
            <Field label="Capitale disponibile" value={capitale} onChange={(v) => setCapitale(parseFloat(v) || 0)} type="number" suffix="€" />
            <Field label="Limite indebitamento (LTV)" value={limiteIndebitamento} onChange={(v) => setLimiteIndebitamento(parseFloat(v) || 0)} type="number" suffix="%" />
            <div className="pt-2 border-t border-[#E2E8F0]">
              <Field label="Liquidità di partenza (cash a inizio anno)" value={liquiditaIniziale} onChange={(v) => setLiquiditaIniziale(parseFloat(v) || 0)} type="number" suffix="€" />
              <div className="mt-1 text-[10px] text-[#64748B] leading-relaxed">
                Cassa di partenza prima dei movimenti bancari importati. La <strong>liquidità in Dashboard</strong> è calcolata come: liquidità iniziale + saldo movimenti banca (o sovrascritta dal bilancio se importato).
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Logo società */}
      <SectionCard
        testId="settings-logo"
        title="Logo società"
        subtitle="Verrà mostrato nell'header di tutti i report PDF (Stato di salute + Business Plan)"
        action={<ImageIcon size={16} className="text-[#0066FF]" />}
        className="mb-4"
      >
        <div className="flex items-center gap-4 flex-wrap">
          <div
            data-testid="logo-preview"
            className="w-32 h-24 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-center overflow-hidden"
          >
            {logoSrc ? (
              <img src={logoSrc} alt="Logo società" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-xs text-[#94A3B8]">Nessun logo</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={uploadLogo}
              className="hidden"
              data-testid="logo-file-input"
            />
            <button
              data-testid="logo-upload-btn"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              <Upload size={14} /> {uploading ? "Carico…" : logoSrc ? "Sostituisci logo" : "Carica logo"}
            </button>
            {logoSrc && (
              <button
                data-testid="logo-remove-btn"
                onClick={removeLogo}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#E2E8F0] text-[#DC2626] hover:bg-[#FEF2F2] text-sm font-medium transition-colors"
              >
                <Trash2 size={14} /> Rimuovi
              </button>
            )}
            <span className="text-xs text-[#64748B]">PNG / JPG / SVG · max 1 MB · meglio se sfondo trasparente</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard testId="settings-ai" title="Parametri AI Autopilot" subtitle="Personalizza il comportamento dell'assistente strategico" action={<Sparkles size={16} className="text-[#2563EB]" />} className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Propensione al rischio</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { v: "bassa", l: "Conservativa", c: "#059669" },
                { v: "media", l: "Bilanciata", c: "#2563EB" },
                { v: "alta", l: "Aggressiva", c: "#B45309" },
              ].map((o) => (
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
              ].map((o) => (
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

      <SectionCard testId="settings-user" title="Account & ruoli" action={<Shield size={16} className="text-[#B45309]" />}>
        <div className="flex items-center gap-4 p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0066FF] to-[#10B981] flex items-center justify-center text-white font-display font-bold">
            {user?.name?.charAt(0)}
          </div>
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
