import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { useAuth } from "../lib/auth";
import { Save, Building2, Target, Sparkles, Shield, Image as ImageIcon, Upload, Trash2, Receipt, Wrench, MessageCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import EmailInboxConfig from "../components/EmailInboxConfig";
import WhatsAppConfig from "../components/WhatsAppConfig";

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

export default function Impostazioni({ embedded = false }) {
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
  // Solleciti automatici
  const [sollAutoEnabled, setSollAutoEnabled] = useState(true);
  const [sollGgCortese, setSollGgCortese] = useState(5);
  const [sollGgFermo, setSollGgFermo] = useState(15);
  const [sollGgLegale, setSollGgLegale] = useState(30);
  // Fiscale & costi gestione default
  const [tipoSocieta, setTipoSocieta] = useState("srl");
  const [regimeAffitti, setRegimeAffitti] = useState("ordinario");
  const [aliquotaIres, setAliquotaIres] = useState(24);
  const [aliquotaIrap, setAliquotaIrap] = useState(3.9);
  const [aliquotaPlusvalenza, setAliquotaPlusvalenza] = useState(26);
  const [imuMedia, setImuMedia] = useState(800);
  const [assicurazioneMedia, setAssicurazioneMedia] = useState(200);
  const [manutenzionePctDefault, setManutenzionePctDefault] = useState(3);
  const [sfittanzaPctDefault, setSfittanzaPctDefault] = useState(4);

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
          setSollAutoEnabled(s.sollecito_auto_enabled ?? true);
          setSollGgCortese(s.sollecito_giorni_cortese ?? 5);
          setSollGgFermo(s.sollecito_giorni_fermo ?? 15);
          setSollGgLegale(s.sollecito_giorni_legale ?? 30);
          setTipoSocieta(s.tipo_societa || "srl");
          setRegimeAffitti(s.regime_affitti || "ordinario");
          setAliquotaIres(s.aliquota_ires ?? 24);
          setAliquotaIrap(s.aliquota_irap ?? 3.9);
          setAliquotaPlusvalenza(s.aliquota_plusvalenza ?? 26);
          setImuMedia(s.imu_media_per_immobile ?? 800);
          setAssicurazioneMedia(s.assicurazione_media_per_immobile ?? 200);
          setManutenzionePctDefault(s.manutenzione_pct_default ?? 3);
          setSfittanzaPctDefault(s.sfittanza_pct_default ?? 4);
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
        sollecito_auto_enabled: !!sollAutoEnabled,
        sollecito_giorni_cortese: parseInt(sollGgCortese) || 5,
        sollecito_giorni_fermo: parseInt(sollGgFermo) || 15,
        sollecito_giorni_legale: parseInt(sollGgLegale) || 30,
        tipo_societa: tipoSocieta,
        regime_affitti: regimeAffitti,
        aliquota_ires: parseFloat(aliquotaIres) || 0,
        aliquota_irap: parseFloat(aliquotaIrap) || 0,
        aliquota_plusvalenza: parseFloat(aliquotaPlusvalenza) || 0,
        imu_media_per_immobile: parseFloat(imuMedia) || 0,
        assicurazione_media_per_immobile: parseFloat(assicurazioneMedia) || 0,
        manutenzione_pct_default: parseFloat(manutenzionePctDefault) || 0,
        sfittanza_pct_default: parseFloat(sfittanzaPctDefault) || 0,
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

  const saveBtn = (
    <button
      data-testid="settings-save"
      onClick={save}
      disabled={saving || loading}
      className="inline-flex items-center gap-2 px-4 py-2 bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white text-sm font-medium transition-colors"
    >
      <Save size={14} /> {saving ? "Salvataggio…" : "Salva modifiche"}
    </button>
  );

  const content = (
    <>
      {embedded && <div className="flex justify-end mb-3">{saveBtn}</div>}
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

      {/* Solleciti automatici */}
      <SectionCard
        testId="settings-solleciti"
        title="Solleciti automatici"
        subtitle="Quando un affitto è in ritardo, il sistema crea automaticamente la notifica con il tono corretto"
        action={<MessageCircle size={16} className="text-[#059669]" />}
        className="mb-4"
      >
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={sollAutoEnabled}
            onChange={(e) => setSollAutoEnabled(e.target.checked)}
            data-testid="sollecito-auto-toggle"
            className="w-4 h-4 rounded border-[#CBD5E1] text-[#0066FF] focus:ring-[#0066FF]"
          />
          <span className="text-sm text-[#0F172A]">Attiva il rilevamento automatico</span>
        </label>
        {sollAutoEnabled && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Sollecito CORTESE dopo (gg)" value={sollGgCortese} onChange={(v) => setSollGgCortese(parseInt(v) || 5)} type="number" suffix="gg" />
              <Field label="Sollecito FERMO dopo (gg)" value={sollGgFermo} onChange={(v) => setSollGgFermo(parseInt(v) || 15)} type="number" suffix="gg" />
              <Field label="Diffida LEGALE dopo (gg)" value={sollGgLegale} onChange={(v) => setSollGgLegale(parseInt(v) || 30)} type="number" suffix="gg" />
            </div>
            <div className="mt-3 text-[11px] text-[#475569] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 leading-relaxed">
              Il sistema controlla gli incassi non pagati ad ogni apertura dell'app. Quando un inquilino è in ritardo di <strong className="tabular">{sollGgCortese}/{sollGgFermo}/{sollGgLegale}</strong> giorni, riceverai una notifica nella campanella e nella pagina <Link to="/notifiche" className="text-[#0066FF] underline">Solleciti & Notifiche</Link> con il testo AI già pronto. <strong className="text-[#0F172A]">Non viene mai inviato nulla senza la tua conferma.</strong>
            </div>
          </>
        )}
      </SectionCard>

      {/* Regime fiscale */}
      <SectionCard
        testId="settings-fiscale"
        title="Regime fiscale società"
        subtitle="Parametri usati da Simulatore, KPI rendimento netto e Forecast cash flow"
        action={<Receipt size={16} className="text-[#7C3AED]" />}
        className="mb-4"
      >
        <div className="space-y-4">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Tipo soggetto</span>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { v: "privato", l: "Privato" },
                { v: "srl", l: "SRL" },
                { v: "spa", l: "SpA" },
                { v: "holding", l: "Holding immobiliare" },
              ].map((o) => (
                <button
                  key={o.v}
                  data-testid={`tipo-societa-${o.v}`}
                  onClick={() => setTipoSocieta(o.v)}
                  className={`px-3 py-2.5 rounded-lg text-sm border transition-colors ${tipoSocieta === o.v ? "border-[#7C3AED] bg-[rgba(124,58,237,0.1)] text-[#7C3AED] font-medium" : "border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1]"}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {tipoSocieta === "privato" ? (
            <>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Regime imposte affitti</span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[
                    { v: "cedolare_21", l: "Cedolare 21%" },
                    { v: "cedolare_10", l: "Cedolare 10% (canone concordato)" },
                    { v: "ordinario", l: "IRPEF ordinario" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      data-testid={`regime-${o.v}`}
                      onClick={() => setRegimeAffitti(o.v)}
                      className={`px-2 py-2 rounded-lg text-xs border transition-colors ${regimeAffitti === o.v ? "border-[#0066FF] bg-[rgba(0,102,255,0.1)] text-[#2563EB] font-medium" : "border-[#E2E8F0] text-[#475569]"}`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-[11px] text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 leading-relaxed">
                <strong className="text-[#0F172A]">Privato:</strong> tassazione su affitti applicata sul lordo (cedolare) o sul netto contabile (IRPEF). La plusvalenza è esente se la vendita avviene dopo {/* eslint-disable-line */} 5 anni dall'acquisto.
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Aliquota IRES" value={aliquotaIres} onChange={(v) => setAliquotaIres(parseFloat(v) || 0)} type="number" suffix="%" />
                <Field label="Aliquota IRAP" value={aliquotaIrap} onChange={(v) => setAliquotaIrap(parseFloat(v) || 0)} type="number" suffix="%" />
              </div>
              <div className="text-[11px] text-[#64748B] bg-[rgba(124,58,237,0.06)] border border-[rgba(124,58,237,0.2)] rounded-lg p-3 leading-relaxed">
                <strong className="text-[#0F172A]">{tipoSocieta.toUpperCase()}:</strong> sugli affitti si applica <strong className="tabular">IRES {aliquotaIres}% + IRAP {aliquotaIrap}%</strong> sul reddito netto contabile, per un'aliquota effettiva ≈ <strong className="tabular text-[#7C3AED]">{(parseFloat(aliquotaIres) + parseFloat(aliquotaIrap)).toFixed(1)}%</strong>. La cedolare secca <em>non si applica</em> alle società di capitali.
              </div>
            </>
          )}

          <div className="pt-3 border-t border-[#E2E8F0] grid grid-cols-2 gap-3">
            <Field label="Aliquota plusvalenza (vendita)" value={aliquotaPlusvalenza} onChange={(v) => setAliquotaPlusvalenza(parseFloat(v) || 0)} type="number" suffix="%" />
            <div />
          </div>
        </div>
      </SectionCard>

      {/* Costi gestione default */}
      <SectionCard
        testId="settings-costi-default"
        title="Costi gestione default per immobile"
        subtitle="Stime medie usate dal Simulatore quando crei una nuova operazione (personalizzabili per ogni deal)"
        action={<Wrench size={16} className="text-[#059669]" />}
        className="mb-4"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="IMU media / anno" value={imuMedia} onChange={(v) => setImuMedia(parseFloat(v) || 0)} type="number" suffix="€" />
          <Field label="Assicurazione media / anno" value={assicurazioneMedia} onChange={(v) => setAssicurazioneMedia(parseFloat(v) || 0)} type="number" suffix="€" />
          <Field label="Riserva manutenzione" value={manutenzionePctDefault} onChange={(v) => setManutenzionePctDefault(parseFloat(v) || 0)} type="number" suffix="%" />
          <Field label="Rischio sfittanza" value={sfittanzaPctDefault} onChange={(v) => setSfittanzaPctDefault(parseFloat(v) || 0)} type="number" suffix="%" />
        </div>
        <div className="mt-3 text-[11px] text-[#64748B] leading-relaxed">
          Manutenzione e sfittanza sono espresse in <strong>% del canone</strong>: vengono accantonate mensilmente per coprire imprevisti e mesi sfitto/morosità.
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

      <SectionCard
        testId="settings-email-inbox"
        title="Casella email annunci immobiliari"
        subtitle="Configura una casella IMAP per ricevere gli alert dei portali (Immobiliare, Idealista, Casa.it…) e farli importare in Pipeline con AI Deal Score"
        action={<Mail size={16} className="text-[#0066FF]" />}
        className="mb-4"
      >
        <EmailInboxConfig />
      </SectionCard>

      <SectionCard
        testId="settings-whatsapp"
        title="WhatsApp Bot per Pipeline (Twilio)"
        subtitle="Crea o aggiorna deal in Pipeline inviando un messaggio WhatsApp. L'AI interpreta indirizzo, prezzo, stage e note."
        action={<MessageCircle size={16} className="text-[#059669]" />}
        className="mb-4"
      >
        <WhatsAppConfig />
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
    </>
  );

  if (embedded) return content;

  return (
    <Layout
      title="Impostazioni"
      subtitle="Parametri società, AI e branding dei report"
      actions={saveBtn}
    >
      {content}
    </Layout>
  );
}
