import { useState, useMemo } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import {
  BookOpen, ChevronRight, ChevronDown, Search, Sparkles, Building2, Wallet,
  FileText, Bell, TrendingUp, Map, BarChart3, Upload, Home, AlertTriangle,
} from "lucide-react";

const SECTIONS = [
  {
    id: "introduzione",
    title: "Introduzione",
    icon: BookOpen,
    intro: "Real Estate Control Room è una webapp AI-driven per gestire il patrimonio immobiliare di una società: monitora rendimento per immobile, cash flow aziendale, alert proattivi, simulazioni strategiche e Piano d'Azione AI per la crescita.",
    blocks: [
      { type: "subtitle", text: "Cosa puoi fare" },
      { type: "list", items: [
        "Registrare tutti gli immobili (a reddito, compra-vendi, compra-ristruttura-vendi).",
        "Tracciare ricavi da affitti, costi (IMU/condominio/lavori), mutui.",
        "Caricare documenti (rogiti, contratti, APE, fatture) e farli leggere dall'AI per estrarre dati strutturati e generare alert automatici.",
        "Simulare piani di crescita pluriennali con AI Strategist (Claude Sonnet 4.6) e ricevere un Piano d'Azione concreto.",
        "Visualizzare KPI portafoglio: rendimento medio, cash flow, debito, Portfolio Score per immobile.",
      ]},
      { type: "tip", text: "Account demo per provare: ceo@controlroom.it / demo1234 (ruolo CEO). Vedi anche admin/amministrazione/commercialista nel file test_credentials.md." },
    ],
  },
  {
    id: "dashboard",
    title: "1. Dashboard",
    icon: BarChart3,
    intro: "La home della piattaforma. Vista sintetica e immediata dello stato del patrimonio: KPI, grafici cash flow, distribuzione tipologia, classifica top immobili.",
    image: "/manual/01-dashboard.png",
    blocks: [
      { type: "subtitle", text: "Cosa trovi" },
      { type: "list", items: [
        "16 KPI direzionali: numero immobili, valore patrimonio (acquisto + stimato), ricavi mensili/annui, cash flow netto, rendimento medio (lordo + netto), utile dell'anno, debito residuo, liquidità.",
        "Grafici interattivi: andamento ricavi vs costi, cash flow mensile, distribuzione patrimonio per tipologia, andamento valore patrimoniale.",
        "Tabella Top Immobili con Portfolio Score per ognuno.",
        "Widget strategici: miglior/peggior immobile per rendimento, alert prioritari.",
      ]},
    ],
  },
  {
    id: "patrimonio",
    title: "2. Patrimonio",
    icon: Building2,
    intro: "Elenco completo degli immobili in vista tabella o griglia con foto. Filtri avanzati per città, stato (affittato/sfitto/in vendita), tipologia, rendimento.",
    image: "/manual/02-patrimonio.png",
    blocks: [
      { type: "subtitle", text: "Come aggiungere un nuovo immobile" },
      { type: "list", items: [
        "Click su «+ Nuovo immobile» in alto a destra → si apre il wizard 2-step.",
        "Step 1: scegli il tipo operazione (A reddito / Compra-Vendi / Compra-Ristruttura-Vendi).",
        "Step 2: anagrafica completa (nome, indirizzo, città, mq, prezzo, agenzia, atto, lavori, canone).",
        "Il sistema calcola in automatico: costo totale, rendimento lordo, netto stimato, cash flow mensile.",
      ]},
      { type: "subtitle", text: "Portfolio Score" },
      { type: "text", text: "Ogni immobile ha un punteggio 0–100. Verde ≥71, ambra 41–70, rosso <41. Passa il mouse sopra il punteggio per vedere il breakdown (es: base 84, alert media -3, alert bassa -15, rendimento netto >8% +5 → 71/100)." },
      { type: "subtitle", text: "Stati immobile" },
      { type: "text", text: "In valutazione · In trattativa · Acquistato · In ristrutturazione · Disponibile · Affittato · Sfitto · In vendita · Venduto · Archiviato." },
    ],
  },
  {
    id: "scheda",
    title: "3. Scheda Immobile",
    icon: Home,
    intro: "Vista completa di un singolo immobile: foto, score, KPI rapidi, 7 tab tematiche con anagrafica, dati d'acquisto, economici, locazione, documenti, movimenti, alert.",
    image: "/manual/03-scheda.png",
    blocks: [
      { type: "subtitle", text: "Tab disponibili" },
      { type: "list", items: [
        "Anagrafica: dati identificativi + valore di mercato + costo totale + rivalutazione.",
        "Acquisto: data, prezzo, notaio, agenzia, imposte, lavori, capitale proprio investito.",
        "Economico: ricavi/costi annui, utile netto, ROI, break-even, tempo recupero capitale.",
        "Locazione: inquilino, contratto (inizio/fine/canone/deposito), modificabile inline.",
        "Documenti: i documenti collegati a questo immobile (filtrati automaticamente).",
        "Movimenti: incassi/uscite dell'immobile.",
        "Alert: numero in badge rosso · anomalie e scadenze attive per questo immobile.",
      ]},
      { type: "tip", text: "Sotto il gauge Portfolio Score c'è una mini-card breakdown con base, penalità alert, morosi, bonus rendimento — sempre visibile." },
    ],
  },
  {
    id: "affitti",
    title: "4. Affitti & Locazioni",
    icon: Wallet,
    intro: "Gestione contratti + incassi mensili + riconciliazione automatica con i movimenti bancari.",
    image: "/manual/04-affitti.png",
    blocks: [
      { type: "subtitle", text: "KPI principali" },
      { type: "list", items: [
        "Canone mensile atteso (somma di tutti i contratti attivi).",
        "Incassato del mese corrente + percentuale di completion.",
        "Tasso occupazione (immobili affittati / immobili a reddito).",
        "Numero morosi (incassi scaduti non a posto).",
      ]},
      { type: "subtitle", text: "Riconciliazione bancaria automatica" },
      { type: "text", text: "Quando importi l'estratto conto bancario nel Centro Import, premi «Riconcilia con banca» qui per abbinare automaticamente movimenti in entrata agli incassi previsti (tolleranze ±3% sull'importo, ±12 giorni dal 1° del mese)." },
      { type: "subtitle", text: "Registrazione manuale" },
      { type: "text", text: "Se non vuoi/non puoi importare la banca, click su «Segna pagato» per ogni incasso → mini modal con importo + data → il sistema marca lo stato e aggiorna i KPI." },
    ],
  },
  {
    id: "costi-ricavi",
    title: "5. Costi & Ricavi",
    icon: Wallet,
    intro: "Registrazione di tutti i movimenti economici: affitti incassati, IMU, condominio, manutenzioni, mutui, costi vendita, agenzia ecc.",
    image: "/manual/05-costi-ricavi.png",
    blocks: [
      { type: "subtitle", text: "Come popolare" },
      { type: "list", items: [
        "Manuale: click su «Nuovo» → form (data, categoria, descrizione, immobile, importo).",
        "Import bulk: «Import» → carichi un CSV/Excel.",
        "Da estratto conto bancario: vai a Centro Import → tab Estratto conto → l'AI estrae automaticamente i movimenti, li categorizza (Affitto/IMU/Condominio/Mutuo) e li collega all'immobile.",
      ]},
      { type: "tip", text: "Il badge «nessun match» vicino ai movimenti bancari indica che non sono ancora stati abbinati a un incasso previsto: vai in Affitti → «Riconcilia con banca»." },
    ],
  },
  {
    id: "documenti",
    title: "6. Documenti + AI Reader",
    icon: FileText,
    intro: "Archivio centralizzato di rogiti, contratti, APE, planimetrie, visure catastali, fatture. L'AI legge ogni documento e estrae dati strutturati + genera alert automatici.",
    image: "/manual/06-documenti.png",
    blocks: [
      { type: "subtitle", text: "Caricamento" },
      { type: "list", items: [
        "Click su «Carica documento» → modal drag-and-drop (max 15 MB).",
        "Formati: PDF, PNG, JPG, WEBP, TIFF, DOC, DOCX, XLS, XLSX.",
        "Scegli tipo (Rogito/Contratto/APE/Fattura/Planimetria/Visura/Altro) + immobile collegato.",
      ]},
      { type: "subtitle", text: "AI Document Reader" },
      { type: "list", items: [
        "Bottone viola «AI» sulla card → l'AI legge il PDF (pdfplumber) o l'immagine (Tesseract OCR ita+eng) e produce un JSON strutturato con i campi tipici del tipo documento.",
        "Esempio Contratto: estrae locatore, conduttore (con CF), durata, canone, deposito, ISTAT, rinnovo, clausole rilevanti.",
        "Esempio Visura: estrae foglio, particella, sub, categoria, rendita catastale, intestatari — e applica automaticamente i dati alla scheda immobile + calcola IMU stimata.",
        "Esempio Rogito: estrae notaio, venditore, acquirente, prezzo, imposte.",
      ]},
      { type: "subtitle", text: "Alert automatici" },
      { type: "text", text: "Ogni anomalia rilevata e ogni scadenza entro 180 giorni diventa automaticamente un alert nel Centro Alert e nella Scheda Immobile. Esempio: «Clausola di prelazione nulla L.392/1978 art.38», «APE scade tra 35 giorni»." },
    ],
  },
  {
    id: "import",
    title: "7. Centro Import",
    icon: Upload,
    intro: "Data ingestion: carica anagrafica immobili, bilanci dal commercialista, storico mese-su-mese, estratti conto bancari.",
    image: "/manual/07-import.png",
    blocks: [
      { type: "subtitle", text: "4 tipi di import" },
      { type: "list", items: [
        "Immobili: bulk-import via template Excel scaricabile.",
        "Bilanci AI: PDF del commercialista → AI estrae ricavi/costi/utile.",
        "Storico MoM: confronto periodi.",
        "Estratto conto: PDF/CSV/Excel → AI categorizza movimenti.",
      ]},
      { type: "tip", text: "L'import non duplica: l'algoritmo usa fingerprint (data+importo+descrizione) per evitare doppioni." },
    ],
  },
  {
    id: "alert",
    title: "8. AI Alert Center",
    icon: Bell,
    intro: "Centro notifiche intelligente: anomalie documentali, scadenze, rischi economici, opportunità strategiche.",
    image: "/manual/08-alert-center.png",
    blocks: [
      { type: "subtitle", text: "Tipi di alert" },
      { type: "list", items: [
        "Documentali: anomalie da AI Reader, APE in scadenza, contratti in scadenza 90/60/30 giorni, fatture in scadenza pagamento.",
        "Economici: cash flow negativo, lavori fuori budget, affitto non incassato, rata mutuo > canone.",
        "Strategici: immobile da valutare per vendita, opportunità rifinanziamento, concentrazione geografica, eccessiva esposizione.",
      ]},
      { type: "subtitle", text: "Refresh manuale" },
      { type: "text", text: "Bottone «Scansiona scadenze»: il sistema ri-controlla tutte le date contratti, mutui, immobili sfitti → ricrea gli alert (idempotente). Esegui dopo aver aggiornato un contratto." },
      { type: "tip", text: "Ogni alert linka all'immobile relativo con «Vai a {immobile}». La X chiude l'alert (dismiss)." },
    ],
  },
  {
    id: "forecast",
    title: "9. Forecast & Piano AI",
    icon: TrendingUp,
    intro: "Simulazione strategica multi-anno con Claude Sonnet 4.6. Descrivi il piano in linguaggio naturale o usa i parametri rapidi → ottieni proiezioni, grafici, stress test e Piano d'Azione concreto.",
    image: "/manual/09-forecast.png",
    blocks: [
      { type: "subtitle", text: "Modalità" },
      { type: "list", items: [
        "Prompt: «Compro 3 bilocali/anno a Torino sotto 70K con mutuo 60%, voglio raddoppiare il PN in 5 anni».",
        "Parametri rapidi: acquisti/anno, prezzo medio, canone medio, città, leva mutuo, tipologia.",
        "Vincoli hard: blocca acquisti se la cassa va sotto la riserva minima.",
      ]},
      { type: "subtitle", text: "Output" },
      { type: "list", items: [
        "Grafici PN/cash flow/LTV anno per anno + tabella dettagliata.",
        "Stress test what-if con slider live (tasso, canone, rivalutazione, vacancy).",
        "Tornado chart: quale parametro impatta di più sul PN finale.",
        "Piano d'Azione AI: 5–7 azioni concrete con priorità P0/P1/P2, timeline, KPI da monitorare.",
        "Bottone «Accelera crescita»: variante aggressiva con leva massima + reinvestimento utili.",
        "Export PDF Piano Industriale.",
      ]},
    ],
  },
  {
    id: "mappa",
    title: "10. Mappa Patrimonio",
    icon: Map,
    intro: "Distribuzione geografica con marker colorati (verde rendimento alto, ambra medio, rosso critico, blu in vendita). Click sul marker per i dettagli.",
    image: "/manual/10-mappa.png",
    blocks: [
      { type: "text", text: "Utile per visualizzare concentrazione geografica e identificare immobili problematici a colpo d'occhio." },
    ],
  },
  {
    id: "kpi",
    title: "11. KPI & Rendimenti",
    icon: BarChart3,
    intro: "Classifiche e indicatori dettagliati: migliori/peggiori immobili per rendimento netto, cash flow, rivalutazione. Suggerimenti AI «da vendere/rifinanziare/ristrutturare/tenere».",
    image: "/manual/11-kpi.png",
    blocks: [
      { type: "subtitle", text: "Decisioni guidate" },
      { type: "text", text: "Il sistema genera classifiche automatiche basate sui KPI in tempo reale per supportare le decisioni: quale immobile vendere prima, quale rifinanziare, quale tenere." },
    ],
  },
  {
    id: "workflow",
    title: "Workflow tipico — Da zero al primo report",
    icon: Sparkles,
    intro: "Sequenza consigliata per portare un nuovo immobile dalla creazione a un piano industriale finanziabile in banca.",
    blocks: [
      { type: "subtitle", text: "Step 1 — Crea l'immobile" },
      { type: "text", text: "Patrimonio → «+ Nuovo immobile» → wizard 2-step. Il sistema calcola automaticamente costo totale, rendimento lordo/netto stimato, cash flow." },
      { type: "subtitle", text: "Step 2 — Inserisci la locazione" },
      { type: "text", text: "Scheda Immobile → tab Locazione → compila inquilino + date + canone + deposito → salva. Auto-generati 14 incassi previsti." },
      { type: "subtitle", text: "Step 3 — Carica i documenti" },
      { type: "text", text: "Documenti → carica rogito.pdf + contratto.pdf + visura.png + APE.pdf → click «AI» su ognuno → estrazione dati + alert automatici." },
      { type: "subtitle", text: "Step 4 — Importa l'estratto conto" },
      { type: "text", text: "Centro Import → tab Estratto conto → trascina il PDF → l'AI categorizza i movimenti." },
      { type: "subtitle", text: "Step 5 — Riconcilia" },
      { type: "text", text: "Affitti → «Riconcilia con banca» → gli incassi previsti vengono abbinati ai bonifici in entrata." },
      { type: "subtitle", text: "Step 6 — Simula e pianifica" },
      { type: "text", text: "Forecast → descrivi il piano → genera → leggi il Piano d'Azione → scarica PDF Piano Industriale per la banca." },
      { type: "tip", text: "Il file PDF generato include: portafoglio attuale, scenari pessimistico/realistico/ottimistico, stress test, piano d'azione con priorità — direttamente presentabile in banca." },
    ],
  },
];

export default function Manuale() {
  const [active, setActive] = useState("introduzione");
  const [q, setQ] = useState("");
  const filteredSections = useMemo(() => {
    if (!q.trim()) return SECTIONS;
    const qq = q.toLowerCase();
    return SECTIONS.filter(s =>
      s.title.toLowerCase().includes(qq) ||
      (s.intro && s.intro.toLowerCase().includes(qq))
    );
  }, [q]);
  const current = SECTIONS.find(s => s.id === active) || SECTIONS[0];

  return (
    <Layout title="Manuale d'uso" subtitle="Guida completa alla Real Estate Control Room con screenshot e workflow tipico">
      <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
        {/* Sidebar indice */}
        <nav className="bg-white border border-[#E2E8F0] rounded-xl p-3 h-fit lg:sticky lg:top-4">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] mb-3">
            <Search size={13} className="text-[#64748B]" />
            <input
              data-testid="manual-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca nella guida…"
              className="bg-transparent text-xs outline-none flex-1 placeholder:text-[#64748B]"
            />
          </div>
          <ul className="space-y-0.5">
            {filteredSections.map(s => {
              const Icon = s.icon;
              const isActive = s.id === active;
              return (
                <li key={s.id}>
                  <button
                    data-testid={`manual-nav-${s.id}`}
                    onClick={() => { setActive(s.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className={`w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-md text-[13px] transition ${isActive ? "bg-[#EFF6FF] text-[#1E40AF] font-semibold" : "text-[#475569] hover:bg-[#F8FAFC]"}`}
                  >
                    <Icon size={13} className="shrink-0" />
                    <span className="truncate">{s.title}</span>
                    {isActive && <ChevronRight size={11} className="ml-auto shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Content */}
        <div data-testid="manual-content">
          <SectionCard testId={`manual-section-${current.id}`}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center shrink-0">
                <current.icon size={20} className="text-[#1E40AF]" />
              </div>
              <div className="flex-1">
                <h2 className="font-display text-2xl font-bold text-[#0F172A]">{current.title}</h2>
                <p className="text-sm text-[#475569] mt-1 leading-relaxed">{current.intro}</p>
              </div>
            </div>
            {current.image && (
              <a href={current.image} target="_blank" rel="noreferrer" className="block mb-5 rounded-xl overflow-hidden border border-[#E2E8F0] hover:border-[#0066FF] transition group">
                <img src={current.image} alt={current.title} className="w-full h-auto" loading="lazy" />
              </a>
            )}
            <div className="space-y-4">
              {current.blocks.map((b, i) => {
                if (b.type === "subtitle") return <h3 key={i} className="font-display font-semibold text-[#0F172A] text-base mt-4">{b.text}</h3>;
                if (b.type === "text") return <p key={i} className="text-sm text-[#475569] leading-relaxed">{b.text}</p>;
                if (b.type === "list") return (
                  <ul key={i} className="space-y-1.5 text-sm text-[#475569]">
                    {b.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <ChevronDown size={12} className="text-[#0066FF] mt-1 shrink-0 rotate-[-45deg]" />
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                );
                if (b.type === "tip") return (
                  <div key={i} className="flex gap-2 p-3 rounded-lg bg-[#FFFBEB] border border-[#FCD34D]/40 text-xs text-[#92400E]">
                    <Sparkles size={13} className="shrink-0 mt-0.5" />
                    <div className="leading-relaxed"><b>Suggerimento — </b>{b.text}</div>
                  </div>
                );
                return null;
              })}
            </div>
            <div className="mt-6 pt-4 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
              {(() => {
                const idx = SECTIONS.findIndex(s => s.id === current.id);
                const prev = idx > 0 ? SECTIONS[idx - 1] : null;
                const next = idx < SECTIONS.length - 1 ? SECTIONS[idx + 1] : null;
                return (
                  <>
                    {prev ? (
                      <button onClick={() => setActive(prev.id)} className="text-[#64748B] hover:text-[#0F172A] inline-flex items-center gap-1">
                        <ChevronRight size={12} className="rotate-180" /> {prev.title}
                      </button>
                    ) : <span />}
                    {next ? (
                      <button onClick={() => setActive(next.id)} className="text-[#0066FF] hover:text-[#1E40AF] inline-flex items-center gap-1 font-semibold">
                        {next.title} <ChevronRight size={12} />
                      </button>
                    ) : <span />}
                  </>
                );
              })()}
            </div>
          </SectionCard>
        </div>
      </div>
    </Layout>
  );
}
