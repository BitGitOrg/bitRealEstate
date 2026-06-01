"""Geocoding helper — converte indirizzo → lat/lng via Nominatim (OpenStreetMap, gratuito).

Cache aggressiva su MongoDB per non rifare chiamate inutili.
Rispetta la usage policy di Nominatim (max 1 req/sec, User-Agent identificativo).
"""
import asyncio
import logging
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "RealEstateControlRoom/1.0 (contact@controlroom.it)"}
_last_call: dict = {"ts": 0.0}


async def _geocode(query: str) -> Optional[dict]:
    """Chiama Nominatim. Rispetta 1 req/sec."""
    import time
    now = time.time()
    elapsed = now - _last_call["ts"]
    if elapsed < 1.05:
        await asyncio.sleep(1.05 - elapsed)
    _last_call["ts"] = time.time()
    async with httpx.AsyncClient(timeout=10.0) as cli:
        try:
            r = await cli.get(NOMINATIM_URL, params={
                "q": query, "format": "json", "limit": 1, "countrycodes": "it",
                "addressdetails": 1,
            }, headers=HEADERS)
            if r.status_code != 200:
                return None
            arr = r.json()
            if not arr:
                return None
            row = arr[0]
            return {
                "lat": float(row["lat"]),
                "lng": float(row["lon"]),
                "display_name": row.get("display_name", ""),
            }
        except Exception as e:
            logging.warning(f"geocode fail for '{query}': {e}")
            return None


def make_geo_router(db, current_user):
    router = APIRouter(prefix="/api/geo")

    @router.post("/geocode-properties")
    async def geocode_all(user: dict = Depends(current_user)):
        """Geocoda tutti gli immobili dell'utente senza lat/lng. Cachato in property.geo."""
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0, "id": 1, "indirizzo": 1, "citta": 1, "cap": 1, "geo": 1}).to_list(500)
        results = []
        for p in props:
            if p.get("geo", {}).get("lat"):
                results.append({"id": p["id"], "cached": True, **p["geo"]})
                continue
            indirizzo = p.get("indirizzo") or ""
            citta = p.get("citta") or ""
            cap = p.get("cap") or ""
            q = ", ".join([x for x in [indirizzo, cap, citta, "Italia"] if x]).strip()
            if not q:
                results.append({"id": p["id"], "error": "indirizzo mancante"})
                continue
            geo = await _geocode(q)
            if geo:
                await db.properties.update_one(
                    {"id": p["id"], "user_id": user["id"]},
                    {"$set": {"geo": {**geo, "geocoded_at": datetime.now(timezone.utc).isoformat()}}}
                )
                results.append({"id": p["id"], "cached": False, **geo})
            else:
                # Fallback: prova solo con la città
                if citta:
                    geo = await _geocode(f"{citta}, Italia")
                    if geo:
                        # marca come "città approssimativa"
                        geo["approx_city"] = True
                        await db.properties.update_one(
                            {"id": p["id"], "user_id": user["id"]},
                            {"$set": {"geo": {**geo, "geocoded_at": datetime.now(timezone.utc).isoformat()}}}
                        )
                        results.append({"id": p["id"], "cached": False, **geo})
                        continue
                results.append({"id": p["id"], "error": "non trovato"})
        return {"results": results, "geocoded": len([r for r in results if "lat" in r])}

    @router.delete("/cache")
    async def clear_cache(user: dict = Depends(current_user)):
        res = await db.properties.update_many(
            {"user_id": user["id"]},
            {"$unset": {"geo": ""}}
        )
        return {"cleared": res.modified_count}

    return router
