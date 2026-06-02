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
from datetime import date, datetime, timezone
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


STAGES = [
    "visionato", "visitato", "offerta_inviata", "trattativa",
    "accettato", "verifica_doc", "mutuo_richiesto", "preliminare", "rogito"
]


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


def make_pipeline_router(db, current_user):
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
        item = {
            "id": f"DEAL-{uuid.uuid4().hex[:6].upper()}",
            "user_id": user["id"],
            "is_pipeline": True,
            "stage": "visionato",
            "convertito": False,
            "prezzo_corrente": payload.prezzo_richiesto,
            **payload.model_dump(),
            "created_at": now,
            "stage_updated_at": now,
            "timeline": [{
                "id": f"EVT-{uuid.uuid4().hex[:6].upper()}",
                "tipo": "visione",
                "data": date.today().isoformat(),
                "descrizione": f"Annuncio visto su {payload.fonte} a {payload.prezzo_richiesto:.0f}€",
                "stage_dopo": "visionato",
            }],
        }
        await db.deals.insert_one(item.copy())
        item.pop("_id", None)
        return item

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
