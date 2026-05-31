"""Alert center — refresh proattivo basato su scadenze contratti, APE, mutui."""
import uuid
from datetime import datetime, timezone, date
from fastapi import APIRouter, Depends, HTTPException

THRESHOLDS = [90, 60, 30]  # giorni mancanti su cui scatta l'alert
SEVERITY_BY_DAYS = lambda d: "alta" if d <= 30 else ("media" if d <= 60 else "bassa")


def _days_between(iso_str: str) -> int | None:
    """Restituisce giorni mancanti da oggi a iso_str (YYYY-MM-DD). Negativo se passato."""
    if not iso_str:
        return None
    try:
        target = date.fromisoformat(iso_str[:10])
    except Exception:
        return None
    return (target - date.today()).days


def make_alerts_router(db, current_user):
    router = APIRouter(prefix="/api/alerts")

    @router.get("")
    async def list_alerts(user: dict = Depends(current_user)):
        items = await db.alerts.find({"user_id": user["id"]}, {"_id": 0}).sort("ts", -1).to_list(500)
        return items

    @router.post("/refresh")
    async def refresh_alerts(user: dict = Depends(current_user)):
        """Scansiona properties e ricalcola alert proattivi su scadenze."""
        uid = user["id"]
        # 1) cancella alert auto-generati (manteniamo manuali)
        await db.alerts.delete_many({"user_id": uid, "auto_generated": True})

        props = await db.properties.find({"user_id": uid}, {"_id": 0}).to_list(500)
        now_iso = datetime.now(timezone.utc).isoformat()
        new_alerts = []

        for p in props:
            pid = p.get("id")
            pname = p.get("nome", "Immobile")

            # ===== Scadenza contratto =====
            scad_contratto = p.get("scadenza_contratto")
            days = _days_between(scad_contratto)
            if days is not None and 0 <= days <= 90:
                threshold = next((t for t in THRESHOLDS if days <= t), 90)
                new_alerts.append({
                    "id": f"A-CON-{pid}-{threshold}",
                    "user_id": uid,
                    "tipo": "documentale",
                    "severity": SEVERITY_BY_DAYS(days),
                    "titolo": f"Contratto in scadenza · {pname}",
                    "descrizione": f"Il contratto di locazione scade tra {days} giorni ({scad_contratto[:10]}). Valuta rinnovo o disdetta.",
                    "immobile_id": pid,
                    "ts": now_iso,
                    "days_remaining": days,
                    "scadenza": scad_contratto[:10],
                    "auto_generated": True,
                    "kind": "scadenza_contratto",
                })
            elif days is not None and days < 0:
                new_alerts.append({
                    "id": f"A-CON-{pid}-scaduto",
                    "user_id": uid,
                    "tipo": "documentale",
                    "severity": "alta",
                    "titolo": f"Contratto SCADUTO · {pname}",
                    "descrizione": f"Il contratto è scaduto da {-days} giorni ({scad_contratto[:10]}). Rinnovare urgentemente.",
                    "immobile_id": pid,
                    "ts": now_iso,
                    "days_remaining": days,
                    "scadenza": scad_contratto[:10],
                    "auto_generated": True,
                    "kind": "scadenza_contratto_passata",
                })

            # ===== Scadenza mutuo =====
            mutuo = p.get("mutuo") or {}
            scad_mutuo = mutuo.get("scadenza") or mutuo.get("data_fine")
            days_m = _days_between(scad_mutuo) if scad_mutuo else None
            if days_m is not None and 0 <= days_m <= 90:
                new_alerts.append({
                    "id": f"A-MUT-{pid}",
                    "user_id": uid,
                    "tipo": "economico",
                    "severity": SEVERITY_BY_DAYS(days_m),
                    "titolo": f"Mutuo in scadenza · {pname}",
                    "descrizione": f"Il mutuo scade tra {days_m} giorni ({scad_mutuo[:10]}). Pianificare rinegoziazione o liquidazione.",
                    "immobile_id": pid,
                    "ts": now_iso,
                    "days_remaining": days_m,
                    "scadenza": scad_mutuo[:10],
                    "auto_generated": True,
                    "kind": "scadenza_mutuo",
                })

            # ===== Sfitto da troppo tempo =====
            if p.get("stato") == "sfitto":
                new_alerts.append({
                    "id": f"A-SFITTO-{pid}",
                    "user_id": uid,
                    "tipo": "economico",
                    "severity": "media",
                    "titolo": f"Immobile sfitto · {pname}",
                    "descrizione": "Immobile attualmente sfitto. Valuta riduzione canone o intermediazione.",
                    "immobile_id": pid,
                    "ts": now_iso,
                    "auto_generated": True,
                    "kind": "sfitto",
                })

        if new_alerts:
            await db.alerts.insert_many([a.copy() for a in new_alerts])
        return {"refreshed": True, "alerts_generated": len(new_alerts), "checked_properties": len(props)}

    @router.delete("/{alert_id}")
    async def dismiss_alert(alert_id: str, user: dict = Depends(current_user)):
        res = await db.alerts.delete_one({"id": alert_id, "user_id": user["id"]})
        if res.deleted_count == 0:
            raise HTTPException(404, "Alert non trovato")
        return {"dismissed": alert_id}

    return router
