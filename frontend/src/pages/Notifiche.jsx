import { useEffect, useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { apiClient } from "../lib/auth";
import { formatEur } from "../lib/demoData";
import { toast } from "sonner";
import { Bell, Mail, MessageCircle, Loader2, Sparkles, CheckCircle2, Clock, Copy, History, Settings as SettingsIcon } from "lucide-react";
import { Link } from "react-router-dom";

const TONI = {
  cortese: { label: "Cortese", color: "#059669", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.3)" },
  fermo: { label: "Fermo", color: "#B45309", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.3)" },
  legale: { label: "Legale", color: "#DC2626", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.3)" },
};

export default function Notifiche() {
  const [solleciti, setSolleciti] = useState([]);
  const [storico, setStorico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([
        apiClient().get("/notifications/solleciti-da-inviare"),
        apiClient().get("/notifications/storico"),
      ]);
      setSolleciti(s.data || []);
      setStorico(h.data || []);
    } catch { toast.error("Errore caricamento"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const importoTotale = solleciti.reduce((sum, s) => sum + (s.importo || 0), 0);
  const ready = solleciti.filter(s => s.ready_to_send);
  const waiting = solleciti.filter(s => !s.ready_to_send);

  return (
    <Layout
      title="Notifiche & Solleciti"
      subtitle={loading ? "Caricamento…" : `${solleciti.length} affitti in ritardo · ${formatEur(importoTotale)} da recuperare`}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="not-kpi-totale">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[#64748B]"><Bell size={12}/> Affitti in ritardo</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#DC2626]">{solleciti.length}</div>
        </SectionCard>
        <SectionCard testId="not-kpi-ready">
          <div className="text-[10px] uppercase text-[#64748B]">Da inviare ora</div>
          <div className="font-display text-3xl font-bold tabular mt-1 text-[#B45309]">{ready.length}</div>
          <div className="text-[11px] text-[#64748B]">Soglia raggiunta</div>
        </SectionCard>
        <SectionCard testId="not-kpi-importo">
          <div className="text-[10px] uppercase text-[#64748B]">Importo totale</div>
          <div className="font-display text-2xl font-bold tabular mt-1 text-[#DC2626]">{formatEur(importoTotale)}</div>
        </SectionCard>
        <SectionCard testId="not-kpi-storico">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[#64748B]"><History size={12}/> Inviati totali</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{storico.length}</div>
        </SectionCard>
      </div>

      {ready.length > 0 && (
        <SectionCard
          title={`⚡ ${ready.length} solleciti raccomandati ora`}
          subtitle="Hanno raggiunto la soglia automatica configurata · pronti per essere inviati"
          testId="not-ready"
          className="mb-4"
          action={<Link to="/impostazioni" className="text-xs text-[#64748B] hover:text-[#0F172A] inline-flex items-center gap-1"><SettingsIcon size={11}/> Soglie</Link>}
        >
          <div className="space-y-2">
            {ready.map(s => <SollecitoRow key={s.incasso_id} s={s} onClick={() => setComposing(s)} />)}
          </div>
        </SectionCard>
      )}

      {waiting.length > 0 && (
        <SectionCard
          title="In monitoraggio"
          subtitle={`Ritardi sotto soglia o solleciti recenti già inviati (totale ${waiting.length})`}
          testId="not-waiting"
        >
          {loading ? (
            <div className="py-6 flex justify-center"><Loader2 size={24} className="animate-spin text-[#0066FF]"/></div>
          ) : (
            <div className="space-y-2">
              {waiting.map(s => <SollecitoRow key={s.incasso_id} s={s} onClick={() => setComposing(s)} muted />)}
            </div>
          )}
        </SectionCard>
      )}

      {ready.length === 0 && waiting.length === 0 && !loading && (
        <SectionCard testId="not-empty">
          <div className="py-10 text-center">
            <CheckCircle2 size={36} className="mx-auto text-[#10B981] mb-2"/>
            <div className="text-sm text-[#475569]">Nessun affitto in ritardo. Tutti gli inquilini hanno pagato puntualmente.</div>
          </div>
        </SectionCard>
      )}

      {storico.length > 0 && (
        <SectionCard title="Storico solleciti inviati" testId="not-storico">
          <div className="space-y-1">
            {storico.slice(0, 15).map(s => (
              <div key={s.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-[#F1F5F9] last:border-0">
                {s.canale === "email" ? <Mail size={12} className="text-[#0066FF]"/> : <MessageCircle size={12} className="text-[#10B981]"/>}
                <span className="text-[#475569] text-xs">{new Date(s.inviato_il).toLocaleString("it-IT")}</span>
                <span className="text-[#0F172A]">via {s.canale}</span>
                {s.note && <span className="text-[#64748B] text-xs italic truncate flex-1">{s.note}</span>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {composing && <ComposeModal sollecito={composing} onClose={() => setComposing(null)} onSent={() => { setComposing(null); load(); }} />}
    </Layout>
  );
}

function SollecitoRow({ s, onClick, muted }) {
  const tono = TONI[s.tono_consigliato] || TONI.cortese;
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${muted ? "bg-white border-[#E2E8F0] opacity-80" : "bg-[#F8FAFC] border-[#E2E8F0]"}`} data-testid={`sollecito-${s.incasso_id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-[#0F172A]">{s.inquilino}</span>
          <span className="text-xs text-[#64748B]">· {s.immobile_nome}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ background: tono.bg, color: tono.color, borderColor: tono.border }}>{tono.label}</span>
          {s.solleciti_inviati > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]">
              {s.solleciti_inviati} inviat{s.solleciti_inviati === 1 ? "o" : "i"}
            </span>
          )}
          {s.ultimo_sollecito && <span className="text-[10px] text-[#64748B] inline-flex items-center gap-1"><Clock size={10}/> ultimo {new Date(s.ultimo_sollecito).toLocaleDateString("it-IT")}</span>}
        </div>
        <div className="text-[11px] text-[#64748B] mt-0.5">
          Affitto {s.mese}/{s.anno} · scaduto da <strong className={muted ? "text-[#475569]" : "text-[#DC2626]"}>{s.giorni_ritardo} giorni</strong>
          {!s.ready_to_send && s.solleciti_inviati >= s.stage_da_inviare && (
            <span className="ml-2 text-[#059669]">✓ sollecito {tono.label.toLowerCase()} già inviato</span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 mr-3">
        <div className={`font-display text-lg font-bold tabular ${muted ? "text-[#475569]" : "text-[#DC2626]"}`}>{formatEur(s.importo)}</div>
      </div>
      <button
        onClick={onClick}
        data-testid={`sollecito-prepara-${s.incasso_id}`}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium ${s.ready_to_send ? "bg-gradient-to-r from-[#7C3AED] to-[#2563EB] hover:opacity-90" : "bg-[#94A3B8] hover:bg-[#64748B]"}`}
      >
        <Sparkles size={12}/> {s.ready_to_send ? "Prepara sollecito" : "Forza invio"}
      </button>
    </div>
  );
}

function ComposeModal({ sollecito, onClose, onSent }) {
  const [loading, setLoading] = useState(true);
  const [tono, setTono] = useState(sollecito.tono_consigliato || "cortese");
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState({ email_oggetto: "", email_corpo: "", whatsapp: "" });

  const generate = async (newTono) => {
    setLoading(true);
    try {
      const r = await apiClient().post("/notifications/genera-testo", {
        immobile_id: sollecito.immobile_id,
        importo_dovuto: sollecito.importo,
        mesi_in_ritardo: Math.max(1, Math.floor(sollecito.giorni_ritardo / 30)),
        tono: newTono || tono,
      });
      setData(r.data);
      setEditing({
        email_oggetto: r.data.email_oggetto || "",
        email_corpo: r.data.email_corpo || "",
        whatsapp: r.data.whatsapp || "",
      });
    } catch (e) { toast.error(e?.response?.data?.detail || "Errore AI"); }
    finally { setLoading(false); }
  };

  useEffect(() => { generate(); }, []); // eslint-disable-line

  const markSent = async (canale) => {
    try {
      await apiClient().post(`/notifications/marca-inviato/${sollecito.incasso_id}`, {
        canale,
        note: canale === "email" ? editing.email_oggetto : "",
      });
      toast.success(`Marcato come inviato via ${canale}`);
      onSent();
    } catch { toast.error("Errore"); }
  };

  const sendEmail = () => {
    const to = sollecito.inquilino_email;
    if (!to) {
      const ok = confirm("Email inquilino non in anagrafica. Vuoi comunque aprire il client mail (dovrai inserire l'indirizzo manualmente)?");
      if (!ok) return;
    }
    const mailto = `mailto:${to || ""}?subject=${encodeURIComponent(editing.email_oggetto)}&body=${encodeURIComponent(editing.email_corpo)}`;
    window.open(mailto);
    setTimeout(() => markSent("email"), 600);
  };

  const sendWhatsapp = () => {
    let tel = sollecito.inquilino_telefono || "";
    tel = tel.replace(/\D/g, "");
    if (tel && !tel.startsWith("39")) tel = "39" + tel;
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(editing.whatsapp)}`;
    window.open(url, "_blank");
    setTimeout(() => markSent("whatsapp"), 600);
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiato negli appunti");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()} data-testid="sollecito-modal">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-[#0F172A]">Sollecito · {sollecito.inquilino}</div>
            <div className="text-xs text-[#64748B]">{sollecito.immobile_nome} · {formatEur(sollecito.importo)} arretrato · {sollecito.giorni_ritardo} gg di ritardo</div>
          </div>
          <button onClick={onClose} className="text-2xl text-[#64748B] hover:text-[#0F172A] leading-none">×</button>
        </div>

        <div className="px-5 py-3 border-b border-[#E2E8F0]">
          <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium mr-2">Tono:</span>
          {["cortese", "fermo", "legale"].map(t => (
            <button
              key={t}
              onClick={() => { setTono(t); generate(t); }}
              data-testid={`tono-${t}`}
              className={`mr-2 px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${tono === t ? "bg-[#0066FF] text-white border-[#0066FF]" : "border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]"}`}
            >
              {TONI[t].label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-10 flex flex-col items-center gap-2">
            <Loader2 size={24} className="animate-spin text-[#7C3AED]"/>
            <div className="text-xs text-[#64748B]">AI sta scrivendo il sollecito…</div>
          </div>
        ) : (
          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* EMAIL */}
            <div className="bg-[#F0F9FF] border border-[#BAE6FD] rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]"><Mail size={14}/> Email</div>
                <button onClick={() => copy(`${editing.email_oggetto}\n\n${editing.email_corpo}`)} className="text-[#475569] hover:text-[#0F172A]" title="Copia"><Copy size={13}/></button>
              </div>
              <input
                value={editing.email_oggetto}
                onChange={(e) => setEditing({...editing, email_oggetto: e.target.value})}
                placeholder="Oggetto"
                data-testid="email-oggetto"
                className="w-full bg-white border border-[#E2E8F0] rounded px-2 py-1.5 text-sm mb-2 outline-none focus:border-[#0066FF]"
              />
              <textarea
                value={editing.email_corpo}
                onChange={(e) => setEditing({...editing, email_corpo: e.target.value})}
                rows={8}
                data-testid="email-corpo"
                className="w-full bg-white border border-[#E2E8F0] rounded px-2 py-1.5 text-sm outline-none focus:border-[#0066FF] resize-none font-sans"
              />
              <button onClick={sendEmail} data-testid="invia-email" className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-semibold">
                <Mail size={12}/> Apri nel client mail
              </button>
              {!sollecito.inquilino_email && <div className="text-[10px] text-[#B45309] mt-1">⚠ Email inquilino non in anagrafica. Aggiungila nella scheda immobile per pre-compilare il destinatario.</div>}
            </div>

            {/* WHATSAPP */}
            <div className="bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.3)] rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]"><MessageCircle size={14} className="text-[#059669]"/> WhatsApp</div>
                <button onClick={() => copy(editing.whatsapp)} className="text-[#475569] hover:text-[#0F172A]" title="Copia"><Copy size={13}/></button>
              </div>
              <textarea
                value={editing.whatsapp}
                onChange={(e) => setEditing({...editing, whatsapp: e.target.value})}
                rows={5}
                data-testid="whatsapp-text"
                className="w-full bg-white border border-[#E2E8F0] rounded px-2 py-1.5 text-sm outline-none focus:border-[#059669] resize-none"
              />
              <button onClick={sendWhatsapp} data-testid="invia-whatsapp" className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold">
                <MessageCircle size={12}/> Apri WhatsApp Web
              </button>
              {!sollecito.inquilino_telefono && <div className="text-[10px] text-[#B45309] mt-1">⚠ Telefono inquilino non in anagrafica. Aggiungilo nella scheda immobile.</div>}
            </div>

            <div className="text-[10px] text-[#64748B] bg-[#F8FAFC] p-2 rounded leading-relaxed">
              <strong>Come funziona:</strong> il bottone apre il tuo client mail / WhatsApp Web con il messaggio pre-compilato. Tu confermi e invii. Il sistema marca automaticamente il sollecito come "inviato" e tiene lo storico.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
