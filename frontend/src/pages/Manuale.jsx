import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { restartTour } from "../components/OnboardingTour";
import {
  BookOpen, ChevronRight, ChevronDown, Search, Sparkles, Building2, Wallet,
  FileText, Bell, TrendingUp, Map, BarChart3, Upload, Home, AlertTriangle,
  Kanban, Landmark, Hammer, Receipt, CalendarClock, MessageSquare, Calculator,
  Briefcase, Settings, FileDown,
} from "lucide-react";

const SECTIONS = [
  {
    id: "introduzione",
    title: "Introduzione",
    icon: BookOpen,
    intro: "Real Estate Control Room è una webapp AI-driven per gestire l'intero ciclo di vita del patrimonio immobiliare di una società: dall'acquisizione (Pipeline CRM) all'amministrazione (affitti, mutui, costi) fino alla pianificazione strategica multi-anno con AI.",
    blocks: [
      { type: "subtitle", text: "Cosa puoi fare" },
      { type: "list", items: [
        "Gestire la Pipeline acquisizioni (Kanban 9 stage) con AI Deal Scoring automatico 0–100 su ogni nuovo deal.",
        "Registrare tutti gli immobili (a reddito, compra-vendi, compra-ristruttura-vendi) e convertirli automaticamente dalla pipeline a rogito firmato.",
        "Tracciare ricavi da affitti, costi (IMU/condominio/lavori), mutui reali con piano di ammortamento, vendite e rivendite.",
        "Caricare documenti (rogiti, contratti, APE, fatture, atti di mutuo) e farli leggere dall'AI per estrarre dati strutturati e generare alert automatici.",
        "Inviare solleciti affitto automatici via WhatsApp/Email con T+5/15/30 giorni di tolleranza.",
        "Simulare piani di crescita pluriennali con AI Strategist (Claude Sonnet 4.6) e ricevere un Piano d'Azione concreto.",
        "Esportare il Banker Pack PDF con tutti i dati patrimoniali pronto per la banca.",
        "Visualizzare KPI: rendimento medio reale (tasse SRL/privato calcolate), cash flow, debito, LTV, Portfolio Score.",
      ]},
      { type: "tip", text: "Account demo per provare: ceo@controlroom.it / demo1234 (ruolo CEO). Vedi anche admin/amministrazione/commercialista nel file test_credentials.md." },
      { type: "tour" },
    ],
  },
  {
    id: "pipeline",
    title: "1. Pipeline Acquisizioni",
    icon: Kanban,
    intro: "CRM Kanban verticale per tracciare i nuovi immobili da quando li scopri (Visionato) fino al rogito firmato. Ogni nuovo deal riceve un AI Deal Score 0–100 automatico.",
    blocks: [
      { type: "subtitle", text: "I 9 stage" },
      { type: "list", items: [
        "Visionato → annuncio scoperto su Immobiliare.it / Idealista / agenzia.",
        "Visitato → visita effettuata in loco.",
        "Offerta inviata → prima offerta scritta.",
        "Trattativa → controproposte in corso (registra ogni cifra negoziata).",
        "Accettato → proposta accettata dal venditore.",
        "Verifica documenti → visure, conformità urbanistica, APE.",
        "Mutuo richiesto → banca in fase di delibera (registra tasso, durata, rata).",
        "Preliminare → compromesso firmato.",
        "Rogito → rogito firmato → bottone «Converti in patrimonio» crea l'immobile + il mutuo + le date.",
      ]},
      { type: "subtitle", text: "AI Deal Score automatico" },
      { type: "text", text: "Appena crei un deal con prezzo richiesto + canone atteso, l'AI calcola un punteggio 0–100 basato su rendimento lordo, rendimento netto reale (tasse SRL 27,9% o privato 21% secondo le impostazioni), e suggerisce un prezzo massimo consigliato. Badge sulla card Kanban: verde ≥72 (buona/eccellente), giallo 55–71 (interessante), rosso <55 (rischiosa/sconsigliata)." },
      { type: "subtitle", text: "KPI pipeline" },
      { type: "list", items: [
        "Time-to-close medio: giorni dalla creazione al rogito (storico).",
        "Sconto medio negoziato: differenza tra prezzo richiesto e prezzo finale.",
        "Conversion visite → rogito: tasso di chiusura.",
        "Banca più veloce: quale istituto delibera in meno giorni in base alla tua esperienza.",
      ]},
      { type: "subtitle", text: "Conversione in patrimonio" },
      { type: "text", text: "Quando un deal raggiunge lo stage «Rogito», compare il bottone verde «Converti in patrimonio». Click → crea automaticamente: 1) immobile in Patrimonio con prezzo + notaio + agenzia + date; 2) mutuo collegato (se hai registrato la banca in pipeline); 3) timeline storica del deal salvata; 4) il deal sparisce dal Kanban (resta archiviato come storico)." },
      { type: "tip", text: "Registra ogni evento (visita, offerta, controproposta, mutuo) cliccando «Avanza pipeline» nel modal del deal: ogni evento aggiorna il prezzo corrente e fa avanzare automaticamente lo stage." },
      { type: "subtitle", text: "Import batch da URL annunci" },
      { type: "text", text: "Click su «Importa da URL» → si apre una modal con textarea. Incolli fino a 20 URL di annunci (uno per riga) e premi «Analizza». Il sistema scarica ogni pagina via Jina Reader, l'AI Claude Sonnet estrae prezzo/indirizzo/mq/tipologia, calcola il Deal Score 0–100 e crea i deal in Pipeline. Tutto in parallelo (4 URL contemporanei)." },
      { type: "tip", text: "Limitazione tecnica importante: Immobiliare.it, Idealista.it e Subito.it bloccano il download diretto (anti-bot Cloudflare/DataDome). Il sistema te lo segnala chiaramente nei risultati. Funziona invece con: Casa.it, agenzie indipendenti, RSS feed, aste giudiziarie (PVP), siti immobiliari di provincia. Per Immobiliare/Idealista usa l'import via email forwarding (paragrafo successivo)." },
      { type: "subtitle", text: "Import via email forwarding (IMAP)" },
      { type: "text", text: "Per Immobiliare.it, Idealista.it e qualsiasi altro portale che blocca lo scraping, usa la casella IMAP dedicata. Workflow: 1) sui portali imposta gli alert per i criteri di ricerca che ti interessano (zona, prezzo, mq) e fai recapitare le email su una casella dedicata (es. deals@tuodominio.com). 2) In Impostazioni → Casella email annunci configuri host IMAP, username e password. 3) Click «Sync email» dalla Pipeline o «Sync inbox ora» dalle Impostazioni → l'AI legge le email non lette, estrae tutti gli annunci presenti (anche 10–20 per email) con prezzo/indirizzo/mq, calcola il Deal Score 0–100 e li mette in Pipeline. Le email vengono marcate come lette. Dedup automatico per URL." },
      { type: "tip", text: "Provider supportati (preset rapido): Gmail (richiede App Password, non la password normale), Aruba, Outlook/Hotmail, Libero, Titan/Hostinger. Per Gmail vai su Account Google → Sicurezza → Password per le app, genera una password dedicata per Control Room. Le credenziali sono salvate cifrate (Fernet AES) sul server." },
      { type: "subtitle", text: "Sync automatico in background" },
      { type: "text", text: "Imposta «Sync automatico» a 15min / 30min / 1h / 2h / 6h. Il server controlla la casella all'intervallo scelto anche quando il browser è chiuso, importa automaticamente i nuovi annunci in Pipeline e segna le email come lette. Al mattino apri Control Room e trovi già 5–20 nuovi deal pre-valutati pronti da approfondire — esattamente come un agente immobiliare AI che lavora h24." },
      { type: "tip", text: "Lo scheduler controlla i config IMAP ogni 60 secondi e fa partire i sync di chi ha l'intervallo scaduto. Fallimenti di login (cambio password, scadenza app password) vengono loggati ma non bloccano gli altri utenti. Per mettere in pausa temporaneamente, imposta «Sync abilitato» a No oppure il selettore intervallo su «Off»." },
    ],
  },
  {
    id: "dashboard",
    title: "2. Dashboard",
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
    title: "3. Patrimonio",
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
    title: "4. Scheda Immobile",
    icon: Home,
    intro: "Vista completa di un singolo immobile: foto, score, KPI rapidi, 7 tab tematiche con anagrafica, dati d'acquisto, economici, locazione, documenti, movimenti, alert. Tutti i campi sono editabili direttamente dalle tab.",
    image: "/manual/03-scheda.png",
    blocks: [
      { type: "subtitle", text: "Tab disponibili" },
      { type: "list", items: [
        "Anagrafica: dati identificativi + valore di mercato + costo totale + rivalutazione · MODIFICABILE.",
        "Acquisto: data, prezzo, notaio, agenzia, imposte, spese tecniche, lavori · MODIFICABILE.",
        "Economico: canoni, spese condominio, rendimento, ROI, cash flow, lavori in corso · MODIFICABILE.",
        "Locazione: inquilino, email/telefono, contratto (inizio/fine/canone/deposito), modificabile inline.",
        "Documenti: archivio dell'immobile con upload drag&drop + download + delete.",
        "Movimenti: incassi/uscite dell'immobile.",
        "Alert: numero in badge rosso · anomalie e scadenze attive per questo immobile.",
      ]},
      { type: "subtitle", text: "Come modificare un dato (anagrafica, acquisto, economico)" },
      { type: "text", text: "Vai sulla tab interessata (Anagrafica / Acquisto / Economico) → in alto a destra di ogni card c'è il bottone «Modifica» → cliccalo per trasformare la card in modulo editabile. Modifica i campi che vuoi correggere → click su «Salva» (in alto a destra della stessa card). Il sistema aggiorna l'immobile, ricalcola in tempo reale tutti i KPI dipendenti (rendimento, ROI, cash flow) e ti dà una conferma. Click su «Annulla» per scartare le modifiche." },
      { type: "tip", text: "Cosa NON puoi modificare: codice interno (ID), data di creazione. Il sistema applica una whitelist sui campi modificabili per evitare modifiche accidentali a dati di sistema." },
      { type: "subtitle", text: "Come caricare documenti aggiornati" },
      { type: "text", text: "Vai sulla tab «Documenti» → trascina il file nel rettangolo tratteggiato in alto (PDF, immagini, Excel) oppure seleziona il tipo di documento e clicca «Sfoglia». Il documento viene collegato automaticamente a questo immobile, archiviato in DB cifrato e accessibile da tutta la piattaforma. Max 15 MB per file. Tipologie disponibili: Rogito, Preliminare, Proposta acquisto, Visura catastale, Planimetria, APE, Contratto affitto, Fattura lavori/agenzia/notaio, Atto di mutuo, Fotografie, Perizia, Preventivo, Altro." },
      { type: "tip", text: "Ogni documento può essere scaricato (icona download), eliminato (icona cestino) o analizzato dall'AI: vai in Documenti (menu principale) → click sull'icona «AI» di ogni documento per far estrarre automaticamente i dati strutturati (banca/importo/durata da un atto di mutuo, durata/canone da un contratto, ecc.)." },
      { type: "tip", text: "Sotto il gauge Portfolio Score c'è una mini-card breakdown con base, penalità alert, morosi, bonus rendimento — sempre visibile." },
    ],
  },
  {
    id: "affitti",
    title: "5. Affitti & Locazioni",
    icon: Wallet,
    intro: "Pagina organizzata in 2 tab: «Contratti di locazione» con CRUD completo e «Incassi» con tabella unica filtrabile.",
    image: "/manual/04-affitti.png",
    blocks: [
      { type: "subtitle", text: "KPI principali (sempre visibili in alto)" },
      { type: "list", items: [
        "Canone mensile atteso (somma di tutti i contratti attivi).",
        "Incassato del mese corrente + percentuale di completion.",
        "Tasso occupazione (immobili affittati / immobili a reddito).",
        "Numero morosi (incassi scaduti non a posto).",
      ]},
      { type: "subtitle", text: "Tab 1 — Contratti di locazione (CRUD)" },
      { type: "list", items: [
        "Tabella con tutti gli immobili a reddito: nome, inquilino, contatti (email/tel), periodo contratto, canone, deposito, stato.",
        "Filtri rapidi: Attivi · Sfitti · Tutti (con contatore).",
        "Ricerca live su immobile/inquilino/indirizzo.",
        "Bottone «Modifica» su ogni riga → modal con tutti i campi del contratto (inquilino, email, telefono, date, canone, deposito, spese, stato) editabili e salvati con un click.",
        "Bottone «+ Nuovo contratto» in alto → seleziona un immobile sfitto e crea il contratto: il sistema genera automaticamente 12 mesi di incassi previsti.",
        "Scadenza contratto in giallo se entro 90 giorni (visibilità preventiva sui rinnovi).",
      ]},
      { type: "subtitle", text: "Tab 2 — Incassi (tabella unica con filtri avanzati)" },
      { type: "list", items: [
        "Una sola tabella con TUTTI gli incassi (storici + attuali + futuri), ordinati cronologicamente.",
        "Filtri: ricerca testuale · Stato (Pagato/Parziale/Previsto/In ritardo/Non pagato) · Anno · Mese · Immobile specifico.",
        "Bottone «Reset filtri» se attivi.",
        "Footer con totali in tempo reale: Previsto · Incassato · Delta (verde se positivo, rosso se negativo).",
        "Bottone «Segna pagato» su ogni riga non ancora pagata → modal con importo, data, metodo (bonifico/contanti/assegno).",
      ]},
      { type: "subtitle", text: "Riconciliazione bancaria automatica" },
      { type: "text", text: "Quando importi l'estratto conto bancario nel Centro Import, premi «Riconcilia con banca» in alto a destra per abbinare automaticamente movimenti in entrata agli incassi previsti (tolleranze ±3% sull'importo, ±12 giorni dal 1° del mese)." },
      { type: "subtitle", text: "Solleciti automatici WhatsApp/Email" },
      { type: "text", text: "Nella tab Contratti → modifica un contratto → inserisci email + telefono WhatsApp dell'inquilino. Il sistema scansiona giornalmente gli incassi non pagati e categorizza in 3 livelli: T+5 giorni (sollecito cortese), T+15 giorni (sollecito fermo), T+30 giorni (intimazione)." },
      { type: "tip", text: "Vai in Notifiche → «Solleciti da inviare»: vedrai i deep link wa.me e mailto: pre-compilati con testo AI personalizzato (importo, mese, immobile). Click → si apre WhatsApp/Mail con il messaggio già scritto. Le soglie T+5/15/30 sono modificabili in Impostazioni." },
    ],
  },
  {
    id: "mutui",
    title: "6. Mutui & Finanziamenti",
    icon: Landmark,
    intro: "Gestione completa dei finanziamenti bancari con piano di ammortamento, LTV, capitale residuo, incidenza rata su affitti, alert finanziari.",
    blocks: [
      { type: "subtitle", text: "Anagrafica mutuo" },
      { type: "list", items: [
        "Immobile collegato + banca + importo originario + capitale residuo.",
        "Tasso (fisso o variabile) + durata anni + rata mensile.",
        "Quota capitale / quota interessi (calcolata automaticamente dal piano di ammortamento).",
        "Ipoteca + garanzie + note.",
      ]},
      { type: "subtitle", text: "Caricamento AI da atto di mutuo" },
      { type: "text", text: "Click «Carica atto di mutuo» → trascina il PDF → l'AI legge il documento (Claude Sonnet) ed estrae automaticamente: banca, importo, tasso, durata, rata, data inizio. Ti basta confermare e collegare l'immobile." },
      { type: "subtitle", text: "Dashboard debito" },
      { type: "list", items: [
        "Debito totale residuo + rata mensile totale + interessi annui.",
        "Loan-to-Value (LTV) medio e per singolo immobile.",
        "Incidenza rate su affitti: percentuale del canone che va in mutuo.",
        "Sostenibilità finanziaria: cash flow netto dopo rate.",
      ]},
      { type: "subtitle", text: "Alert finanziari automatici" },
      { type: "text", text: "Il sistema avvisa quando: rata supera il cash flow generato dall'immobile, LTV sopra l'80%, mutuo in scadenza entro 12 mesi, tasso fuori mercato da rinegoziare." },
    ],
  },
  {
    id: "vendite",
    title: "7. Vendite & Rivendite",
    icon: TrendingUp,
    intro: "Sezione dedicata agli immobili in vendita o già venduti: prezzo richiesto, minimo accettabile, prezzo finale, agenzia, provvigioni, margine netto, ROI operazione.",
    blocks: [
      { type: "subtitle", text: "Per ogni vendita registri" },
      { type: "list", items: [
        "Data messa in vendita + prezzo richiesto + prezzo minimo accettabile.",
        "Data compromesso + data rogito vendita + prezzo vendita effettivo.",
        "Agenzia coinvolta + provvigione + altri costi vendita.",
        "Il sistema calcola: utile lordo, utile netto, ROI finale, percentuale di margine, rendimento annuo equivalente, durata operazione, capitale liberato.",
      ]},
      { type: "tip", text: "Le operazioni compra-ristruttura-vendi mostrano anche il margine residuo: prezzo vendita atteso – costo totale (acquisto + accessori + lavori) – costi vendita. Utile per decidere quando staccare la spina." },
    ],
  },
  {
    id: "lavori",
    title: "8. Lavori & Ristrutturazioni",
    icon: Hammer,
    intro: "Tracciamento dei cantieri: budget previsto vs costo effettivo, percentuale avanzamento, scostamento, alert superamento budget, categorie costo dettagliate.",
    blocks: [
      { type: "subtitle", text: "Per ogni cantiere" },
      { type: "list", items: [
        "Descrizione lavori + immobile + impresa incaricata + tecnico/direttore lavori.",
        "Data inizio + data fine prevista + data fine effettiva.",
        "Budget iniziale + costo effettivo + costi ancora previsti.",
        "Stato avanzamento (0–100%) + note.",
      ]},
      { type: "subtitle", text: "Categorie di costo" },
      { type: "text", text: "Muratura, impianto elettrico, impianto idraulico, serramenti, pavimenti, bagno, cucina, tinteggiatura, arredamento, pratiche tecniche, direzione lavori, imprevisti. Ogni voce ha il suo budget e il suo consuntivo." },
      { type: "subtitle", text: "Alert scostamento budget" },
      { type: "text", text: "Quando i costi sostenuti superano il budget previsto del 10%, parte un alert automatico. Quando arrivano al 100%, l'alert diventa critico." },
    ],
  },
  {
    id: "costi-ricavi",
    title: "9. Costi & Ricavi",
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
    id: "cashflow",
    title: "10. Cash Flow",
    icon: Receipt,
    intro: "Vista mensile dei flussi di cassa: saldo iniziale, incassi affitti/vendite, uscite (lavori, mutui, tasse, gestione), saldo finale. Forecast a 30/90/180/365 giorni con simulazione delle scadenze ricorrenti.",
    blocks: [
      { type: "subtitle", text: "Vista mese per mese" },
      { type: "list", items: [
        "Saldo iniziale del mese (porta avanti il saldo del mese precedente).",
        "Incassi: affitti, vendite, altri ricavi.",
        "Uscite: lavori, mutui, fiscali, gestione, altre.",
        "Saldo finale + variazione percentuale rispetto al mese precedente.",
      ]},
      { type: "subtitle", text: "Cash flow per immobile" },
      { type: "text", text: "Per ogni immobile vedi: incassi totali, uscite totali, saldo netto, rendimento mensile reale, storico cash flow degli ultimi 12 mesi." },
      { type: "subtitle", text: "Forecast cash flow" },
      { type: "text", text: "Il sistema prevede la liquidità a 30, 90, 180 e 365 giorni proiettando: rate mutuo, scadenze fiscali, canoni in incasso, eventuali lavori pianificati. Avvisa quando un mese ha cash flow negativo previsto." },
    ],
  },
  {
    id: "scadenzario",
    title: "11. Scadenzario fiscale",
    icon: CalendarClock,
    intro: "Calendario automatico delle scadenze fiscali e amministrative legate al patrimonio: IMU (giugno/dicembre), TARI, registrazione contratti, dichiarazioni redditi, F24 mutuo, assicurazioni.",
    blocks: [
      { type: "subtitle", text: "Scadenze generate automaticamente" },
      { type: "list", items: [
        "IMU acconto (16 giugno) e saldo (16 dicembre) — stimata su valore catastale × aliquota IMU media (modificabile in Impostazioni).",
        "TARI (variabile per comune).",
        "Registrazione annuale contratti di locazione.",
        "Rinnovo APE alla scadenza decennale.",
        "Rinnovo polizze assicurazione fabbricato.",
        "Dichiarazione redditi società (giugno/luglio).",
      ]},
      { type: "subtitle", text: "Vista calendario + lista" },
      { type: "text", text: "Toggle tra vista calendario mensile e vista lista cronologica. Ogni scadenza è cliccabile per vedere il dettaglio, segnarla come «Pagata», o aggiungere note." },
      { type: "tip", text: "Le scadenze entro 30 giorni diventano automaticamente alert nel Centro Alert. Le scadenze pagate restano archiviate per export storico." },
    ],
  },
  {
    id: "documenti",
    title: "12. Documenti + AI Reader",
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
    title: "13. Centro Import",
    icon: Upload,
    intro: "Centro per l'import in massa di dati: bilanci, estratti conto e — fondamentale — il template Excel per caricare in un colpo solo l'intero patrimonio immobiliare esistente.",
    blocks: [
      { type: "subtitle", text: "Template immobili in massa (Excel)" },
      { type: "text", text: "Scarica il template strutturato in 8 gruppi colore (Anagrafica · Dati tecnici · Stato · Acquisto · Valore · Locazione · Mutuo · Note) per un totale di 38 campi. Comprende dropdown automatici per Tipologia, Classe energetica, Stato, Operazione, Tipo tasso mutuo. Riga di esempio inclusa. Sheet «Guida compilazione» con guida completa di 130+ righe: come iniziare in 4 step, regole generali, formato date/importi, dettaglio di ogni singolo campo con esempi, 3 scenari pratici, FAQ con 9 domande frequenti, effetti automatici post-import. Sheet «Valori ammessi» con tutti gli enum." },
      { type: "list", items: [
        "Centro Import → tab Immobili → click «Scarica template» (oppure URL diretto /downloads/template_immobili_control_room.xlsx).",
        "Compila una riga per immobile a partire dalla riga 3 (lascia righe 1 e 2: super-header e intestazioni).",
        "Inquilino email/telefono sono FONDAMENTALI: abilitano i solleciti automatici WhatsApp/Email a T+5/15/30 giorni.",
        "Telefono in formato internazionale: +393331234567 (no spazi, no trattini).",
        "Compila i campi mutuo solo se l'immobile è gravato: l'import li replica anche in /mutui con piano di ammortamento automatico.",
        "Date sempre YYYY-MM-DD · Importi senza € e senza separatore migliaia.",
        "Carica il file → anteprima con warnings per riga → conferma import → tutti gli immobili creati in un colpo.",
      ]},
      { type: "tip", text: "I template scaricati dalla versione precedente (24 colonne) NON sono compatibili con questa versione: le colonne hanno posizioni diverse. Scarica il nuovo template, ricompila e ricarica. Il sistema rileva automaticamente i template obsoleti e ti mostra un messaggio chiaro." },
      { type: "subtitle", text: "Altri tipi di import" },
      { type: "list", items: [
        "Bilanci AI: PDF del commercialista → AI estrae ricavi/costi/utile automaticamente.",
        "Storico MoM: confronto periodi mese su mese, anno su anno.",
        "Estratto conto: PDF/CSV/Excel → AI categorizza i movimenti (affitti, IMU, condominio, rate mutuo).",
      ]},
      { type: "tip", text: "L'import non duplica: l'algoritmo usa fingerprint (data+importo+descrizione) per evitare doppioni." },
    ],
  },
  {
    id: "alert",
    title: "14. AI Alert Center",
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
    title: "15. Forecast & Piano AI",
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
    title: "16. Mappa Patrimonio",
    icon: Map,
    intro: "Distribuzione geografica con marker colorati (verde rendimento alto, ambra medio, rosso critico, blu in vendita). Click sul marker per i dettagli.",
    image: "/manual/10-mappa.png",
    blocks: [
      { type: "text", text: "Utile per visualizzare concentrazione geografica e identificare immobili problematici a colpo d'occhio." },
    ],
  },
  {
    id: "kpi",
    title: "17. KPI & Rendimenti",
    icon: BarChart3,
    intro: "Classifiche e indicatori dettagliati: migliori/peggiori immobili per rendimento netto, cash flow, rivalutazione. Suggerimenti AI «da vendere/rifinanziare/ristrutturare/tenere».",
    image: "/manual/11-kpi.png",
    blocks: [
      { type: "subtitle", text: "Decisioni guidate" },
      { type: "text", text: "Il sistema genera classifiche automatiche basate sui KPI in tempo reale per supportare le decisioni: quale immobile vendere prima, quale rifinanziare, quale tenere." },
    ],
  },
  {
    id: "simulatore",
    title: "18. Simulatore Investimenti",
    icon: Calculator,
    intro: "Strumento di valutazione rapida per nuovi acquisti, scenari affitto, scenari rivendita. Calcola in tempo reale ROI, cash flow, prezzo massimo consigliato, break-even.",
    blocks: [
      { type: "subtitle", text: "3 simulatori" },
      { type: "list", items: [
        "Nuovo acquisto: inserisci prezzo + costi accessori + lavori + canone atteso → output ROI, rendimento netto reale, cash flow, prezzo max consigliato sotto il quale comprare.",
        "Affitto: canone sostenibile, scenari sfitto (vacancy), morosità, aumento canone ISTAT.",
        "Rivendita: prezzo vendita minimo per pareggio, target di margine, impatto lavori e costi accessori.",
      ]},
      { type: "subtitle", text: "Tasse SRL vs Privato" },
      { type: "text", text: "Toggle in alto: scegli «SRL» per applicare IRES 24% + IRAP 3,9% = 27,9% sull'utile lordo, oppure «Privato» per cedolare secca 21% sul canone. I rendimenti netti vengono ricalcolati istantaneamente con la corretta tassazione." },
      { type: "subtitle", text: "Toggle Mutuo" },
      { type: "text", text: "Toggle «Con mutuo» / «Senza mutuo» per vedere come cambia il cash flow e il ROI con o senza leva finanziaria. Il sistema usa le tue impostazioni standard di tasso medio (modificabile)." },
      { type: "tip", text: "Tutti i calcoli sono trasparenti: cliccando sui valori vedi la formula esatta (es: rendimento netto = (canone annuo × (1 – 0,279) – costi gestione) / costo totale × 100)." },
    ],
  },
  {
    id: "banker-pack",
    title: "19. Banker Pack PDF",
    icon: FileDown,
    intro: "Pacchetto documentale PDF pronto per la banca: anagrafica società, lista immobili con valori, KPI patrimoniali, posizione debitoria, cash flow storico, proiezioni.",
    blocks: [
      { type: "subtitle", text: "Cosa contiene" },
      { type: "list", items: [
        "Copertina con dati società e data di generazione.",
        "Sintesi patrimoniale: numero immobili, valore totale, debito residuo, patrimonio netto, LTV medio.",
        "Tabella immobili: indirizzo, valore stimato, mutuo residuo, canone, rendimento netto.",
        "Andamento cash flow ultimi 12 mesi.",
        "Posizione finanziaria: lista mutui in essere con banche, capitale residuo, scadenze.",
        "Proiezioni economiche a 3 anni (se hai generato un Forecast).",
      ]},
      { type: "subtitle", text: "Come generarlo" },
      { type: "text", text: "Vai in Report → Banker Pack → click «Genera PDF». Il sistema impiega 3–5 secondi e ti restituisce un file pronto da inviare in banca o al commercialista." },
      { type: "tip", text: "Aggiorna sempre i dati prima di generare: importa l'estratto conto del mese, registra gli affitti incassati, aggiorna il capitale residuo dei mutui. Più dati reali, più credibilità in banca." },
    ],
  },
  {
    id: "impostazioni",
    title: "20. Impostazioni",
    icon: Settings,
    intro: "Parametri della società, soglie di target, modalità fiscale, soglie solleciti automatici, propensione al rischio per l'AI Strategist.",
    blocks: [
      { type: "subtitle", text: "Parametri società" },
      { type: "list", items: [
        "Nome società + valuta.",
        "Liquidità iniziale: il saldo di partenza del conto al momento del primo utilizzo.",
        "Tipo società: SRL (IRES + IRAP) oppure Privato (cedolare secca).",
        "Aliquote fiscali: IRES (default 24%), IRAP (default 3,9%), IMU media stimata.",
      ]},
      { type: "subtitle", text: "Soglie target" },
      { type: "list", items: [
        "Rendimento netto minimo: sotto questa soglia l'immobile è «sottoperformante» (default 4,5%).",
        "ROI target: usato dall'AI Deal Analyzer per i suggerimenti.",
        "Cash flow minimo per immobile.",
      ]},
      { type: "subtitle", text: "Soglie solleciti automatici" },
      { type: "list", items: [
        "Sollecito cortese: T+5 giorni dalla data di scadenza canone (default).",
        "Sollecito fermo: T+15 giorni.",
        "Intimazione: T+30 giorni (usata anche come trigger per alert critico).",
      ]},
      { type: "subtitle", text: "Parametri AI Strategist" },
      { type: "text", text: "Target rendimento netto, propensione al rischio (Bassa/Media/Alta), strategia preferita (affitto / rivendita / mista), capitale disponibile, limite indebitamento, orizzonte di investimento (anni). Sono passati a Claude Sonnet 4.6 quando generi un Forecast o un Piano d'Azione." },
    ],
  },
  {
    id: "workflow",
    title: "Workflow tipico — Da zero al primo report",
    icon: Sparkles,
    intro: "Sequenza consigliata per portare un nuovo immobile dalla scoperta dell'annuncio fino a un piano industriale finanziabile in banca.",
    blocks: [
      { type: "subtitle", text: "Step 1 — Apri il deal in Pipeline" },
      { type: "text", text: "Pipeline → «Nuovo deal» → inserisci indirizzo, prezzo richiesto, canone atteso → l'AI ti dà subito un Deal Score 0–100 e un prezzo massimo consigliato. Stage iniziale: Visionato." },
      { type: "subtitle", text: "Step 2 — Avanza nella pipeline" },
      { type: "text", text: "Registra ogni evento: visita, offerta, controproposta, mutuo richiesto, preliminare. Il sistema avanza automaticamente gli stage e aggiorna il prezzo corrente man mano che negozi." },
      { type: "subtitle", text: "Step 3 — Converti in patrimonio al rogito" },
      { type: "text", text: "Quando lo stage diventa «Rogito», click su «Converti in patrimonio» → crea automaticamente l'immobile, il mutuo collegato (se hai registrato la banca), tutte le date e il prezzo finale." },
      { type: "subtitle", text: "Step 4 — Inserisci la locazione" },
      { type: "text", text: "Scheda Immobile → tab Locazione → compila inquilino + email + WhatsApp + date + canone + deposito → salva. Auto-generati gli incassi previsti per i mesi del contratto." },
      { type: "subtitle", text: "Step 5 — Carica i documenti" },
      { type: "text", text: "Documenti → carica rogito.pdf + contratto.pdf + atto di mutuo + visura + APE → click «AI» su ognuno → estrazione dati + alert automatici + scadenze nel Scadenzario." },
      { type: "subtitle", text: "Step 6 — Importa l'estratto conto" },
      { type: "text", text: "Centro Import → tab Estratto conto → trascina il PDF → l'AI categorizza i movimenti (affitti, IMU, condominio, rata mutuo)." },
      { type: "subtitle", text: "Step 7 — Riconcilia gli affitti" },
      { type: "text", text: "Affitti → «Riconcilia con banca» → gli incassi previsti vengono abbinati ai bonifici in entrata. Per i ritardatari il sistema prepara i solleciti WhatsApp/Email pronti." },
      { type: "subtitle", text: "Step 8 — Simula e pianifica" },
      { type: "text", text: "Forecast → descrivi il piano (o usa il Simulatore per nuovi acquisti) → genera → leggi il Piano d'Azione → scarica il Banker Pack PDF da Report per la banca." },
      { type: "tip", text: "Il Banker Pack PDF contiene: portafoglio attuale, posizione debitoria con LTV, scenari pessimistico/realistico/ottimistico, stress test, piano d'azione AI con priorità — direttamente presentabile in banca per nuove acquisizioni o rifinanziamenti." },
    ],
  },
];

export default function Manuale() {
  const [searchParams] = useSearchParams();
  const initial = searchParams.get("s");
  const [active, setActive] = useState(
    initial && SECTIONS.find(s => s.id === initial) ? initial : "introduzione"
  );
  useEffect(() => {
    const s = searchParams.get("s");
    if (s && SECTIONS.find(x => x.id === s)) {
      setActive(s);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [searchParams]);
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
                if (b.type === "tour") return (
                  <button
                    key={i}
                    data-testid="restart-tour"
                    onClick={restartTour}
                    className="w-full mt-2 flex items-center justify-between gap-3 p-3 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] hover:bg-[#DBEAFE] transition group"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <Sparkles size={14} className="text-[#1E40AF]" />
                      <div>
                        <div className="text-sm font-semibold text-[#1E40AF]">Rifai il tour guidato</div>
                        <div className="text-[11px] text-[#3B82F6]">7 step in 30 secondi sulle sezioni più importanti</div>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-[#1E40AF] group-hover:translate-x-0.5 transition-transform" />
                  </button>
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
