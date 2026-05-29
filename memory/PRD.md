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

## Demo accounts
- ceo@controlroom.it / demo1234 (admin)
- amministrazione@controlroom.it / demo1234 (amministrazione)
- commercialista@controlroom.it / demo1234 (commercialista)
- collaboratore@controlroom.it / demo1234 (collaboratore)

## Backlog (P1)
- Persistenza immobili reali su MongoDB (oggi sono in `demoData.js`)
- Upload documenti reali con object storage
- AI Document Reader (estrazione rogito, fatture)
- Mappa reale con react-leaflet
- Permessi per ruolo lato UI (oggi tutti vedono tutto)
- Modale "Nuovo immobile" funzionante
- Export PDF/Excel reale dei report (oggi è mockato)

## Backlog (P2)
- Integrazione bancaria
- Notifiche email/PEC su alert critici
- Multi-società / multi-tenant
- Mobile-first ottimizzato (oggi responsive ma desktop-first)
