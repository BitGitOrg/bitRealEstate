"""Properties + Deal-to-Property conversion router."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from routers._shared import enrich_property as _enrich_property


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
        return [_enrich_property(p) for p in items]

    @router.get("/properties/{pid}")
    async def get_property(pid: str, user: dict = Depends(current_user)):
        p = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="Immobile non trovato")
        return _enrich_property(p)

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
