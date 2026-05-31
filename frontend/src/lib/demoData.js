// Dati demo realistici per il mockup del Control Room immobiliare.
// Tutti i numeri sono in EUR.

export const PROPERTY_IMAGES = [
  "https://images.unsplash.com/photo-1619218070141-bcfeb8b93074?crop=entropy&cs=srgb&fm=jpg&w=800",
  "https://images.unsplash.com/photo-1635506232643-6c526f97e519?crop=entropy&cs=srgb&fm=jpg&w=800",
  "https://images.unsplash.com/photo-1597682496035-b04f723202a4?crop=entropy&cs=srgb&fm=jpg&w=800",
  "https://images.unsplash.com/photo-1734173071981-b16ee4f9867f?crop=entropy&cs=srgb&fm=jpg&w=800",
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?crop=entropy&cs=srgb&fm=jpg&w=800",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?crop=entropy&cs=srgb&fm=jpg&w=800",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?crop=entropy&cs=srgb&fm=jpg&w=800",
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?crop=entropy&cs=srgb&fm=jpg&w=800",
];

export const STATI = {
  in_valutazione: "In valutazione",
  in_trattativa: "In trattativa",
  acquistato: "Acquistato",
  in_ristrutturazione: "In ristrutturazione",
  disponibile: "Disponibile",
  affittato: "Affittato",
  sfitto: "Sfitto",
  in_vendita: "In vendita",
  venduto: "Venduto",
  archiviato: "Archiviato",
};

export const properties = [
  {
    id: "IMM-001", nome: "Via Foligno", indirizzo: "Via Foligno 18", citta: "Torino", provincia: "TO",
    tipologia: "Bilocale", metratura: 55, piano: "2°", anno_costruzione: 1965, classe_energetica: "E",
    stato: "affittato", operazione: "reddito", img: PROPERTY_IMAGES[0], lat: 45.0808, lng: 7.6555,
    data_acquisto: "2025-02-15", prezzo_acquisto: 24000, notaio: 0, agenzia: 3000, imposte: 2160,
    lavori: 0, costo_totale: 29160, valore_stimato: 32000,
    canone_mensile: 320, rendimento_lordo: 13.17, rendimento_netto: 9.88, cash_flow_mensile: 224,
    mutuo: null,
    portfolio_score: 92, lat_lng: [45.0808, 7.6555],
  },
  {
    id: "IMM-002", nome: "Negozio P.za De Amicis", indirizzo: "Piazza Edmondo De Amicis 4", citta: "Torino", provincia: "TO",
    tipologia: "Negozio", metratura: 78, piano: "T", anno_costruzione: 1955, classe_energetica: "F",
    stato: "affittato", operazione: "reddito", img: PROPERTY_IMAGES[1], lat: 45.0508, lng: 7.6677,
    data_acquisto: "2025-05-10", prezzo_acquisto: 60000, notaio: 0, agenzia: 0, imposte: 5400,
    lavori: 0, costo_totale: 65400, valore_stimato: 70000,
    canone_mensile: 590, rendimento_lordo: 10.83, rendimento_netto: 8.12, cash_flow_mensile: 413,
    mutuo: null,
    portfolio_score: 84, lat_lng: [45.0508, 7.6677],
  },
  {
    id: "IMM-003", nome: "Via Borgaro", indirizzo: "Via Borgaro 86", citta: "Torino", provincia: "TO",
    tipologia: "Bilocale", metratura: 52, piano: "1°", anno_costruzione: 1968, classe_energetica: "E",
    stato: "affittato", operazione: "reddito", img: PROPERTY_IMAGES[2], lat: 45.0987, lng: 7.6601,
    data_acquisto: "2025-07-08", prezzo_acquisto: 52000, notaio: 0, agenzia: 3000, imposte: 4680,
    lavori: 0, costo_totale: 59680, valore_stimato: 62000,
    canone_mensile: 480, rendimento_lordo: 9.65, rendimento_netto: 7.24, cash_flow_mensile: 336,
    mutuo: null,
    portfolio_score: 78, lat_lng: [45.0987, 7.6601],
  },
  {
    id: "IMM-004", nome: "Via Don Bosco", indirizzo: "Via Don Giovanni Bosco 22", citta: "Torino", provincia: "TO",
    tipologia: "Bilocale", metratura: 50, piano: "3°", anno_costruzione: 1960, classe_energetica: "F",
    stato: "affittato", operazione: "reddito", img: PROPERTY_IMAGES[3], lat: 45.0625, lng: 7.6932,
    data_acquisto: "2025-09-15", prezzo_acquisto: 51000, notaio: 0, agenzia: 6000, imposte: 4590,
    lavori: 0, costo_totale: 61590, valore_stimato: 63000,
    canone_mensile: 420, rendimento_lordo: 8.18, rendimento_netto: 6.14, cash_flow_mensile: 294,
    mutuo: null,
    portfolio_score: 70, lat_lng: [45.0625, 7.6932],
  },
  {
    id: "IMM-005", nome: "Via Lauro Rossi", indirizzo: "Via Lauro Rossi 14", citta: "Torino", provincia: "TO",
    tipologia: "Bilocale", metratura: 54, piano: "2°", anno_costruzione: 1963, classe_energetica: "E",
    stato: "affittato", operazione: "reddito", img: PROPERTY_IMAGES[4], lat: 45.0930, lng: 7.6390,
    data_acquisto: "2025-11-20", prezzo_acquisto: 58000, notaio: 0, agenzia: 4000, imposte: 5220,
    lavori: 0, costo_totale: 67220, valore_stimato: 70000,
    canone_mensile: 480, rendimento_lordo: 8.57, rendimento_netto: 6.43, cash_flow_mensile: 336,
    mutuo: null,
    portfolio_score: 73, lat_lng: [45.0930, 7.6390],
  },
];

// === Aggregate KPI ===
// Portafoglio 5 immobili Torino, acquistati nel 2025, tutti affittati al 100% da Gen 2026.
export const portfolioKPI = {
  totale_immobili: properties.length,
  valore_acquisto_totale: properties.reduce((s, p) => s + (p.prezzo_acquisto || 0), 0),    // 245.000
  valore_stimato_totale: properties.reduce((s, p) => s + (p.valore_stimato || 0), 0),      // 297.000
  capitale_investito: properties.reduce((s, p) => s + (p.costo_totale || 0), 0),           // 283.050
  ricavi_mensili: properties.reduce((s, p) => s + (p.canone_mensile || 0), 0),             // 2.290
  cash_flow_mensile: properties.reduce((s, p) => s + (p.cash_flow_mensile || 0), 0),       // 1.603
  debito_residuo: properties.reduce((s, p) => s + (p.mutuo?.residuo || 0), 0),             // 0
  liquidita_disponibile: 35000,
  rendimento_medio_lordo: 10.08,
  rendimento_medio_netto: 7.56,
  utile_anno: 19236,                // annualizzato: ~1.603 cash flow mensile × 12
  immobili_profittevoli: 5,
  immobili_sotto_target: 1,         // Don Bosco sotto 7%
  immobili_sfitti: 0,
  immobili_in_lavorazione: 0,
  immobili_in_vendita: 0,
};

// === Cash Flow mensile (a partire da Gen 2026, primo mese a regime) ===
export const cashFlowMensile = [
  { mese: "Gen '26", incassi: 2290, uscite: 470, saldo: 1820 },
  { mese: "Feb '26", incassi: 2290, uscite: 470, saldo: 1820 },
];

// === Forecast 12 mesi (full occupancy €2.290/mese) ===
export const cashFlowForecast = [
  { mese: "Mar '26", saldo_previsto: 1820 },
  { mese: "Apr '26", saldo_previsto: 1820 },
  { mese: "Mag '26", saldo_previsto: 1820 },
  { mese: "Giu '26", saldo_previsto: 1070 },  // IMU acconto
  { mese: "Lug '26", saldo_previsto: 1820 },
  { mese: "Ago '26", saldo_previsto: 1820 },
  { mese: "Set '26", saldo_previsto: 1820 },
  { mese: "Ott '26", saldo_previsto: 1820 },
  { mese: "Nov '26", saldo_previsto: 1820 },
  { mese: "Dic '26", saldo_previsto: 1070 },  // IMU saldo
  { mese: "Gen '27", saldo_previsto: 1820 },
  { mese: "Feb '27", saldo_previsto: 1820 },
];

// === Ricavi vs Costi (a partire da Gen 2026) ===
export const ricaviCostiAnnuali = [
  { mese: "Gen '26", ricavi: 2290, costi: 470 },
  { mese: "Feb '26", ricavi: 2290, costi: 470 },
];

// === Distribuzione patrimonio per tipologia ===
export const distribuzioneTipologia = [
  { name: "Bilocali", value: 4, color: "#0066FF" },
  { name: "Negozi",   value: 1, color: "#F59E0B" },
];

// === Contratti affitto ===
export const contratti = [
  { id: "C-001", immobile_id: "IMM-001", conduttore: "Inquilino Via Foligno",   inizio: "2026-01-01", fine: "2030-01-01", canone: 320, deposito: 640,  stato: "attivo", istat: true },
  { id: "C-002", immobile_id: "IMM-002", conduttore: "Conduttore Negozio",       inizio: "2026-01-01", fine: "2032-01-01", canone: 590, deposito: 1770, stato: "attivo", istat: true },
  { id: "C-003", immobile_id: "IMM-003", conduttore: "Inquilino Via Borgaro",   inizio: "2026-01-01", fine: "2030-01-01", canone: 480, deposito: 960,  stato: "attivo", istat: true },
  { id: "C-004", immobile_id: "IMM-004", conduttore: "Inquilino Via Don Bosco", inizio: "2026-01-01", fine: "2030-01-01", canone: 420, deposito: 840,  stato: "attivo", istat: true },
  { id: "C-005", immobile_id: "IMM-005", conduttore: "Inquilino Lauro Rossi",   inizio: "2026-01-01", fine: "2030-01-01", canone: 480, deposito: 960,  stato: "attivo", istat: true },
];

// === Incassi affitti (mese corrente: Feb 2026) ===
export const incassi = [
  { contratto_id: "C-001", mese: "Feb 2026", previsto: 320, incassato: 320, data: "2026-02-03", stato: "pagato" },
  { contratto_id: "C-002", mese: "Feb 2026", previsto: 590, incassato: 590, data: "2026-02-02", stato: "pagato" },
  { contratto_id: "C-003", mese: "Feb 2026", previsto: 480, incassato: 480, data: "2026-02-05", stato: "pagato" },
  { contratto_id: "C-004", mese: "Feb 2026", previsto: 420, incassato: 420, data: "2026-02-04", stato: "pagato" },
  { contratto_id: "C-005", mese: "Feb 2026", previsto: 480, incassato: 480, data: "2026-02-06", stato: "pagato" },
];

// === Lavori in corso (nessuno: immobili già a reddito) ===
export const lavori = [];

// === Movimenti costi/ricavi recenti — solo da Gen 2026 in poi (entrata a regime) ===
export const movimenti = [
  { id: "M-001", data: "2026-02-06", tipo: "ricavo", categoria: "Affitto", descrizione: "Canone Via Lauro Rossi (feb)",    immobile_id: "IMM-005", importo: 480 },
  { id: "M-002", data: "2026-02-05", tipo: "ricavo", categoria: "Affitto", descrizione: "Canone Via Borgaro (feb)",         immobile_id: "IMM-003", importo: 480 },
  { id: "M-003", data: "2026-02-04", tipo: "ricavo", categoria: "Affitto", descrizione: "Canone Via Don Bosco (feb)",       immobile_id: "IMM-004", importo: 420 },
  { id: "M-004", data: "2026-02-03", tipo: "ricavo", categoria: "Affitto", descrizione: "Canone Via Foligno (feb)",         immobile_id: "IMM-001", importo: 320 },
  { id: "M-005", data: "2026-02-02", tipo: "ricavo", categoria: "Affitto", descrizione: "Canone Negozio De Amicis (feb)",   immobile_id: "IMM-002", importo: 590 },
  { id: "M-006", data: "2026-02-01", tipo: "costo",  categoria: "Manutenzione", descrizione: "Manutenzione ordinaria",      immobile_id: null,      importo: 220 },
  { id: "M-007", data: "2026-01-15", tipo: "ricavo", categoria: "Affitto", descrizione: "Canone Via Foligno (gen)",         immobile_id: "IMM-001", importo: 320 },
  { id: "M-008", data: "2026-01-12", tipo: "ricavo", categoria: "Affitto", descrizione: "Canone Negozio De Amicis (gen)",   immobile_id: "IMM-002", importo: 590 },
  { id: "M-009", data: "2026-01-10", tipo: "ricavo", categoria: "Affitto", descrizione: "Canone Via Borgaro (gen)",         immobile_id: "IMM-003", importo: 480 },
  { id: "M-010", data: "2026-01-08", tipo: "ricavo", categoria: "Affitto", descrizione: "Canone Via Don Bosco (gen)",       immobile_id: "IMM-004", importo: 420 },
  { id: "M-011", data: "2026-01-07", tipo: "ricavo", categoria: "Affitto", descrizione: "Canone Via Lauro Rossi (gen)",     immobile_id: "IMM-005", importo: 480 },
  { id: "M-012", data: "2026-01-05", tipo: "costo",  categoria: "Condominio",  descrizione: "Quote condominiali Q1 (5 imm.)", immobile_id: null,      importo: 470 },
];

// === Mutui (nessuno: tutti acquisti cash) ===
export const mutui = properties
  .filter(p => p.mutuo)
  .map(p => ({
    id: `MUT-${p.id}`,
    immobile_id: p.id,
    banca: p.mutuo.banca,
    importo_originario: Math.round(p.mutuo.residuo * 1.6),
    capitale_residuo: p.mutuo.residuo,
    tasso: p.mutuo.tasso,
    tipo_tasso: "Variabile",
    rata: p.mutuo.rata,
    durata_anni: 20,
    data_inizio: p.data_acquisto,
  }));

// === Alerts ===
export const alerts = [
  { id: "A-001", tipo: "strategico",  severity: "media", titolo: "Portafoglio appena entrato a regime",          descrizione: "Tutti i 5 immobili sono affittati dal 01/01/2026. Il primo bilancio completo sarà disponibile a fine Q1.", immobile_id: null,    ts: "2026-02-12" },
  { id: "A-002", tipo: "strategico",  severity: "media", titolo: "Concentrazione geografica 100% Torino",        descrizione: "Tutto il portafoglio (5 immobili) è concentrato a Torino. Valuta diversificazione geografica.",                  immobile_id: null,    ts: "2026-02-10" },
  { id: "A-003", tipo: "strategico",  severity: "bassa", titolo: "Opportunità leva finanziaria",                  descrizione: "Tutti gli immobili sono cash. Un mutuo al 60% libererebbe ~€170k da reinvestire.",                                immobile_id: null,    ts: "2026-02-08" },
  { id: "A-004", tipo: "economico",   severity: "bassa", titolo: "Rendimento sotto target Via Don Bosco",         descrizione: "Rend. netto 6,14% — leggermente sotto il target del 7%. Valuta aumento canone alla prima rinegoziazione.",      immobile_id: "IMM-004", ts: "2026-02-05" },
  { id: "A-005", tipo: "documentale", severity: "bassa", titolo: "APE in scadenza Via Foligno",                   descrizione: "APE Via Foligno scade tra 60 giorni — rinnovo necessario.",                                                       immobile_id: "IMM-001", ts: "2026-02-01" },
];

// === Documenti — archivio completo dei 5 immobili Torino ===
export const documenti = [
  // Rogiti
  { id: "D-001", nome: "Rogito Via Foligno.pdf",          tipo: "Rogito",       immobile_id: "IMM-001", dimensione: "2.1 MB", caricato: "2025-02-15" },
  { id: "D-002", nome: "Rogito Negozio De Amicis.pdf",    tipo: "Rogito",       immobile_id: "IMM-002", dimensione: "2.4 MB", caricato: "2025-05-10" },
  { id: "D-003", nome: "Rogito Via Borgaro.pdf",          tipo: "Rogito",       immobile_id: "IMM-003", dimensione: "2.0 MB", caricato: "2025-07-08" },
  { id: "D-004", nome: "Rogito Via Don Bosco.pdf",        tipo: "Rogito",       immobile_id: "IMM-004", dimensione: "2.2 MB", caricato: "2025-09-15" },
  { id: "D-005", nome: "Rogito Via Lauro Rossi.pdf",      tipo: "Rogito",       immobile_id: "IMM-005", dimensione: "2.3 MB", caricato: "2025-11-20" },
  // APE
  { id: "D-006", nome: "APE Via Foligno.pdf",             tipo: "APE",          immobile_id: "IMM-001", dimensione: "0.7 MB", caricato: "2025-02-10" },
  { id: "D-007", nome: "APE Negozio De Amicis.pdf",       tipo: "APE",          immobile_id: "IMM-002", dimensione: "0.8 MB", caricato: "2025-05-05" },
  { id: "D-008", nome: "APE Via Borgaro.pdf",             tipo: "APE",          immobile_id: "IMM-003", dimensione: "0.7 MB", caricato: "2025-07-03" },
  { id: "D-009", nome: "APE Via Don Bosco.pdf",           tipo: "APE",          immobile_id: "IMM-004", dimensione: "0.8 MB", caricato: "2025-09-10" },
  { id: "D-010", nome: "APE Via Lauro Rossi.pdf",         tipo: "APE",          immobile_id: "IMM-005", dimensione: "0.7 MB", caricato: "2025-11-15" },
  // Planimetrie
  { id: "D-011", nome: "Planimetria Via Foligno.pdf",     tipo: "Planimetria",  immobile_id: "IMM-001", dimensione: "1.4 MB", caricato: "2025-02-15" },
  { id: "D-012", nome: "Planimetria Negozio.pdf",         tipo: "Planimetria",  immobile_id: "IMM-002", dimensione: "1.8 MB", caricato: "2025-05-10" },
  { id: "D-013", nome: "Planimetria Via Borgaro.pdf",     tipo: "Planimetria",  immobile_id: "IMM-003", dimensione: "1.3 MB", caricato: "2025-07-08" },
  { id: "D-014", nome: "Planimetria Via Don Bosco.pdf",   tipo: "Planimetria",  immobile_id: "IMM-004", dimensione: "1.4 MB", caricato: "2025-09-15" },
  { id: "D-015", nome: "Planimetria Via Lauro Rossi.pdf", tipo: "Planimetria",  immobile_id: "IMM-005", dimensione: "1.5 MB", caricato: "2025-11-20" },
  // Visure catastali
  { id: "D-016", nome: "Visura catastale Foligno.pdf",        tipo: "Visura",   immobile_id: "IMM-001", dimensione: "0.5 MB", caricato: "2025-02-12" },
  { id: "D-017", nome: "Visura catastale De Amicis.pdf",      tipo: "Visura",   immobile_id: "IMM-002", dimensione: "0.6 MB", caricato: "2025-05-08" },
  { id: "D-018", nome: "Visura catastale Borgaro.pdf",        tipo: "Visura",   immobile_id: "IMM-003", dimensione: "0.5 MB", caricato: "2025-07-05" },
  { id: "D-019", nome: "Visura catastale Don Bosco.pdf",      tipo: "Visura",   immobile_id: "IMM-004", dimensione: "0.5 MB", caricato: "2025-09-12" },
  { id: "D-020", nome: "Visura catastale Lauro Rossi.pdf",    tipo: "Visura",   immobile_id: "IMM-005", dimensione: "0.5 MB", caricato: "2025-11-18" },
  // Contratti locazione (tutti dal 01/01/2026)
  { id: "D-021", nome: "Contratto locazione C-001 Foligno.pdf",   tipo: "Contratto", immobile_id: "IMM-001", dimensione: "0.9 MB", caricato: "2025-12-20" },
  { id: "D-022", nome: "Contratto locazione C-002 De Amicis.pdf", tipo: "Contratto", immobile_id: "IMM-002", dimensione: "1.1 MB", caricato: "2025-12-22" },
  { id: "D-023", nome: "Contratto locazione C-003 Borgaro.pdf",   tipo: "Contratto", immobile_id: "IMM-003", dimensione: "0.9 MB", caricato: "2025-12-23" },
  { id: "D-024", nome: "Contratto locazione C-004 Don Bosco.pdf", tipo: "Contratto", immobile_id: "IMM-004", dimensione: "0.9 MB", caricato: "2025-12-28" },
  { id: "D-025", nome: "Contratto locazione C-005 Lauro Rossi.pdf", tipo: "Contratto", immobile_id: "IMM-005", dimensione: "0.9 MB", caricato: "2025-12-30" },
  // Fatture agenzia (4: tutti tranne il negozio che non ha avuto agenzia)
  { id: "D-026", nome: "Fattura agenzia Via Foligno (3.000€).pdf",     tipo: "Fattura", immobile_id: "IMM-001", dimensione: "0.3 MB", caricato: "2025-02-15" },
  { id: "D-027", nome: "Fattura agenzia Via Borgaro (3.000€).pdf",     tipo: "Fattura", immobile_id: "IMM-003", dimensione: "0.3 MB", caricato: "2025-07-08" },
  { id: "D-028", nome: "Fattura agenzia Via Don Bosco (6.000€).pdf",   tipo: "Fattura", immobile_id: "IMM-004", dimensione: "0.3 MB", caricato: "2025-09-15" },
  { id: "D-029", nome: "Fattura agenzia Via Lauro Rossi (4.000€).pdf", tipo: "Fattura", immobile_id: "IMM-005", dimensione: "0.3 MB", caricato: "2025-11-20" },
  // Imposta di registro 9% atto (5 ricevute)
  { id: "D-030", nome: "Ricevuta imposta registro Foligno (2.160€).pdf",     tipo: "Fattura", immobile_id: "IMM-001", dimensione: "0.2 MB", caricato: "2025-02-15" },
  { id: "D-031", nome: "Ricevuta imposta registro De Amicis (5.400€).pdf",   tipo: "Fattura", immobile_id: "IMM-002", dimensione: "0.2 MB", caricato: "2025-05-10" },
  { id: "D-032", nome: "Ricevuta imposta registro Borgaro (4.680€).pdf",     tipo: "Fattura", immobile_id: "IMM-003", dimensione: "0.2 MB", caricato: "2025-07-08" },
  { id: "D-033", nome: "Ricevuta imposta registro Don Bosco (4.590€).pdf",   tipo: "Fattura", immobile_id: "IMM-004", dimensione: "0.2 MB", caricato: "2025-09-15" },
  { id: "D-034", nome: "Ricevuta imposta registro Lauro Rossi (5.220€).pdf", tipo: "Fattura", immobile_id: "IMM-005", dimensione: "0.2 MB", caricato: "2025-11-20" },
];

export const formatEur = (n) => {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
};
export const formatPct = (n) => (n === null || n === undefined) ? "—" : `${n.toFixed(2)}%`;
export const formatNum = (n) => new Intl.NumberFormat("it-IT").format(n);

export const getProperty = (id) => properties.find(p => p.id === id);
