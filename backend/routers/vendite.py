"""Vendite & Rivendite — gestione mercato e operazioni concluse.

Lavora SULL'IMMOBILE stesso aggiornando campi `vendita_*` e lo stato.
Mantiene retro-compatibilità (non serve una collezione separata).

Endpoints:
- POST /api/properties/{pid}/metti-in-vendita  → stato=in_vendita, target/min
- POST /api/properties/{pid}/registra-vendita   → stato=venduto, prezzo effettivo, utile
- POST /api/properties/{pid}/ritira-da-vendita  → torna allo stato precedente
- GET  /api/vendite/aggregato                   → KPI vendite (concluse, in vendita, utile)
"""
import uuid
from datetime import datetime, timezone, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


class MettiInVenditaIn(BaseModel):
    prezzo_richiesto: float
    prezzo_minimo: Optional[float] = None
    data_messa_in_vendita: Optional[str] = None
    agenzia: Optional[str] = ""
    provvigione_pct: Optional[float] = None
    note: Optional[str] = ""


class RegistraVenditaIn(BaseModel):
    prezzo_vendita: float
    data_compromesso: Optional[str] = None
    data_rogito: Optional[str] = None
    provvigione_eur: Optional[float] = 0
    altri_costi_vendita: Optional[float] = 0
    note: Optional[str] = ""


def make_vendite_router(db, current_user):
    router = APIRouter(prefix="/api")

    @router.post("/properties/{pid}/metti-in-vendita")
    async def metti_in_vendita(pid: str, payload: MettiInVenditaIn, user: dict = Depends(current_user)):
        p = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Immobile non trovato")
        if p.get("stato") == "venduto":
            raise HTTPException(400, "Immobile già venduto")
        upd = {
            "stato": "in_vendita",
            "prezzo_vendita_target": payload.prezzo_richiesto,
            "prezzo_minimo": payload.prezzo_minimo or payload.prezzo_richiesto * 0.92,
            "data_messa_in_vendita": payload.data_messa_in_vendita or date.today().isoformat(),
            "agenzia_vendita": payload.agenzia,
            "provvigione_pct": payload.provvigione_pct,
            "note_vendita": payload.note,
            "_stato_precedente": p.get("stato"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.properties.update_one({"id": pid, "user_id": user["id"]}, {"$set": upd})
        return {"ok": True, **upd}

    @router.post("/properties/{pid}/ritira-da-vendita")
    async def ritira(pid: str, user: dict = Depends(current_user)):
        p = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Immobile non trovato")
        if p.get("stato") != "in_vendita":
            raise HTTPException(400, "L'immobile non è in vendita")
        nuovo_stato = p.get("_stato_precedente") or ("affittato" if p.get("inquilino") else "disponibile")
        await db.properties.update_one(
            {"id": pid, "user_id": user["id"]},
            {"$set": {"stato": nuovo_stato, "updated_at": datetime.now(timezone.utc).isoformat()},
             "$unset": {"prezzo_vendita_target": "", "prezzo_minimo": "", "data_messa_in_vendita": "", "_stato_precedente": ""}}
        )
        return {"ok": True, "stato_nuovo": nuovo_stato}

    @router.post("/properties/{pid}/registra-vendita")
    async def registra_vendita(pid: str, payload: RegistraVenditaIn, user: dict = Depends(current_user)):
        p = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Immobile non trovato")
        if p.get("stato") == "venduto":
            raise HTTPException(400, "Immobile già venduto")
        # Calcoli automatici
        costo_totale = float(p.get("prezzo_acquisto", 0) or 0) + float(p.get("notaio", 0) or 0) + \
                       float(p.get("agenzia", 0) or 0) + float(p.get("imposte", 0) or 0) + float(p.get("lavori", 0) or 0)
        provv = float(payload.provvigione_eur or 0)
        altri = float(payload.altri_costi_vendita or 0)
        prezzo = float(payload.prezzo_vendita)
        # Plusvalenza: se SRL/SpA → tassata IRES+IRAP, se privato dopo 5 anni esente
        settings = await db.settings.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
        tipo = settings.get("tipo_societa", "srl")
        anni_holding = float(settings.get("anni_holding_plusvalenza", 5) or 5)
        plus = prezzo - costo_totale - provv - altri
        tax_pct = 0.0
        if tipo == "privato":
            try:
                acq = date.fromisoformat((p.get("data_acquisto") or "")[:10])
                anni = (date.today() - acq).days / 365.25
                if anni >= anni_holding:
                    tax_pct = 0.0  # esente
                else:
                    tax_pct = float(settings.get("aliquota_plusvalenza", 26) or 26) / 100.0
            except Exception:
                tax_pct = float(settings.get("aliquota_plusvalenza", 26) or 26) / 100.0
        else:
            ires = float(settings.get("aliquota_ires", 24) or 24)
            irap = float(settings.get("aliquota_irap", 3.9) or 3.9)
            tax_pct = (ires + irap) / 100.0
        tasse = max(0, plus) * tax_pct
        utile_netto = plus - tasse
        roi = (utile_netto / costo_totale * 100) if costo_totale > 0 else 0
        upd = {
            "stato": "venduto",
            "prezzo_vendita": prezzo,
            "data_compromesso": payload.data_compromesso,
            "data_vendita": payload.data_rogito or date.today().isoformat(),
            "provvigione_vendita_eur": provv,
            "altri_costi_vendita": altri,
            "plusvalenza_lorda": round(plus, 2),
            "tasse_plusvalenza": round(tasse, 2),
            "utile_netto": round(utile_netto, 2),
            "roi_finale_pct": round(roi, 2),
            "note_vendita_chiusura": payload.note,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.properties.update_one({"id": pid, "user_id": user["id"]}, {"$set": upd})
        return {"ok": True, **upd}

    @router.get("/vendite/aggregato")
    async def aggregato(user: dict = Depends(current_user)):
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        in_vendita = [p for p in props if (p.get("stato") or "") == "in_vendita"]
        venduti = [p for p in props if (p.get("stato") or "") == "venduto"]
        utile_ytd = 0
        utile_totale = 0
        year = date.today().year
        for v in venduti:
            ut = float(v.get("utile_netto", 0) or 0)
            utile_totale += ut
            dv = (v.get("data_vendita") or "")[:4]
            if dv == str(year):
                utile_ytd += ut
        # ROI medio
        rois = [float(v.get("roi_finale_pct", 0) or 0) for v in venduti if v.get("roi_finale_pct")]
        roi_medio = round(sum(rois) / len(rois), 2) if rois else 0
        return {
            "n_concluse": len(venduti),
            "n_in_vendita": len(in_vendita),
            "utile_ytd": round(utile_ytd, 2),
            "utile_totale": round(utile_totale, 2),
            "roi_medio_pct": roi_medio,
            "in_vendita": in_vendita,
            "venduti": sorted(venduti, key=lambda v: (v.get("data_vendita") or ""), reverse=True),
        }

    return router
