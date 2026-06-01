"""Ciclo di vita locazione — disdetta, chiusura contratto, storico.

Non duplica i dati del contratto ATTIVO (rimangono sull'immobile per retro-compat).
Quando un contratto viene chiuso, viene snapshottato in `contratti_storico` e i campi
locazione sull'immobile vengono puliti.

Endpoints:
- POST /api/properties/{pid}/disdetta      → registra disdetta ricevuta (non chiude ancora)
- POST /api/properties/{pid}/chiudi-contratto → chiude effettivamente, sposta in storico, stato → sfitto
- POST /api/properties/{pid}/annulla-disdetta → cancella la disdetta registrata
- GET  /api/properties/{pid}/storico-contratti → lista storico
"""
import uuid
import logging
from datetime import datetime, timezone, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


class DisdettaIn(BaseModel):
    data_ricezione: Optional[str] = None       # YYYY-MM-DD, default oggi
    data_uscita_prevista: str                   # YYYY-MM-DD obbligatoria
    parte_disdicente: Optional[str] = "conduttore"  # conduttore | locatore
    motivo: Optional[str] = ""


class ChiudiContrattoIn(BaseModel):
    data_uscita_effettiva: Optional[str] = None  # default oggi
    motivo_chiusura: Optional[str] = "fine_naturale"  # fine_naturale | disdetta_conduttore | disdetta_locatore | morosità | altro
    stato_consegna: Optional[str] = "ok"        # ok | con_riserve | da_ripristinare
    note: Optional[str] = ""


async def _autocheck_disdette(db, user_id: str):
    """Per ogni immobile con `data_uscita_prevista` <= oggi, chiude automaticamente il contratto.
    Idempotente: se non c'è data_uscita_prevista o stato già sfitto, skippa.
    """
    today = date.today().isoformat()
    props = await db.properties.find({
        "user_id": user_id,
        "data_uscita_prevista": {"$lte": today, "$ne": None},
    }, {"_id": 0}).to_list(200)
    closed = 0
    for p in props:
        if (p.get("stato") or "").lower() == "sfitto":
            continue
        if not p.get("inquilino") and not p.get("canone_mensile"):
            continue
        # auto-chiude
        await _do_chiudi_contratto(db, user_id, p, {
            "data_uscita_effettiva": p.get("data_uscita_prevista"),
            "motivo_chiusura": "disdetta_eseguita",
            "stato_consegna": "ok",
            "note": "Chiusura automatica al raggiungimento della data uscita prevista.",
        }, auto=True)
        closed += 1
    return closed


async def _do_chiudi_contratto(db, user_id: str, prop: dict, payload: dict, auto: bool = False):
    """Snapshot contratto attivo → contratti_storico, poi pulisce campi locazione, stato → sfitto."""
    today = date.today().isoformat()
    snapshot = {
        "id": f"CONT-{uuid.uuid4().hex[:8].upper()}",
        "user_id": user_id,
        "immobile_id": prop["id"],
        "immobile_nome": prop.get("nome"),
        "inquilino": prop.get("inquilino"),
        "canone_mensile": prop.get("canone_mensile"),
        "deposito_cauzionale": prop.get("deposito_cauzionale"),
        "data_inizio": prop.get("data_inizio_contratto"),
        "scadenza_originale": prop.get("scadenza_contratto"),
        "durata_anni": prop.get("durata_contratto_anni"),
        "rinnovo_automatico": prop.get("rinnovo_automatico"),
        "note_locazione": prop.get("note_locazione"),
        # dati disdetta (se presenti)
        "disdetta_ricevuta_il": prop.get("disdetta_ricevuta_il"),
        "data_uscita_prevista": prop.get("data_uscita_prevista"),
        "parte_disdicente": prop.get("parte_disdicente"),
        "motivo_disdetta": prop.get("motivo_disdetta"),
        # chiusura
        "data_uscita_effettiva": payload.get("data_uscita_effettiva") or today,
        "motivo_chiusura": payload.get("motivo_chiusura") or "fine_naturale",
        "stato_consegna": payload.get("stato_consegna") or "ok",
        "note_chiusura": payload.get("note") or "",
        "auto_chiuso": auto,
        "chiuso_il": datetime.now(timezone.utc).isoformat(),
    }
    await db.contratti_storico.insert_one(snapshot.copy())
    # Pulisci campi locazione + stato
    await db.properties.update_one(
        {"id": prop["id"], "user_id": user_id},
        {
            "$set": {
                "stato": "sfitto",
                "inquilino": None,
                "data_inizio_contratto": None,
                "scadenza_contratto": None,
                "canone_mensile": 0,
                "deposito_cauzionale": 0,
                "durata_contratto_anni": 0,
                "rinnovo_automatico": False,
                "note_locazione": None,
                "disdetta_ricevuta_il": None,
                "data_uscita_prevista": None,
                "parte_disdicente": None,
                "motivo_disdetta": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        }
    )
    # Archivia gli incassi previsti futuri non pagati (li marca "archiviato")
    today_y, today_m = date.today().year, date.today().month
    await db.incassi.update_many(
        {
            "user_id": user_id,
            "immobile_id": prop["id"],
            "stato": {"$in": ["previsto", "in_ritardo"]},
            "$or": [
                {"anno": {"$gt": today_y}},
                {"anno": today_y, "mese": {"$gte": today_m}},
            ]
        },
        {"$set": {"stato": "archiviato"}}
    )
    return snapshot


def make_contracts_router(db, current_user):
    router = APIRouter(prefix="/api/properties")

    @router.post("/{pid}/disdetta")
    async def registra_disdetta(pid: str, payload: DisdettaIn, user: dict = Depends(current_user)):
        p = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Immobile non trovato")
        if not p.get("inquilino"):
            raise HTTPException(400, "Nessun contratto attivo su questo immobile.")
        if p.get("disdetta_ricevuta_il"):
            raise HTTPException(400, "Disdetta già registrata. Annulla quella esistente prima di inserirne una nuova.")
        today = date.today().isoformat()
        data_uscita = payload.data_uscita_prevista
        try:
            d = date.fromisoformat(data_uscita)
        except Exception:
            raise HTTPException(400, "data_uscita_prevista non valida (YYYY-MM-DD)")
        if d < date.today():
            raise HTTPException(400, "La data di uscita prevista non può essere nel passato. Usa direttamente 'Chiudi contratto'.")
        upd = {
            "disdetta_ricevuta_il": payload.data_ricezione or today,
            "data_uscita_prevista": data_uscita,
            "parte_disdicente": payload.parte_disdicente or "conduttore",
            "motivo_disdetta": payload.motivo or "",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.properties.update_one({"id": pid, "user_id": user["id"]}, {"$set": upd})

        # Crea alert di disdetta in arrivo
        days = (d - date.today()).days
        sev = "alta" if days <= 30 else ("media" if days <= 60 else "bassa")
        alert = {
            "id": f"A-DISDETTA-{pid}",
            "user_id": user["id"],
            "tipo": "locazione",
            "severity": sev,
            "titolo": f"Disdetta registrata · {p.get('nome', pid)}",
            "descrizione": f"Inquilino esce il {data_uscita} ({days}gg). Motivo: {payload.motivo or 'non specificato'}.",
            "immobile_id": pid,
            "ts": datetime.now(timezone.utc).isoformat(),
            "days_remaining": days,
            "scadenza": data_uscita,
            "auto_generated": True,
            "kind": "disdetta",
        }
        # idempotente: cancella eventuale alert disdetta pregresso per questo pid
        await db.alerts.delete_many({"user_id": user["id"], "kind": "disdetta", "immobile_id": pid})
        await db.alerts.insert_one(alert)
        return {"ok": True, **upd}

    @router.post("/{pid}/annulla-disdetta")
    async def annulla_disdetta(pid: str, user: dict = Depends(current_user)):
        p = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Immobile non trovato")
        if not p.get("disdetta_ricevuta_il"):
            raise HTTPException(400, "Nessuna disdetta registrata.")
        await db.properties.update_one(
            {"id": pid, "user_id": user["id"]},
            {"$set": {
                "disdetta_ricevuta_il": None,
                "data_uscita_prevista": None,
                "parte_disdicente": None,
                "motivo_disdetta": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        await db.alerts.delete_many({"user_id": user["id"], "kind": "disdetta", "immobile_id": pid})
        return {"ok": True}

    @router.post("/{pid}/chiudi-contratto")
    async def chiudi_contratto(pid: str, payload: ChiudiContrattoIn, user: dict = Depends(current_user)):
        p = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Immobile non trovato")
        if not p.get("inquilino") and not p.get("canone_mensile"):
            raise HTTPException(400, "Nessun contratto attivo da chiudere.")
        snap = await _do_chiudi_contratto(db, user["id"], p, payload.model_dump(), auto=False)
        # rimuovi alert disdetta + alert scadenza contratto
        await db.alerts.delete_many({"user_id": user["id"], "kind": "disdetta", "immobile_id": pid})
        return {"ok": True, "storico_id": snap["id"], "stato_nuovo": "sfitto"}

    @router.get("/{pid}/storico-contratti")
    async def storico(pid: str, user: dict = Depends(current_user)):
        items = await db.contratti_storico.find(
            {"user_id": user["id"], "immobile_id": pid}, {"_id": 0}
        ).sort("chiuso_il", -1).to_list(100)
        return items

    @router.post("/auto-check-disdette")
    async def auto_check(user: dict = Depends(current_user)):
        """Manuale: scorre tutti gli immobili con disdetta scaduta e li chiude.
        Chiamabile su demand o da un job giornaliero futuro."""
        n = await _autocheck_disdette(db, user["id"])
        return {"closed": n}

    return router
