"""Scadenzario fiscale — IMU, TARI, IRES, IRAP, IVA, F24.

Calcola le scadenze annuali in base al regime società (privato/SRL) e agli immobili.
- IMU: 16 giugno (acconto 50%) + 16 dicembre (saldo 50%)
- TARI: variabile per comune, default genera promemoria gen/lug
- IRES + IRAP: 30 giugno (saldo + 1° acconto 40%), 30 novembre (2° acconto 60%)
- IVA trimestrale: 16 maggio, 20 agosto, 16 novembre, 16 marzo (Y+1)
- Cedolare secca (privati): 4 acconti
- Dichiarazione (Modello Redditi): 30 novembre

L'IMU viene calcolata automaticamente se la rendita catastale è presente:
  valore_imponibile = rendita * 1.05 * moltiplicatore_categoria
  IMU = valore_imponibile * aliquota_comune (default 1.06%)
"""
import uuid
from datetime import date, datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


# Moltiplicatori catastali per categoria immobiliare
MOLT_IMU = {
    "A": 160, "A1": 160, "A2": 160, "A3": 160, "A4": 160, "A5": 160, "A6": 160, "A7": 160, "A8": 160, "A9": 160,
    "A10": 80,  # uffici
    "A11": 160,
    "B": 140,
    "C1": 55,   # negozi
    "C2": 160, "C3": 160, "C4": 160, "C5": 160, "C6": 160, "C7": 160,
    "D": 65,    # opifici/alberghi etc
    "D5": 80,   # istituti bancari
    "E": 65,
}


def _moltiplicatore(categoria: str) -> int:
    cat = (categoria or "").upper().strip().replace("/", "").replace(" ", "")
    return MOLT_IMU.get(cat, MOLT_IMU.get(cat[:2], 160) if len(cat) >= 2 else 160)


class AliquoteIn(BaseModel):
    aliquota_imu: Optional[float] = None    # %
    aliquota_tari_per_mq: Optional[float] = None  # €/mq/anno


def _stato_scadenza(d: date, oggi: date) -> str:
    diff = (d - oggi).days
    if diff < 0:
        return "scaduta"
    if diff <= 7:
        return "imminente"
    if diff <= 30:
        return "in_arrivo"
    return "futura"


def make_tax_calendar_router(db, current_user):
    router = APIRouter(prefix="/api/tax-calendar")

    @router.get("/annuale")
    async def calendario(anno: Optional[int] = None, user: dict = Depends(current_user)):
        """Genera il calendario fiscale per l'anno richiesto (default: anno corrente)."""
        anno = anno or date.today().year
        settings = await db.settings.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
        props = await db.properties.find({"user_id": user["id"], "stato": {"$ne": "venduto"}}, {"_id": 0}).to_list(500)
        tipo_societa = settings.get("tipo_societa", "srl")
        aliquota_imu = float(settings.get("aliquota_imu", 1.06) or 1.06) / 100
        # Default TARI in €/mq/anno
        tari_per_mq = float(settings.get("aliquota_tari_per_mq", 2.5) or 2.5)

        # === CALCOLA IMU per ogni immobile ===
        imu_per_immobile: List[dict] = []
        imu_totale = 0.0
        for p in props:
            rendita = float(p.get("rendita_catastale", 0) or 0)
            categoria = p.get("categoria_catastale", "A2")
            if rendita > 0:
                molt = _moltiplicatore(categoria)
                valore_imp = rendita * 1.05 * molt
                imu_annuo = valore_imp * aliquota_imu
            else:
                # Stima grezza se manca rendita
                imu_annuo = float(settings.get("imu_media_per_immobile", 800) or 800)
            imu_per_immobile.append({
                "id": p["id"],
                "nome": p.get("nome"),
                "rendita_catastale": rendita,
                "categoria": categoria,
                "imu_annuo": round(imu_annuo, 2),
                "acconto": round(imu_annuo / 2, 2),
                "saldo": round(imu_annuo / 2, 2),
            })
            imu_totale += imu_annuo

        # === TARI stima ===
        tari_totale = sum(float(p.get("metratura", 0) or 0) * tari_per_mq for p in props)

        oggi = date.today()
        scadenze = []

        # IMU acconto
        d_imu_acc = date(anno, 6, 16)
        scadenze.append({
            "id": f"IMU-ACC-{anno}",
            "data": d_imu_acc.isoformat(),
            "tipo": "IMU",
            "descrizione": "Acconto IMU (50%)",
            "importo": round(imu_totale / 2, 2),
            "stato": _stato_scadenza(d_imu_acc, oggi),
            "codice_tributo": "3918",
            "dettaglio": imu_per_immobile,
        })
        # IMU saldo
        d_imu_sal = date(anno, 12, 16)
        scadenze.append({
            "id": f"IMU-SAL-{anno}",
            "data": d_imu_sal.isoformat(),
            "tipo": "IMU",
            "descrizione": "Saldo IMU (50%)",
            "importo": round(imu_totale / 2, 2),
            "stato": _stato_scadenza(d_imu_sal, oggi),
            "codice_tributo": "3918",
            "dettaglio": imu_per_immobile,
        })

        # TARI (rate semestrali tipiche)
        if tari_totale > 0:
            for k, m, descr in [("TARI-1", 4, "1° rata TARI"), ("TARI-2", 10, "2° rata TARI")]:
                d = date(anno, m, 30)
                scadenze.append({
                    "id": f"{k}-{anno}",
                    "data": d.isoformat(),
                    "tipo": "TARI",
                    "descrizione": descr + " (stima)",
                    "importo": round(tari_totale / 2, 2),
                    "stato": _stato_scadenza(d, oggi),
                    "codice_tributo": "3944",
                })

        # IRES + IRAP (SRL/SpA/Holding)
        if tipo_societa != "privato":
            d_ires1 = date(anno, 6, 30)
            d_ires2 = date(anno, 11, 30)
            scadenze.append({
                "id": f"IRES-{anno}-1",
                "data": d_ires1.isoformat(),
                "tipo": "IRES/IRAP",
                "descrizione": "Saldo IRES/IRAP anno precedente + 1° acconto (40%)",
                "importo": None,  # va calcolato dal commercialista
                "stato": _stato_scadenza(d_ires1, oggi),
                "codice_tributo": "2003 / 3800",
                "note": "Dipende dall'utile di esercizio anno precedente",
            })
            scadenze.append({
                "id": f"IRES-{anno}-2",
                "data": d_ires2.isoformat(),
                "tipo": "IRES/IRAP",
                "descrizione": "2° acconto IRES/IRAP (60%)",
                "importo": None,
                "stato": _stato_scadenza(d_ires2, oggi),
                "codice_tributo": "2003 / 3800",
            })

        # IVA trimestrale (se applicabile)
        for k, m, descr in [
            ("IVA-Q1", 5, "IVA 1° trimestre"),
            ("IVA-Q2", 8, "IVA 2° trimestre"),
            ("IVA-Q3", 11, "IVA 3° trimestre"),
        ]:
            day = 16 if m != 8 else 20
            d = date(anno, m, day)
            scadenze.append({
                "id": f"{k}-{anno}",
                "data": d.isoformat(),
                "tipo": "IVA",
                "descrizione": descr,
                "importo": None,
                "stato": _stato_scadenza(d, oggi),
                "codice_tributo": "60xx",
            })
        # IVA Q4 = primo trimestre anno successivo
        d_iva4 = date(anno + 1, 3, 16)
        scadenze.append({
            "id": f"IVA-Q4-{anno}",
            "data": d_iva4.isoformat(),
            "tipo": "IVA",
            "descrizione": "IVA 4° trimestre",
            "importo": None,
            "stato": _stato_scadenza(d_iva4, oggi),
            "codice_tributo": "6035",
        })

        # Dichiarazione redditi / Modello unico società
        d_mod = date(anno, 11, 30)
        scadenze.append({
            "id": f"MOD-REDDITI-{anno}",
            "data": d_mod.isoformat(),
            "tipo": "Dichiarazione",
            "descrizione": "Modello Redditi società / Dichiarazione",
            "importo": None,
            "stato": _stato_scadenza(d_mod, oggi),
            "note": "Termine ordinario (30 nov)",
        })

        # Cedolare (solo privati)
        if tipo_societa == "privato":
            for k, m, descr in [("CED-1", 6, "Cedolare secca - 1° acconto"),
                                ("CED-2", 11, "Cedolare secca - 2° acconto")]:
                d = date(anno, m, 30)
                scadenze.append({
                    "id": f"{k}-{anno}",
                    "data": d.isoformat(),
                    "tipo": "Cedolare",
                    "descrizione": descr,
                    "importo": None,
                    "stato": _stato_scadenza(d, oggi),
                    "codice_tributo": "1840 / 1841",
                })

        scadenze.sort(key=lambda x: x["data"])

        return {
            "anno": anno,
            "tipo_societa": tipo_societa,
            "imu_totale_anno": round(imu_totale, 2),
            "tari_totale_anno": round(tari_totale, 2),
            "scadenze": scadenze,
            "imminenti_30gg": [s for s in scadenze if s["stato"] in ("imminente", "in_arrivo")],
            "scadute_non_pagate": [s for s in scadenze if s["stato"] == "scaduta"],
        }

    @router.put("/aliquote")
    async def aggiorna_aliquote(payload: AliquoteIn, user: dict = Depends(current_user)):
        update = {}
        if payload.aliquota_imu is not None:
            update["aliquota_imu"] = payload.aliquota_imu
        if payload.aliquota_tari_per_mq is not None:
            update["aliquota_tari_per_mq"] = payload.aliquota_tari_per_mq
        if update:
            update["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.settings.update_one(
                {"user_id": user["id"]},
                {"$set": update},
                upsert=True,
            )
        return {"ok": True, **update}

    return router
