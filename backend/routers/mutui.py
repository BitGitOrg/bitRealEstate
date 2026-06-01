"""Mutui & Finanziamenti — CRUD + AI PDF parsing (Claude Sonnet 4.6).

Gestisce il portafoglio mutui collegati agli immobili.
Supporta:
- Inserimento manuale via form
- Importazione PDF contratto banca (AI parser)
- Calcolo piano di ammortamento (alla francese)
- KPI aggregati (debito totale, LTV, incidenza su affitti)
"""
import io
import json
import uuid
import base64
import logging
from datetime import datetime, timezone, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel


class MutuoIn(BaseModel):
    immobile_id: Optional[str] = None
    banca: str
    tipo_tasso: Optional[str] = "fisso"  # fisso | variabile | misto
    importo_originario: float
    capitale_residuo: Optional[float] = None
    tasso: float
    durata_anni: int
    rata_mensile: float
    data_inizio: Optional[str] = None
    data_fine: Optional[str] = None
    spread: Optional[float] = None
    parametro_riferimento: Optional[str] = None  # es. EURIBOR 3M / IRS 10Y
    garanzie: Optional[str] = None
    ipoteca_importo: Optional[float] = None
    note: Optional[str] = ""


class MutuoPatch(BaseModel):
    immobile_id: Optional[str] = None
    banca: Optional[str] = None
    tipo_tasso: Optional[str] = None
    importo_originario: Optional[float] = None
    capitale_residuo: Optional[float] = None
    tasso: Optional[float] = None
    durata_anni: Optional[int] = None
    rata_mensile: Optional[float] = None
    data_inizio: Optional[str] = None
    data_fine: Optional[str] = None
    spread: Optional[float] = None
    parametro_riferimento: Optional[str] = None
    garanzie: Optional[str] = None
    ipoteca_importo: Optional[float] = None
    note: Optional[str] = None


def _compute_ammortamento(importo: float, tasso_annuo: float, durata_anni: int, rata: float, data_inizio: Optional[str]):
    """Piano di ammortamento alla francese (rata costante).
    Restituisce lista mese-per-mese: {mese_idx, data, rata, quota_capitale, quota_interessi, capitale_residuo}
    """
    if importo <= 0 or tasso_annuo < 0 or durata_anni <= 0 or rata <= 0:
        return []
    n = durata_anni * 12
    i_m = (tasso_annuo / 100) / 12  # tasso mensile
    capitale = importo
    piano = []
    try:
        start = date.fromisoformat(data_inizio[:10]) if data_inizio else date.today()
    except Exception:
        start = date.today()
    for k in range(1, n + 1):
        interessi = capitale * i_m
        quota_cap = rata - interessi
        capitale = max(0.0, capitale - quota_cap)
        m_year = start.year + (start.month - 1 + (k - 1)) // 12
        m_month = (start.month - 1 + (k - 1)) % 12 + 1
        piano.append({
            "mese_idx": k,
            "data": f"{m_year}-{m_month:02d}-01",
            "rata": round(rata, 2),
            "quota_interessi": round(max(0, interessi), 2),
            "quota_capitale": round(max(0, quota_cap), 2),
            "capitale_residuo": round(capitale, 2),
        })
        if capitale <= 0:
            break
    return piano


def _residuo_corrente(piano: list) -> Optional[float]:
    """Stima il capitale residuo OGGI in base al piano di ammortamento."""
    today = date.today()
    today_str = today.isoformat()
    last = None
    for row in piano:
        if row["data"][:10] <= today_str:
            last = row
        else:
            break
    return last["capitale_residuo"] if last else None


async def _enrich_mutuo(db, user_id: str, m: dict) -> dict:
    """Aggiunge dati derivati: piano di ammortamento riassuntivo, capitale_residuo aggiornato,
    interessi residui, immobile collegato."""
    out = {**m}
    out.pop("_id", None)
    piano = _compute_ammortamento(
        float(m.get("importo_originario", 0) or 0),
        float(m.get("tasso", 0) or 0),
        int(m.get("durata_anni", 0) or 0),
        float(m.get("rata_mensile", 0) or 0),
        m.get("data_inizio"),
    )
    residuo_calc = _residuo_corrente(piano) if piano else None
    # Se utente ha inserito capitale_residuo manuale e piano calcola, prendi il manuale
    residuo_finale = m.get("capitale_residuo") if m.get("capitale_residuo") not in (None, 0) else residuo_calc
    interessi_totali = sum(r["quota_interessi"] for r in piano) if piano else 0
    interessi_pagati = sum(r["quota_interessi"] for r in piano if r["data"][:10] <= date.today().isoformat()) if piano else 0
    out["capitale_residuo_calcolato"] = round(residuo_calc, 2) if residuo_calc is not None else None
    out["capitale_residuo"] = round(residuo_finale, 2) if residuo_finale is not None else None
    out["interessi_totali"] = round(interessi_totali, 2)
    out["interessi_residui"] = round(max(0, interessi_totali - interessi_pagati), 2)
    out["rate_totali"] = len(piano)
    out["rate_pagate"] = sum(1 for r in piano if r["data"][:10] <= date.today().isoformat()) if piano else 0
    out["rate_residue"] = max(0, out["rate_totali"] - out["rate_pagate"])
    # Immobile name (helper for UI)
    if m.get("immobile_id"):
        p = await db.properties.find_one({"id": m["immobile_id"], "user_id": user_id}, {"_id": 0, "nome": 1, "valore_stimato": 1, "prezzo_acquisto": 1})
        if p:
            out["immobile_nome"] = p.get("nome")
            valore = p.get("valore_stimato") or p.get("prezzo_acquisto") or 0
            out["ltv_pct"] = round((residuo_finale or 0) / valore * 100, 1) if valore else None
    return out


def make_mutui_router(db, current_user, llm_key: str = ""):
    router = APIRouter(prefix="/api/mutui")

    @router.get("")
    async def list_mutui(immobile_id: Optional[str] = None, user: dict = Depends(current_user)):
        q = {"user_id": user["id"]}
        if immobile_id:
            q["immobile_id"] = immobile_id
        items = await db.mutui.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
        out = []
        for m in items:
            out.append(await _enrich_mutuo(db, user["id"], m))
        return out

    @router.get("/aggregato")
    async def aggregato(user: dict = Depends(current_user)):
        """KPI di portafoglio per la pagina Mutui."""
        items = await db.mutui.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
        debito_totale = 0.0
        rata_totale = 0.0
        interessi_residui = 0.0
        valore_immobili_garanzia = 0.0
        for m in items:
            e = await _enrich_mutuo(db, user["id"], m)
            debito_totale += e.get("capitale_residuo") or 0
            rata_totale += float(e.get("rata_mensile") or 0)
            interessi_residui += e.get("interessi_residui") or 0
            if m.get("immobile_id"):
                p = await db.properties.find_one({"id": m["immobile_id"], "user_id": user["id"]}, {"_id": 0})
                if p:
                    valore_immobili_garanzia += float(p.get("valore_stimato") or p.get("prezzo_acquisto") or 0)
        # ricavi mensili da affitti per incidenza
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        ricavi_mensili = sum(float(p.get("canone_mensile") or 0) for p in props)
        return {
            "n_mutui": len(items),
            "debito_totale": round(debito_totale, 2),
            "rata_totale": round(rata_totale, 2),
            "interessi_residui": round(interessi_residui, 2),
            "ltv_pct": round(debito_totale / valore_immobili_garanzia * 100, 1) if valore_immobili_garanzia else None,
            "ricavi_mensili": round(ricavi_mensili, 2),
            "incidenza_rata_su_affitti_pct": round(rata_totale / ricavi_mensili * 100, 1) if ricavi_mensili else None,
        }

    @router.post("")
    async def create_mutuo(payload: MutuoIn, user: dict = Depends(current_user)):
        data = payload.model_dump()
        # default capitale residuo = importo originario se non specificato
        if data.get("capitale_residuo") is None:
            data["capitale_residuo"] = data["importo_originario"]
        # calcola data_fine se manca
        if not data.get("data_fine") and data.get("data_inizio") and data.get("durata_anni"):
            try:
                d0 = date.fromisoformat(data["data_inizio"][:10])
                anno_fine = d0.year + int(data["durata_anni"])
                data["data_fine"] = f"{anno_fine}-{d0.month:02d}-{d0.day:02d}"
            except Exception:
                pass
        item = {
            "id": f"MUT-{uuid.uuid4().hex[:6].upper()}",
            "user_id": user["id"],
            **data,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.mutui.insert_one(item.copy())
        # Aggiorna anche il mini-record `mutuo` sull'immobile per backwards-compat
        if data.get("immobile_id"):
            await db.properties.update_one(
                {"id": data["immobile_id"], "user_id": user["id"]},
                {"$set": {"mutuo": {
                    "id": item["id"],
                    "banca": data["banca"],
                    "residuo": data.get("capitale_residuo"),
                    "rata": data.get("rata_mensile"),
                    "tasso": data.get("tasso"),
                }}}
            )
        return await _enrich_mutuo(db, user["id"], item)

    @router.patch("/{mid}")
    async def update_mutuo(mid: str, payload: MutuoPatch, user: dict = Depends(current_user)):
        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        if not data:
            raise HTTPException(400, "Nessun campo da aggiornare")
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.mutui.update_one({"id": mid, "user_id": user["id"]}, {"$set": data})
        if res.matched_count == 0:
            raise HTTPException(404, "Mutuo non trovato")
        m = await db.mutui.find_one({"id": mid, "user_id": user["id"]})
        if m and m.get("immobile_id"):
            await db.properties.update_one(
                {"id": m["immobile_id"], "user_id": user["id"]},
                {"$set": {"mutuo": {
                    "id": m["id"],
                    "banca": m.get("banca"),
                    "residuo": m.get("capitale_residuo"),
                    "rata": m.get("rata_mensile"),
                    "tasso": m.get("tasso"),
                }}}
            )
        return await _enrich_mutuo(db, user["id"], m)

    @router.delete("/{mid}")
    async def delete_mutuo(mid: str, user: dict = Depends(current_user)):
        m = await db.mutui.find_one({"id": mid, "user_id": user["id"]})
        if not m:
            raise HTTPException(404, "Mutuo non trovato")
        await db.mutui.delete_one({"id": mid, "user_id": user["id"]})
        if m.get("immobile_id"):
            await db.properties.update_one(
                {"id": m["immobile_id"], "user_id": user["id"]},
                {"$unset": {"mutuo": ""}}
            )
        return {"deleted": mid}

    @router.get("/{mid}/ammortamento")
    async def piano(mid: str, user: dict = Depends(current_user)):
        m = await db.mutui.find_one({"id": mid, "user_id": user["id"]}, {"_id": 0})
        if not m:
            raise HTTPException(404, "Mutuo non trovato")
        piano = _compute_ammortamento(
            float(m.get("importo_originario", 0) or 0),
            float(m.get("tasso", 0) or 0),
            int(m.get("durata_anni", 0) or 0),
            float(m.get("rata_mensile", 0) or 0),
            m.get("data_inizio"),
        )
        return {"mutuo_id": mid, "piano": piano, "totale_rate": len(piano)}

    @router.post("/parse-pdf")
    async def parse_pdf(file: UploadFile = File(...), user: dict = Depends(current_user)):
        """Estrae i dati del mutuo da un PDF/scan del contratto banca usando Claude Sonnet 4.6.
        NON salva il mutuo: restituisce solo i campi parsati, l'utente li conferma e poi POST /api/mutui.
        """
        if not llm_key:
            raise HTTPException(500, "LLM key non configurata")
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(400, "File vuoto")
        if len(content) > 15 * 1024 * 1024:
            raise HTTPException(413, "File troppo grande (max 15 MB)")
        mime = file.content_type or ""
        text = ""
        if mime == "application/pdf" or (file.filename or "").lower().endswith(".pdf"):
            try:
                import pdfplumber
                with pdfplumber.open(io.BytesIO(content)) as pdf:
                    pages = []
                    for i, page in enumerate(pdf.pages[:20]):
                        t = page.extract_text() or ""
                        pages.append(f"--- Pagina {i+1} ---\n{t}")
                text = "\n\n".join(pages)
                if len(text.replace("---", "").replace("Pagina", "").strip()) < 30:
                    # Fallback OCR per scansioni
                    from routers.documents import _ocr_pdf_pages
                    text = _ocr_pdf_pages(content, max_pages=10)
            except Exception as e:
                logging.exception("PDF extract failed")
                raise HTTPException(400, f"Impossibile leggere il PDF: {e}")
        elif mime.startswith("image/"):
            from routers.documents import _ocr_image_bytes
            text = _ocr_image_bytes(content)
        else:
            raise HTTPException(400, f"Formato non supportato: {mime}. Carica un PDF o un'immagine.")

        if not text or len(text.strip()) < 30:
            raise HTTPException(400, "Documento illeggibile o senza testo estratto.")

        # Prompt AI per estrazione mutuo
        text_short = text[:18000]
        sys_msg = (
            "Sei un esperto di analisi di contratti di mutuo italiani. "
            "Analizza il testo del contratto qui sotto e produci SOLO JSON valido (niente testo prima o dopo, niente markdown, niente backticks).\n\n"
            "Schema JSON atteso:\n"
            "{\n"
            '  "banca": "string (es. Intesa Sanpaolo, UniCredit, ...)",\n'
            '  "tipo_tasso": "fisso | variabile | misto",\n'
            '  "importo_originario": numero EUR,\n'
            '  "capitale_residuo": numero EUR o null,\n'
            '  "tasso": numero percentuale (es. 3.85 per 3.85%),\n'
            '  "spread": numero percentuale o null,\n'
            '  "parametro_riferimento": "string (es. EURIBOR 3M, IRS 10Y) o null",\n'
            '  "durata_anni": numero intero,\n'
            '  "rata_mensile": numero EUR,\n'
            '  "data_inizio": "YYYY-MM-DD",\n'
            '  "data_fine": "YYYY-MM-DD",\n'
            '  "ipoteca_importo": numero EUR o null,\n'
            '  "garanzie": "string sintetica o null",\n'
            '  "note_ai": "2-3 frasi di sintesi del contratto + clausole rilevanti (penali estinzione, surroga, ecc.)",\n'
            '  "anomalie": ["clausole inusuali o rischiose, lista breve"]\n'
            "}\n\n"
            "Regole:\n"
            "- Se un campo non è presente nel documento, usa null (NON inventare).\n"
            "- Date in formato YYYY-MM-DD.\n"
            "- Importi in numeri (senza simbolo €).\n"
            "- Per il tasso: se misto, indica il tasso fisso iniziale; aggiungi note_ai con dettaglio.\n"
            "- Inserisci sempre `note_ai` (max 250 caratteri) con sintesi esecutiva.\n\n"
            "=== TESTO DEL CONTRATTO ===\n" + text_short
        )

        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=llm_key,
                session_id=f"mutuo-parse-{uuid.uuid4()}",
                system_message=sys_msg,
            ).with_model("anthropic", "claude-sonnet-4-6")
            reply = await chat.send_message(UserMessage(text="Estrai i dati strutturati del mutuo."))
        except Exception as e:
            logging.exception("AI parse mutuo error")
            raise HTTPException(500, f"Errore AI: {str(e)}")

        # parse robusto
        parsed: dict = {}
        try:
            t = reply.strip()
            if "```" in t:
                import re as _re
                mm = _re.search(r"```(?:json)?\s*([\s\S]*?)```", t)
                if mm:
                    t = mm.group(1).strip()
            s = t.find("{")
            e = t.rfind("}")
            if s != -1 and e > s:
                t = t[s:e+1]
            parsed = json.loads(t)
        except Exception as ex:
            logging.warning(f"Parse mutuo failed: {ex}; raw: {reply[:300]}")
            raise HTTPException(500, "L'AI non ha restituito JSON valido. Verifica che il PDF contenga davvero un contratto di mutuo.")

        # Validazioni minime
        if not parsed.get("importo_originario") or not parsed.get("banca"):
            raise HTTPException(422, "Impossibile riconoscere campi essenziali (banca e importo). Verifica il documento o inserisci manualmente.")

        return {
            "parsed": parsed,
            "raw_text_preview": text_short[:500],
        }

    return router
