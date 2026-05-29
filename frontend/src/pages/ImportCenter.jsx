import { useState, useEffect } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { apiClient } from "../lib/auth";
import { formatEur } from "../lib/demoData";
import {
  Upload, Download, FileSpreadsheet, FileText, Building2, Sparkles,
  CheckCircle2, AlertTriangle, Loader2, Banknote, Database, X, Calendar
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend } from "recharts";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Dropzone = ({ onFile, accept, hint, testId }) => {
  const [drag, setDrag] = useState(false);
  return (
    <label
      data-testid={testId}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`block w-full p-8 rounded-xl border-2 border-dashed cursor-pointer text-center transition-colors ${drag ? "border-[#0066FF] bg-[rgba(0,102,255,0.05)]" : "border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#CBD5E1]"}`}
    >
      <input type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <Upload size={28} className="mx-auto text-[#475569] mb-2" />
      <div className="font-medium text-sm text-[#0F172A]">Trascina qui il file</div>
      <div className="text-xs text-[#64748B] mt-1">o clicca per selezionare · {hint}</div>
    </label>
  );
};

// ===== TAB 1: Immobili =====
function ImmobiliTab() {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const downloadTemplate = async () => {
    try {
      const t = localStorage.getItem("crr_token");
      const r = await fetch(`${API_BASE}/import/template/immobili`, { headers: { Authorization: `Bearer ${t}` } });
      if (!r.ok) throw new Error("Errore download");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "template_immobili_control_room.xlsx";
      a.click(); URL.revokeObjectURL(url);
      toast.success("Template scaricato");
    } catch { toast.error("Errore download template"); }
  };

  const upload = async (file) => {
    setLoading(true); setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await apiClient().post("/import/immobili/parse", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPreview(data);
      toast.success(`${data.total_rows} righe trovate, ${data.valid_rows} valide`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore parsing");
    } finally { setLoading(false); }
  };

  const commit = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient().post("/import/immobili/commit", { rows: preview.rows.filter(r => r.valid) });
      toast.success(`${data.created} immobili importati nel Patrimonio`);
      setPreview(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore import");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <SectionCard testId="import-immobili-intro">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 max-w-xl">
            <div className="w-10 h-10 rounded-lg bg-[rgba(0,102,255,0.1)] border border-[rgba(0,102,255,0.3)] flex items-center justify-center shrink-0">
              <Building2 size={18} className="text-[#2563EB]"/>
            </div>
            <div>
              <div className="font-display font-semibold text-[#0F172A]">Anagrafica immobili — bulk import</div>
              <div className="text-sm text-[#475569] mt-1">Scarica il template Excel, compilalo con i tuoi immobili, ricaricalo: anteprima riga per riga prima del commit definitivo.</div>
            </div>
          </div>
          <button data-testid="download-template-btn" onClick={downloadTemplate} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#E2E8F0] hover:border-[#CBD5E1] text-sm font-medium text-[#0F172A] transition-colors">
            <Download size={14}/> Scarica template .xlsx
          </button>
        </div>
      </SectionCard>

      {!preview && (
        <Dropzone testId="dropzone-immobili" onFile={upload} accept=".xlsx,.xls" hint="formati supportati: .xlsx, .xls" />
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-[#475569]">
          <Loader2 size={16} className="animate-spin" /> Elaborazione in corso…
        </div>
      )}

      {preview && (
        <SectionCard testId="immobili-preview" title="Anteprima righe" subtitle={`${preview.total_rows} totali · ${preview.valid_rows} valide · ${preview.rows_with_warnings} con warning`}
          action={
            <div className="flex items-center gap-2">
              <button onClick={() => setPreview(null)} className="text-xs px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:border-[#CBD5E1] text-[#475569]">Annulla</button>
              <button data-testid="immobili-commit-btn" onClick={commit} disabled={loading || preview.valid_rows === 0} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 text-white font-medium">
                <CheckCircle2 size={12}/> Importa {preview.valid_rows} immobili
              </button>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                  <th className="py-2 px-2">#</th>
                  <th className="py-2 px-2">Nome</th>
                  <th className="py-2 px-2">Città</th>
                  <th className="py-2 px-2">Tipologia</th>
                  <th className="py-2 px-2 text-right">Prezzo</th>
                  <th className="py-2 px-2 text-right">Canone</th>
                  <th className="py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} className={`border-b border-[#E2E8F0] last:border-0 ${r.valid ? "" : "bg-[rgba(239,68,68,0.04)]"}`}>
                    <td className="py-2 px-2 text-[#64748B] mono text-xs">{r._row}</td>
                    <td className="py-2 px-2 font-medium text-[#0F172A]">{r.nome}</td>
                    <td className="py-2 px-2 text-[#475569]">{r.citta || "—"}</td>
                    <td className="py-2 px-2 text-[#475569]">{r.tipologia}</td>
                    <td className="py-2 px-2 text-right tabular">{formatEur(r.prezzo_acquisto)}</td>
                    <td className="py-2 px-2 text-right tabular">{r.canone_mensile ? formatEur(r.canone_mensile) : "—"}</td>
                    <td className="py-2 px-2">
                      {r.valid ? (
                        <span className="inline-flex items-center gap-1 text-xs text-[#059669]"><CheckCircle2 size={12}/> Ok</span>
                      ) : (
                        <span title={r.warnings.join("; ")} className="inline-flex items-center gap-1 text-xs text-[#DC2626]"><AlertTriangle size={12}/> {r.warnings[0]}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ===== TAB 2: Bilanci AI Reader =====
function BilanciTab() {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const upload = async (file) => {
    setLoading(true); setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await apiClient().post("/import/bilancio/parse", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPreview({ ...data, filename: file.name });
      toast.success("Bilancio estratto da AI");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore AI Reader");
    } finally { setLoading(false); }
  };

  const commit = async () => {
    try {
      const { data } = await apiClient().post("/import/bilancio/commit", {
        periodo: preview.periodo,
        tipo: preview.tipo || "provvisorio",
        conto_economico: preview.conto_economico,
        stato_patrimoniale: preview.stato_patrimoniale,
        note_estrazione: preview.note_estrazione,
        filename: preview.filename,
      });
      toast.success(`Bilancio "${data.periodo}" salvato`);
      setPreview(null);
    } catch { toast.error("Errore salvataggio"); }
  };

  const Row = ({ label, value, bold }) => (
    <div className={`flex justify-between py-1.5 text-sm border-b border-[#E2E8F0] last:border-0 ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "text-[#0F172A]" : "text-[#475569]"}>{label}</span>
      <span className="tabular text-[#0F172A]">{formatEur(value)}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionCard testId="import-bilanci-intro">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] flex items-center justify-center shrink-0">
            <Sparkles size={18} className="text-[#B45309]"/>
          </div>
          <div>
            <div className="font-display font-semibold text-[#0F172A]">Bilancio Conto Economico + Stato Patrimoniale</div>
            <div className="text-sm text-[#475569] mt-1">Trascina il PDF o l'Excel esportato dal tuo gestionale (Arca, Zucchetti, TeamSystem…). L'AI estrarrà automaticamente le voci principali.</div>
          </div>
        </div>
      </SectionCard>

      {!preview && (
        <Dropzone testId="dropzone-bilanci" onFile={upload} accept=".pdf,.xlsx,.xls,.csv" hint="PDF, Excel o CSV · max 30 pagine" />
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#475569]">
          <Loader2 size={16} className="animate-spin" /> L'AI sta estraendo i dati dal bilancio…
        </div>
      )}

      {preview && (
        <SectionCard testId="bilanci-preview" title={`Estrazione AI — ${preview.periodo || "Periodo sconosciuto"}`}
          subtitle={preview.tipo ? `Tipo: ${preview.tipo}` : ""}
          action={
            <div className="flex items-center gap-2">
              <button onClick={() => setPreview(null)} className="text-xs px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:border-[#CBD5E1] text-[#475569]">Scarta</button>
              <button data-testid="bilancio-commit-btn" onClick={commit} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white font-medium">
                <CheckCircle2 size={12}/> Salva bilancio
              </button>
            </div>
          }
        >
          {preview.note_estrazione && (
            <div className="mb-3 p-2.5 rounded-lg bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.3)] text-xs text-[#B45309] flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0"/> {preview.note_estrazione}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#64748B] mb-2 font-semibold">Conto Economico</div>
              <Row label="Ricavi affitti" value={preview.conto_economico?.ricavi_affitti} />
              <Row label="Ricavi vendite" value={preview.conto_economico?.ricavi_vendite} />
              <Row label="Altri ricavi" value={preview.conto_economico?.altri_ricavi} />
              <Row label="Totale ricavi" value={preview.conto_economico?.totale_ricavi} bold />
              <div className="h-2"/>
              <Row label="Costi gestione" value={preview.conto_economico?.costi_gestione} />
              <Row label="Manutenzione" value={preview.conto_economico?.costi_manutenzione} />
              <Row label="IMU" value={preview.conto_economico?.imu} />
              <Row label="Interessi mutui" value={preview.conto_economico?.interessi_mutui} />
              <Row label="Ammortamenti" value={preview.conto_economico?.ammortamenti} />
              <Row label="Altri costi" value={preview.conto_economico?.altri_costi} />
              <Row label="Totale costi" value={preview.conto_economico?.totale_costi} bold />
              <div className="h-3"/>
              <div className="flex justify-between py-2 px-3 rounded-lg bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.3)]">
                <span className="font-semibold text-[#059669]">Utile netto</span>
                <span className="tabular font-bold text-[#059669]">{formatEur(preview.conto_economico?.utile_netto)}</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#64748B] mb-2 font-semibold">Stato Patrimoniale</div>
              <Row label="Valore immobili" value={preview.stato_patrimoniale?.valore_immobili} />
              <Row label="Liquidità" value={preview.stato_patrimoniale?.liquidita} />
              <Row label="Crediti" value={preview.stato_patrimoniale?.crediti} />
              <Row label="Totale attivo" value={preview.stato_patrimoniale?.totale_attivo} bold />
              <div className="h-2"/>
              <Row label="Debito mutui" value={preview.stato_patrimoniale?.debito_mutui} />
              <Row label="Altri debiti" value={preview.stato_patrimoniale?.altri_debiti} />
              <Row label="Totale passivo" value={preview.stato_patrimoniale?.totale_passivo} bold />
              <div className="h-3"/>
              <div className="flex justify-between py-2 px-3 rounded-lg bg-[rgba(0,102,255,0.08)] border border-[rgba(0,102,255,0.3)]">
                <span className="font-semibold text-[#2563EB]">Patrimonio netto</span>
                <span className="tabular font-bold text-[#2563EB]">{formatEur(preview.stato_patrimoniale?.patrimonio_netto)}</span>
              </div>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ===== TAB 3: Estratto conto bancario =====
function BancaTab() {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const upload = async (file) => {
    setLoading(true); setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await apiClient().post("/import/banca/parse", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPreview(data);
      toast.success(`${data.total} movimenti · ${data.matched} riconciliati con i canoni`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore parsing estratto conto");
    } finally { setLoading(false); }
  };

  const commit = async () => {
    try {
      const { data } = await apiClient().post("/import/banca/commit", { movimenti: preview.movimenti });
      toast.success(`${data.created} movimenti bancari importati`);
      setPreview(null);
    } catch { toast.error("Errore"); }
  };

  return (
    <div className="space-y-4">
      <SectionCard testId="import-banca-intro">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] flex items-center justify-center shrink-0">
            <Banknote size={18} className="text-[#059669]"/>
          </div>
          <div>
            <div className="font-display font-semibold text-[#0F172A]">Estratto conto bancario</div>
            <div className="text-sm text-[#475569] mt-1">Carica il CSV o Excel dell'estratto conto: il sistema riconcilia automaticamente le entrate con i canoni attesi degli immobili.</div>
            <div className="text-xs text-[#64748B] mt-1">Colonne attese: una colonna "Data", una "Descrizione", una "Importo".</div>
          </div>
        </div>
      </SectionCard>

      {!preview && (
        <Dropzone testId="dropzone-banca" onFile={upload} accept=".csv,.xlsx,.xls" hint="CSV o Excel" />
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#475569]">
          <Loader2 size={16} className="animate-spin" /> Elaborazione movimenti…
        </div>
      )}

      {preview && (
        <SectionCard testId="banca-preview" title="Movimenti rilevati" subtitle={`${preview.total} totali · ${preview.entrate} entrate · ${preview.uscite} uscite · ${preview.matched} riconciliati con canoni`}
          action={
            <div className="flex items-center gap-2">
              <button onClick={() => setPreview(null)} className="text-xs px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:border-[#CBD5E1] text-[#475569]">Annulla</button>
              <button data-testid="banca-commit-btn" onClick={commit} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white font-medium">
                <CheckCircle2 size={12}/> Importa {preview.total} movimenti
              </button>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                  <th className="py-2 px-2">Data</th>
                  <th className="py-2 px-2">Descrizione</th>
                  <th className="py-2 px-2 text-right">Importo</th>
                  <th className="py-2 px-2">Match canone</th>
                </tr>
              </thead>
              <tbody>
                {preview.movimenti.map((m, i) => (
                  <tr key={i} className="border-b border-[#E2E8F0] last:border-0">
                    <td className="py-2 px-2 text-[#475569] text-xs"><Calendar size={10} className="inline mr-1"/>{m.data}</td>
                    <td className="py-2 px-2">{m.descrizione}</td>
                    <td className={`py-2 px-2 text-right tabular ${m.importo >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>{formatEur(m.importo)}</td>
                    <td className="py-2 px-2">
                      {m.match_canone ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.08)] text-[#059669]">
                          <CheckCircle2 size={10}/> {m.match_canone.property_nome}
                        </span>
                      ) : m.importo > 0 ? <span className="text-[10px] text-[#64748B]">nessun match</span> : <span className="text-[10px] text-[#64748B]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ===== Page =====
function StoricoTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient().get("/import/bilanci/storico")
      .then(r => setData(r.data))
      .catch(() => toast.error("Errore caricamento storico"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#475569]"><Loader2 size={16} className="animate-spin" /> Caricamento storico…</div>;
  if (!data || data.bilanci.length === 0) {
    return (
      <SectionCard className="text-center py-12" testId="storico-empty">
        <Database size={28} className="mx-auto text-[#64748B] mb-3" />
        <div className="font-display font-semibold text-[#0F172A]">Nessun bilancio caricato</div>
        <div className="text-sm text-[#475569] mt-2">Carica almeno un bilancio dalla tab "Bilanci AI" per vedere lo storico.</div>
      </SectionCard>
    );
  }

  const fmtDelta = (d) => {
    if (!d || d.pct === null || d.pct === undefined) return <span className="text-[10px] text-[#64748B]">—</span>;
    const positive = d.abs >= 0;
    return (
      <span className={`text-[10px] tabular font-medium ${positive ? "text-[#059669]" : "text-[#DC2626]"}`}>
        {positive ? "▲" : "▼"} {d.pct.toFixed(1)}%
      </span>
    );
  };

  const Row = ({ label, b, k, kind = "ce", invertColor = false }) => {
    const v = (kind === "ce" ? b.conto_economico : b.stato_patrimoniale)[k] || 0;
    const d = (kind === "ce" ? b.diff_ce : b.diff_sp)[k];
    const positive = d && d.abs >= 0;
    const goodDirection = invertColor ? !positive : positive;
    return (
      <div className="flex justify-between items-center py-1.5 text-sm border-b border-[#E2E8F0] last:border-0">
        <span className="text-[#475569]">{label}</span>
        <div className="flex items-center gap-3">
          {d && d.pct !== null && (
            <span className={`text-[10px] tabular font-medium ${goodDirection ? "text-[#059669]" : "text-[#DC2626]"}`}>
              {positive ? "+" : ""}{formatEur(d.abs)} ({positive ? "▲" : "▼"}{Math.abs(d.pct).toFixed(1)}%)
            </span>
          )}
          <span className="tabular font-medium text-[#0F172A] min-w-[100px] text-right">{formatEur(v)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <SectionCard testId="storico-evoluzione" title="Evoluzione" subtitle={`${data.bilanci.length} bilanci · andamento dal più vecchio al più recente`}>
        <div style={{height: 260}}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.evoluzione} margin={{ top: 10, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="periodo" stroke="#64748B" fontSize={11} axisLine={false} tickLine={false} />
              <YAxis stroke="#64748B" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <RTooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatEur(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="totale_ricavi" name="Ricavi" stroke="#0066FF" strokeWidth={2} dot={{r: 3}} />
              <Line type="monotone" dataKey="totale_costi" name="Costi" stroke="#DC2626" strokeWidth={2} dot={{r: 3}} />
              <Line type="monotone" dataKey="utile_netto" name="Utile netto" stroke="#059669" strokeWidth={2.5} dot={{r: 4}} />
              <Line type="monotone" dataKey="patrimonio_netto" name="Patrimonio netto" stroke="#B45309" strokeWidth={2} dot={{r: 3}} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.bilanci.map((b, idx) => (
          <SectionCard key={b.id} testId={`storico-bilancio-${b.id}`}
            title={b.periodo} subtitle={`${b.tipo} · ${idx === 0 ? "ultimo caricato" : "vs precedente"}`}
          >
            <div className="text-[10px] uppercase tracking-widest text-[#64748B] mb-2 font-semibold">Conto Economico</div>
            <Row label="Totale ricavi" b={b} k="totale_ricavi" />
            <Row label="Ricavi affitti" b={b} k="ricavi_affitti" />
            <Row label="Totale costi" b={b} k="totale_costi" invertColor />
            <Row label="Utile netto" b={b} k="utile_netto" />
            <div className="text-[10px] uppercase tracking-widest text-[#64748B] mt-4 mb-2 font-semibold">Stato Patrimoniale</div>
            <Row label="Valore immobili" b={b} k="valore_immobili" kind="sp" />
            <Row label="Debito mutui" b={b} k="debito_mutui" kind="sp" invertColor />
            <Row label="Liquidità" b={b} k="liquidita" kind="sp" />
            <Row label="Patrimonio netto" b={b} k="patrimonio_netto" kind="sp" />
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

export default function ImportCenter() {
  return (
    <Layout title="Centro Import" subtitle="Carica anagrafica immobili, bilanci dal commercialista, estratti conto bancari">
      <Tabs defaultValue="immobili" className="w-full">
        <TabsList data-testid="import-tabs">
          <TabsTrigger value="immobili" data-testid="tab-import-immobili"><FileSpreadsheet size={14} className="mr-2"/> Immobili</TabsTrigger>
          <TabsTrigger value="bilanci" data-testid="tab-import-bilanci"><Sparkles size={14} className="mr-2"/> Bilanci AI</TabsTrigger>
          <TabsTrigger value="storico" data-testid="tab-import-storico"><FileText size={14} className="mr-2"/> Storico (MoM)</TabsTrigger>
          <TabsTrigger value="banca" data-testid="tab-import-banca"><Banknote size={14} className="mr-2"/> Estratto conto</TabsTrigger>
        </TabsList>
        <TabsContent value="immobili" className="mt-4"><ImmobiliTab /></TabsContent>
        <TabsContent value="bilanci" className="mt-4"><BilanciTab /></TabsContent>
        <TabsContent value="storico" className="mt-4"><StoricoTab /></TabsContent>
        <TabsContent value="banca" className="mt-4"><BancaTab /></TabsContent>
      </Tabs>
    </Layout>
  );
}
