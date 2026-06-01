"""Lavori & Ristrutturazioni — CRUD + aggregato budget."""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


class LavoroIn(BaseModel):
    immobile_id: Optional[str] = None
    descrizione: str
    categoria: Optional[str] = "Generico"   # muratura, impianti, serramenti, ecc.
    impresa: Optional[str] = ""
    tecnico: Optional[str] = ""
    data_inizio: Optional[str] = None
    data_fine_prevista: Optional[str] = None
    data_fine_effettiva: Optional[str] = None
    budget: float = 0
    speso: float = 0
    avanzamento: int = 0   # 0-100
    stato: Optional[str] = "in_corso"  # in_corso | completato | sospeso
    note: Optional[str] = ""


class LavoroPatch(BaseModel):
    immobile_id: Optional[str] = None
    descrizione: Optional[str] = None
    categoria: Optional[str] = None
    impresa: Optional[str] = None
    tecnico: Optional[str] = None
    data_inizio: Optional[str] = None
    data_fine_prevista: Optional[str] = None
    data_fine_effettiva: Optional[str] = None
    budget: Optional[float] = None
    speso: Optional[float] = None
    avanzamento: Optional[int] = None
    stato: Optional[str] = None
    note: Optional[str] = None


async def _enrich_lavoro(db, user_id: str, item: dict) -> dict:
    out = {**item}
    out.pop("_id", None)
    budget = float(item.get("budget", 0) or 0)
    speso = float(item.get("speso", 0) or 0)
    out["residuo"] = round(budget - speso, 2)
    out["over_budget"] = speso > budget and budget > 0
    out["scostamento_pct"] = round((speso - budget) / budget * 100, 1) if budget > 0 else 0
    if item.get("immobile_id"):
        p = await db.properties.find_one({"id": item["immobile_id"], "user_id": user_id}, {"_id": 0, "nome": 1, "img": 1})
        if p:
            out["immobile_nome"] = p.get("nome")
            out["immobile_img"] = p.get("img")
    return out


def make_lavori_router(db, current_user):
    router = APIRouter(prefix="/api/lavori")

    @router.get("")
    async def list_lavori(immobile_id: Optional[str] = None, user: dict = Depends(current_user)):
        q = {"user_id": user["id"]}
        if immobile_id:
            q["immobile_id"] = immobile_id
        items = await db.lavori.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
        return [await _enrich_lavoro(db, user["id"], item) for item in items]

    @router.get("/aggregato")
    async def aggregato(user: dict = Depends(current_user)):
        items = await db.lavori.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        tot_budget = sum(float(item.get("budget", 0) or 0) for item in items)
        tot_speso = sum(float(item.get("speso", 0) or 0) for item in items)
        fuori = [item for item in items if (item.get("speso", 0) or 0) > (item.get("budget", 0) or 0) and (item.get("budget", 0) or 0) > 0]
        completati = [item for item in items if (item.get("stato") or "") == "completato"]
        in_corso = [item for item in items if (item.get("stato") or "") == "in_corso"]
        return {
            "n_cantieri": len(items),
            "n_in_corso": len(in_corso),
            "n_completati": len(completati),
            "tot_budget": round(tot_budget, 2),
            "tot_speso": round(tot_speso, 2),
            "residuo_totale": round(tot_budget - tot_speso, 2),
            "fuori_budget": len(fuori),
            "scostamento_totale_pct": round((tot_speso - tot_budget) / tot_budget * 100, 1) if tot_budget > 0 else 0,
        }

    @router.post("")
    async def create_lavoro(payload: LavoroIn, user: dict = Depends(current_user)):
        item = {
            "id": f"LAV-{uuid.uuid4().hex[:6].upper()}",
            "user_id": user["id"],
            **payload.model_dump(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.lavori.insert_one(item.copy())
        return await _enrich_lavoro(db, user["id"], item)

    @router.patch("/{lid}")
    async def update_lavoro(lid: str, payload: LavoroPatch, user: dict = Depends(current_user)):
        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        if not data:
            raise HTTPException(400, "Nessun campo da aggiornare")
        # Auto completato se avanzamento=100
        if data.get("avanzamento") == 100 and not data.get("stato"):
            data["stato"] = "completato"
            data["data_fine_effettiva"] = data.get("data_fine_effettiva") or datetime.now(timezone.utc).date().isoformat()
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.lavori.update_one({"id": lid, "user_id": user["id"]}, {"$set": data})
        if res.matched_count == 0:
            raise HTTPException(404, "Lavoro non trovato")
        l_item = await db.lavori.find_one({"id": lid, "user_id": user["id"]}, {"_id": 0})
        return await _enrich_lavoro(db, user["id"], l_item)

    @router.delete("/{lid}")
    async def delete_lavoro(lid: str, user: dict = Depends(current_user)):
        res = await db.lavori.delete_one({"id": lid, "user_id": user["id"]})
        if res.deleted_count == 0:
            raise HTTPException(404, "Lavoro non trovato")
        return {"deleted": lid}

    return router
