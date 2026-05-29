"""Company settings router — profile, AI params, company logo upload."""
import base64
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

DEFAULT_SETTINGS = {
    "nome_societa": "Control Room Real Estate SRL",
    "valuta": "EUR",
    "target_netto": 5.0,
    "target_roi": 8.0,
    "cash_flow_min": 0.0,
    "propensione": "media",
    "strategia": "mista",
    "capitale_disponibile": 250000.0,
    "limite_indebitamento": 60.0,
    "logo_base64": None,
    "logo_mime": None,
}


class SettingsIn(BaseModel):
    nome_societa: Optional[str] = None
    valuta: Optional[str] = None
    target_netto: Optional[float] = None
    target_roi: Optional[float] = None
    cash_flow_min: Optional[float] = None
    propensione: Optional[str] = None
    strategia: Optional[str] = None
    capitale_disponibile: Optional[float] = None
    limite_indebitamento: Optional[float] = None


async def get_user_settings(db, user_id: str) -> dict:
    """Helper used by other routers (e.g. reports) to fetch settings."""
    s = await db.settings.find_one({"user_id": user_id}, {"_id": 0})
    if not s:
        return {"user_id": user_id, **DEFAULT_SETTINGS}
    merged = {**DEFAULT_SETTINGS, **s}
    return merged


def make_settings_router(db, current_user):
    router = APIRouter(prefix="/api/settings")

    @router.get("")
    async def get_settings(user: dict = Depends(current_user)):
        return await get_user_settings(db, user["id"])

    @router.put("")
    async def put_settings(payload: SettingsIn, user: dict = Depends(current_user)):
        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.settings.update_one(
            {"user_id": user["id"]},
            {"$set": data, "$setOnInsert": {"user_id": user["id"]}},
            upsert=True,
        )
        return await get_user_settings(db, user["id"])

    @router.post("/logo")
    async def upload_logo(file: UploadFile = File(...), user: dict = Depends(current_user)):
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Carica un'immagine (PNG, JPG, SVG).")
        content = await file.read()
        # Hard cap 1 MB to keep Mongo docs lean
        if len(content) > 1_048_576:
            raise HTTPException(status_code=400, detail="Logo troppo grande (max 1 MB).")
        b64 = base64.b64encode(content).decode("ascii")
        await db.settings.update_one(
            {"user_id": user["id"]},
            {"$set": {
                "logo_base64": b64, "logo_mime": file.content_type,
                "logo_filename": file.filename,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }, "$setOnInsert": {"user_id": user["id"]}},
            upsert=True,
        )
        return {"ok": True, "size": len(content), "mime": file.content_type}

    @router.delete("/logo")
    async def delete_logo(user: dict = Depends(current_user)):
        await db.settings.update_one(
            {"user_id": user["id"]},
            {"$set": {"logo_base64": None, "logo_mime": None, "logo_filename": None}},
        )
        return {"ok": True}

    return router
