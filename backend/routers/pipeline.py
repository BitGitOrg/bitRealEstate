"""Pipeline Acquisizioni — CRM verticale immobiliare.

Modello: Deal con 8 stage progressivi + timeline eventi datati.
Alla chiusura (stage=rogito_completato), il deal viene convertito in Property automaticamente.

Stage:
0. visionato       — annuncio scoperto
1. visitato        — visita effettuata
2. offerta_inviata — prima offerta
3. trattativa      — controproposte in corso
4. accettato       — proposta accettata
5. verifica_doc    — visure, conformità
6. mutuo_richiesto — banca in delibera
7. preliminare     — compromesso firmato
8. rogito          — rogito firmato → diventa Property

Metriche: time-to-close, sconto negoziato, conversion funnel, banche più veloci.
"""
import uuid
import re
import json
import asyncio
import logging
import httpx
from datetime import date, datetime, timezone
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)


STAGES = [
    "visionato", "visitato", "offerta_inviata", "trattativa",
    "accettato", "verifica_doc", "mutuo_richiesto", "preliminare", "rogito"
]


async def _compute_ai_score(db, user_id: str, prezzo: float, canone_mensile: Optional[float]) -> dict:
    """Calcola AI Deal Score deterministico in base a impostazioni fiscali utente."""
    out = {"ai_deal_score": None, "ai_giudizio": None, "ai_prezzo_max": None, "ai_punti": []}
    try:
        from routers._shared import tax_rate_from_settings
        settings = await db.settings.find_one({"user_id": user_id}, {"_id": 0}) or {}
        costo_tot = (prezzo or 0) + 8000
        canone_a = float(canone_mensile or 0) * 12
        rend_lordo = (canone_a / costo_tot * 100) if costo_tot > 0 else 0
        tax = tax_rate_from_settings(settings)
        rend_netto = rend_lordo * (1 - tax - 0.08)
        score = 55 + min(35, max(-35, (rend_netto - 4) * 7))
        if canone_a == 0:
            score -= 10
        if rend_lordo >= 8:
            score += 6
        elif rend_lordo >= 6.5:
            score += 3
        score = max(0, min(100, int(score)))
        target_n = float(settings.get("target_netto", 4.5) or 4.5)
        if canone_a > 0:
            prezzo_max = (canone_a / (target_n / 100)) / (1 - tax - 0.08) - 8000
            out["ai_prezzo_max"] = max(0, round(prezzo_max, 0))
        out["ai_deal_score"] = score
        out["ai_giudizio"] = ("eccellente" if score >= 88 else "buona" if score >= 72
                              else "interessante" if score >= 55 else "rischiosa" if score >= 38
                              else "sconsigliata")
        punti = []
        if canone_a == 0:
            punti.append("Canone atteso mancante: stima difficile")
        if rend_netto < 3.5 and canone_a > 0:
            punti.append(f"Rendimento netto stimato {rend_netto:.1f}% sotto soglia")
        if rend_lordo >= 7:
            punti.append(f"Rendimento lordo {rend_lordo:.1f}% sopra media")
        out["ai_punti"] = punti or ["Parametri equilibrati"]
    except Exception as e:
        logger.warning(f"AI score compute failed: {e}")
    return out


async def _fetch_url_text(url: str) -> str:
    """Scarica il contenuto leggibile di una pagina via Jina Reader (gestisce JS+anti-bot)."""
    jina_url = f"https://r.jina.ai/{url}"
    async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
        r = await client.get(jina_url, headers={"Accept": "text/plain", "User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        text = r.text
        # Detect portali con anti-bot aggressivo (Immobiliare.it / Idealista.it / Subito.it)
        low = text.lower()
        if "403: forbidden" in low or "access denied" in low or "captcha" in low or "requiring captcha" in low:
            raise PermissionError(
                "Portale protetto da anti-bot (Immobiliare/Idealista/Subito bloccano lo scraping). "
                "Soluzione: usa l'email forwarding degli alert del portale (sezione coming soon)."
            )
        return text[:18000]


async def _ai_parse_annuncio(llm_key: str, url: str, page_text: str) -> dict:
    """Chiede a Claude di estrarre dati strutturati dall'annuncio."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    sys_msg = (
        "Sei un esperto di annunci immobiliari italiani (Immobiliare.it, Idealista, Subito, Casa.it). "
        "Estrai i dati dall'annuncio e restituisci SOLO un JSON valido (no markdown, no testo) nel formato esatto: "
        '{"indirizzo":"str|null","citta":"str|null","cap":"str|null","prezzo_richiesto":num|null,'
        '"metratura":num|null,"tipologia":"bilocale|trilocale|quadrilocale|monolocale|negozio|ufficio|villa|altro",'
        '"canone_atteso":num|null,"note":"str con riassunto in italiano max 200 char","fonte":"immobiliare|idealista|subito|casa|altro"}\n'
        "Regole: prezzo_richiesto e metratura SOLO numeri (no €/mq). Se canone non indicato, stima realistica = metratura × 12 €/mese (in Italia centro città bilocale). "
        "Nelle note metti SOLO: stato (nuovo/ristrutturato/da ristrutturare), piano, spese condominio, classe energetica.\n\n"
        f"URL: {url}\n\nCONTENUTO PAGINA:\n{page_text}"
    )
    chat = LlmChat(api_key=llm_key, session_id=f"deal-parse-{uuid.uuid4().hex[:8]}", system_message=sys_msg).with_model("anthropic", "claude-sonnet-4-6")
    reply = await chat.send_message(UserMessage(text="Estrai i dati dell'annuncio."))
    text = reply.strip()
    if "```" in text:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if m:
            text = m.group(1).strip()
    s = text.find("{")
    e = text.rfind("}")
    if s == -1 or e <= s:
        raise ValueError("AI non ha restituito JSON valido")
    return json.loads(text[s:e+1])


class DealIn(BaseModel):
    indirizzo: str
    citta: Optional[str] = ""
    cap: Optional[str] = ""
    prezzo_richiesto: float
    fonte: Optional[str] = "altro"   # immobiliare | idealista | agenzia | passaparola | altro
    metratura: Optional[float] = None
    tipologia: Optional[str] = ""    # bilocale | trilocale | negozio | ecc.
    canone_atteso: Optional[float] = None
    note: Optional[str] = ""


class DealPatch(BaseModel):
    indirizzo: Optional[str] = None
    citta: Optional[str] = None
    cap: Optional[str] = None
    prezzo_richiesto: Optional[float] = None
    prezzo_corrente: Optional[float] = None
    fonte: Optional[str] = None
    metratura: Optional[float] = None
    tipologia: Optional[str] = None
    canone_atteso: Optional[float] = None
    stage: Optional[str] = None
    note: Optional[str] = None


class EventoIn(BaseModel):
    tipo: str       # visita | offerta | controproposta | doc | mutuo | preliminare | rogito | nota
    data: Optional[str] = None
    importo: Optional[float] = None
    banca: Optional[str] = None
    descrizione: Optional[str] = ""
    nuovo_stage: Optional[str] = None
    dati: Optional[dict] = None


def make_pipeline_router(db, current_user, llm_key: Optional[str] = None):
    router = APIRouter(prefix="/api/pipeline")

    @router.get("")
    async def list_deals(stage: Optional[str] = None, user: dict = Depends(current_user)):
        q = {"user_id": user["id"], "is_pipeline": True}
        if stage:
            q["stage"] = stage
        items = await db.deals.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
        # Enrich con giorni-in-stage e timeline count
        today = date.today()
        out = []
        for d in items:
            gg_stage = 0
            try:
                if d.get("stage_updated_at"):
                    gg_stage = (today - date.fromisoformat(d["stage_updated_at"][:10])).days
            except Exception:
                pass
            d["giorni_in_stage"] = gg_stage
            d["n_eventi"] = len(d.get("timeline", []))
            # Sconto attuale
            pr = float(d.get("prezzo_richiesto", 0) or 0)
            pc = float(d.get("prezzo_corrente", pr) or pr)
            d["sconto_pct"] = round((pr - pc) / pr * 100, 1) if pr > 0 else 0
            out.append(d)
        return out

    @router.get("/board")
    async def kanban_board(user: dict = Depends(current_user)):
        """Raggruppa i deal attivi per stage (esclude i rogiti convertiti)."""
        items = await db.deals.find({
            "user_id": user["id"], "is_pipeline": True, "convertito": {"$ne": True}
        }, {"_id": 0}).to_list(500)
        board = {s: [] for s in STAGES}
        for d in items:
            stage = d.get("stage", "visionato")
            if stage in board:
                board[stage].append(d)
        return board

    @router.post("")
    async def create_deal(payload: DealIn, user: dict = Depends(current_user)):
        now = datetime.now(timezone.utc).isoformat()
        ai = await _compute_ai_score(db, user["id"], payload.prezzo_richiesto, payload.canone_atteso)
        item = {
            "id": f"DEAL-{uuid.uuid4().hex[:6].upper()}",
            "user_id": user["id"],
            "is_pipeline": True,
            "stage": "visionato",
            "convertito": False,
            "prezzo_corrente": payload.prezzo_richiesto,
            **payload.model_dump(),
            **ai,
            "created_at": now,
            "stage_updated_at": now,
            "timeline": [{
                "id": f"EVT-{uuid.uuid4().hex[:6].upper()}",
                "tipo": "visione",
                "data": date.today().isoformat(),
                "descrizione": f"Annuncio visto su {payload.fonte} a {payload.prezzo_richiesto:.0f}€" + (f" · AI Score {ai['ai_deal_score']}/100 ({ai['ai_giudizio']})" if ai.get("ai_deal_score") is not None else ""),
                "stage_dopo": "visionato",
            }],
        }
        await db.deals.insert_one(item.copy())
        item.pop("_id", None)
        return item

    @router.post("/import-urls")
    async def import_urls(payload: dict, user: dict = Depends(current_user)):
        """Importa più annunci da URL in batch. Per ognuno: scarica via Jina, parsa con Claude, crea deal con AI score."""
        urls = payload.get("urls") or []
        if not isinstance(urls, list) or not urls:
            raise HTTPException(400, "Fornire lista 'urls'")
        if len(urls) > 20:
            raise HTTPException(400, "Massimo 20 URL per batch")
        if not llm_key:
            raise HTTPException(503, "AI non configurata (EMERGENT_LLM_KEY mancante)")
        # Dedup + clean
        clean_urls = []
        seen = set()
        for u in urls:
            u = (u or "").strip()
            if not u or u in seen:
                continue
            if not (u.startswith("http://") or u.startswith("https://")):
                u = "https://" + u
            seen.add(u)
            clean_urls.append(u)

        async def process_one(url: str):
            try:
                # 1. Fetch text via Jina Reader
                page_text = await _fetch_url_text(url)
                if len(page_text) < 200:
                    return {"url": url, "ok": False, "error": "Pagina vuota o bloccata"}
                # 2. Parse con Claude
                data = await _ai_parse_annuncio(llm_key, url, page_text)
                indirizzo = (data.get("indirizzo") or "").strip()
                prezzo = data.get("prezzo_richiesto")
                if not indirizzo or not prezzo:
                    return {"url": url, "ok": False, "error": "Indirizzo o prezzo non trovati"}
                # 3. AI score
                ai = await _compute_ai_score(db, user["id"], float(prezzo), data.get("canone_atteso"))
                # 4. Crea deal
                now = datetime.now(timezone.utc).isoformat()
                item = {
                    "id": f"DEAL-{uuid.uuid4().hex[:6].upper()}",
                    "user_id": user["id"],
                    "is_pipeline": True,
                    "stage": "visionato",
                    "convertito": False,
                    "indirizzo": indirizzo[:160],
                    "citta": (data.get("citta") or "")[:80],
                    "cap": (data.get("cap") or "")[:10],
                    "prezzo_richiesto": float(prezzo),
                    "prezzo_corrente": float(prezzo),
                    "fonte": data.get("fonte") or "altro",
                    "metratura": data.get("metratura"),
                    "tipologia": data.get("tipologia") or "",
                    "canone_atteso": data.get("canone_atteso"),
                    "note": (data.get("note") or "")[:300],
                    "url_annuncio": url,
                    **ai,
                    "created_at": now,
                    "stage_updated_at": now,
                    "timeline": [{
                        "id": f"EVT-{uuid.uuid4().hex[:6].upper()}",
                        "tipo": "visione",
                        "data": date.today().isoformat(),
                        "descrizione": f"Importato da {data.get('fonte','annuncio')} · AI Score {ai.get('ai_deal_score','-')}/100 ({ai.get('ai_giudizio','-')})",
                        "stage_dopo": "visionato",
                    }],
                }
                await db.deals.insert_one(item.copy())
                item.pop("_id", None)
                return {
                    "url": url, "ok": True, "deal_id": item["id"],
                    "indirizzo": indirizzo, "prezzo": prezzo,
                    "ai_deal_score": ai.get("ai_deal_score"), "ai_giudizio": ai.get("ai_giudizio"),
                    "canone_atteso": data.get("canone_atteso"), "metratura": data.get("metratura"),
                }
            except PermissionError as e:
                logger.info(f"Anti-bot block on {url}: {e}")
                return {"url": url, "ok": False, "error": str(e), "anti_bot": True}
            except httpx.HTTPError as e:
                logger.warning(f"Fetch failed {url}: {e}")
                return {"url": url, "ok": False, "error": "Errore download (URL non valido o portale offline)"}
            except Exception as e:
                logger.exception(f"Parse failed {url}")
                return {"url": url, "ok": False, "error": str(e)[:120]}

        # Esegui in parallelo (max 4 contemporanei per non saturare LLM)
        sem = asyncio.Semaphore(4)
        async def bounded(u):
            async with sem:
                return await process_one(u)
        results = await asyncio.gather(*[bounded(u) for u in clean_urls])
        return {
            "totali": len(results),
            "successi": sum(1 for r in results if r.get("ok")),
            "errori": sum(1 for r in results if not r.get("ok")),
            "risultati": results,
        }

    @router.patch("/{did}")
    async def update_deal(did: str, payload: DealPatch, user: dict = Depends(current_user)):
        d = await db.deals.find_one({"id": did, "user_id": user["id"]}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Deal non trovato")
        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        # Se cambia stage, aggiorna stage_updated_at + aggiungi evento timeline
        if "stage" in data and data["stage"] != d.get("stage"):
            if data["stage"] not in STAGES:
                raise HTTPException(400, f"Stage non valido. Validi: {STAGES}")
            data["stage_updated_at"] = datetime.now(timezone.utc).isoformat()
            evento = {
                "id": f"EVT-{uuid.uuid4().hex[:6].upper()}",
                "tipo": "cambio_stage",
                "data": date.today().isoformat(),
                "descrizione": f"Passato a {data['stage'].replace('_', ' ')}",
                "stage_dopo": data["stage"],
            }
            await db.deals.update_one(
                {"id": did, "user_id": user["id"]},
                {"$set": data, "$push": {"timeline": evento}}
            )
        else:
            await db.deals.update_one(
                {"id": did, "user_id": user["id"]},
                {"$set": data}
            )
        return await db.deals.find_one({"id": did, "user_id": user["id"]}, {"_id": 0})

    @router.post("/{did}/evento")
    async def aggiungi_evento(did: str, payload: EventoIn, user: dict = Depends(current_user)):
        d = await db.deals.find_one({"id": did, "user_id": user["id"]}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Deal non trovato")
        now = datetime.now(timezone.utc).isoformat()
        evento = {
            "id": f"EVT-{uuid.uuid4().hex[:6].upper()}",
            "tipo": payload.tipo,
            "data": payload.data or date.today().isoformat(),
            "descrizione": payload.descrizione or "",
            "importo": payload.importo,
            "banca": payload.banca,
            "dati": payload.dati or {},
            "stage_dopo": payload.nuovo_stage or d.get("stage"),
        }
        update: dict[str, Any] = {"$push": {"timeline": evento}}
        # Update prezzo_corrente se l'evento è offerta/controproposta
        set_fields = {}
        if payload.tipo in ("offerta", "controproposta", "accettato") and payload.importo:
            set_fields["prezzo_corrente"] = payload.importo
        if payload.banca and payload.tipo == "mutuo":
            set_fields["banca_mutuo"] = payload.banca
        if payload.nuovo_stage and payload.nuovo_stage != d.get("stage"):
            if payload.nuovo_stage not in STAGES:
                raise HTTPException(400, f"Stage non valido. Validi: {STAGES}")
            set_fields["stage"] = payload.nuovo_stage
            set_fields["stage_updated_at"] = now
        if set_fields:
            update["$set"] = set_fields
        await db.deals.update_one({"id": did, "user_id": user["id"]}, update)
        return await db.deals.find_one({"id": did, "user_id": user["id"]}, {"_id": 0})

    @router.delete("/{did}")
    async def delete_deal(did: str, user: dict = Depends(current_user)):
        res = await db.deals.delete_one({"id": did, "user_id": user["id"], "is_pipeline": True})
        if res.deleted_count == 0:
            raise HTTPException(404, "Deal non trovato")
        return {"deleted": did}

    @router.post("/{did}/converti-in-immobile")
    async def converti(did: str, user: dict = Depends(current_user)):
        """Converte il deal in Property quando lo stage è 'rogito'. Popola anche il mutuo se compilato."""
        d = await db.deals.find_one({"id": did, "user_id": user["id"], "is_pipeline": True}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Deal non trovato")
        if d.get("convertito"):
            raise HTTPException(400, "Deal già convertito")
        if d.get("stage") != "rogito":
            raise HTTPException(400, f"Lo stage deve essere 'rogito' (attuale: {d.get('stage')})")
        prezzo_finale = float(d.get("prezzo_corrente") or d.get("prezzo_richiesto") or 0)
        # Cerca date e costi nella timeline
        rogito_data = None
        prelim_data = None
        proposta_data = None
        notaio_eur = 0
        agenzia_eur = 0
        for evt in d.get("timeline", []):
            if evt.get("tipo") == "rogito":
                rogito_data = evt.get("data")
                notaio_eur = float((evt.get("dati") or {}).get("notaio", 0) or 0)
                agenzia_eur = float((evt.get("dati") or {}).get("agenzia", 0) or 0)
            elif evt.get("tipo") == "preliminare":
                prelim_data = evt.get("data")
            elif evt.get("tipo") == "offerta":
                proposta_data = proposta_data or evt.get("data")
        prop_id = f"IMM-{uuid.uuid4().hex[:6].upper()}"
        property_item = {
            "id": prop_id,
            "user_id": user["id"],
            "nome": d.get("indirizzo", "Nuovo immobile")[:60],
            "indirizzo": d.get("indirizzo", ""),
            "citta": d.get("citta", ""),
            "cap": d.get("cap", ""),
            "tipologia": d.get("tipologia", ""),
            "metratura": d.get("metratura"),
            "stato": "disponibile",
            "operazione": "reddito",
            "prezzo_acquisto": prezzo_finale,
            "valore_stimato": prezzo_finale,
            "notaio": notaio_eur,
            "agenzia": agenzia_eur,
            "data_proposta": proposta_data,
            "data_preliminare": prelim_data,
            "data_acquisto": rogito_data or date.today().isoformat(),
            "canone_mensile": float(d.get("canone_atteso", 0) or 0),
            "fromDeal": True,
            "deal_id": did,
            "deal_storico": {
                "stage_finale": "rogito",
                "prezzo_richiesto_iniziale": d.get("prezzo_richiesto"),
                "sconto_pct": round((float(d.get("prezzo_richiesto", 0)) - prezzo_finale) / float(d.get("prezzo_richiesto", 1)) * 100, 1) if d.get("prezzo_richiesto") else 0,
                "timeline": d.get("timeline", []),
                "fonte": d.get("fonte"),
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.properties.insert_one(property_item.copy())
        # Marca deal come convertito
        await db.deals.update_one(
            {"id": did, "user_id": user["id"]},
            {"$set": {"convertito": True, "property_id": prop_id, "convertito_at": datetime.now(timezone.utc).isoformat()}}
        )
        # Se nel deal c'è banca_mutuo, crea mutuo collegato
        if d.get("banca_mutuo"):
            mutuo_evt = next((e for e in d.get("timeline", []) if e.get("tipo") == "mutuo"), None)
            if mutuo_evt and (mutuo_evt.get("dati") or {}).get("importo"):
                dati_m = mutuo_evt["dati"]
                await db.mutui.insert_one({
                    "id": f"MUT-{uuid.uuid4().hex[:6].upper()}",
                    "user_id": user["id"],
                    "immobile_id": prop_id,
                    "banca": d.get("banca_mutuo"),
                    "tipo_tasso": dati_m.get("tipo_tasso", "fisso"),
                    "importo_originario": float(dati_m.get("importo", 0)),
                    "capitale_residuo": float(dati_m.get("importo", 0)),
                    "tasso": float(dati_m.get("tasso", 3.5)),
                    "durata_anni": int(dati_m.get("durata_anni", 20)),
                    "rata_mensile": float(dati_m.get("rata", 0)),
                    "data_inizio": rogito_data or date.today().isoformat(),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
        property_item.pop("_id", None)
        return {"ok": True, "property_id": prop_id, "property": property_item}

    @router.get("/metrics")
    async def metrics(user: dict = Depends(current_user)):
        """Calcola le metriche del CRM: time-to-close, sconto medio, conversion, banche."""
        deals = await db.deals.find({"user_id": user["id"], "is_pipeline": True}, {"_id": 0}).to_list(1000)
        attivi = [d for d in deals if not d.get("convertito") and d.get("stage") != "rogito"]
        chiusi = [d for d in deals if d.get("convertito")]
        # Time-to-close: gg da created_at a convertito_at
        ttc_list = []
        for c in chiusi:
            try:
                start = datetime.fromisoformat(c["created_at"].replace("Z", "+00:00"))
                end = datetime.fromisoformat(c["convertito_at"].replace("Z", "+00:00"))
                ttc_list.append((end - start).days)
            except Exception:
                pass
        time_to_close = round(sum(ttc_list) / len(ttc_list), 1) if ttc_list else 0
        # Sconto medio negoziato
        sconti = []
        for c in chiusi:
            pr = float(c.get("prezzo_richiesto") or 0)
            pc = float(c.get("prezzo_corrente") or pr)
            if pr > 0:
                sconti.append((pr - pc) / pr * 100)
        sconto_medio = round(sum(sconti) / len(sconti), 1) if sconti else 0
        # Conversion: visite → rogito
        n_visite = len([d for d in deals if any(e.get("tipo") in ("visita", "cambio_stage") and e.get("stage_dopo") in ("visitato", "offerta_inviata") for e in d.get("timeline", []))])
        n_rogiti = len(chiusi)
        conversion_pct = round(n_rogiti / n_visite * 100, 1) if n_visite > 0 else 0
        # Banche più veloci (gg da evento mutuo a evento successivo verso rogito)
        banche = {}
        for c in chiusi:
            if c.get("banca_mutuo"):
                tl = c.get("timeline", [])
                mutuo_evt = next((e for e in tl if e.get("tipo") == "mutuo"), None)
                rogito_evt = next((e for e in tl if e.get("tipo") == "rogito"), None)
                if mutuo_evt and rogito_evt:
                    try:
                        gg = (date.fromisoformat(rogito_evt["data"][:10]) - date.fromisoformat(mutuo_evt["data"][:10])).days
                        banche.setdefault(c["banca_mutuo"], []).append(gg)
                    except Exception:
                        pass
        banche_avg = [{"banca": b, "gg_medi": round(sum(v) / len(v), 1), "n": len(v)} for b, v in banche.items()]
        banche_avg.sort(key=lambda x: x["gg_medi"])
        # Conteggio per stage (funnel)
        funnel = {s: 0 for s in STAGES}
        for d in deals:
            funnel[d.get("stage", "visionato")] = funnel.get(d.get("stage", "visionato"), 0) + 1
        return {
            "n_attivi": len(attivi),
            "n_chiusi": len(chiusi),
            "time_to_close_medio_gg": time_to_close,
            "sconto_medio_pct": sconto_medio,
            "conversion_visite_rogito_pct": conversion_pct,
            "banche_tempi": banche_avg,
            "funnel": funnel,
        }

    return router
