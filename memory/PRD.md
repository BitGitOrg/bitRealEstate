# Real Estate Portfolio Control Room — PRD

## Problem Statement (originale)
Mockup di webapp "Real Estate Portfolio Control Room + AI Autopilot" in italiano per la gestione centralizzata di patrimonio immobiliare (affitti, vendite, ristrutturazioni, cash flow, mutui, KPI, AI strategica). 17 sezioni come da documento funzionale.

## User choices (28 May 2026)
- Output: Mockup visuale navigabile
- AI: Claude Sonnet 4.6 (via Emergent Universal Key)
- Auth: JWT con ruoli (Admin / CEO / Amministrazione / Commercialista / Collaboratore)
- Lingua: Italiano
- Scope: Tutte le 17 sezioni

## Architecture
- Backend: FastAPI + MongoDB + emergentintegrations (claude-sonnet-4-6)
- Frontend: React 19 + Recharts + Shadcn UI + Tailwind (Cabinet Grotesk + IBM Plex Sans)
- Auth: JWT bearer + bcrypt + 4 account demo auto-seeded
- Endpoints: `/api/auth/login`, `/api/auth/me`, `/api/auth/demo-accounts`, `/api/ai/chat`, `/api/ai/deal-analyze`, `/api/ai/history/:id`

## Personas
- Admin/CEO: vista globale + AI + nuove operazioni
- Amministrazione: costi, fatture, incassi, scadenze, mutui
- Commercialista: read-only economico + export
- Collaboratore: stato lavori, foto, preventivi

## Sezioni implementate (28 May 2026)
1. Login multi-account con demo accounts
2. Dashboard Generale (KPI cards × 9, 4 charts, 4 widgets, tabella recenti)
3. Patrimonio Immobiliare (tabella + grid, filtri città/stato/ricerca, 10 immobili demo + righe da Deal Inbox in trattativa con badge)
4. Scheda Immobile (tabs anagrafica/acquisto/economico/documenti/movimenti)
5. Operazioni (tre tipologie: reddito / compra-vendi / compra-ristruttura-vendi)
6. Affitti & Locazioni (contratti, incassi, stati pagamento)
7. Vendite & Rivendite (in vendita + storico con ROI)
8. Lavori & Ristrutturazioni (progress bar, budget vs effettivo, alert fuori budget)
9. Costi & Ricavi (filtri, categorie, import)
10. Mutui & Finanziamenti (LTV, debito per immobile, alert)
11. Cash Flow (storico ComposedChart + forecast 12 mesi)
12. KPI & Rendimenti (ranking, score, grafici lordo/netto)
13. Simulatore Investimenti (live calc + AI Deal Analyzer)
14. AI Autopilot (chat Claude Sonnet 4.6 con contesto portafoglio)
15. AI Alert Center (3 tipologie, filtri severity)
16. Documenti (filtri tipo, search, AI Reader badge)
17. Report Direzionali (8 report + report AI mensile, PDF/Excel/CSV)
18. Impostazioni (società + target + AI params + ruoli)
19. Mappa Patrimonio (markers colorati per rendimento)

## 🆕 Modulo Deal Inbox + AI Scout (29 May 2026)
20. **Deal Inbox** — incolla URL annuncio (Immobiliare.it/Idealista/Subito) OPPURE testo → l'AI (Claude Sonnet 4.6) estrae automaticamente titolo, prezzo, metratura, zona, canone stimato, anno, classe energetica, punti forza/attenzione. Calcolo locale del Deal Score 0-100 + giudizio + strategia + rischio. Workflow: marcare come Interessato / Scartato / In trattativa. I deal "In trattativa" appaiono automaticamente nel Patrimonio con badge "Deal Inbox".
21. **Watchlists** — filtri salvabili (città, tipologia, prezzo max, metratura min, rendimento netto min). Ogni nuovo deal viene confrontato contro le watchlists attive e popolato `watchlist_matches[]`.

### Backend endpoints (persistiti su MongoDB)
- `POST /api/deals/analyze` body `{url?, text?, note?}` → fetch URL (httpx + BeautifulSoup) → estrazione AI JSON → score → match watchlists → persist. Rifiuta 422 se prezzo non riconoscibile.
- `GET /api/deals?status=` lista. `PATCH /api/deals/:id/status` cambia stato. `DELETE /api/deals/:id`
- `GET /api/watchlists` lista. `POST /api/watchlists` crea. `DELETE /api/watchlists/:id`

## 🆕 Conversione Deal→Immobile + Tema chiaro (29 May 2026)
22. **Conversione Deal→Patrimonio**: due modalità — `Converti rapidamente` (one-click, default sensati) e `Converti con dettagli…` (modale con data rogito, costi notaio/agenzia/imposte/lavori, mutuo opzionale). Il deal originale assume status "convertito" + `converted_property_id`.
23. **Properties CRUD reali**: `/api/properties` POST/GET/DELETE persistito su MongoDB. Scheda Immobile carica via API con fallback su demo. Patrimonio mostra le real properties + deal in_trattativa + i 10 demo, distinti via prefisso `IMM-`/`DEAL-`.
24. **Tema chiaro completo**: migrazione globale dal dark control-room al light fintech (stile Linear/Stripe). Background #F8FAFC, card bianche, bordi #E2E8F0, testo #0F172A. Tutti i 30+ file frontend ribaltati con script Python.

## 🆕 Centro Import (29 May 2026)
25. **Centro Import** (`/import`) — 3 tab per popolare il sistema con dati reali della società:
   - **Immobili — bulk import Excel**: download template `.xlsx` pre-formattato (23 colonne + foglio Istruzioni), upload del file compilato, anteprima riga-per-riga con validation OK/warning, commit selettivo (solo righe valide)
   - **Bilanci AI Reader**: drag-and-drop di PDF o Excel del gestionale (Arca/Zucchetti/TeamSystem) → Claude estrae automaticamente Conto Economico (ricavi affitti, costi gestione, IMU, interessi mutui, utile netto) e Stato Patrimoniale (valore immobili, debito, liquidità, patrimonio netto) → preview tabellare → commit
   - **Estratto conto bancario**: upload CSV/Excel con colonne Data/Descrizione/Importo → parsing pandas (auto-detect separatore ; o ,) → riconciliazione automatica delle entrate con i canoni attesi degli immobili (tolleranza ±5€)

### Backend endpoints Centro Import
- `GET /api/import/template/immobili` → file .xlsx scaricabile
- `POST /api/import/immobili/parse` (multipart file) → JSON anteprima righe
- `POST /api/import/immobili/commit` → bulk insert properties
- `POST /api/import/bilancio/parse` (PDF/XLSX/CSV) → Claude → JSON CE + SP
- `POST /api/import/bilancio/commit` → persist `db.bilanci`
- `GET /api/import/bilanci` / `GET /api/import/bilanci/latest` → lista/ultimo
- `POST /api/import/banca/parse` (CSV/XLSX) → movimenti + match_canone
- `POST /api/import/banca/commit` → persist con **dedup SHA1** su (user, data, importo, descrizione)
- `GET /api/import/banca` lista · `DELETE /api/import/banca/{id}`

## 🆕 Wiring dati reali (29 May 2026 - iter 6)
26. **Dashboard auto-override**: appena è presente un bilancio in DB, la Dashboard mostra subtitle "KPI da bilancio {periodo}", banner verde con utile/patrimonio netto, e le 9 KPI cards sono calcolate dai numeri reali (valore patrimonio, patrimonio netto, ricavi/12, utile/12, debito mutui, utile anno, rendimento netto = utile/valore*100). Fallback automatico ai demo se nessun bilancio.
27. **Costi & Ricavi integrato con banca**: i movimenti bancari importati appaiono nella tabella movimenti con badge "Banca" + check verde se riconciliati con un canone. Nuovo filtro origine "tutte/manuale/banca". Subtitle mostra "X movimenti · N importati da banca".
28. **AI Autopilot context-aware reale**: il system message di Claude viene arricchito server-side con la lista delle real properties (max 25) + ultimo bilancio + storico ultimi 3 bilanci. L'AI cita esplicitamente periodi e immobili reali invece dei demo.
29. **Dedup estratto conto**: signature SHA1 di `user_id|data|importo|descrizione[:80]`. Re-upload dello stesso CSV → `{created:0, skipped_duplicates:N}`.

## 🆕 Storico MoM + Report reali (29 May 2026 - iter 7)
30. **Storico bilanci MoM** (`/import` tab "Storico"): grafico Recharts evoluzione (Costi/Ricavi/Utile/Patrimonio netto) + card affiancate dei bilanci ordinati cronologicamente per periodo (parser italiano "Gennaio"..."Dicembre" + anno + supporto "Q1 2026"). Per ogni voce confronto MoM con delta € e % colorati verde/rosso, con inversione semantica per costi/debiti (riduzione = verde).
31. **Cash flow Dashboard live**: nuovo endpoint `GET /api/import/banca/cashflow-mensile?months=12` aggrega movimenti per YYYY-MM. Se ≥2 mesi di dati, il chart Dashboard "Andamento Cash Flow" passa automaticamente ai dati reali con subtitle "X mesi · da movimenti bancari reali". Fallback ai demo altrimenti.
32. **Server-side paginazione movimenti banca**: `GET /api/import/banca?skip=&limit=&q=&tipo=&matched=` con risposta `{total, skip, limit, items, has_more}`. Frontend `/costi-ricavi` ha search bar server-side e controlli Precedenti/Successivi quando >50 movimenti.
33. **Report PDF/Excel/CSV REALI**: `GET /api/report/{id}.{fmt}` con reportlab + xlsxwriter.

## 🆕 8 Report PDF completi + Split parziale (29 May 2026 - iter 8)
34. **Tutti gli 8 report PDF reali**: rendimento (PDF/XLSX/CSV), affitti, vendite, lavori, cashflow, mutui — tutti generati live da reportlab basandosi su `db.properties` e `db.movimenti_bancari`. Frontend `/report`: rimossi i badge "Mockup", tutti i bottoni attivi.
35. **Chart "Ricavi vs Costi" Dashboard live**: oltre a "Andamento Cash Flow", anche il barchart Ricavi vs Costi usa `bankCashflow` quando ≥2 mesi di movimenti sono presenti (incassi → ricavi, uscite → costi); fallback demo.
36. **Split parziale backend**: nuovo `/app/backend/routers/reports.py` (220 righe) con factory pattern `make_reports_router(db, current_user, enrich_property)` per i 8 report builders. Server.py 1483 → 1269 righe (-214). Imports e Properties resteranno nel server.py per ora (split rinviato).

## 🆕 Split completo + Reports v2 + Logo società (29 May 2026 - iter 9)
37. **Split completo server.py**: da 1269 → **591 righe** (-678, sotto target 700). Estratti router:
   - `routers/_shared.py` (compute_deal_score, enrich_property, coerce_*)
   - `routers/properties.py` (`/api/properties` CRUD + `/api/deals/{id}/convert`)
   - `routers/imports.py` (tutti gli `/api/import/*` ~530 righe)
   - `routers/settings.py` (`/api/settings` GET/PUT + `/api/settings/logo` POST/DELETE)
   - `routers/reports.py` (Reports v2)
38. **Reports v2 — solo 2 PDF completi**: rimossi gli 8 report granulari precedenti. Disponibili ora:
   - `GET /api/report/stato-salute.pdf` → "Stato di Salute della Società" (KPI sintesi + CE + Top/Worst immobili + alert + storico bilanci)
   - `GET /api/report/business-plan.pdf` → "Business Plan" per le banche (profilo + patrimonio + CE/EBITDA + struttura debito + scenari +2/+5/+10 immobili/anno + indici solidità LTV/coverage/PN/Debito + allegato A immobili)
   - **Branded chrome**: header colorato con logo società (se caricato) + brand name; footer con data generazione + brand al centro + "Pagina N" a destra su OGNI pagina (ReportLab PageTemplate via onFirstPage/onLaterPages callback).
39. **Logo società upload (`POST /api/settings/logo`)**: multipart image (PNG/JPG/SVG/WebP) max 1 MB, persistito base64 in `db.settings`. UI in Impostazioni con preview, sostituisci, rimuovi. Il logo appare automaticamente nell'header di entrambi i PDF (ReportLab `ImageReader` con fallback safe se decode fallisce).
40. **Settings persistiti**: nome società, valuta, target rendimento, target ROI, cash flow min, propensione rischio, strategia, capitale disponibile, limite indebitamento — caricati e salvati via `/api/settings` GET/PUT.

## 🆕 Forecast / Piano Industriale + AI Coach (29 May 2026 - iter 10)
41. **Modulo Forecast pluri-annuale** (`/forecast`):
   - **Scenari salvabili** in MongoDB con orizzonte configurabile **3 / 5 / 10 anni**, baseline da dati reali società oppure input manuale.
   - **6 tipi di operazione pianificabili anno per anno**: acquisto (prezzo + lavori + canone + leva mutuo + tasso + durata), vendita (prezzo, opzionale link a immobile reale che libera debito/rata/canone), ristrutturazione (lavori + Δ canone con boost +1.4× sul valore), rinegoziazione mutuo (delta tasso → risparmio sulla rata), sfitto (mesi → perdita ricavi), aumento canone (€/mese o %).
   - **Engine simulazione**: per ogni anno applica eventi automatici (rivalutazione immobili + ISTAT canoni) + operazioni utente + P&L (ricavi 12×canone, costi 15%, interessi 3% blended, ammortamento mutui, tasse) → snapshot con valore, debito, PN, canone, utile, cash flow, LTV, ROI.
   - **AI Coach** per scenario (`POST /api/forecast/scenarios/{id}/ai`): chat con Claude Sonnet 4.6 che riceve nel system message TUTTO lo scenario (snapshot anno per anno + operazioni + summary). Storia conversazione persistita in `db.scenario_messages`. Preset prompts in UI.
   - **Confronto fino a 3 scenari** side-by-side (`POST /api/forecast/scenarios/compare`): tabella riepilogo + grafico evoluzione patrimonio netto sovrapposto.
   - **PDF "Piano Industriale"** (`GET /api/forecast/scenarios/{id}/pdf`): branded header con logo società + nome, sezioni 1.Riepilogo strategico 2.Operazioni pianificate 3.Proiezione anno per anno 4.Assunzioni 5.Conclusioni con verdict automatico.
42. **PDF chrome condiviso** (`routers/_pdf_chrome.py`): estratto da reports.py per essere riusato da forecast.py (DRY) — setup_doc(), make_table(), chrome_factory(), eur(), pct().
43. **Frontend `/forecast`**: 4 tab — Editor (parametri + operazioni CRUD con form contestuali per tipo), Risultati (4 KPI card + 4 grafici Recharts: patrimonio netto area, cash flow bar, debito+LTV composto, ricavi/costi/utile composto + tabella anno-per-anno), AI Coach (chat persistente con preset), Confronta (multi-select scenari + grafico sovrapposto).
44. **Voce sidebar "Forecast & Piano Industriale"** con badge AI in gruppo Finanza.

## 🆕 Alert proattivi negli scenari (29 May 2026 - iter 11)
45. **Alert proattivi nel forecast** — `simulate()` ora calcola alert per ogni snapshot annuale e li espone insieme alla simulazione:
   - **7 tipologie**: `ltv_alto` (critical, soglia da `settings.limite_indebitamento`), `ltv_vicino_soglia` (warning), `cash_flow_negativo`, `liquidita_negativa` / `liquidita_bassa`, `patrimonio_negativo` (debito > valore), `rata_su_canone`, `rendimento_sotto_target` (vs `settings.target_netto`), `patrimonio_in_calo` (>5% YoY).
   - **Verdict aggregato automatico** in `summary`: `verdict` (Scenario sostenibile / praticabile con attenzione / rischioso / critico) + `verdict_severity` ('ok'|'warning'|'critical') + roll-up `alerts_critical`, `alerts_warning`, `years_with_neg_cash_flow`, `years_with_high_ltv`, `first_year_negative_liquidity`.
46. **AI Coach context-aware degli alert**: il system message ora include la lista completa di alert per anno → l'AI cita esplicitamente LTV alto/CF negativo/liquidità in tensione quando l'utente chiede pareri. Preset prompts aggiornati ("Analizza gli alert critici", "Suggerisci come portare LTV sotto 60%").
47. **PDF Piano Industriale**: nuova sezione "5 · Alert proattivi rilevati" con tabella severità-colorata (rosso se critici presenti, ambra altrimenti) e verdict automatico nelle conclusioni.
48. **UI Forecast Risultati**:
   - **Banner verdict** in alto colorato per severity (rosso/ambra/verde) con conteggio alert e anni critici.
   - **Tabella anno-per-anno** con righe tinte rosse (alert critici presenti) o ambra (solo warning), badge alert per riga con tooltip dettagli, lista completa di tutti gli alert sotto la tabella.
   - **ReferenceLine LTV=70%** sul grafico esposizione debitoria + zero-line sul grafico utile.
   - Soglie completamente parametrizzate da `/api/settings` (target_netto + limite_indebitamento).

## 🆕 AI Strategist Auto-Optimize (30 May 2026 - iter 14)
49. **Nuovo endpoint `POST /api/forecast/auto-optimize`** (`routers/forecast.py`):
   - Input: target patrimonio netto, orizzonte (3/5/10), max LTV, capitale disponibile (o fallback su `settings.capitale_disponibile`), strategia (reddito/rivendita/mista), propensione (bassa/media/alta), vincoli testuali extra, flag `save`.
   - Costruisce baseline reale dei dati società + system prompt strutturato → Claude Sonnet 4.6 genera JSON con `strategy_summary`, `expected_outcome`, `key_risks[]`, `assumptions{}`, `operations[]` aderenti allo schema Operation.
   - Backend valida e normalizza ogni operazione (id uuid, anno bounded, mutuo_pct 0..0.9, tipi enum) → poi **simula immediatamente** con `simulate()` per fornire `goal_summary` (`target_raggiunto`, `ltv_rispettato`, `gap_pct`).
   - Con `save=true` persiste come scenario con tag `ai_generated:true`, `ai_strategy_summary`, `ai_key_risks`.
50. **UI `AIStrategistModal.jsx`**: pulsante gradient blu→viola "AI Strategist" nell'header di `/forecast`. Modal a 3 step (Form → Loading 20-40s → Result) con banner goal verde/ambra + strategia + outcome + lista operazioni colorate per tipo + rischi chiave + 4 KPI mini. Pulsanti "Modifica obiettivo", "Scarta", "Salva come scenario" (persiste + switcha automatico alla tab Risultati). ESC + click-outside per chiudere.
51. **Test coverage**: 20/20 backend test (auth, validation, response shape, profili rischio, strategie, target irraggiungibile, vincoli extra, normalizzazione op, save flag, regression). Test file riusabile: `/app/backend/tests/test_iter14_auto_optimize.py`.

## 🆕 AI Strategist v2 — Multi-Shot Async (30 May 2026 - iter 15)
52. **Pattern 202/Job per chiamate AI lunghe** — il singolo endpoint sync (60s blocking) è stato sostituito da:
   - `POST /api/forecast/auto-optimize/jobs` → 202 `{job_id, status:"queued"}` + `asyncio.create_task` spawn del background runner.
   - `GET /api/forecast/auto-optimize/jobs/{id}` → polling (3s lato client) con `{status, progress 0-100, current_step, plans[]}`. Stato persistito in `db.strategist_jobs`.
   - `POST /api/forecast/auto-optimize/jobs/{id}/save?profile_id=` → salva un singolo piano come scenario.
   - `POST /api/forecast/auto-optimize/jobs/{id}/save-all` → salva tutti e 3 i piani in un colpo.
   - Endpoint legacy sync `POST /auto-optimize` mantenuto per backward compat (refactor a usare helper `_generate_strategist_plan`).
53. **Multi-Shot — 3 piani alternativi simulati in parallelo logico** (sequenziale per LLM):
   - **Conservativo** (propensione bassa, LTV cap min(input, 50%), color #059669)
   - **Bilanciato** (propensione media, LTV cap min(input, 60%), color #0066FF)
   - **Aggressivo** (propensione alta, LTV cap min(input, 75%), color #B45309)
   - Ogni piano riceve nome compatto "AI Conservativo/Bilanciato/Aggressivo · target €Xk @ Ny" per Compare tab leggibile.
54. **LTV cap enforcement con retry** in `_generate_strategist_plan`: se la simulazione produce `ltv_finale > max_ltv + 10pp`, retry singolo con prompt più stringente. Il risultato del retry viene accettato solo se migliora effettivamente l'LTV. (Mitigazione del bug semantico individuato in iter 15: aggressivo overshoot 110% vs cap 75%.)
55. **UI rewrite `AIStrategistModal.jsx`** — 3 step: Form → Polling (progress bar gradient + 3 marker Conservativo/Bilanciato/Aggressivo con check/spinner/pending) → Result (3 PlanCard side-by-side con header colorato profilo, badge goal verde/ambra, 4 KPI mini, strategia text, lista top 6 op + bottone "Salva questo piano"). Pulsante globale "Salva tutti e confronta" → salva tutti i 3 e switcha automaticamente alla tab Compare con confronto già caricato.
56. **Fix critico**: React Rules-of-Hooks violation nel modal (early return prima di useEffect) → moved early return AFTER hooks, guard inside first useEffect. Risolto in iter 15.
57. **Test coverage**: 16/17 backend test passati (1 fallimento atteso era l'LTV overshoot, ora mitigato dal retry). File: `/app/backend/tests/test_iter15_multishot.py`.

## 🆕 Investor Book PDF report (30 May 2026 - iter 16)
58. **Terzo report nella sezione Report Direzionali** — `GET /api/report/investor-book.pdf`:
   - **Cover page** con KPI portafoglio: numero immobili, % a reddito, tasso occupazione, sfitti, valore mercato totale, costo totale, **plusvalenza latente**, canone mensile/annuo, rendimento medio lordo/netto, debito residuo, patrimonio netto.
   - **Una scheda PDF per immobile**: foto reale (scaricata async da URL via httpx con fallback graceful "Foto non disponibile"), anagrafica completa (codice, indirizzo, comune, tipologia, m², anno, classe energetica, stato, data acquisto), dati economici (prezzo acquisto, costo totale, valore stimato, plusvalenza, canone mensile/annuo, rendimento lordo/netto, cash flow, portfolio score), sezione finanziamento se presente mutuo (banca, residuo, rata, tasso), sezione locazione in corso (inquilino, data inizio, scadenza contratto, deposito cauzionale).
   - **Recap finale** con tabella sinottica di tutti gli immobili (#, Nome, Città, Acquisto, Valore attuale, Canone, Rend. netto, Inquilino).
   - Header brand+logo società + footer pagine (riusa `_pdf_chrome.py`).
59. **Frontend**: terzo card violet (#7C3AED) con icona BookOpen nella griglia `/report`. Grid ora `lg:grid-cols-3`.
60. **Campi opzionali immobili** letti dal report (popolabili via Mongo direct o futuro endpoint dedicato): `inquilino`, `scadenza_contratto`, `data_inizio_contratto`, `deposito_cauzionale`. Quando assenti, mostra "—".
61. **Helper async `_fetch_property_images()`**: scarica in parallelo le foto degli immobili (timeout 6s, follow_redirects, supporta sia URL HTTP che data: base64), passa BytesIO al builder ReportLab. Errori loggati a DEBUG, foto fallback graziosa.
62. **Test coverage**: 15/15 backend+frontend passati. File: `/app/backend/tests/test_iter16_investor_book.py` con assertion su contenuto PDF via pdfplumber (KPI values, section headers, tenant names, scadenze dates).

## 🆕 Locazione editable nella Scheda Immobile (30 May 2026 - iter 17)
63. **Nuovo endpoint `PATCH /api/properties/{pid}/locazione`** (`routers/properties.py`):
   - Body `LocazioneIn` con tutti i campi opzionali — `inquilino`, `data_inizio_contratto`, `scadenza_contratto`, `deposito_cauzionale`, `durata_contratto_anni`, `rinnovo_automatico`, `canone_mensile`, `note_locazione`.
   - Solo i campi forniti vengono `$set` (partial update); body vuoto dopo filtro → 400; immobile non trovato → 404.
   - Restituisce immobile arricchito con metriche ricalcolate (rendimento/cash flow aggiornati se cambia il canone).
   - `PropertyIn` esteso con gli stessi campi → ora anche POST `/api/properties` li accetta.
64. **Nuovo tab "Locazione"** nella scheda immobile (`/immobile/{id}`):
   - Form completo: inquilino, date contratto, canone, deposito, durata, rinnovo automatico (checkbox), note libere.
   - **Status badge dinamico** computato lato client da `scadenza_contratto`:
     - 🟢 Verde "In corso · scade tra N giorni" (>90 giorni)
     - 🟡 Ambra "Scade tra N giorni" (<90 giorni)
     - 🔴 Rosso "Contratto SCADUTO" (data passata)
     - ⚪ Grigio "Nessuna locazione attiva"
   - KPI riepilogo a colonna destra: canone annuo, rendimento lordo/netto auto-aggiornati dal `_enrich_property()` lato backend.
65. **Loop chiuso end-to-end**: i dati salvati dal form fluiscono automaticamente in `Investor Book` PDF (sezione "Locazione in corso" per ogni immobile) + nei calcoli `KPI` portafoglio (canone annuo complessivo) + nelle proiezioni `Forecast` (canone_mensile è la baseline).
66. **Test coverage**: 6/6 backend pytest + frontend e2e (toast success, persistenza dopo reload, screenshot). File: `/app/backend/tests/test_iter17_locazione.py`.

## 🆕 Form "Nuova operazione" multi-step (31 May 2026 - iter 18)
67. **Nuovo modal `NewPropertyModal.jsx`** (4 step) — chiude finalmente il gap di creazione manuale immobile:
   - **Step 1**: 3 card grandi per scegliere la **tipologia operazione** (`reddito` / `compra_vendi` / `compra_ristruttura_vendi`), ognuna con icona, colore distintivo e descrizione strategica.
   - **Step 2**: Anagrafica completa (nome, indirizzo, città, provincia, tipologia, m², piano, anno, classe energetica, data acquisto).
   - **Step 3**: Numeri (prezzo + notaio + agenzia + imposte + lavori + valore stimato + canone se reddito + mutuo opzionale) con **live preview** che calcola in tempo reale costo totale, rendimento lordo stimato (per reddito) o margine atteso (per compra-vendi/ristruttura-vendi).
   - **Step 4**: Stato iniziale (in_valutazione / in_trattativa / acquistato / in_ristrutturazione / disponibile / affittato) + note + **recap finale** prima della creazione.
   - Progress bar gradient con colore del tipo operazione selezionato.
68. **Wiring nei 2 punti di entrata**:
   - **`/patrimonio`** → pulsante "Nuovo immobile" (precedentemente non funzionante) ora apre il modal.
   - **`/operazioni`** → pulsante header "Nuova operazione" + **3 pulsanti per-card** ("Aggiungi a reddito", "Aggiungi compra-vendi", "Aggiungi compra-ristruttura-vendi") che **preselezionano la tipologia** e saltano direttamente allo step 2.
69. **Template Excel aggiornato** (`routers/imports.py`): nuova colonna "Operazione" all'indice 10 (tra "Stato" e "Data acquisto"). 24 colonne totali. Parse e commit preservano l'operazione esplicita; fallback alla heuristica canone-based solo se cella vuota.
70. **Bug fix critici durante testing** (iter 18):
   - **Off-by-one Excel parse**: dopo l'inserimento di "Operazione" al col 10, `prezzo = cells[11]` puntava a "Data acquisto" → fixed a `cells[12]`. Tutti gli altri indici già a posto.
   - **Modal step re-sync**: `useState(preselectOperazione ? 2 : 1)` non re-eseguiva al cambio prop → modal di `/operazioni` restava su step 1. Fixed con `useEffect([open, preselectOperazione])` che resetta step + operazione.
71. **Test coverage**: 8/8 backend pytest + 100% UI e2e flow (4 step, live preview, recap, toast, list-show, preselect→step 2 con accent colore). Suite riusabile in `/app/backend/tests/test_iter18_operazione.py`. 5 screenshot in `/app/frontend/public/screenshots/16..19`.

## 🆕 Forecast semplificato — Una sola schermata (31 May 2026 - iter 19)
72. **`/forecast` rifatta da zero** (`ForecastSimple.jsx`) — layout 2 colonne, niente tab. Sinistra = input ultra-leggero (modalità Prompt / Parametri / Entrambi · orizzonte 3-5-10), destra = output immediato.
73. **Endpoint backend unificato** `POST /api/forecast/quick`:
   - Con **prompt**: chiama Claude → JSON con operazioni + risks → simula
   - Con **parametri** (acquisti/anno, prezzo, canone, città, tipologia, leva): espansione deterministica → simula (no LLM)
   - Con **entrambi**: prompt + parametri come vincoli espliciti nel system message
   - Sempre persistito con `quick_mode:true` (per PDF + AI chat).
74. **Output sintetico**: verdict banner colorato, 4 KPI mini (PN, immobili, CF cum., LTV), 4 grafici essenziali (PN area, CF bar, debito+LTV composite con linea soglia 70%, ricavi/costi/utile composite), tabella anno-per-anno con righe tinte rosso/ambra + badge alert per riga, 4 pulsanti azione (Genera variante, Confronta, Scarica PDF, Chiedi all'AI).
75. **AI chat in pagina** sul risultato — domande libere ("Qual è l'anno più rischioso?", "Come riduco l'LTV?") risposte dal Claude AI Coach esistente.
76. **Pagina avanzata preservata** su `/forecast/advanced` (vecchio editor a 4 tab + multi-shot Strategist + Compare side-by-side). Link "Modalità avanzata" sempre visibile in header.
77. **Test coverage**: 100% backend (3/3) + 100% frontend e2e (16 data-testids verificati). Suite in `/app/backend/tests/test_iter19_forecast_quick.py`.

## 🆕 Rafforzamento simulazione — Pacchetto "UX + decisione rapida" (31 May 2026 - iter 20)
78. **Vincoli hard** applicati durante `simulate()`: nuovo campo `vincoli` salvato nello scenario con `blocca_acquisti_cassa_negativa` (bool) + `riserva_minima_liquidita` (€). Quando l'engine incontra un'op di acquisto che farebbe scendere la cassa sotto la soglia, l'op viene SCARTATA (non solo segnalata): voce in `state["_blocked_ops"]` con `{anno, label, liquidita_attesa, riserva_richiesta, reason}` + log riga "⚠️ BLOCCATO" nel year-log. Riepilogata in `summary.blocked_ops`. Verdict UI mostra ora "N op. bloccate dai vincoli" se >0.
79. **Sensitivity what-if con slider live** — nuovo endpoint `POST /api/forecast/scenarios/{sid}/sensitivity` accetta `{delta_tasso_pct, delta_canone_pct, delta_rivalutazione_pct, vacancy_mesi_anno, costi_gestione_pct}` e re-simula stesso scenario con modifiers applicati: tasso interesse implicito (base 3%), canone moltiplicato (1+Δ%), rivalutazione offset, sottrazione vacancy_mesi×canone dal ricavo annuo, override % costi gestione (default 15%). UI: 4 slider colorati (rosso/blu/verde/arancione) in `ForecastSimple.jsx` con debounce 280ms → call backend → 3 DeltaCard side-by-side (Base vs Stress su PN/CF/LTV con ▲▼ % delta colorato e linea barrata sul base).
80. **Tornado chart** — nuovo endpoint `POST /api/forecast/scenarios/{sid}/tornado` esegue 10 simulazioni (5 parametri × low/high con range fissati: tasso ±1.5%, canone ±15%, rivalutazione ±2%, vacancy 0-3m, costi gestione 10-25%) e restituisce items ordinati per `swing = max(|delta_pn_low|,|delta_pn_high|)`. UI: chart custom div-based con barre divergenti centrate sul base — rossa a sx (PN low - base), verde a dx (PN high - base), label €Xk dentro la barra se larga, range testuale a destra. Nota didattica "💡 La variabile in cima è quella che conta di più".
81. **Reset automatico** sensitivity + tornado a ogni nuova simulazione `/quick`. Layout: i nuovi pannelli si inseriscono tra la tabella anno-per-anno e i bottoni azione, mantenendo il flusso logico simulazione → KPI → grafici → tabella → stress test → tornado → azioni → AI chat.
82. **Test coverage**: 3/3 endpoint funzionanti via curl smoke test (block 8 acquisti su 10 con riserva 50k€, sensitivity PN da 2.74M → 2.66M con stress, tornado classifica Rivalutazione come driver dominante 419k swing). E2E UI verificato via screenshot tool: 4 slider colorati funzionanti, DeltaCard live, TornadoChart rendering ordinato.


## Demo accounts

## 🆕 Reset DB + popolazione portafoglio reale Torino (31 May 2026 - iter 21)
83. **DB CEO svuotato e popolato con 5 immobili reali a Torino** via `/app/backend/scripts/reset_and_seed_torino.py`:
   - Via Foligno 18 — Bilocale — 24K + 3K ag + 9% atto → canone 320€/m (rend. lordo 13.17%)
   - Negozio Piazza De Amicis 4 — 60K + 9% atto → canone 590€/m (rend. lordo 10.83%)
   - Via Borgaro 86 — Bilocale — 52K + 3K ag + 9% atto → canone 480€/m (rend. lordo 9.65%)
   - Via Don Bosco 22 — Bilocale — 51K + 6K ag + 9% atto → canone 420€/m (rend. lordo 8.18%)
   - Via Lauro Rossi 14 — Bilocale — 58K + 4K ag + 9% atto → canone 480€/m (rend. lordo 8.57%)
   - **Totale**: € 283.050 investiti, € 2.290/mese canoni (€27.480/anno), tutti acquistati cash (zero mutui), tutti affittati.
84. **demoData.js riallineato**: properties array, portfolioKPI, cashFlowMensile/Forecast/Ricavi-Costi, distribuzioneTipologia (4 bilocali + 1 negozio), contratti (5), incassi (5 pagati Feb 2026), lavori vuoto, mutui vuoto, alerts riscritti (concentrazione 100% Torino + opportunità leva).
85. **Patrimonio.jsx fix duplicazione**: la pagina mostrava 10 immobili (5 real + 5 demo). Ora se `realProps.length > 0` mostra SOLO i real + deals in trattativa; demoData è fallback se DB vuoto. Subtitle: "5 immobili · dati reali".

## 🆕 Rebase timeline a Gen 2026 (31 May 2026 - iter 22)
87. **Acquisti spostati al 2025**, **contratti tutti dal 01/01/2026 al 100%**:
   - data_acquisto: Feb/Mag/Lug/Set/Nov 2025 (sostituiti i 2024)
   - data_inizio_contratto: 2026-01-01 per tutti e 5; scadenza 4 anni bilocali (2030-01-01), 6 anni negozio (2032-01-01)
88. **Cashflow storico ricalcolato**: zero da Mar '25 a Nov '25 (immobili in acquisizione), -220€ a Dic '25 (prep), poi 1820€/mese a regime da Gen '26.
89. **Forecast 12 mesi**: steady ~1820€/mese con dip a 1070€ a Giu '26 e Dic '26 (IMU acconto/saldo).
90. **Movimenti aggiornati**: solo Gen + Feb 2026 (5 affitti pagati ciascun mese + condominio Q1 + manutenzione). Niente IMU 2025 (non ancora dovuta).
91. **Alerts** aggiornati con "Portafoglio appena entrato a regime" come primo alert strategico.
92. **MongoDB sincronizzato** via script reset_and_seed_torino.py.

86. **Coerenza dati** verificata: Dashboard (Valore patrimonio 297.000€, ricavi 2.290€/m, rend. netto 7.56%, debito 0€), Patrimonio (5 righe Torino), KPI & Rendimenti (Via Foligno top 9.88%, Don Bosco bottom 6.14%, Portfolio Score 72/100), Mappa (5 marker GPS Torino), Cash Flow (saldo medio 12 mesi 1.119€), Affitti (5 contratti 100% occupancy), Scheda immobile (anagrafica + valore corretti).

## 🆕 Cleanup UX + dati doppi + archivio Documenti (31 May 2026 - iter 23)
93. **Rimossa modalità avanzata Forecast**: eliminato link "Modalità avanzata" nell'header di `ForecastSimple`, link "Confronta con altro scenario" che portava a `/forecast/advanced`, route `/forecast/advanced` e import di `Forecast.jsx` da `App.js`. Forecast ora è single-page senza diramazioni.
94. **Grafici partono da Gen 2026**: `cashFlowMensile` e `ricaviCostiAnnuali` troncati ai soli mesi a regime (Gen + Feb 2026). Forecast 12 mesi rimane invariato. Niente più mesi a 0 pre-acquisizione.
95. **Fix Operazioni duplicate**: `Operazioni.jsx` faceva `[...realProps, ...demoProperties]` mostrando 10 invece di 5. Applicato lo stesso pattern di Patrimonio: se realProps presenti → usa solo quelli, altrimenti fallback demo.
96. **Documenti archivio completo** (da 7 → 34): 5 rogiti + 5 APE + 5 planimetrie + 5 visure catastali + 5 contratti locazione + 4 fatture agenzia + 5 ricevute imposta registro (9% atto). Tutte le date allineate al 2025 per gli atti d'acquisto e dicembre 2025 per i contratti firmati prima dell'avvio Gen 2026.


- ceo@controlroom.it / demo1234 (admin)
- amministrazione@controlroom.it / demo1234 (amministrazione)

## 🆕 Documenti reali + Alert scadenze automatici (31 May 2026 - iter 24)
97. **Backend `/api/documents`** (`routers/documents.py`): upload multipart con MIME detection, list filtrato per `immobile_id`/`tipo`, download streaming, delete. Storage base64 in MongoDB (limite 15 MB). Tipi accettati: Rogito/APE/Contratto/Fattura/Planimetria/Visura/Altro. Estensioni: PDF/PNG/JPG/DOC/DOCX/XLS/XLSX.
98. **Frontend `Documenti.jsx` rifatta**: modal upload drag-and-drop con preview file, selettore tipo + immobile, download reale (blob+anchor), delete con conferma. Modalità ibrida: se ci sono documenti reali → mostra solo quelli con badge "archivio reale"; se vuoto → mostra i 34 documenti demo come anteprima ispirativa con etichetta "demo" e tooltip "Carica per attivare l'archivio reale".
99. **Backend `/api/alerts`** (`routers/alerts.py`): `GET /alerts` lista, `POST /alerts/refresh` ricalcola alert auto-generated (cancella vecchi auto + scansiona properties), `DELETE /alerts/{id}` dismiss. Trigger: scadenza_contratto a 90/60/30/0 gg (severity bassa/media/alta/critica), scadenza mutuo idem, immobile sfitto. Campi `days_remaining` + `scadenza` per UI badge.
100. **Frontend `AlertCenter.jsx` rifatta**: bottone "Scansiona scadenze" con loader, toast con N alert generati, badge Clock colorato (rosso scaduto / arancio ≤30 / ambra ≤60 / blu ≤90), pulsante X per dismiss inline. Subtitle mostra "live · agg. HH:MM" se i dati sono reali, altrimenti "demo".
101. **Test end-to-end verificato**: setto temporaneamente scadenze Via Foligno (45gg) / Borgaro (75gg) / Don Bosco (20gg) → 3 alert generati con severity corretta (media/bassa/alta) → screenshot UI funzionante → rollback scadenze al 2030.


## 🆕 AI Action Plan widget nella Forecast (1 Jun 2026 - iter 25)
102. **Backend `/api/forecast/scenarios/{sid}/action-plan`** (`forecast.py`): chiama Claude Sonnet 4.6 passando contesto completo (portafoglio attuale + obiettivi simulazione + operazioni pianificate + verdict) e chiede output JSON strutturato `{actions: [{priority: P0|P1|P2, timeline, title, description, kpi, category}]}`. Parsing robusto (regex blocco markdown, slice tra `{` e `}`). Salva action_plan + action_plan_ts nello scenario.
103. **Frontend `ForecastSimple.jsx` — widget "Piano d'Azione AI"** posizionato tra Tornado e Actions. Bottone "Genera piano d'azione" → call AI → render `ActionPlanList` con 3 sezioni (P0 URGENTE / P1 QUESTO Q / P2 STRATEGICO), ogni azione card con numero cerchiato, badge categoria colorato (acquisto/finanziamento/gestione/vendita/ottimizzazione/monitoraggio), clock+timeline, KPI con check verde.
104. **Bottone "Accelera crescita"** appare dopo generazione piano: appende al prompt corrente "ACCELERA LA CRESCITA: usa leva finanziaria massima (mutui 70-75% LTV), reinvesti tutti gli utili, considera anche operazioni compra-ristruttura-vendi…" e ri-esegue `/quick`, producendo una variante più aggressiva.
105. **Test e2e verificato**: simulazione "2 acquisti/anno bilocali Torino 60K€ leva 60%" → action plan genera 7 azioni concrete con riferimenti reali (Intesa Sanpaolo, Banco BPM, immobiliare.it, zone specifiche, numeri esatti). Toast feedback "Piano d'azione generato (N step)".

- commercialista@controlroom.it / demo1234 (commercialista)
- collaboratore@controlroom.it / demo1234 (collaboratore)

## Backlog (P1)

## 🆕 AI Document Reader (1 Jun 2026 - iter 26)
106. **Backend `POST /api/documents/{id}/analyze`**: estrae testo dal PDF con pdfplumber (max 15 pagine), invia a Claude Sonnet 4.6 con schema JSON specifico per tipo documento (Rogito/Contratto/APE/Fattura/Visura/Planimetria/Altro). Cache su `documents.ai_analysis` + `ai_analyzed_at` (no doppia chiamata se già analizzato). Parsing robusto JSON (regex markdown + slice braces) con fallback `raw_text` se l'AI restituisce testo non strutturato.
107. **Schema specifici per tipo**: Contratto estrae locatore/conduttore + CF, durata, canone, deposito, ISTAT, spese condominiali, rinnovo, clausole_rilevanti[], anomalie[]. Rogito estrae notaio, venditore, acquirente, prezzo, imposte, dati catastali. APE estrae classe energetica, EP globale, certificatore, scadenza. Fattura estrae numero, emittente, imponibile, IVA, totale, scadenza pagamento.
108. **Anomalie intelligenti**: il prompt chiede a Claude di segnalare incongruenze, clausole rischiose, scadenze imminenti, importi sospetti. Test reale su contratto Foligno → 5 anomalie professionali (registrazione 30gg, clausola prelazione nulla per L.431/1998, congruità canone, deposito ok, mancata modalità pagamento).
109. **Frontend `Documenti.jsx`**: bottone viola **"AI"** (o "Apri AI" se già analizzato) su ogni card + link `Analisi AI disponibile` sotto. Apre `AnalysisModal` con sezioni Sintesi/Dati estratti (grid 2 col)/Clausole/Anomalie. Loader inline durante analisi. Cache visibile: 2ª apertura è istantanea.
110. **Limitazioni note**: l'analisi è disponibile solo per documenti reali (non demo). PDF richiesti — immagini OCR fuori scope iniziale. Max 15 pagine per non saturare il context.

- Persistenza immobili reali su MongoDB (oggi sono in `demoData.js`)
- Upload documenti reali con object storage
- AI Document Reader (estrazione rogito, fatture)

## 🆕 Alert auto-generati da AI Document Reader (1 Jun 2026 - iter 27)
111. **Backend `_generate_alerts_from_analysis()`** in `documents.py`: dopo `/analyze` salva l'analisi e genera automaticamente alert dal contenuto. Cancella prima i vecchi alert con `source_doc_id` corrispondente per non duplicare.
112. **Anomalie → alert documentali**: ogni stringa in `analysis.anomalie[]` (lunga ≥10 char) diventa 1 alert tipo "documentale". Severity = media se contiene keyword [nulla, scaduto, illegittim, rischio, antiabuso], altrimenti bassa. Titolo "Anomalia · {tipo} {nome[:40]}", descrizione completa, linkato a immobile_id.
113. **Date scadenza → alert con `days_remaining`**: scansiona campi `data_scadenza`, `data_fine`, `data_fine_prima_scadenza`, `scadenza_pagamento`. Se entro 180gg (e non > 7gg passato), genera alert con severity dinamica: alta ≤30gg o scaduto, media ≤60gg, bassa >60gg. Titolo dinamico ("Scadenza imminente", "in approssimazione", "SCADUTA").
114. **Test e2e verificato**:
   - Upload + analyze APE con scadenza 35gg → 5 alert (4 anomalie + 1 scadenza media gravità 35gg)
   - Upload + analyze Contratto Foligno → 5 alert (4 anomalie + 1 prima_scadenza)
   - Totale 10 alert documentali con `source_doc_id` correttamente tracciato
115. **Risposta endpoint arricchita**: `{analysis, alerts_generated: N}`. Frontend toast: "Documento analizzato · {N} alert generati automaticamente".
116. **AlertCenter mostra gli alert auto** con badge bassa/media, link "Vai a {immobile}", bottone X per dismiss inline. La re-analisi (cache invalidata) ricrea gli alert idempotente (delete + insert).

- Mappa reale con react-leaflet
- Permessi per ruolo lato UI (oggi tutti vedono tutto)
- Modale "Nuovo immobile" funzionante
- Export PDF/Excel reale dei report (oggi è mockato)

## 🆕 OCR per documenti immagine + PDF scansionati (1 Jun 2026 - iter 28)
117. **Tesseract OCR** installato a livello sistema: `tesseract-ocr` + `tesseract-ocr-ita` + `tesseract-ocr-eng` (3 lingue disponibili). Python: `pytesseract` + `Pillow` aggiunti a requirements.txt.
118. **Helper `_ocr_image_bytes()`**: apre immagine con Pillow, converte in RGB se necessario, esegue Tesseract con `lang="ita+eng"` e `--psm 6` (assume blocco di testo uniforme — ideale per documenti). Supporta PNG/JPG/JPEG/WEBP/TIFF.
119. **Helper `_ocr_pdf_pages()`**: fallback per PDF scansionati (immagine, no testo). Rasterizza le pagine via `pdfplumber.page.to_image(resolution=200)` → Tesseract → testo. Limite 10 pagine per non saturare.
120. **Pipeline analyze aggiornata**: PDF → pdfplumber, se testo estratto <30 char → OCR pagine. Immagine → OCR diretto. Multi-lingua italiano+inglese per gestire documenti misti.
121. **Test reale OCR su PNG**: visura catastale 1200×1500px scansionata caricata → in 13 secondi totali (OCR + Claude) estratti: comune TORINO, foglio 142, particella 38, sub 7, categoria A/3, rendita 412,38€, superficie 65mq, intestatario "ROSSI MARIO 100/100" + 6 anomalie inclusa una geniale: "campo Consistenza riporta '35vani' (35 vani per 65 mq è incongruente con A/3, probabile errore OCR — verosimilmente 3,5 vani)". L'AI rileva e segnala anche gli errori OCR stessi.
122. **Frontend**: file upload accetta ora anche `.webp,.tiff,.tif` oltre a PNG/JPG. Workflow invariato: stessa modale di analisi, stessi alert auto-generati.


## Backlog (P2)

## 🆕 Alert sulla Scheda Immobile (1 Jun 2026 - iter 29)
123. **Banner alert in hero** della scheda: se l'immobile ha alert attivi (filtrati da `immobile_id`), appare un mini-banner giallo "⚠ N alert attivi · Vedi sotto ↓" sotto le card Rendimento/Cash flow del Portfolio Score. Link smooth scroll a `#alerts-section`.
124. **Tab dedicata "Alert"** in `SchedaImmobile.jsx` con **badge contatore rosso** (`bg-#FEE2E2 text-#DC2626`). Posizionata dopo Movimenti come ultima.
125. **Pannello alert dettagliato**: lista di card con icona AlertTriangle, badge severity colorato (alta=rosso, media=ambra, bassa=blu), tipo (documentale/economico/strategico), Clock badge con `days_remaining` (scaduto/≤30gg arancio/≤60gg ambra/>60gg blu), titolo, descrizione completa, timestamp, bottone X per dismiss inline.
126. **Stato vuoto educativo**: "Nessun alert per questo immobile. Carica un documento e analizzalo con l'AI per generare alert automatici su anomalie e scadenze." → invita all'azione.
127. **Test e2e**: Via Foligno (IMM-001) ha già 16 alert (16 anomalie dai 2 documenti caricati: contratto + visura PNG OCR + APE) → tutti visualizzati correttamente nella nuova tab. Loop chiuso: documento caricato → AI Reader → alert auto → visibile sulla scheda immobile + Centro Alert centralizzato.

- Integrazione bancaria
- Notifiche email/PEC su alert critici
- Multi-società / multi-tenant
- Mobile-first ottimizzato (oggi responsive ma desktop-first)

## 🆕 3 automazioni potenti (1 Jun 2026 - iter 30)
128. **Auto-applica dati catastali alla scheda immobile** in `_autoapply_to_property()`: dopo `/analyze` di Visura o Rogito, se l'AI ha estratto foglio/particella/sub/categoria/rendita/superficie/vani e i campi sulla property sono vuoti → applica i valori. Calcolo IMU automatico: `rendita × 1.05 × moltiplicatore (160 abitazione / 55 negozio) × 10.6‰`. Salva `imu_annua_stimata`. No overwrite di dati già inseriti dall'utente.
129. **Incassi affitto auto-generati** (`_generate_expected_incassi` in properties.py): quando si aggiorna la locazione con canone + data_inizio_contratto, crea automaticamente fino a 14 mesi di incassi previsti in `db.incassi` con id deterministico `INC-{pid}-YYYY-MM` (idempotente). Stato iniziale "previsto", upgrade a "in_ritardo" automatico se data > 7gg dal 1° del mese.
130. **Nuovo router `/api/incassi`** (`incassi.py`): `GET /incassi` (lista filtrata per immobile), `GET /incassi/stats` (KPI mese corrente con completion %), `POST /incassi/{id}/mark-paid` (registrazione manuale), `POST /incassi/reconcile` (matching automatico con movimenti bancari), `POST /incassi/regenerate` (rigenera per tutti gli affittati).
131. **Algoritmo riconciliazione bancaria**: per ogni incasso open scansiona i movimenti positivi non abbinati, applica tolleranze (data ±12gg dal 1° del mese, importo ±3% o ±€5 assoluti), sceglie il candidato migliore per score combinato. Marca incasso "pagato" + flagga movimento con `matched_incasso_id`. Test: 5 movimenti bancari di Giugno → 5/5 incassi abbinati istantaneamente.
132. **Portfolio Score dinamico** in `_shared.py` con `apply_dynamic_score()`: parte dal base, penalità per alert (alta=-10, media=-3, bassa=-1) + morosità (-5 per incasso non a posto) + bonus se rendimento_netto>8% (+5). `score_breakdown` esposto. Test: Via Foligno 84 → **71** (16 alert: 1 media + 15 bassa = -18, +5 bonus rendimento). Endpoint `GET /properties` ora ricarica anche alerts + incassi per applicare lo score.
133. **Frontend `Affitti.jsx` rifatto live**: KPI "Incassato 2026-06 €2.290 · 5/5 · 100%", bottone "Riconcilia con banca", contratti dalla properties live, incassi raggruppati per mese (ultimi 4 mesi visibili), bottone "Segna pagato" inline + modal. Filtro morosi solo mesi passati/corrente (i previsti futuri non sono morosi).
134. **Test e2e**: regenerate → 70 incassi creati (14 × 5 immobili) → inseriti 5 movimenti test → reconcile → 5/5 matched → completion 100% in dashboard.



## 🆕 Score breakdown tooltip ovunque (1 Jun 2026 - iter 31)
135. **Componente `ScoreBadge`** (`/components/ScoreBadge.jsx`): mostra il portfolio_score con tooltip on-hover/click che spiega come è calcolato. Layout: card 64 di larghezza, header "Come è calcolato", righe con base + ogni penalità/bonus colorato + separatore + "Totale X/100" colorato per soglia.
136. **Applicato in 3 punti**: Patrimonio tabella (tooltip top-right per non uscire dal viewport), Patrimonio card pill `/100`, Dashboard tabella Top immobili.
137. **SchedaImmobile**: sotto il gauge una mini-card breakdown sempre visibile con Base + Alert penalty + Morosi penalty + Bonus rendimento.
138. **Logica`?`** visibile solo se score_breakdown disponibile (no su demo).


## 🆕 Manuale d'uso integrato (1 Jun 2026 - iter 32)
139. **11 screenshot generati** in `/app/frontend/public/manual/` per Dashboard, Patrimonio, Scheda, Affitti, Costi&Ricavi, Documenti, Import, AlertCenter, Forecast, Mappa, KPI.
140. **Nuova pagina `/manuale`** (`Manuale.jsx`): 2-colonne con indice sticky a sinistra (search inclusa) + content a destra. 13 sezioni: Introduzione + 11 pagine + Workflow tipico (Step 1-6 dal nuovo immobile al PDF Piano Industriale).
141. **Sistema di blocchi**: ogni sezione usa `blocks: [{type, text/items}]` con 4 tipi (subtitle, text, list, tip). Box "Suggerimento" giallo per best practices.
142. **UX**: footer prev/next, click su screenshot apre fullsize, smooth scroll al cambio sezione, voce sidebar BookOpen sotto Documenti.


## 🆕 HelpButton context-aware (1 Jun 2026 - iter 33)
145. **Componente `HelpButton.jsx`** floating fixed bottom-right (sopra badge Emergent, z-40): mappa il `location.pathname` corrente a una sezione del manuale (`/affitti` → `affitti`, `/forecast` → `forecast`, ecc). Auto-hide su `/manuale` e `/login`.
146. **UX espandibile**: cerchio 48px chiuso, si allarga su hover mostrando "Aiuto · {NomeSezione}" (es. "Aiuto · 4. Affitti & Locazioni"). Click → naviga a `/manuale?s={section}`.
147. **Manuale.jsx** legge il query param `?s=` via `useSearchParams` (+ useEffect per cambi dinamici) e apre direttamente sulla sezione richiesta.

## 🆕 Onboarding Tour guidato (1 Jun 2026 - iter 34)
149. **Componente `OnboardingTour.jsx`** integrato nel Layout (visibile dopo login): tour a 7 step con spotlight ritagliato sull'elemento target (sidebar voci) e tooltip card laterale. Auto-trigger solo se `localStorage.tour_completed != "1"` e path != /login.
150. **7 step**: Welcome modal centrale → Patrimonio → Documenti → Centro Import → Forecast → HelpButton bottom-right → End ("Vai a Patrimonio" naviga a /patrimonio).
151. **UX**: progress dots animati che mostrano avanzamento, "Salta il tour" sempre disponibile, "Indietro" da step 2+, anello blu pulsante con `box-shadow` su elemento target. Spotlight implementato con 4 div esterni che oscurano tutto tranne il rect target (più performante di SVG mask).
152. **Posizionamento adattivo**: placement `right/left/center/bottom` per la card tooltip in base allo step. Re-misurato su resize/scroll via `useLayoutEffect`.
153. **`restartTour()` helper** esportato per il bottone "Rifai il tour guidato" presente nella sezione Introduzione del Manuale d'uso (rimuove localStorage + redirect a /dashboard).

148. **Integrato nel Layout** (visibile ovunque). Test e2e: da `/affitti` → click help → URL `/manuale?s=affitti` → titolo "4. Affitti & Locazioni" caricato.


## 🆕 Import estratto conto AI-driven (1 Jun 2026 - iter 35)
154. **Backend `parse_banca` riscritto robusto** in `imports.py`:
   - `_read_tabular_robust()`: CSV con auto-detect separator (`;`, `,`, `\t`, `|`) e encoding (utf-8, latin-1, cp1252). Excel multi-sheet con `skiprows` 0–5 e scoring per scegliere il foglio/header migliore (privilegia righe con più colonne non-Unnamed).
   - `_parse_amount()`: gestisce formati italiani e USA (1.234,56 vs 1,234.56), simboli €/EUR, parentesi per negativi, spazi e apostrofi.
   - `_parse_date()`: stringhe ISO, Timestamp pandas (via `.date()`), date italiane DD/MM/YYYY via dateutil fuzzy.
   - `_ai_detect_columns()`: fallback Claude Sonnet 4.6 che riceve sample CSV e ritorna JSON `{data, importo, dare, avere, descrizione}` con nomi colonne ESATTI.
155. **3-step ladder mapping**: 1) override manuale dal frontend, 2) heuristic keyword italiano+inglese, 3) AI fallback solo se ancora mancano data/importo.
156. **Response shape**: `{status: "ok"|"needs_mapping", total, entrate, uscite, matched, duplicates, errors[], errors_count, mapping_used, ai_used, movimenti[]}`. Duplicati detect via signature MD5 già esistenti in DB. Errors riportano riga umana (header + 1-based) + messaggio.
157. **Frontend `BancaTab` rifatto** con 2 stati:
   - `status=needs_mapping` → form interattivo con 5 dropdown popolate dalle colonne disponibili + preview sample 5 righe + bottone "Riprova con mapping".
   - `status=ok` → 5 KPI boxes (movimenti, entrate, uscite, riconciliati, duplicati), banner AI viola se Claude usato, banner errori ambra se >0 errori (mostra prime 5 con numero riga), tabella anteprima con badge per ogni riga (ok/duplicato).
158. **Commit filtrato**: solo righe non duplicate vengono importate, toast mostra "X importati, Y duplicati saltati".
159. **Test e2e**: file con header annidati (BANCA INTESA + IBAN + Periodo prima della tabella) + colonne inglesi (Trans. Date, Debit, Credit) → riconosciuto via heuristic con `skiprows=4`, mappato correttamente, 3 movimenti parsati e 2 riconciliati con canoni Negozio De Amicis + Via Borgaro.


## 🆕 Bug fix + 2 feature (1 Jun 2026 - iter 36)
160. **BUG Deal AI link Immobiliare/Idealista**: `fetch_url_text` ora ha fallback automatico a Jina Reader (`r.jina.ai/<URL>`) per bypassare HTTP 403 anti-bot. Filtra cookie banner/errori target. Messaggio errore con istruzioni copia-incolla.
161. **BUG Liquidità inconsistente**: nuovo endpoint `GET /api/finance/liquidity` fonte unica = bilancio_caricato.liquidita → fallback settings.liquidita_iniziale + Σ movimenti_bancari. Dashboard + Forecast `build_baseline` ora usano la stessa funzione `_compute_liquidity`. Risultato test: 37.290€ ovunque (35k iniziali + 2.290 movimenti).
162. **Mapping preset banca**: `bank_mapping_presets` con `columns_signature` hash. CRUD `/api/import/banca/mapping-presets`. Parse_banca auto-applica preset prima di heuristic/AI. Frontend: banner verde "Preset X applicato" o inline form "Salva mapping".
163. **Fuzzy variant detection**: per ogni movimento non-duplicato cerco esistenti con stesso importo, data ±2gg, descrizione diversa → marca `variant_of`. KPI "Possibili rettifiche" + badge viola "rettifica?" con tooltip movimento originale.

## Update 2026-02-XX — Fase A+B+C
### Fase A (Quick wins)
- ✅ Campo "Liquidità iniziale" in Impostazioni (salva su settings.liquidita_iniziale)
- ✅ Sparkline + tooltip ⓘ con formula su KPI Dashboard

### Fase B (Ciclo vita locazione)
- ✅ Nuovo router `contracts.py`: registra-disdetta, annulla-disdetta, chiudi-contratto, storico-contratti
- ✅ Auto-transizione stato → sfitto quando data_uscita_prevista <= oggi (chiamata da GET /properties)
- ✅ Collezione `contratti_storico` per snapshot inquilini precedenti
- ✅ Alert automatico generato alla registrazione disdetta (severità in base ai gg residui)
- ✅ UI SchedaImmobile tab Locazione: banner stato, 3 bottoni (disdetta, annulla, chiudi), storico

### Fase C (Mutui reali + AI PDF)
- ✅ Nuovo router `mutui.py`: CRUD + aggregato + piano ammortamento alla francese
- ✅ Endpoint POST /api/mutui/parse-pdf → AI Claude Sonnet 4.6 estrae campi dal PDF banca (con OCR fallback)
- ✅ Pagina Mutui rifatta: dati reali, form completo, modal AI import con preview anomalie
- ✅ KPI live: debito totale, rata totale, LTV%, incidenza rata/affitti
- ✅ Collezione `mutui` + sync `mutuo` mini-record su property per retro-compat

### Test end-to-end completati con curl
- Create/Update/Delete mutuo ✓
- Piano ammortamento corretto (rata 720.50€/mese, 239 rate, capitale calcolato) ✓
- Disdetta + Chiudi contratto + Storico ✓
- Aggregato mutui (LTV, incidenza) ✓

## Update — P0 + P1 completati (massiccio refactor dati demo→reali)

### P0 Quick wins
- ✅ **Topbar campanella**: legge da `/api/alerts` (severity alta/media), refresh ogni 60s
- ✅ **Dashboard widget "Profittevoli/Sotto target/Sfitti"**: calcolati live dalle properties reali
- ✅ **Dashboard Portfolio Score**: media reale degli score immobili (non più 72 hardcoded)

### P1 Conversioni complete
- ✅ **`routers/lavori.py`** (nuovo): CRUD cantieri + aggregato budget + over-budget alert. Categoria, impresa, avanzamento, autocomplete da 100%.
- ✅ **`routers/vendite.py`** (nuovo): metti-in-vendita, registra-vendita, ritira-da-vendita. Calcolo plusvalenza automatico con regime fiscale (privato vs SRL/SpA + holding 5 anni esenzione).
- ✅ **`routers/cashflow.py`** (nuovo): storico 12 mesi + forecast 12 mesi + KPI aggregato. Usa incassi reali, rate mutui, IMU/assicurazione mensilizzate, tasse stimate, lavori residui spalmati 6 mesi.
- ✅ **Vendite.jsx** rifatta: KPI live, lista in-vendita con bottoni «Registra vendita» / «Ritira», storico operazioni con plusvalenza+tasse+ROI, modali per workflow.
- ✅ **Lavori.jsx** rifatta: CRUD completo con form (categoria, impresa, budget, speso, avanzamento), stato auto-completato a 100%, scostamento %.
- ✅ **CashFlow.jsx** rifatta: dati live storico + forecast, alert mesi in tensione.
- ✅ **KPI.jsx** rifatta: rendimento netto/lordo calcolato sul regime società SRL, ROI cash-on-equity, leva finanziaria, classifiche top/worst, Portfolio Score reale.
- ✅ **CostiRicavi.jsx**: rimossi i 30 movimenti demo. Mostra solo movimenti banca importati + empty state CTA «Importa estratto conto».

### Verifiche E2E con curl
- Cashflow live: 2.290€ incassi/mese (5 immobili Torino) - 1.124€ uscite = saldo netto 1.166€/mese
- Lavori, Vendite, Mutui partono vuoti per l'utente (collezioni nuove). Tutto creabile da UI.

### Rimanenze (P2)
- Mappa Patrimonio geografica (richiede geocoding indirizzi + react-leaflet)

## Update — Zero dati demo orfani (chiusura P2)

### Tre fix conclusivi
1. ✅ **AIAutopilot.jsx** ora carica via `/api/properties`, `/api/mutui/aggregato`, `/api/cashflow/aggregato`, `/api/finance/liquidity`, `/api/settings`. Il contesto inviato a Claude contiene **ogni KPI reale** + il regime fiscale + la lista dei 20 primi immobili con dati live (canoni, scadenze, mutui collegati). Pannello "Contesto live" ridisegnato.
2. ✅ **SchedaImmobile.jsx** tab Documenti/Movimenti/Lavori → ora leggono da `/api/documents?immobile_id`, `/api/import/banca` (filtrato per `match_canone.property_id`), `/api/lavori?immobile_id`. Rimossi gli import demo `contratti`, `lavori`, `documenti`, `movimenti`.
3. ✅ **Mappa.jsx** ora vera mappa OpenStreetMap con **react-leaflet** + nuovo router `routers/geo.py` con geocoding Nominatim (free, rate-limit 1req/s) e cache su `property.geo`. CircleMarker colorati per rendimento/stato, Popup con dati live, fallback su città se indirizzo non trovato.

### Verifica E2E
- 5 immobili Torino geocodificati con successo: Via Foligno 18 → lat 45.097549 lng 7.669097, ecc.
- Tutti gli endpoint API rispondono correttamente.

### Stato finale "demo"
- Demo presente: `formatEur`, `STATI`, `getProperty` (helper di utilità statici, non dati)
- Demo residuo come fallback se DB vuoto: Patrimonio, Dashboard, AlertCenter, Operazioni, Affitti (tutti già passano automaticamente ai dati live se presenti).
