"""Properties + Deal-to-Property conversion router."""
import uuid
from datetime import datetime, timezone, date
from dateutil.relativedelta import relativedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from routers._shared import enrich_property as _enrich_property, apply_dynamic_score


async def _generate_expected_incassi(db, user_id: str, prop: dict) -> int:
    """Crea incassi previsti per i 12 mesi successivi a partire da data_inizio_contratto.
    Idempotente: skip se l'incasso con quella chiave esiste già.
    Solo se canone_mensile > 0 e data_inizio_contratto è valida.
    """
    canone = float(prop.get("canone_mensile") or 0)
    start = prop.get("data_inizio_contratto")
    if canone <= 0 or not start:
        return 0
    try:
        d0 = date.fromisoformat(str(start)[:10])
    except Exception:
        return 0
    today = date.today()
    pid = prop.get("id")
    incassi_to_insert = []
    # Genera 12 mesi a partire dal max(start, current month - 2) per non riempire storia troppo lontana
    start_month = max(d0, date(today.year, today.month, 1) - relativedelta(months=2))
    for i in range(14):  # ~14 mesi (storico recente + futuro 12)
        m = (date(start_month.year, start_month.month, 1) + relativedelta(months=i))
        if m > today + relativedelta(months=12):
            break
        # Skip se prima del contratto
        if date(m.year, m.month, 1) < date(d0.year, d0.month, 1):
            continue
        incasso_id = f"INC-{pid}-{m.year}-{m.month:02d}"
        existing = await db.incassi.find_one({"id": incasso_id, "user_id": user_id})
        if existing:
            continue
        incassi_to_insert.append({
            "id": incasso_id,
            "user_id": user_id,
            "immobile_id": pid,
            "anno": m.year,
            "mese": m.month,
            "mese_label": f"{['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'][m.month-1]} {m.year}",
            "previsto": canone,
            "incassato": 0,
            "data_incasso": None,
            "stato": "previsto",  # previsto | pagato | parzialmente_pagato | in_ritardo | non_pagato
            "movimento_id": None,  # ID del movimento bancario quando riconciliato
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    if incassi_to_insert:
        await db.incassi.insert_many(incassi_to_insert)
    return len(incassi_to_insert)


class PropertyIn(BaseModel):
    nome: str
    indirizzo: Optional[str] = ""
    citta: Optional[str] = ""
    provincia: Optional[str] = ""
    tipologia: Optional[str] = "Altro"
    metratura: Optional[float] = 0
    piano: Optional[str] = ""
    anno_costruzione: Optional[int] = 0
    classe_energetica: Optional[str] = ""
    stato: Optional[str] = "acquistato"
    operazione: Optional[str] = "reddito"
    prezzo_acquisto: float = 0
    notaio: Optional[float] = 0
    agenzia: Optional[float] = 0
    imposte: Optional[float] = 0
    lavori: Optional[float] = 0
    valore_stimato: Optional[float] = 0
    canone_mensile: Optional[float] = 0
    data_acquisto: Optional[str] = None
    note: Optional[str] = ""
    mutuo: Optional[dict] = None
    img: Optional[str] = "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?crop=entropy&cs=srgb&fm=jpg&w=800"
    # Locazione
    inquilino: Optional[str] = None
    data_inizio_contratto: Optional[str] = None
    scadenza_contratto: Optional[str] = None
    deposito_cauzionale: Optional[float] = 0
    durata_contratto_anni: Optional[int] = 0
    rinnovo_automatico: Optional[bool] = False


class LocazioneIn(BaseModel):
    inquilino: Optional[str] = None
    data_inizio_contratto: Optional[str] = None
    scadenza_contratto: Optional[str] = None
    deposito_cauzionale: Optional[float] = None
    durata_contratto_anni: Optional[int] = None
    rinnovo_automatico: Optional[bool] = None
    canone_mensile: Optional[float] = None
    note_locazione: Optional[str] = None


class ConvertDealIn(BaseModel):
    data_acquisto: Optional[str] = None
    notaio: Optional[float] = 0
    agenzia: Optional[float] = 0
    imposte: Optional[float] = 0
    lavori: Optional[float] = 0
    stato: Optional[str] = "acquistato"
    operazione: Optional[str] = "reddito"
    mutuo: Optional[dict] = None
    note: Optional[str] = ""


def make_properties_router(db, current_user):
    router = APIRouter(prefix="/api")

    @router.get("/properties")
    async def list_properties(user: dict = Depends(current_user)):
        items = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
        alerts = await db.alerts.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        incassi = await db.incassi.find({"user_id": user["id"]}, {"_id": 0}).to_list(2000)
        a_by_p: dict = {}
        for a in alerts:
            pid = a.get("immobile_id")
            if pid:
                a_by_p.setdefault(pid, []).append(a)
        i_by_p: dict = {}
        for i in incassi:
            pid = i.get("immobile_id")
            if pid:
                i_by_p.setdefault(pid, []).append(i)
        out = []
        for p in items:
            p = _enrich_property(p)
            p = apply_dynamic_score(p, a_by_p, i_by_p)
            out.append(p)
        return out

    @router.get("/properties/{pid}")
    async def get_property(pid: str, user: dict = Depends(current_user)):
        p = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="Immobile non trovato")
        alerts = await db.alerts.find({"user_id": user["id"], "immobile_id": pid}, {"_id": 0}).to_list(500)
        incassi = await db.incassi.find({"user_id": user["id"], "immobile_id": pid}, {"_id": 0}).to_list(500)
        p = _enrich_property(p)
        p = apply_dynamic_score(p, {pid: alerts}, {pid: incassi})
        return p

    @router.post("/properties")
    async def create_property(p: PropertyIn, user: dict = Depends(current_user)):
        item = {
            "id": f"IMM-{uuid.uuid4().hex[:6].upper()}",
            "user_id": user["id"],
            **p.model_dump(),
            "fromDeal": False,
            "deal_id": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.properties.insert_one(item.copy())
        item.pop("_id", None)
        return _enrich_property(item)

    @router.delete("/properties/{pid}")
    async def delete_property(pid: str, user: dict = Depends(current_user)):
        await db.properties.delete_one({"id": pid, "user_id": user["id"]})
        return {"ok": True}

    @router.patch("/properties/{pid}/locazione")
    async def update_locazione(pid: str, payload: LocazioneIn, user: dict = Depends(current_user)):
        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        if not data:
            raise HTTPException(status_code=400, detail="Nessun campo fornito")
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.properties.update_one(
            {"id": pid, "user_id": user["id"]},
            {"$set": data},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Immobile non trovato")
        p = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
        # Auto-genera incassi previsti per i 12 mesi successivi se canone + data_inizio_contratto presenti
        gen = await _generate_expected_incassi(db, user["id"], p)
        result = _enrich_property(p)
        result["incassi_generated"] = gen
        return result


    @router.post("/deals/{deal_id}/convert")
    async def convert_deal_to_property(deal_id: str, ov: ConvertDealIn, user: dict = Depends(current_user)):
        deal = await db.deals.find_one({"id": deal_id, "user_id": user["id"]}, {"_id": 0})
        if not deal:
            raise HTTPException(status_code=404, detail="Deal non trovato")
        today = datetime.now(timezone.utc).date().isoformat()
        item = {
            "id": f"IMM-{uuid.uuid4().hex[:6].upper()}",
            "user_id": user["id"],
            "nome": deal.get("titolo", "Immobile da deal"),
            "indirizzo": deal.get("zona", ""),
            "citta": deal.get("citta", ""),
            "provincia": "",
            "tipologia": deal.get("tipologia", "Altro"),
            "metratura": float(deal.get("metratura", 0) or 0),
            "piano": deal.get("piano", ""),
            "anno_costruzione": int(deal.get("anno_costruzione", 0) or 0),
            "classe_energetica": deal.get("classe_energetica", ""),
            "stato": ov.stato or "acquistato",
            "operazione": ov.operazione or "reddito",
            "prezzo_acquisto": float(deal.get("prezzo", 0) or 0),
            "notaio": float(ov.notaio or 0),
            "agenzia": float(ov.agenzia or 0),
            "imposte": float(ov.imposte or 0),
            "lavori": float(ov.lavori or 0),
            "valore_stimato": float(deal.get("prezzo", 0) or 0),
            "canone_mensile": float(deal.get("canone_stimato", 0) or 0),
            "data_acquisto": ov.data_acquisto or today,
            "mutuo": ov.mutuo,
            "note": ov.note or deal.get("descrizione_breve", ""),
            "img": "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?crop=entropy&cs=srgb&fm=jpg&w=800",
            "fromDeal": True,
            "deal_id": deal_id,
            "deal_score": deal.get("deal_score"),
            "punti_forza": deal.get("punti_forza", []),
            "punti_attenzione": deal.get("punti_attenzione", []),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.properties.insert_one(item.copy())
        await db.deals.update_one(
            {"id": deal_id, "user_id": user["id"]},
            {"$set": {"status": "convertito", "converted_property_id": item["id"],
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        item.pop("_id", None)
        return _enrich_property(item)

    return router
