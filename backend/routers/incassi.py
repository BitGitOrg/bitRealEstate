"""Incassi affitti — gestione incassi previsti + riconciliazione bancaria automatica."""
import uuid
import logging
from datetime import datetime, timezone, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

# Tolleranze per il matching
DATE_TOLERANCE_DAYS = 12     # un canone Gen incasso entro 12gg dal 1° del mese
AMOUNT_TOLERANCE_PCT = 0.03  # ±3% sul canone (gestisce piccoli arrotondamenti)


class IncassoManualIn(BaseModel):
    incassato: float
    data_incasso: Optional[str] = None
    note: Optional[str] = ""


def make_incassi_router(db, current_user):
    router = APIRouter(prefix="/api/incassi")

    @router.get("")
    async def list_incassi(immobile_id: Optional[str] = None, user: dict = Depends(current_user)):
        q = {"user_id": user["id"]}
        if immobile_id:
            q["immobile_id"] = immobile_id
        items = await db.incassi.find(q, {"_id": 0}).sort([("anno", -1), ("mese", -1)]).to_list(500)
        # Marca come "in_ritardo" gli incassi previsti scaduti da >7gg
        today = date.today()
        for it in items:
            if it["stato"] == "previsto":
                m_first = date(it["anno"], it["mese"], 1)
                if (today - m_first).days > 7:
                    it["stato"] = "in_ritardo"
        return items

    @router.post("/{incasso_id}/mark-paid")
    async def mark_paid(incasso_id: str, payload: IncassoManualIn, user: dict = Depends(current_user)):
        inc = await db.incassi.find_one({"id": incasso_id, "user_id": user["id"]})
        if not inc:
            raise HTTPException(404, "Incasso non trovato")
        incassato = float(payload.incassato or 0)
        previsto = float(inc.get("previsto") or 0)
        if incassato <= 0:
            stato = "non_pagato"
        elif incassato >= previsto * (1 - AMOUNT_TOLERANCE_PCT):
            stato = "pagato"
        else:
            stato = "parzialmente_pagato"
        upd = {
            "incassato": incassato,
            "data_incasso": payload.data_incasso or date.today().isoformat(),
            "stato": stato,
            "note": payload.note or "",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.incassi.update_one({"id": incasso_id, "user_id": user["id"]}, {"$set": upd})
        return {"ok": True, **upd}

    @router.post("/reconcile")
    async def reconcile_from_bank(user: dict = Depends(current_user)):
        """Riconcilia automaticamente gli incassi previsti con i movimenti bancari importati.
        Algoritmo:
          - per ogni incasso 'previsto' o 'in_ritardo'
          - cerca movimenti positivi (entrata) non ancora abbinati, importo ±3%, data entro ±12gg dal mese
          - se trovato: marca incasso come 'pagato' e blocca il movimento (matched=True)
        """
        uid = user["id"]
        # 1) carico incassi aperti
        incassi_open = await db.incassi.find({
            "user_id": uid,
            "stato": {"$in": ["previsto", "in_ritardo"]},
        }, {"_id": 0}).to_list(500)
        # 2) carico movimenti positivi non ancora abbinati
        movs = await db.movimenti_bancari.find({
            "user_id": uid,
            "importo": {"$gt": 0},
            "$or": [{"matched_incasso_id": {"$exists": False}}, {"matched_incasso_id": None}],
        }, {"_id": 0}).to_list(2000)
        matched_count = 0
        for inc in incassi_open:
            previsto = float(inc.get("previsto") or 0)
            if previsto <= 0:
                continue
            anno, mese = inc["anno"], inc["mese"]
            m_first = date(anno, mese, 1)
            tol_amount = previsto * AMOUNT_TOLERANCE_PCT
            best = None
            best_diff = 999999
            for mv in movs:
                if mv.get("matched_incasso_id"):
                    continue
                try:
                    mv_date = date.fromisoformat(str(mv.get("data", ""))[:10])
                except Exception:
                    continue
                diff_days = abs((mv_date - m_first).days)
                if diff_days > DATE_TOLERANCE_DAYS:
                    continue
                amount_diff = abs(float(mv.get("importo", 0)) - previsto)
                if amount_diff > tol_amount and amount_diff > 5:  # 5€ tolleranza assoluta
                    continue
                # candidato valido: scegli il più vicino
                score = diff_days * 10 + amount_diff
                if score < best_diff:
                    best = mv
                    best_diff = score
            if best:
                await db.incassi.update_one(
                    {"id": inc["id"], "user_id": uid},
                    {"$set": {
                        "stato": "pagato",
                        "incassato": float(best["importo"]),
                        "data_incasso": str(best.get("data", ""))[:10],
                        "movimento_id": best.get("id"),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }}
                )
                await db.movimenti_bancari.update_one(
                    {"id": best["id"], "user_id": uid},
                    {"$set": {"matched_incasso_id": inc["id"]}}
                )
                # rimuovi dalla pool locale per non riusare
                best["matched_incasso_id"] = inc["id"]
                matched_count += 1
        return {"matched": matched_count, "incassi_open": len(incassi_open), "movimenti_checked": len(movs)}

    @router.get("/stats")
    async def stats(user: dict = Depends(current_user)):
        """KPI riepilogativi per dashboard Affitti."""
        uid = user["id"]
        all_inc = await db.incassi.find({"user_id": uid}, {"_id": 0}).to_list(2000)
        today = date.today()
        cm_year, cm_month = today.year, today.month
        cur_month = [i for i in all_inc if i["anno"] == cm_year and i["mese"] == cm_month]
        cur_paid = [i for i in cur_month if i["stato"] == "pagato"]
        cur_unpaid = [i for i in cur_month if i["stato"] in ("previsto", "in_ritardo", "non_pagato", "parzialmente_pagato")]
        total_paid_eur = sum(i["incassato"] for i in cur_paid)
        total_expected_eur = sum(i["previsto"] for i in cur_month)
        return {
            "current_month": f"{cm_year}-{cm_month:02d}",
            "expected_count": len(cur_month),
            "paid_count": len(cur_paid),
            "unpaid_count": len(cur_unpaid),
            "expected_eur": total_expected_eur,
            "paid_eur": total_paid_eur,
            "completion_pct": round(total_paid_eur / total_expected_eur * 100, 1) if total_expected_eur else 0,
        }

    @router.post("/regenerate")
    async def regenerate_for_all(user: dict = Depends(current_user)):
        """Rigenera gli incassi previsti per tutti gli immobili attualmente affittati."""
        from routers.properties import _generate_expected_incassi
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        total = 0
        for p in props:
            if p.get("canone_mensile") and p.get("data_inizio_contratto"):
                total += await _generate_expected_incassi(db, user["id"], p)
        return {"generated": total, "properties_checked": len(props)}

    # ===== Single source of truth for liquidity =====
    @router.get("/liquidity", include_in_schema=False)
    async def liquidity_legacy(user: dict = Depends(current_user)):
        # alias retro-compat
        return await _compute_liquidity(db, user["id"])

    return router


async def _compute_liquidity(db, user_id: str) -> dict:
    """Fonte di verità per la liquidità: liquidita_iniziale (settings) + saldo movimenti bancari importati.
    Esposto via /api/finance/liquidity (vedi finance_router). Lo riuso da incassi e finance.
    """
    # 1) liquidità iniziale dalle impostazioni
    s = await db.settings.find_one({"user_id": user_id}, {"_id": 0}) or {}
    iniziale = float(s.get("liquidita_iniziale", 35000.0) or 0)
    # 2) saldo movimenti bancari importati
    movs = await db.movimenti_bancari.find({"user_id": user_id}, {"_id": 0, "importo": 1}).to_list(10000)
    saldo_movs = sum(float(m.get("importo", 0) or 0) for m in movs)
    # 3) bilancio caricato (preferenza assoluta se presente)
    latest = await db.bilanci.find_one({"user_id": user_id}, sort=[("created_at", -1)])
    bilancio_liq = None
    if latest:
        sp = latest.get("stato_patrimoniale") or {}
        bv = sp.get("liquidita")
        if bv is not None:
            bilancio_liq = float(bv)
    if bilancio_liq is not None:
        liquidita = bilancio_liq
        source = "bilancio"
    else:
        liquidita = iniziale + saldo_movs
        source = "iniziale+movimenti"
    return {
        "liquidita": round(liquidita, 2),
        "source": source,
        "components": {
            "iniziale": iniziale,
            "saldo_movimenti_bancari": round(saldo_movs, 2),
            "movimenti_count": len(movs),
            "bilancio_liquidita": bilancio_liq,
        },
    }
