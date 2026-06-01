"""Cash Flow aggregato: storico (12 mesi) + forecast (12 mesi).

Costruisce le serie mensili dai dati REALI:
- Incassi: collezione `incassi` (stato=pagato) + canoni attesi futuri (forecast)
- Uscite: somma rate mutui + IMU/assicurazione mensilizzate + tasse stimate
- Saldo: incassi - uscite
- Forecast: stesso modello proiettato 12 mesi

Endpoints:
- GET /api/cashflow/storico?months=12
- GET /api/cashflow/forecast?months=12
- GET /api/cashflow/aggregato → KPI overview
"""
from datetime import date, datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException


def _add_months(year: int, month: int, n: int):
    total = (year * 12 + (month - 1)) + n
    return total // 12, (total % 12) + 1


def _month_label_it(month: int, year: int) -> str:
    mesi = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
    return f"{mesi[month - 1]} {str(year)[-2:]}"


def make_cashflow_router(db, current_user):
    router = APIRouter(prefix="/api/cashflow")

    async def _compute_monthly_outflow(user_id: str) -> float:
        """Stima uscite mensili ricorrenti per la società.
        Componenti: somma rate mutui + (IMU annua + assicurazione annua) × n_immobili / 12.
        """
        settings = await db.settings.find_one({"user_id": user_id}, {"_id": 0}) or {}
        imu_a = float(settings.get("imu_media_per_immobile", 800) or 800)
        ass_a = float(settings.get("assicurazione_media_per_immobile", 200) or 200)
        props = await db.properties.find({"user_id": user_id, "stato": {"$ne": "venduto"}}, {"_id": 0, "id": 1}).to_list(500)
        spese_immobili_m = (imu_a + ass_a) * len(props) / 12.0
        mutui = await db.mutui.find({"user_id": user_id}, {"_id": 0, "rata_mensile": 1, "data_inizio": 1, "data_fine": 1}).to_list(200)
        today_s = date.today().isoformat()
        rate_correnti = 0.0
        for m in mutui:
            di = (m.get("data_inizio") or "")[:10]
            df = (m.get("data_fine") or "")[:10]
            if di and di > today_s:
                continue
            if df and df < today_s:
                continue
            rate_correnti += float(m.get("rata_mensile", 0) or 0)
        return round(spese_immobili_m + rate_correnti, 2)

    async def _aliquota(user_id: str) -> float:
        settings = await db.settings.find_one({"user_id": user_id}, {"_id": 0}) or {}
        from routers._shared import tax_rate_from_settings
        return tax_rate_from_settings(settings)

    @router.get("/storico")
    async def storico(months: int = 12, user: dict = Depends(current_user)):
        # Mesi: da (oggi - months + 1) a oggi
        today = date.today()
        rows: List[dict] = []
        outflow_base = await _compute_monthly_outflow(user["id"])
        aliquota = await _aliquota(user["id"])
        # Liquidità iniziale per saldo cumulato
        settings = await db.settings.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
        saldo_cum = float(settings.get("liquidita_iniziale", 35000) or 35000)
        for k in range(months - 1, -1, -1):
            y, m = _add_months(today.year, today.month, -k)
            incassi_doc = await db.incassi.find({
                "user_id": user["id"], "anno": y, "mese": m, "stato": "pagato"
            }, {"_id": 0, "importo": 1}).to_list(500)
            incassi = sum(float(i.get("importo", 0) or 0) for i in incassi_doc)
            # Se non ci sono incassi reali, stima dai contratti attivi
            if incassi == 0:
                props = await db.properties.find({"user_id": user["id"], "stato": "affittato"}, {"_id": 0, "canone_mensile": 1}).to_list(500)
                incassi = sum(float(p.get("canone_mensile", 0) or 0) for p in props)
            # Tasse stimate sull'incasso
            tasse = round(incassi * aliquota, 2)
            uscite = outflow_base + tasse
            saldo = incassi - uscite
            saldo_cum += saldo
            rows.append({
                "anno": y, "mese": m, "label": _month_label_it(m, y),
                "incassi": round(incassi, 2),
                "uscite": round(uscite, 2),
                "saldo": round(saldo, 2),
                "saldo_cumulato": round(saldo_cum, 2),
            })
        return {"rows": rows, "outflow_base_mensile": outflow_base, "aliquota_tasse": aliquota}

    @router.get("/forecast")
    async def forecast(months: int = 12, user: dict = Depends(current_user)):
        """Previsione 12 mesi futuri. Usa contratti attivi (canoni) - uscite ricorrenti - tasse stimate.
        Sottrae anche uscite straordinarie note (lavori in corso con budget residuo)."""
        today = date.today()
        outflow_base = await _compute_monthly_outflow(user["id"])
        aliquota = await _aliquota(user["id"])
        settings = await db.settings.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
        saldo_cum = float(settings.get("liquidita_iniziale", 35000) or 35000)
        # Aggiungi storico al saldo cumulato per partire dal "oggi"
        st = await db.incassi.find({"user_id": user["id"], "stato": "pagato"}, {"_id": 0, "importo": 1}).to_list(2000)
        # +incassi reali storici a saldo_cum (semplificato)
        saldo_cum += sum(float(i.get("importo", 0) or 0) for i in st) - outflow_base * 6  # stima storica grezza
        # Lavori in corso → residuo da distribuire nei prossimi 6 mesi
        lavori = await db.lavori.find({"user_id": user["id"], "stato": "in_corso"}, {"_id": 0}).to_list(100)
        residuo_lavori = sum(max(0, float(item.get("budget", 0) or 0) - float(item.get("speso", 0) or 0)) for item in lavori)
        spalmatura_lavori = residuo_lavori / 6 if residuo_lavori > 0 else 0
        rows: List[dict] = []
        for k in range(months):
            y, m = _add_months(today.year, today.month, k)
            # Incassi attesi = canoni dei contratti attivi quel mese
            props = await db.properties.find({
                "user_id": user["id"],
                "stato": {"$in": ["affittato", "disponibile"]}
            }, {"_id": 0, "canone_mensile": 1, "data_uscita_prevista": 1, "scadenza_contratto": 1}).to_list(500)
            incassi = 0.0
            for p in props:
                canone = float(p.get("canone_mensile", 0) or 0)
                if canone == 0:
                    continue
                # se ha data uscita prevista < questo mese, salta
                duscita = (p.get("data_uscita_prevista") or "")[:10]
                if duscita and duscita < f"{y}-{m:02d}-01":
                    continue
                incassi += canone
            tasse = round(incassi * aliquota, 2)
            uscite = outflow_base + tasse + (spalmatura_lavori if k < 6 else 0)
            saldo = incassi - uscite
            saldo_cum += saldo
            rows.append({
                "anno": y, "mese": m, "label": _month_label_it(m, y),
                "incassi_previsti": round(incassi, 2),
                "uscite_previste": round(uscite, 2),
                "saldo_previsto": round(saldo, 2),
                "saldo_cumulato": round(saldo_cum, 2),
                "alert": saldo < 0,
            })
        return {"rows": rows, "outflow_base_mensile": outflow_base, "aliquota_tasse": aliquota, "residuo_lavori": residuo_lavori}

    @router.get("/aggregato")
    async def aggregato(user: dict = Depends(current_user)):
        sto = await storico(months=12, user=user)
        fwd = await forecast(months=12, user=user)
        rows = sto["rows"]
        saldo_corrente = rows[-1]["saldo"] if rows else 0
        saldo_medio = sum(r["saldo"] for r in rows) / len(rows) if rows else 0
        mesi_tensione = sum(1 for r in fwd["rows"] if r["alert"])
        # Liquidità prossimi 90 gg (somma saldo prossimi 3 mesi + saldo iniziale)
        from routers.incassi import _compute_liquidity
        liq = await _compute_liquidity(db, user["id"])
        liq_90 = liq.get("liquidita", 0) + sum(r["saldo_previsto"] for r in fwd["rows"][:3])
        return {
            "saldo_corrente": saldo_corrente,
            "saldo_medio_12m": round(saldo_medio, 2),
            "liquidita_90gg": round(liq_90, 2),
            "mesi_tensione_prossimi_12": mesi_tensione,
        }

    return router
