"""Properties + Deal-to-Property conversion router."""
import re
import uuid
from datetime import datetime, timezone, date
from dateutil.relativedelta import relativedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from routers._shared import enrich_property as _enrich_property, apply_dynamic_score


_MESI_IT_MAP = {
    "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
    "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
}


def _period_end_iso(periodo: str) -> Optional[str]:
    """Converte "Q4 2025" / "2025" / "Marzo 2025" → "YYYY-MM-DD" (ultimo giorno del periodo).
    Ritorna None se non riconosciuto."""
    if not periodo:
        return None
    p = periodo.lower().strip()
    # Mese specifico (es. "Marzo 2025")
    for name, num in _MESI_IT_MAP.items():
        if name in p:
            m = re.search(r"(20\d{2})", p)
            if m:
                year = int(m.group(1))
                # ultimo giorno del mese
                if num == 12:
                    last = date(year, 12, 31)
                else:
                    last = date(year, num + 1, 1) - relativedelta(days=1)
                return last.isoformat()
    # Trimestre (es. "Q4 2025")
    m = re.search(r"q(\d)\s*(20\d{2})", p)
    if m:
        q = int(m.group(1))
        year = int(m.group(2))
        end_month = q * 3
        if end_month == 12:
            last = date(year, 12, 31)
        else:
            last = date(year, end_month + 1, 1) - relativedelta(days=1)
        return last.isoformat()
    # Anno (es. "2025")
    m = re.search(r"(20\d{2})", p)
    if m:
        return date(int(m.group(1)), 12, 31).isoformat()
    return None


async def _generate_expected_incassi(db, user_id: str, prop: dict) -> int:
    """Crea incassi previsti per i 12 mesi successivi a partire da data_inizio_contratto.
    Idempotente: skip se l'incasso con quella chiave esiste già.
    Solo se canone_mensile > 0 e data_inizio_contratto è valida.
    """
    canone = float(prop.get("canone_mensile") or 0)
    start = prop.get("data_inizio_contratto")
    if canone <= 0 or not start:
        return 0
    try:
        d0 = date.fromisoformat(str(start)[:10])
    except Exception:
        return 0
    today = date.today()
    pid = prop.get("id")
    incassi_to_insert = []
    # Genera 12 mesi a partire dal max(start, current month - 2) per non riempire storia troppo lontana
    start_month = max(d0, date(today.year, today.month, 1) - relativedelta(months=2))
    for i in range(14):  # ~14 mesi (storico recente + futuro 12)
        m = (date(start_month.year, start_month.month, 1) + relativedelta(months=i))
        if m > today + relativedelta(months=12):
            break
        # Skip se prima del contratto
        if date(m.year, m.month, 1) < date(d0.year, d0.month, 1):
            continue
        incasso_id = f"INC-{pid}-{m.year}-{m.month:02d}"
        existing = await db.incassi.find_one({"id": incasso_id, "user_id": user_id})
        if existing:
            continue
        incassi_to_insert.append({
            "id": incasso_id,
            "user_id": user_id,
            "immobile_id": pid,
            "anno": m.year,
            "mese": m.month,
            "mese_label": f"{['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'][m.month-1]} {m.year}",
            "previsto": canone,
            "incassato": 0,
            "data_incasso": None,
            "stato": "previsto",  # previsto | pagato | parzialmente_pagato | in_ritardo | non_pagato
            "movimento_id": None,  # ID del movimento bancario quando riconciliato
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    if incassi_to_insert:
        await db.incassi.insert_many(incassi_to_insert)
    return len(incassi_to_insert)


class PropertyIn(BaseModel):
    nome: str
    indirizzo: Optional[str] = ""
    citta: Optional[str] = ""
    provincia: Optional[str] = ""
    tipologia: Optional[str] = "Altro"
    metratura: Optional[float] = 0
    piano: Optional[str] = ""
    anno_costruzione: Optional[int] = 0
    classe_energetica: Optional[str] = ""
    stato: Optional[str] = "acquistato"
    operazione: Optional[str] = "reddito"
    prezzo_acquisto: float = 0
    notaio: Optional[float] = 0
    agenzia: Optional[float] = 0
    imposte: Optional[float] = 0
    lavori: Optional[float] = 0
    valore_stimato: Optional[float] = 0
    canone_mensile: Optional[float] = 0
    data_acquisto: Optional[str] = None
    note: Optional[str] = ""
    mutuo: Optional[dict] = None
    img: Optional[str] = "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?crop=entropy&cs=srgb&fm=jpg&w=800"
    # Locazione
    inquilino: Optional[str] = None
    inquilino_email: Optional[str] = None
    inquilino_telefono: Optional[str] = None
    data_inizio_contratto: Optional[str] = None
    scadenza_contratto: Optional[str] = None
    deposito_cauzionale: Optional[float] = 0
    durata_contratto_anni: Optional[int] = 0
    rinnovo_automatico: Optional[bool] = False


class LocazioneIn(BaseModel):
    inquilino: Optional[str] = None
    inquilino_email: Optional[str] = None
    inquilino_telefono: Optional[str] = None
    data_inizio_contratto: Optional[str] = None
    scadenza_contratto: Optional[str] = None
    deposito_cauzionale: Optional[float] = None
    durata_contratto_anni: Optional[int] = None
    rinnovo_automatico: Optional[bool] = None
    canone_mensile: Optional[float] = None
    note_locazione: Optional[str] = None


class ConvertDealIn(BaseModel):
    data_acquisto: Optional[str] = None
    notaio: Optional[float] = 0
    agenzia: Optional[float] = 0
    imposte: Optional[float] = 0
    lavori: Optional[float] = 0
    stato: Optional[str] = "acquistato"
    operazione: Optional[str] = "reddito"
    mutuo: Optional[dict] = None
    note: Optional[str] = ""


def make_properties_router(db, current_user):
    router = APIRouter(prefix="/api")

    @router.get("/properties")
    async def list_properties(user: dict = Depends(current_user)):
        # Auto-chiude contratti con data_uscita_prevista scaduta
        try:
            from routers.contracts import _autocheck_disdette
            await _autocheck_disdette(db, user["id"])
        except Exception:
            pass
        items = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
        alerts = await db.alerts.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        incassi = await db.incassi.find({"user_id": user["id"]}, {"_id": 0}).to_list(2000)
        # Carica settings UNA SOLA VOLTA per evitare N+1
        from routers.settings import get_user_settings
        settings = await get_user_settings(db, user["id"])
        a_by_p: dict = {}
        for a in alerts:
            pid = a.get("immobile_id")
            if pid:
                a_by_p.setdefault(pid, []).append(a)
        i_by_p: dict = {}
        for i in incassi:
            pid = i.get("immobile_id")
            if pid:
                i_by_p.setdefault(pid, []).append(i)
        out = []
        for p in items:
            p = _enrich_property(p, settings)
            p = apply_dynamic_score(p, a_by_p, i_by_p)
            out.append(p)
        return out

    @router.get("/patrimonio/reconcile")
    async def patrimonio_reconcile(user: dict = Depends(current_user)):
        """Riconciliazione bilancio↔gestionale per il patrimonio immobiliare.
        Ritorna i totali necessari alla UI per mostrare uno dei 4 stati banner."""
        # Gestionale: somma valori immobili attualmente registrati
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        gest_valore = sum(
            float(p.get("valore_stimato") or p.get("prezzo_acquisto") or 0) for p in props
        )

        # Ultimo bilancio caricato
        latest_bil = await db.bilanci.find_one(
            {"user_id": user["id"]}, {"_id": 0}, sort=[("periodo", -1), ("created_at", -1)]
        )
        bilancio_caricato = latest_bil is not None
        bilancio_periodo = latest_bil.get("periodo") if latest_bil else None
        bilancio_valore = None
        if latest_bil:
            sp = latest_bil.get("stato_patrimoniale") or {}
            bilancio_valore = float(sp.get("valore_immobili") or 0)

        return {
            "n_immobili": len(props),
            "gestionale_valore_immobili": round(gest_valore, 2),
            "bilancio_caricato": bilancio_caricato,
            "bilancio_periodo": bilancio_periodo,
            "bilancio_valore_immobili": round(bilancio_valore, 2) if bilancio_valore is not None else None,
        }

    async def _compute_finanza_reconcile(user_id: str):
        """Logica condivisa: ritorna lo stesso payload di /finanza/reconcile (riusato da pn-timeline)."""
        latest_bil = await db.bilanci.find_one(
            {"user_id": user_id}, {"_id": 0}, sort=[("periodo", -1), ("created_at", -1)]
        )
        if not latest_bil:
            return None
        sp = latest_bil.get("stato_patrimoniale") or {}
        bil_pn = float(sp.get("patrimonio_netto") or 0)
        bil_liq = float(sp.get("liquidita") or 0)
        bil_debm = float(sp.get("debito_mutui") or 0)
        bil_imm = float(sp.get("valore_immobili") or 0)
        periodo = latest_bil.get("periodo")
        end_iso = _period_end_iso(periodo)

        props = await db.properties.find({"user_id": user_id}, {"_id": 0}).to_list(500)
        gest_imm = sum(float(p.get("valore_stimato") or p.get("prezzo_acquisto") or 0) for p in props)

        mutui = await db.mutui.find({"user_id": user_id}, {"_id": 0}).to_list(200)
        gest_deb = sum(float(m.get("capitale_residuo") or m.get("importo_originario") or 0) for m in mutui)

        n_post = 0
        delta_post = 0.0
        if end_iso:
            async for m in db.movimenti_bancari.find(
                {"user_id": user_id, "data": {"$gt": end_iso}}, {"_id": 0, "importo": 1, "tipo": 1}
            ):
                imp = float(m.get("importo") or 0)
                t = (m.get("tipo") or "uscita").lower()
                delta_post += abs(imp) if t in ("incasso", "entrata", "credito") else -abs(imp)
                n_post += 1
        liq_live = bil_liq + delta_post
        pn_reale = gest_imm + liq_live - gest_deb

        return {
            "bilancio_periodo": periodo,
            "bilancio_pn": bil_pn,
            "bilancio_immobili": bil_imm,
            "bilancio_liquidita": bil_liq,
            "bilancio_debito_mutui": bil_debm,
            "gestionale_immobili": gest_imm,
            "gestionale_debito_mutui": gest_deb,
            "liquidita_live": liq_live,
            "delta_post": delta_post,
            "n_post": n_post,
            "pn_reale": pn_reale,
            "end_iso": end_iso,
        }

    @router.get("/finanza/pn-timeline")
    async def pn_timeline(user: dict = Depends(current_user)):
        """Timeline storica del Patrimonio Netto.
        Ogni punto = uno snapshot di bilancio (PN ufficiale). Aggiunge un punto extra "Oggi"
        con il PN Reale live (ricalcolato da gestionale + cassa post-bilancio).
        Frontend: chart line con 2 serie ('PN Bilancio' storica + 'PN Reale' che prosegue oltre)."""
        bilanci = await db.bilanci.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", 1).to_list(100)

        points = []
        for b in bilanci:
            sp = b.get("stato_patrimoniale") or {}
            periodo = b.get("periodo") or ""
            end = _period_end_iso(periodo)
            pn_bil = float(sp.get("patrimonio_netto") or 0)
            # Per i bilanci storici, PN Reale = PN bilancio (snapshot ufficiale già allineato)
            # La divergenza emerge solo nel punto "Oggi" post-ultimo bilancio
            points.append({
                "label": periodo,
                "data": end,
                "pn_bilancio": round(pn_bil, 2),
                "pn_reale": round(pn_bil, 2),
                "immobili": round(float(sp.get("valore_immobili") or 0), 2),
                "liquidita": round(float(sp.get("liquidita") or 0), 2),
                "debito_mutui": round(float(sp.get("debito_mutui") or 0), 2),
                "is_snapshot": True,
            })

        # Ordina cronologicamente per data (alcuni bilanci possono avere ordine errato)
        points.sort(key=lambda p: (p.get("data") or "9999-99-99"))

        # Aggiunge punto "Oggi" col PN Reale live (sostituisce/estende l'ultimo se è il più recente)
        rec = await _compute_finanza_reconcile(user["id"])
        if rec:
            today_iso = datetime.now(timezone.utc).date().isoformat()
            # Se l'ultimo bilancio è già "alla data" (es. fine periodo > oggi -7gg), aggiungiamo comunque
            points.append({
                "label": "Oggi (live)",
                "data": today_iso,
                "pn_bilancio": None,  # serie bilancio si ferma all'ultimo snapshot
                "pn_reale": round(rec["pn_reale"], 2),
                "immobili": round(rec["gestionale_immobili"], 2),
                "liquidita": round(rec["liquidita_live"], 2),
                "debito_mutui": round(rec["gestionale_debito_mutui"], 2),
                "is_snapshot": False,
                "delta_vs_ultimo_bilancio": round(rec["pn_reale"] - rec["bilancio_pn"], 2),
            })

        return {"points": points, "n_snapshots": len([p for p in points if p["is_snapshot"]])}

    @router.get("/finanza/reconcile")
    async def finanza_reconcile(user: dict = Depends(current_user)):
        """Riconciliazione completa bilancio↔gestionale: liquidità, debito mutui, immobili e patrimonio netto reale.
        Calcola la liquidità live aggiungendo i movimenti bancari successivi alla data del bilancio."""
        # ─── Ultimo bilancio ───
        latest_bil = await db.bilanci.find_one(
            {"user_id": user["id"]}, {"_id": 0}, sort=[("periodo", -1), ("created_at", -1)]
        )
        if not latest_bil:
            return {
                "bilancio_caricato": False,
                "bilancio_periodo": None,
                "bilancio": None,
                "gestionale": None,
                "liquidita_live": None,
                "patrimonio_netto_reale": None,
                "n_movimenti_post_bilancio": 0,
            }
        sp = latest_bil.get("stato_patrimoniale") or {}
        bil_valore_immobili = float(sp.get("valore_immobili") or 0)
        bil_debito_mutui = float(sp.get("debito_mutui") or 0)
        bil_liquidita = float(sp.get("liquidita") or 0)
        bil_pn = float(sp.get("patrimonio_netto") or 0)
        periodo = latest_bil.get("periodo")

        # ─── Gestionale: immobili ───
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        gest_valore_immobili = sum(
            float(p.get("valore_stimato") or p.get("prezzo_acquisto") or 0) for p in props
        )

        # ─── Gestionale: debito mutui (capitale residuo dai piani caricati) ───
        mutui = await db.mutui.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
        gest_debito_mutui = 0.0
        for m in mutui:
            gest_debito_mutui += float(m.get("capitale_residuo") or m.get("importo_originario") or 0)

        # ─── Liquidità live: bilancio.liquidita + movimenti dopo fine periodo ───
        end_iso = _period_end_iso(periodo)
        n_post = 0
        delta_post = 0.0
        if end_iso:
            mov_cursor = db.movimenti_bancari.find(
                {"user_id": user["id"], "data": {"$gt": end_iso}}, {"_id": 0, "importo": 1, "tipo": 1}
            )
            async for m in mov_cursor:
                imp = float(m.get("importo") or 0)
                t = (m.get("tipo") or "uscita").lower()
                if t in ("incasso", "entrata", "credito"):
                    delta_post += abs(imp)
                else:
                    delta_post -= abs(imp)
                n_post += 1
        liquidita_live = bil_liquidita + delta_post

        # ─── Patrimonio Netto Reale ───
        # = immobili gestionale + liquidità live - debito mutui gestionale
        pn_reale = gest_valore_immobili + liquidita_live - gest_debito_mutui

        return {
            "bilancio_caricato": True,
            "bilancio_periodo": periodo,
            "bilancio_periodo_end": end_iso,
            "bilancio": {
                "valore_immobili": round(bil_valore_immobili, 2),
                "liquidita": round(bil_liquidita, 2),
                "debito_mutui": round(bil_debito_mutui, 2),
                "patrimonio_netto": round(bil_pn, 2),
            },
            "gestionale": {
                "n_immobili": len(props),
                "valore_immobili": round(gest_valore_immobili, 2),
                "n_mutui": len(mutui),
                "debito_mutui": round(gest_debito_mutui, 2),
            },
            "liquidita_live": round(liquidita_live, 2),
            "liquidita_delta_post_bilancio": round(delta_post, 2),
            "n_movimenti_post_bilancio": n_post,
            "patrimonio_netto_reale": round(pn_reale, 2),
            "delta_pn": round(pn_reale - bil_pn, 2),
        }

    @router.get("/properties/{pid}")
    async def get_property(pid: str, user: dict = Depends(current_user)):
        p = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="Immobile non trovato")
        alerts = await db.alerts.find({"user_id": user["id"], "immobile_id": pid}, {"_id": 0}).to_list(500)
        incassi = await db.incassi.find({"user_id": user["id"], "immobile_id": pid}, {"_id": 0}).to_list(500)
        from routers.settings import get_user_settings
        settings = await get_user_settings(db, user["id"])
        p = _enrich_property(p, settings)
        p = apply_dynamic_score(p, {pid: alerts}, {pid: incassi})
        return p

    @router.post("/properties")
    async def create_property(p: PropertyIn, user: dict = Depends(current_user)):
        from routers.settings import get_user_settings
        settings = await get_user_settings(db, user["id"])
        item = {
            "id": f"IMM-{uuid.uuid4().hex[:6].upper()}",
            "user_id": user["id"],
            **p.model_dump(),
            "fromDeal": False,
            "deal_id": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.properties.insert_one(item.copy())
        item.pop("_id", None)
        return _enrich_property(item, settings)

    @router.delete("/properties/{pid}")
    async def delete_property(pid: str, user: dict = Depends(current_user)):
        await db.properties.delete_one({"id": pid, "user_id": user["id"]})
        return {"ok": True}

    @router.patch("/properties/{pid}")
    async def update_property(pid: str, payload: dict, user: dict = Depends(current_user)):
        """Update generico per Anagrafica / Acquisto / Economico / Mutuo / Stato.

        Whitelist dei campi modificabili per evitare update accidentali di
        user_id, id, created_at o di campi calcolati.
        """
        ALLOWED = {
            # Anagrafica
            "nome", "indirizzo", "citta", "provincia", "cap", "tipologia",
            "metratura", "piano", "anno_costruzione", "classe_energetica",
            "rendita_catastale", "valore_catastale",
            # Stato
            "stato", "operazione", "note", "img",
            # Acquisto
            "data_acquisto", "prezzo_acquisto", "notaio", "agenzia",
            "imposte", "spese_tecniche", "lavori",
            # Valore
            "valore_stimato",
            # Economico / Locazione minimi
            "canone_mensile", "spese_condominiali", "deposito",
        }
        data = {}
        for k, v in (payload or {}).items():
            if k not in ALLOWED:
                continue
            # Cast a numero per campi numerici
            if k in {"metratura", "anno_costruzione", "rendita_catastale", "valore_catastale",
                     "prezzo_acquisto", "notaio", "agenzia", "imposte", "spese_tecniche",
                     "lavori", "valore_stimato", "canone_mensile", "spese_condominiali", "deposito"}:
                try:
                    data[k] = float(v) if v not in (None, "") else 0.0
                except (ValueError, TypeError):
                    raise HTTPException(status_code=400, detail=f"Valore non valido per {k}")
            else:
                data[k] = v if v is not None else ""
        # Gestione mutuo annidato (sottooggetto separato)
        if "mutuo" in (payload or {}):
            m = payload["mutuo"]
            if m is None:
                data["mutuo"] = None
            elif isinstance(m, dict):
                mutuo_clean = {}
                for k in ["banca", "tipo_tasso", "data_fine", "data_inizio"]:
                    if k in m and m[k] is not None:
                        mutuo_clean[k] = str(m[k])
                for k in ["importo_originario", "residuo", "rata", "tasso", "durata_anni"]:
                    if k in m and m[k] not in (None, ""):
                        try:
                            mutuo_clean[k] = float(m[k])
                        except (ValueError, TypeError):
                            raise HTTPException(status_code=400, detail=f"Mutuo: valore non valido per {k}")
                data["mutuo"] = mutuo_clean if mutuo_clean else None

        if not data:
            raise HTTPException(status_code=400, detail="Nessun campo modificabile fornito")
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.properties.update_one(
            {"id": pid, "user_id": user["id"]},
            {"$set": data},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Immobile non trovato")
        p = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
        from routers.settings import get_user_settings
        settings = await get_user_settings(db, user["id"])
        return _enrich_property(p, settings)

    @router.patch("/properties/{pid}/locazione")
    async def update_locazione(pid: str, payload: LocazioneIn, user: dict = Depends(current_user)):
        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        if not data:
            raise HTTPException(status_code=400, detail="Nessun campo fornito")
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.properties.update_one(
            {"id": pid, "user_id": user["id"]},
            {"$set": data},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Immobile non trovato")
        p = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
        # Auto-genera incassi previsti per i 12 mesi successivi se canone + data_inizio_contratto presenti
        gen = await _generate_expected_incassi(db, user["id"], p)
        from routers.settings import get_user_settings
        settings = await get_user_settings(db, user["id"])
        result = _enrich_property(p, settings)
        result["incassi_generated"] = gen
        return result


    @router.post("/deals/{deal_id}/convert")
    async def convert_deal_to_property(deal_id: str, ov: ConvertDealIn, user: dict = Depends(current_user)):
        deal = await db.deals.find_one({"id": deal_id, "user_id": user["id"]}, {"_id": 0})
        if not deal:
            raise HTTPException(status_code=404, detail="Deal non trovato")
        today = datetime.now(timezone.utc).date().isoformat()
        item = {
            "id": f"IMM-{uuid.uuid4().hex[:6].upper()}",
            "user_id": user["id"],
            "nome": deal.get("titolo", "Immobile da deal"),
            "indirizzo": deal.get("zona", ""),
            "citta": deal.get("citta", ""),
            "provincia": "",
            "tipologia": deal.get("tipologia", "Altro"),
            "metratura": float(deal.get("metratura", 0) or 0),
            "piano": deal.get("piano", ""),
            "anno_costruzione": int(deal.get("anno_costruzione", 0) or 0),
            "classe_energetica": deal.get("classe_energetica", ""),
            "stato": ov.stato or "acquistato",
            "operazione": ov.operazione or "reddito",
            "prezzo_acquisto": float(deal.get("prezzo", 0) or 0),
            "notaio": float(ov.notaio or 0),
            "agenzia": float(ov.agenzia or 0),
            "imposte": float(ov.imposte or 0),
            "lavori": float(ov.lavori or 0),
            "valore_stimato": float(deal.get("prezzo", 0) or 0),
            "canone_mensile": float(deal.get("canone_stimato", 0) or 0),
            "data_acquisto": ov.data_acquisto or today,
            "mutuo": ov.mutuo,
            "note": ov.note or deal.get("descrizione_breve", ""),
            "img": "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?crop=entropy&cs=srgb&fm=jpg&w=800",
            "fromDeal": True,
            "deal_id": deal_id,
            "deal_score": deal.get("deal_score"),
            "punti_forza": deal.get("punti_forza", []),
            "punti_attenzione": deal.get("punti_attenzione", []),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.properties.insert_one(item.copy())
        await db.deals.update_one(
            {"id": deal_id, "user_id": user["id"]},
            {"$set": {"status": "convertito", "converted_property_id": item["id"],
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        item.pop("_id", None)
        from routers.settings import get_user_settings
        settings = await get_user_settings(db, user["id"])
        return _enrich_property(item, settings)

    return router
