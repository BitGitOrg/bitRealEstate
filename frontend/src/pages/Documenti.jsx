import { useState, useEffect, useRef } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { documenti as demoDocs, properties as demoProps } from "../lib/demoData";
import { apiClient } from "../lib/auth";
import { toast } from "sonner";
import { FileText, Upload, Download, Search, Sparkles, X, Trash2, Loader2, FileUp, AlertTriangle, CheckCircle2 } from "lucide-react";

const TIPI = ["Tutti", "Rogito", "APE", "Contratto", "Fattura", "Planimetria", "Visura"];
const TIPI_FORM = ["Rogito", "APE", "Contratto", "Fattura", "Planimetria", "Visura", "Altro"];
const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api/documents`;

export default function Documenti() {
  const [tipo, setTipo] = useState("Tutti");
  const [q, setQ] = useState("");
  const [realDocs, setRealDocs] = useState([]);
  const [realProps, setRealProps] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [analysisModal, setAnalysisModal] = useState(null); // {doc, analysis}

  const load = () => apiClient().get("/documents").then(r => setRealDocs(r.data || [])).catch(() => {});
  useEffect(() => {
    load();
    apiClient().get("/properties").then(r => setRealProps(r.data || [])).catch(() => {});
  }, []);

  const allDocs = realDocs.length > 0 ? realDocs : demoDocs;
  const allProps = realProps.length > 0 ? realProps : demoProps;
  const filtered = allDocs.filter(d =>
    (tipo === "Tutti" || d.tipo === tipo) &&
    (q === "" || (d.nome || "").toLowerCase().includes(q.toLowerCase()))
  );

  const handleDownload = async (doc) => {
    const isReal = !!realDocs.find(d => d.id === doc.id);
    if (!isReal) {
      toast.info("Documento dimostrativo — non c'è un file reale da scaricare. Carica i tuoi documenti per avere il download reale.");
      return;
    }
    try {
      const token = localStorage.getItem("token");
      const r = await fetch(`${API_URL}/${doc.id}/file`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("download fallito");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = doc.nome || "documento";
      document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(url);
    } catch {
      toast.error("Errore nel download");
    }
  };

  const handleDelete = async (doc) => {
    const isReal = !!realDocs.find(d => d.id === doc.id);
    if (!isReal) { toast.info("I documenti demo non possono essere eliminati"); return; }
    if (!window.confirm(`Eliminare «${doc.nome}»?`)) return;
    try {
      await apiClient().delete(`/documents/${doc.id}`);
      toast.success("Documento eliminato");
      load();
    } catch {
      toast.error("Errore nell'eliminazione");
    }
  };

  const handleAnalyze = async (doc) => {
    const isReal = !!realDocs.find(d => d.id === doc.id);
    if (!isReal) { toast.info("L'analisi AI funziona solo su documenti reali caricati."); return; }
    setAnalyzingId(doc.id);
    try {
      const r = await apiClient().post(`/documents/${doc.id}/analyze`);
      setAnalysisModal({ doc, analysis: r.data.analysis, cached: r.data.cached });
      const gen = r.data.alerts_generated || 0;
      if (r.data.cached) {
        toast.success("Analisi caricata da cache");
      } else if (gen > 0) {
        toast.success(`Documento analizzato · ${gen} alert generati automaticamente`);
      } else {
        toast.success("Documento analizzato dall'AI");
      }
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Errore analisi AI");
    } finally {
      setAnalyzingId(null);
    }
  };

  return (
    <Layout title="Documenti" subtitle={`${allDocs.length} documenti${realDocs.length > 0 ? " · archivio reale" : " · demo"}`}
      actions={
        <button
          data-testid="doc-upload-btn"
          onClick={() => setUploadOpen(true)}
          className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-sm font-medium transition-colors"
        >
          <Upload size={14} /> Carica documento
        </button>
      }
    >
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => { load(); setUploadOpen(false); }}
        properties={allProps}
        loading={loading}
        setLoading={setLoading}
      />

      <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
          <Search size={14} className="text-[#64748B]" />
          <input data-testid="doc-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca documento…" className="bg-transparent outline-none text-sm flex-1 placeholder:text-[#64748B]" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {TIPI.map(t => (
            <button
              key={t}
              data-testid={`doc-filter-${t}`}
              onClick={() => setTipo(t)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${tipo === t ? "bg-[#0066FF] text-white border-[#0066FF]" : "bg-transparent text-[#475569] border-[#E2E8F0] hover:border-[#CBD5E1]"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <SectionCard
        title="Archivio"
        subtitle={`${filtered.length} risultati${realDocs.length === 0 ? " · in modalità demo (carica un documento per attivare l'archivio reale)" : ""}`}
        testId="doc-list"
        action={
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[rgba(0,102,255,0.3)] bg-[rgba(0,102,255,0.1)] text-[#2563EB]">
            <Sparkles size={11}/> AI Reader attivo
          </span>
        }
      >
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <FileText size={32} className="mx-auto text-[#CBD5E1] mb-2" />
            <div className="text-sm text-[#475569]">Nessun documento in archivio con questi filtri.</div>
            <button onClick={() => setUploadOpen(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white">
              <Upload size={12} /> Carica il primo documento
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(d => {
              const p = allProps.find(x => x.id === d.immobile_id);
              const isReal = !!realDocs.find(r => r.id === d.id);
              return (
                <div key={d.id} data-testid={`doc-card-${d.id}`} className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg hover:border-[#CBD5E1] transition-colors group">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-[rgba(0,102,255,0.1)] border border-[rgba(0,102,255,0.3)] flex items-center justify-center shrink-0">
                      <FileText size={18} className="text-[#2563EB]" />
                    </div>
                    <div className="flex items-center gap-1">
                      {!isReal && <span className="text-[9px] uppercase tracking-wider text-[#94A3B8]">demo</span>}
                      <span className="text-[10px] uppercase tracking-wider text-[#475569] border border-[#E2E8F0] rounded px-1.5 py-0.5">{d.tipo}</span>
                    </div>
                  </div>
                  <div className="font-medium text-sm text-[#0F172A] mb-1 line-clamp-2">{d.nome}</div>
                  {p && <div className="text-[11px] text-[#475569]">{p.nome}</div>}
                  <div className="text-[11px] text-[#64748B] mt-2">{d.dimensione} · {d.caricato}</div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => handleAnalyze(d)} disabled={analyzingId === d.id || !isReal} title={isReal ? "Estrai dati con AI" : "Disponibile dopo l'upload"} className="inline-flex items-center justify-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-[#7C3AED]/40 bg-[#F5F3FF] text-[#6D28D9] hover:bg-[#EDE9FE] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      {analyzingId === d.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {analyzingId === d.id ? "AI…" : (d.ai_analysis ? "Apri AI" : "AI")}
                    </button>
                    <button onClick={() => handleDownload(d)} className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#FFFFFF] text-[#475569] hover:text-[#0F172A] transition-colors">
                      <Download size={12} /> Scarica
                    </button>
                    {isReal && (
                      <button onClick={() => handleDelete(d)} title="Elimina" className="inline-flex items-center justify-center text-xs px-2 py-1.5 rounded-lg border border-[#FECACA] hover:bg-[#FEF2F2] text-[#DC2626] transition-colors">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  {d.ai_analysis && (
                    <button onClick={() => setAnalysisModal({ doc: d, analysis: d.ai_analysis, cached: true })} className="mt-2 w-full text-[10px] text-[#6D28D9] hover:underline text-left inline-flex items-center gap-1">
                      <Sparkles size={10} /> Analisi AI disponibile
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
      {analysisModal && (
        <AnalysisModal doc={analysisModal.doc} analysis={analysisModal.analysis} onClose={() => setAnalysisModal(null)} />
      )}
    </Layout>
  );
}

function UploadModal({ open, onClose, onUploaded, properties, loading, setLoading }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("Rogito");
  const [immobileId, setImmobileId] = useState("");
  const [drag, setDrag] = useState(false);

  if (!open) return null;

  const pickFile = (f) => {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) {
      toast.error("File troppo grande (max 15 MB)");
      return;
    }
    setFile(f);
    if (!nome) setNome(f.name);
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (!file) { toast.error("Seleziona un file"); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("nome", nome || file.name);
      fd.append("tipo", tipo);
      if (immobileId) fd.append("immobile_id", immobileId);
      const token = localStorage.getItem("token");
      const r = await fetch(API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "upload fallito");
      }
      toast.success(`Documento «${nome || file.name}» caricato`);
      setFile(null); setNome(""); setTipo("Rogito"); setImmobileId("");
      onUploaded();
    } catch (err) {
      toast.error(err.message || "Errore upload");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <div>
            <div className="text-sm font-semibold text-[#0F172A]">Carica documento</div>
            <div className="text-xs text-[#64748B]">PDF, immagini, Word, Excel · max 15 MB</div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#F1F5F9] rounded-lg"><X size={16} className="text-[#64748B]" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); }}
            onClick={() => fileRef.current?.click()}
            data-testid="doc-drop"
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${drag ? "border-[#0066FF] bg-[#EFF6FF]" : "border-[#CBD5E1] hover:border-[#94A3B8] bg-[#F8FAFC]"}`}
          >
            <FileUp size={28} className="mx-auto text-[#0066FF] mb-2" />
            {file ? (
              <div>
                <div className="text-sm font-medium text-[#0F172A]">{file.name}</div>
                <div className="text-[11px] text-[#64748B]">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
            ) : (
              <>
                <div className="text-sm text-[#0F172A] font-medium">Trascina un file qui</div>
                <div className="text-[11px] text-[#64748B]">o clicca per selezionare</div>
              </>
            )}
            <input type="file" ref={fileRef} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" />
          </div>

          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Nome documento</span>
            <input data-testid="doc-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="es. Rogito Via Foligno"
              className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2 text-sm outline-none focus:border-[#0066FF]" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Tipo</span>
              <select data-testid="doc-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}
                className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2 text-sm outline-none focus:border-[#0066FF]">
                {TIPI_FORM.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#475569] font-medium">Immobile (opzionale)</span>
              <select data-testid="doc-immobile" value={immobileId} onChange={(e) => setImmobileId(e.target.value)}
                className="mt-1 w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2 text-sm outline-none focus:border-[#0066FF]">
                <option value="">— Nessuno —</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-sm text-[#475569]">Annulla</button>
            <button data-testid="doc-submit" type="submit" disabled={loading || !file}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {loading ? "Caricamento…" : "Carica"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


function AnalysisModal({ doc, analysis, onClose }) {
  const a = analysis || {};
  const summary = a.summary || "";
  const anomalie = Array.isArray(a.anomalie) ? a.anomalie.filter((x) => x && String(x).trim()) : [];
  const clausole = Array.isArray(a.clausole_rilevanti) ? a.clausole_rilevanti.filter((x) => x && String(x).trim()) : [];

  // Tutti gli altri campi (esclusi summary/anomalie/clausole/parse_error/raw_text)
  const skip = new Set(["summary", "anomalie", "clausole_rilevanti", "parse_error", "raw_text"]);
  const fields = Object.entries(a).filter(([k, v]) => !skip.has(k) && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0));

  const formatVal = (v) => {
    if (typeof v === "boolean") return v ? "Sì" : "No";
    if (typeof v === "number") return v.toLocaleString("it-IT");
    if (typeof v === "object") return JSON.stringify(v, null, 2);
    return String(v);
  };
  const labelize = (k) => k.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#F5F3FF] border border-[#7C3AED]/30 flex items-center justify-center">
              <Sparkles size={18} className="text-[#7C3AED]" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[#0F172A]">Analisi AI · {doc.tipo}</div>
              <div className="text-xs text-[#64748B]">{doc.nome}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#F1F5F9] rounded-lg"><X size={16} className="text-[#64748B]" /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {a.parse_error && (
            <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <div>L'AI ha restituito una risposta non strutturata. Mostro il testo grezzo qui sotto. Riprova: solitamente la seconda analisi è più pulita.</div>
            </div>
          )}
          {summary && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-1">Sintesi esecutiva</div>
              <p className="text-sm text-[#0F172A] leading-relaxed bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3">{summary}</p>
            </div>
          )}
          {fields.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-2">Dati estratti</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {fields.map(([k, v]) => (
                  <div key={k} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-2.5">
                    <div className="text-[9px] uppercase tracking-wider text-[#64748B] mb-0.5">{labelize(k)}</div>
                    <div className="text-[13px] text-[#0F172A] font-medium break-words">
                      {Array.isArray(v) ? (
                        <ul className="list-disc list-inside text-xs space-y-0.5">{v.map((x, i) => <li key={i}>{formatVal(x)}</li>)}</ul>
                      ) : (
                        formatVal(v)
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {clausole.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-1">Clausole rilevanti</div>
              <ul className="space-y-1.5">
                {clausole.map((c, i) => (
                  <li key={i} className="text-xs text-[#475569] flex items-start gap-2">
                    <CheckCircle2 size={12} className="text-[#0066FF] mt-0.5 shrink-0" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {anomalie.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#B45309] font-semibold mb-1 flex items-center gap-1">
                <AlertTriangle size={11} /> Anomalie / Attenzioni
              </div>
              <ul className="space-y-1.5">
                {anomalie.map((c, i) => (
                  <li key={i} className="text-xs text-[#92400E] bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-2">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.raw_text && a.parse_error && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#64748B] mb-1">Output AI (grezzo)</div>
              <pre className="text-[11px] bg-[#F1F5F9] border border-[#E2E8F0] rounded-lg p-2.5 whitespace-pre-wrap max-h-48 overflow-auto">{a.raw_text}</pre>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm">Chiudi</button>
        </div>
      </div>
    </div>
  );
}
