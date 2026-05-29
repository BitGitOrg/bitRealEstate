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
