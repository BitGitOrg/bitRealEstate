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
    id: "IMM-001", nome: "Bilocale Navigli", indirizzo: "Via Vigevano 12", citta: "Milano", provincia: "MI",
    tipologia: "Bilocale", metratura: 58, piano: "2°", anno_costruzione: 1972, classe_energetica: "D",
    stato: "affittato", operazione: "reddito", img: PROPERTY_IMAGES[0], lat: 45.4516, lng: 9.1727,
    data_acquisto: "2022-03-15", prezzo_acquisto: 215000, notaio: 4200, agenzia: 6500, imposte: 8900,
    lavori: 18000, costo_totale: 252600, valore_stimato: 285000,
    canone_mensile: 1450, rendimento_lordo: 6.89, rendimento_netto: 4.92, cash_flow_mensile: 620,
    mutuo: { banca: "Intesa Sanpaolo", residuo: 95000, rata: 540, tasso: 2.8 },
    portfolio_score: 82, lat_lng: [45.4516, 9.1727],
  },
  {
    id: "IMM-002", nome: "Trilocale Isola", indirizzo: "Via Borsieri 28", citta: "Milano", provincia: "MI",
    tipologia: "Trilocale", metratura: 82, piano: "4°", anno_costruzione: 1965, classe_energetica: "C",
    stato: "affittato", operazione: "reddito", img: PROPERTY_IMAGES[1], lat: 45.4895, lng: 9.1903,
    data_acquisto: "2021-06-20", prezzo_acquisto: 340000, notaio: 5800, agenzia: 9200, imposte: 12500,
    lavori: 42000, costo_totale: 409500, valore_stimato: 480000,
    canone_mensile: 1980, rendimento_lordo: 5.80, rendimento_netto: 4.10, cash_flow_mensile: 510,
    mutuo: { banca: "UniCredit", residuo: 160000, rata: 920, tasso: 3.1 },
    portfolio_score: 76,
  },
  {
    id: "IMM-003", nome: "Villa Lago Como", indirizzo: "Via Statale 88", citta: "Como", provincia: "CO",
    tipologia: "Villa", metratura: 220, piano: "T+1", anno_costruzione: 1998, classe_energetica: "B",
    stato: "in_vendita", operazione: "compra_ristruttura_vendi", img: PROPERTY_IMAGES[2], lat: 45.8081, lng: 9.0852,
    data_acquisto: "2023-11-02", prezzo_acquisto: 650000, notaio: 11000, agenzia: 19500, imposte: 28000,
    lavori: 145000, costo_totale: 853500, valore_stimato: 1080000,
    canone_mensile: 0, rendimento_lordo: 0, rendimento_netto: 0, cash_flow_mensile: -2400,
    mutuo: { banca: "BPM", residuo: 380000, rata: 2400, tasso: 3.5 },
    portfolio_score: 71, prezzo_vendita_target: 1100000, prezzo_minimo: 990000,
  },
  {
    id: "IMM-004", nome: "Loft Brera", indirizzo: "Via Solferino 5", citta: "Milano", provincia: "MI",
    tipologia: "Loft", metratura: 95, piano: "Mansarda", anno_costruzione: 1920, classe_energetica: "E",
    stato: "in_ristrutturazione", operazione: "compra_ristruttura_vendi", img: PROPERTY_IMAGES[3], lat: 45.4736, lng: 9.1856,
    data_acquisto: "2024-09-10", prezzo_acquisto: 480000, notaio: 8500, agenzia: 14500, imposte: 19000,
    lavori: 95000, costo_totale: 617000, valore_stimato: 720000,
    canone_mensile: 0, rendimento_lordo: 0, rendimento_netto: 0, cash_flow_mensile: -1800,
    mutuo: { banca: "Intesa Sanpaolo", residuo: 260000, rata: 1450, tasso: 3.3 },
    portfolio_score: 64, prezzo_vendita_target: 780000,
  },
  {
    id: "IMM-005", nome: "Monolocale Centrale", indirizzo: "Via Palestro 14", citta: "Torino", provincia: "TO",
    tipologia: "Monolocale", metratura: 38, piano: "1°", anno_costruzione: 1980, classe_energetica: "D",
    stato: "sfitto", operazione: "reddito", img: PROPERTY_IMAGES[4], lat: 45.0703, lng: 7.6869,
    data_acquisto: "2020-04-18", prezzo_acquisto: 95000, notaio: 2200, agenzia: 3500, imposte: 4800,
    lavori: 8000, costo_totale: 113500, valore_stimato: 125000,
    canone_mensile: 0, rendimento_lordo: 0, rendimento_netto: 0, cash_flow_mensile: -180,
    mutuo: null,
    portfolio_score: 38,
  },
  {
    id: "IMM-006", nome: "Trilocale Eur", indirizzo: "Viale Europa 211", citta: "Roma", provincia: "RM",
    tipologia: "Trilocale", metratura: 90, piano: "3°", anno_costruzione: 1985, classe_energetica: "C",
    stato: "affittato", operazione: "reddito", img: PROPERTY_IMAGES[5], lat: 41.8307, lng: 12.4708,
    data_acquisto: "2019-09-25", prezzo_acquisto: 285000, notaio: 5100, agenzia: 8500, imposte: 11200,
    lavori: 22000, costo_totale: 331800, valore_stimato: 365000,
    canone_mensile: 1620, rendimento_lordo: 5.86, rendimento_netto: 4.35, cash_flow_mensile: 720,
    mutuo: { banca: "UniCredit", residuo: 110000, rata: 680, tasso: 2.6 },
    portfolio_score: 79,
  },
  {
    id: "IMM-007", nome: "Bilocale Vomero", indirizzo: "Via Cilea 92", citta: "Napoli", provincia: "NA",
    tipologia: "Bilocale", metratura: 65, piano: "5°", anno_costruzione: 1970, classe_energetica: "D",
    stato: "affittato", operazione: "reddito", img: PROPERTY_IMAGES[6], lat: 40.8473, lng: 14.2236,
    data_acquisto: "2022-11-11", prezzo_acquisto: 145000, notaio: 3100, agenzia: 4800, imposte: 6200,
    lavori: 15000, costo_totale: 174100, valore_stimato: 195000,
    canone_mensile: 950, rendimento_lordo: 6.55, rendimento_netto: 4.72, cash_flow_mensile: 380,
    mutuo: { banca: "BPM", residuo: 75000, rata: 410, tasso: 2.9 },
    portfolio_score: 74,
  },
  {
    id: "IMM-008", nome: "Quadrilocale Cit. Studi", indirizzo: "Via Plinio 41", citta: "Milano", provincia: "MI",
    tipologia: "Quadrilocale", metratura: 110, piano: "2°", anno_costruzione: 1958, classe_energetica: "F",
    stato: "disponibile", operazione: "reddito", img: PROPERTY_IMAGES[7], lat: 45.4793, lng: 9.2247,
    data_acquisto: "2024-12-05", prezzo_acquisto: 380000, notaio: 6800, agenzia: 11500, imposte: 15200,
    lavori: 38000, costo_totale: 451500, valore_stimato: 475000,
    canone_mensile: 0, rendimento_lordo: 0, rendimento_netto: 0, cash_flow_mensile: -1100,
    mutuo: { banca: "Intesa Sanpaolo", residuo: 230000, rata: 1100, tasso: 3.2 },
    portfolio_score: 58,
  },
  {
    id: "IMM-009", nome: "Bilocale San Salvario", indirizzo: "Via Berthollet 6", citta: "Torino", provincia: "TO",
    tipologia: "Bilocale", metratura: 55, piano: "T", anno_costruzione: 1962, classe_energetica: "D",
    stato: "venduto", operazione: "compra_vendi", img: PROPERTY_IMAGES[0], lat: 45.0625, lng: 7.6822,
    data_acquisto: "2023-02-14", prezzo_acquisto: 105000, notaio: 2300, agenzia: 3800, imposte: 5200,
    lavori: 12000, costo_totale: 128300, valore_stimato: 165000,
    prezzo_vendita: 168000, data_vendita: "2024-08-20", utile_netto: 32400,
    canone_mensile: 0, rendimento_lordo: 0, rendimento_netto: 0, cash_flow_mensile: 0,
    portfolio_score: 88,
  },
  {
    id: "IMM-010", nome: "Trilocale Bovisa", indirizzo: "Via Bovisasca 17", citta: "Milano", provincia: "MI",
    tipologia: "Trilocale", metratura: 78, piano: "1°", anno_costruzione: 1968, classe_energetica: "E",
    stato: "in_trattativa", operazione: "reddito", img: PROPERTY_IMAGES[1], lat: 45.5048, lng: 9.1614,
    data_acquisto: null, prezzo_acquisto: 268000, notaio: 4800, agenzia: 8000, imposte: 10500,
    lavori: 28000, costo_totale: 319300, valore_stimato: 340000,
    canone_mensile: 1380, rendimento_lordo: 5.19, rendimento_netto: 3.45, cash_flow_mensile: 280,
    mutuo: null,
    portfolio_score: 56,
  },
];

// === Aggregate KPI ===
export const portfolioKPI = {
  totale_immobili: properties.length,
  valore_acquisto_totale: properties.reduce((s, p) => s + (p.prezzo_acquisto || 0), 0),
  valore_stimato_totale: properties.reduce((s, p) => s + (p.valore_stimato || 0), 0),
  capitale_investito: properties.reduce((s, p) => s + (p.costo_totale || 0), 0),
  ricavi_mensili: properties.reduce((s, p) => s + (p.canone_mensile || 0), 0),
  cash_flow_mensile: properties.reduce((s, p) => s + (p.cash_flow_mensile || 0), 0),
  debito_residuo: properties.reduce((s, p) => s + (p.mutuo?.residuo || 0), 0),
  liquidita_disponibile: 142500,
  rendimento_medio_lordo: 5.65,
  rendimento_medio_netto: 4.15,
  utile_anno: 187400,
  immobili_profittevoli: 5,
  immobili_sotto_target: 3,
  immobili_sfitti: 1,
  immobili_in_lavorazione: 2,
  immobili_in_vendita: 1,
};

// === Cash Flow mensile (ultimi 12 mesi) ===
export const cashFlowMensile = [
  { mese: "Mar '25", incassi: 8200, uscite: 4100, saldo: 4100 },
  { mese: "Apr '25", incassi: 8400, uscite: 5200, saldo: 3200 },
  { mese: "Mag '25", incassi: 8400, uscite: 4600, saldo: 3800 },
  { mese: "Giu '25", incassi: 8600, uscite: 6800, saldo: 1800 },
  { mese: "Lug '25", incassi: 8600, uscite: 4900, saldo: 3700 },
  { mese: "Ago '25", incassi: 8200, uscite: 4400, saldo: 3800 },
  { mese: "Set '25", incassi: 8400, uscite: 5100, saldo: 3300 },
  { mese: "Ott '25", incassi: 8400, uscite: 5300, saldo: 3100 },
  { mese: "Nov '25", incassi: 8600, uscite: 5800, saldo: 2800 },
  { mese: "Dic '25", incassi: 8600, uscite: 7200, saldo: 1400 },
  { mese: "Gen '26", incassi: 8400, uscite: 4800, saldo: 3600 },
  { mese: "Feb '26", incassi: 8400, uscite: 4960, saldo: 3440 },
];

// === Forecast 12 mesi ===
export const cashFlowForecast = [
  { mese: "Mar '26", saldo_previsto: 3800 },
  { mese: "Apr '26", saldo_previsto: 4100 },
  { mese: "Mag '26", saldo_previsto: 4000 },
  { mese: "Giu '26", saldo_previsto: -1200, alert: true },
  { mese: "Lug '26", saldo_previsto: 3900 },
  { mese: "Ago '26", saldo_previsto: 3700 },
  { mese: "Set '26", saldo_previsto: 4200 },
  { mese: "Ott '26", saldo_previsto: 4400 },
  { mese: "Nov '26", saldo_previsto: 4300 },
  { mese: "Dic '26", saldo_previsto: -900, alert: true },
  { mese: "Gen '27", saldo_previsto: 4500 },
  { mese: "Feb '27", saldo_previsto: 4600 },
];

// === Ricavi vs Costi annuali ===
export const ricaviCostiAnnuali = [
  { mese: "Mar", ricavi: 8200, costi: 4100 },
  { mese: "Apr", ricavi: 8400, costi: 5200 },
  { mese: "Mag", ricavi: 8400, costi: 4600 },
  { mese: "Giu", ricavi: 8600, costi: 6800 },
  { mese: "Lug", ricavi: 8600, costi: 4900 },
  { mese: "Ago", ricavi: 8200, costi: 4400 },
  { mese: "Set", ricavi: 8400, costi: 5100 },
  { mese: "Ott", ricavi: 8400, costi: 5300 },
  { mese: "Nov", ricavi: 8600, costi: 5800 },
  { mese: "Dic", ricavi: 8600, costi: 7200 },
  { mese: "Gen", ricavi: 8400, costi: 4800 },
  { mese: "Feb", ricavi: 8400, costi: 4960 },
];

// === Distribuzione patrimonio per tipologia ===
export const distribuzioneTipologia = [
  { name: "Bilocali", value: 3, color: "#0066FF" },
  { name: "Trilocali", value: 3, color: "#10B981" },
  { name: "Ville", value: 1, color: "#F59E0B" },
  { name: "Loft", value: 1, color: "#38BDF8" },
  { name: "Monolocali", value: 1, color: "#A3E635" },
  { name: "Quadrilocali", value: 1, color: "#F87171" },
];

// === Contratti affitto ===
export const contratti = [
  { id: "C-001", immobile_id: "IMM-001", conduttore: "Andrea Galli", inizio: "2023-04-01", fine: "2027-03-31", canone: 1450, deposito: 2900, stato: "attivo", istat: true },
  { id: "C-002", immobile_id: "IMM-002", conduttore: "Elena Marchetti", inizio: "2022-09-01", fine: "2026-08-31", canone: 1980, deposito: 3960, stato: "attivo", istat: true },
  { id: "C-003", immobile_id: "IMM-006", conduttore: "Famiglia De Luca", inizio: "2024-01-01", fine: "2028-12-31", canone: 1620, deposito: 3240, stato: "attivo", istat: true },
  { id: "C-004", immobile_id: "IMM-007", conduttore: "Maria Esposito", inizio: "2023-12-01", fine: "2026-02-28", canone: 950, deposito: 1900, stato: "in_scadenza", istat: false },
];

// === Incassi affitti (ultimo mese) ===
export const incassi = [
  { contratto_id: "C-001", mese: "Feb 2026", previsto: 1450, incassato: 1450, data: "2026-02-03", stato: "pagato" },
  { contratto_id: "C-002", mese: "Feb 2026", previsto: 1980, incassato: 1980, data: "2026-02-05", stato: "pagato" },
  { contratto_id: "C-003", mese: "Feb 2026", previsto: 1620, incassato: 1620, data: "2026-02-02", stato: "pagato" },
  { contratto_id: "C-004", mese: "Feb 2026", previsto: 950, incassato: 0, data: null, stato: "in_ritardo" },
];

// === Lavori in corso ===
export const lavori = [
  { id: "L-001", immobile_id: "IMM-004", descrizione: "Ristrutturazione completa loft Brera", inizio: "2024-10-01", fine_prevista: "2026-04-15", impresa: "Edilcasa Srl", budget: 95000, speso: 67000, avanzamento: 68, stato: "in_corso" },
  { id: "L-002", immobile_id: "IMM-003", descrizione: "Finiture e arredamento villa Como", inizio: "2024-02-10", fine_prevista: "2025-09-30", impresa: "Lariana Costruzioni", budget: 145000, speso: 162000, avanzamento: 100, stato: "fuori_budget" },
  { id: "L-003", immobile_id: "IMM-008", descrizione: "Rifacimento bagno e impianti", inizio: "2025-01-15", fine_prevista: "2026-03-20", impresa: "Plinio Srl", budget: 38000, speso: 22000, avanzamento: 58, stato: "in_corso" },
];

// === Movimenti costi/ricavi recenti ===
export const movimenti = [
  { id: "M-001", data: "2026-02-05", tipo: "ricavo", categoria: "Affitto", descrizione: "Canone Trilocale Isola", immobile_id: "IMM-002", importo: 1980 },
  { id: "M-002", data: "2026-02-03", tipo: "ricavo", categoria: "Affitto", descrizione: "Canone Bilocale Navigli", immobile_id: "IMM-001", importo: 1450 },
  { id: "M-003", data: "2026-02-02", tipo: "costo", categoria: "Mutuo", descrizione: "Rata mutuo Villa Como", immobile_id: "IMM-003", importo: 2400 },
  { id: "M-004", data: "2026-01-28", tipo: "costo", categoria: "Lavori", descrizione: "SAL 3 ristrutturazione Loft", immobile_id: "IMM-004", importo: 18500 },
  { id: "M-005", data: "2026-01-22", tipo: "costo", categoria: "IMU", descrizione: "IMU prima rata 2026", immobile_id: null, importo: 4200 },
  { id: "M-006", data: "2026-01-15", tipo: "ricavo", categoria: "Affitto", descrizione: "Canone Eur", immobile_id: "IMM-006", importo: 1620 },
  { id: "M-007", data: "2026-01-10", tipo: "costo", categoria: "Condominio", descrizione: "Spese condominiali Q1", immobile_id: "IMM-002", importo: 420 },
];

// === Mutui ===
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
  { id: "A-001", tipo: "economico", severity: "alta", titolo: "Cash flow negativo previsto", descrizione: "Giugno 2026 e Dicembre 2026 in tensione di liquidità (-1.200 € e -900 €).", immobile_id: null, ts: "2026-02-12" },
  { id: "A-002", tipo: "economico", severity: "alta", titolo: "Lavori fuori budget", descrizione: "Villa Lago Como: scostamento +17.000 € su budget 145.000 €.", immobile_id: "IMM-003", ts: "2026-02-08" },
  { id: "A-003", tipo: "economico", severity: "media", titolo: "Affitto in ritardo", descrizione: "Bilocale Vomero — Maria Esposito non ha versato il canone di Febbraio.", immobile_id: "IMM-007", ts: "2026-02-10" },
  { id: "A-004", tipo: "strategico", severity: "media", titolo: "Immobile sfitto > 90 giorni", descrizione: "Monolocale Torino sfitto da 4 mesi: valuta riduzione canone o vendita.", immobile_id: "IMM-005", ts: "2026-02-05" },
  { id: "A-005", tipo: "documentale", severity: "bassa", titolo: "APE in scadenza", descrizione: "APE Trilocale Eur scade tra 45 giorni.", immobile_id: "IMM-006", ts: "2026-02-01" },
  { id: "A-006", tipo: "strategico", severity: "media", titolo: "Opportunità rifinanziamento", descrizione: "Tasso mutuo Bovisa (3,5%) sopra media mercato. Possibile risparmio 280 €/mese.", immobile_id: "IMM-003", ts: "2026-01-28" },
  { id: "A-007", tipo: "documentale", severity: "bassa", titolo: "Contratto in scadenza", descrizione: "Contratto C-004 scade il 28/02/2026, valutare rinnovo.", immobile_id: "IMM-007", ts: "2026-01-25" },
];

// === Documenti ===
export const documenti = [
  { id: "D-001", nome: "Rogito Bilocale Navigli.pdf", tipo: "Rogito", immobile_id: "IMM-001", dimensione: "2.4 MB", caricato: "2022-03-15" },
  { id: "D-002", nome: "APE Trilocale Isola.pdf", tipo: "APE", immobile_id: "IMM-002", dimensione: "0.8 MB", caricato: "2021-06-22" },
  { id: "D-003", nome: "Contratto locazione C-001.pdf", tipo: "Contratto", immobile_id: "IMM-001", dimensione: "1.1 MB", caricato: "2023-04-01" },
  { id: "D-004", nome: "Fattura ristrutt. Loft #SAL3.pdf", tipo: "Fattura", immobile_id: "IMM-004", dimensione: "0.6 MB", caricato: "2026-01-28" },
  { id: "D-005", nome: "Planimetria Villa Como.pdf", tipo: "Planimetria", immobile_id: "IMM-003", dimensione: "3.2 MB", caricato: "2023-11-04" },
  { id: "D-006", nome: "Visura catastale Eur.pdf", tipo: "Visura", immobile_id: "IMM-006", dimensione: "0.4 MB", caricato: "2019-09-26" },
];

export const formatEur = (n) => {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
};
export const formatPct = (n) => (n === null || n === undefined) ? "—" : `${n.toFixed(2)}%`;
export const formatNum = (n) => new Intl.NumberFormat("it-IT").format(n);

export const getProperty = (id) => properties.find(p => p.id === id);
