"""
Push Notifications via Web Push API (VAPID).

Endpoints (autenticati):
  GET    /api/push/public-key  → restituisce la VAPID public key (raw base64url)
  POST   /api/push/subscribe   → salva la subscription del browser per l'utente
  DELETE /api/push/subscribe   → rimuove tutte le subscription dell'utente
  POST   /api/push/test        → invia una push di test all'utente corrente

Helper:
  send_push_to_user(db, user_id, payload)  → invia push a tutte le subscription dell'utente
"""
import os
import base64
import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pywebpush import webpush, WebPushException

logger = logging.getLogger(__name__)


def _load_vapid_private_pem() -> Optional[bytes]:
    b64 = os.environ.get("VAPID_PRIVATE_PEM_B64", "")
    if not b64:
        return None
    # Restore padding
    pad = "=" * (-len(b64) % 4)
    return base64.urlsafe_b64decode(b64 + pad)


def _vapid_public_key() -> str:
    return os.environ.get("VAPID_PUBLIC_KEY", "")


def _vapid_subject() -> str:
    return os.environ.get("VAPID_SUBJECT", "mailto:admin@controlroom.it")


class SubscriptionPayload(BaseModel):
    endpoint: str
    keys: Dict[str, str]  # {"p256dh": "...", "auth": "..."}
    user_agent: Optional[str] = None


async def send_push_to_user(db, user_id: str, payload: Dict[str, Any]) -> int:
    """Invia una push a tutte le subscription attive dell'utente.
    Restituisce il numero di push consegnate. Pulisce automaticamente le subscription scadute (410/404)."""
    private_pem = _load_vapid_private_pem()
    if not private_pem:
        logger.warning("VAPID_PRIVATE_PEM non configurata — push disabilitate")
        return 0
    subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    if not subs:
        return 0

    body = json.dumps(payload, ensure_ascii=False)
    sent = 0
    subject = _vapid_subject()

    def _send_blocking(sub):
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
                data=body,
                vapid_private_key=private_pem.decode() if isinstance(private_pem, bytes) else private_pem,
                vapid_claims={"sub": subject},
                ttl=60 * 60 * 24,  # 24h
            )
            return ("ok", None)
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            return ("err", status)
        except Exception as e:
            logger.warning(f"push failed: {e}")
            return ("err", None)

    for sub in subs:
        result, status = await asyncio.to_thread(_send_blocking, sub)
        if result == "ok":
            sent += 1
        elif status in (404, 410):
            # Subscription scaduta: rimuovila
            await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
            logger.info(f"Push subscription scaduta rimossa: {sub['endpoint'][:50]}...")
    return sent


def make_push_router(db, current_user):
    router = APIRouter(prefix="/api/push")

    @router.get("/public-key")
    async def public_key(user: dict = Depends(current_user)):
        pk = _vapid_public_key()
        if not pk:
            raise HTTPException(503, "VAPID public key non configurata sul server")
        return {"publicKey": pk}

    @router.post("/subscribe")
    async def subscribe(payload: SubscriptionPayload, user: dict = Depends(current_user)):
        # Deduplica per endpoint
        doc = {
            "user_id": user["id"],
            "endpoint": payload.endpoint,
            "keys": payload.keys,
            "user_agent": (payload.user_agent or "")[:200],
            "subscribed_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.push_subscriptions.update_one(
            {"endpoint": payload.endpoint},
            {"$set": doc},
            upsert=True,
        )
        return {"ok": True}

    @router.delete("/subscribe")
    async def unsubscribe(payload: dict = None, user: dict = Depends(current_user)):
        """Rimuove una specifica subscription (per endpoint) o tutte se non specificato."""
        endpoint = (payload or {}).get("endpoint")
        if endpoint:
            r = await db.push_subscriptions.delete_one({"endpoint": endpoint, "user_id": user["id"]})
        else:
            r = await db.push_subscriptions.delete_many({"user_id": user["id"]})
        return {"ok": True, "deleted": r.deleted_count}

    @router.get("/status")
    async def status(user: dict = Depends(current_user)):
        count = await db.push_subscriptions.count_documents({"user_id": user["id"]})
        return {
            "enabled": bool(_vapid_public_key()),
            "active_subscriptions": count,
        }

    @router.post("/test")
    async def test(user: dict = Depends(current_user)):
        sent = await send_push_to_user(db, user["id"], {
            "title": "Control Room · test",
            "body": "🚀 Notifiche push attive! Riceverai aggiornamenti su nuovi deal e alert critici.",
            "url": "/",
            "tag": "test-notification",
        })
        if sent == 0:
            raise HTTPException(400, "Nessuna subscription attiva. Abilita prima le notifiche.")
        return {"ok": True, "delivered": sent}

    return router
