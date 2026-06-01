"""Archivio documenti — upload/list/download/delete con base64 storage in MongoDB."""
import io
import json
import uuid
import base64
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response

# Limite 15 MB per file (BSON cap 16 MB → margine sicurezza)
MAX_BYTES = 15 * 1024 * 1024
ALLOWED_TIPI = {"Rogito", "APE", "Contratto", "Fattura", "Planimetria", "Visura", "Altro"}
MIME_BY_EXT = {
    "pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg",
    "jpeg": "image/jpeg", "webp": "image/webp", "tiff": "image/tiff", "tif": "image/tiff",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _ocr_image_bytes(content: bytes) -> str:
    """Esegue OCR Tesseract su un'immagine. Lingua: italiano + inglese."""
    try:
        from PIL import Image
        import pytesseract
        img = Image.open(io.BytesIO(content))
        # Migliora contrasto su immagini chiare (scansioni)
        if img.mode != "RGB":
            img = img.convert("RGB")
        # Tesseract con ita+eng (per documenti italiani contenenti termini tecnici inglesi)
        text = pytesseract.image_to_string(img, lang="ita+eng", config="--psm 6")
        return text or ""
    except Exception as e:
        logging.exception("OCR image failed")
        raise HTTPException(400, f"Errore OCR: {e}")


def _ocr_pdf_pages(pdf_bytes: bytes, max_pages: int = 10) -> str:
    """OCR di un PDF scansionato (rasterizza ogni pagina e applica Tesseract)."""
    try:
        from PIL import Image
        import pytesseract
        # Uso pdfplumber per ottenere le immagini delle pagine (ha .to_image())
        import pdfplumber
        pages_text = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for i, page in enumerate(pdf.pages[:max_pages]):
                try:
                    pil_img = page.to_image(resolution=200).original
                    if pil_img.mode != "RGB":
                        pil_img = pil_img.convert("RGB")
                    page_text = pytesseract.image_to_string(pil_img, lang="ita+eng", config="--psm 6")
                    pages_text.append(f"--- Pagina {i+1} (OCR) ---\n{page_text or ''}")
                except Exception as ex:
                    logging.warning(f"OCR pagina {i+1} fallito: {ex}")
        return "\n\n".join(pages_text)
    except Exception as e:
        logging.exception("OCR PDF failed")
        return ""


def make_documents_router(db, current_user, llm_key: str = ""):
    router = APIRouter(prefix="/api/documents")

    @router.get("")
    async def list_documents(immobile_id: Optional[str] = None, tipo: Optional[str] = None,
                              user: dict = Depends(current_user)):
        q = {"user_id": user["id"]}
        if immobile_id:
            q["immobile_id"] = immobile_id
        if tipo:
            q["tipo"] = tipo
        items = await db.documents.find(q, {"_id": 0, "content_base64": 0}).sort("created_at", -1).to_list(500)
        return items

    @router.post("")
    async def upload_document(
        file: UploadFile = File(...),
        nome: Optional[str] = Form(None),
        tipo: str = Form("Altro"),
        immobile_id: Optional[str] = Form(None),
        user: dict = Depends(current_user),
    ):
        if tipo not in ALLOWED_TIPI:
            raise HTTPException(400, f"Tipo non valido. Usa uno di: {sorted(ALLOWED_TIPI)}")
        content = await file.read()
        if len(content) > MAX_BYTES:
            raise HTTPException(413, f"File troppo grande: {len(content)/1024/1024:.1f} MB (max 15 MB)")
        if len(content) == 0:
            raise HTTPException(400, "File vuoto")
        ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
        mime = file.content_type or MIME_BY_EXT.get(ext, "application/octet-stream")
        doc = {
            "id": f"D-{uuid.uuid4().hex[:8].upper()}",
            "user_id": user["id"],
            "nome": nome or file.filename or "documento.pdf",
            "tipo": tipo,
            "immobile_id": immobile_id or None,
            "dimensione_bytes": len(content),
            "dimensione": _human_size(len(content)),
            "mime_type": mime,
            "content_base64": base64.b64encode(content).decode("ascii"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "caricato": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        }
        await db.documents.insert_one(doc.copy())
        doc.pop("content_base64", None)
        doc.pop("_id", None)
        return doc

    @router.get("/{doc_id}/file")
    async def download_document(doc_id: str, user: dict = Depends(current_user)):
        d = await db.documents.find_one({"id": doc_id, "user_id": user["id"]})
        if not d:
            raise HTTPException(404, "Documento non trovato")
        content = base64.b64decode(d.get("content_base64", ""))
        filename = d.get("nome", "documento.bin")
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return Response(content=content, media_type=d.get("mime_type", "application/octet-stream"), headers=headers)

    @router.delete("/{doc_id}")
    async def delete_document(doc_id: str, user: dict = Depends(current_user)):
        res = await db.documents.delete_one({"id": doc_id, "user_id": user["id"]})
        if res.deleted_count == 0:
            raise HTTPException(404, "Documento non trovato")
        return {"deleted": doc_id}

    @router.post("/{doc_id}/analyze")
    async def analyze_document(doc_id: str, user: dict = Depends(current_user)):
        """AI Document Reader: estrae testo dal PDF e usa Claude per produrre dati strutturati."""
        if not llm_key:
            raise HTTPException(500, "LLM key non configurata")
        d = await db.documents.find_one({"id": doc_id, "user_id": user["id"]})
        if not d:
            raise HTTPException(404, "Documento non trovato")

        # Cached analysis se presente
        if d.get("ai_analysis") and d.get("ai_analyzed_at"):
            return {"analysis": d["ai_analysis"], "cached": True, "analyzed_at": d["ai_analyzed_at"]}

        content = base64.b64decode(d.get("content_base64", ""))
        mime = d.get("mime_type", "")
        text = ""
        if mime == "application/pdf":
            try:
                import pdfplumber
                with pdfplumber.open(io.BytesIO(content)) as pdf:
                    pages = []
                    for i, page in enumerate(pdf.pages[:15]):  # max 15 pagine
                        t = page.extract_text() or ""
                        pages.append(f"--- Pagina {i+1} ---\n{t}")
                text = "\n\n".join(pages)
                # Fallback OCR se PDF scansionato (no testo estratto)
                if len(text.replace("---", "").replace("Pagina", "").strip()) < 30:
                    logging.info(f"PDF {doc_id}: testo vuoto, tentativo OCR pagine come immagini")
                    text = _ocr_pdf_pages(content, max_pages=10)
            except Exception as e:
                logging.exception("PDF extract failed")
                raise HTTPException(400, f"Impossibile estrarre testo dal PDF: {e}")
        elif mime.startswith("text/"):
            try:
                text = content.decode("utf-8", errors="ignore")
            except Exception:
                text = ""
        elif mime.startswith("image/"):
            text = _ocr_image_bytes(content)
            if not text.strip():
                raise HTTPException(400, "OCR non ha estratto testo dall'immagine. Verifica risoluzione/contrasto del file.")
        else:
            raise HTTPException(400, f"Tipo file non supportato per analisi: {mime}")

        if not text.strip():
            raise HTTPException(400, "Documento vuoto o non leggibile (nessun testo estratto). Potrebbe essere uno scan immagine senza OCR.")

        # Trunca per evitare token limit (claude ha 200k ctx, ma teniamo basso)
        text_short = text[:18000]

        tipo = d.get("tipo", "Altro")
        nome = d.get("nome", "documento")
        prompts = _prompt_by_tipo(tipo)

        sys_msg = (
            "Sei un esperto di analisi documentale immobiliare italiana. "
            "Analizza il documento qui sotto e produci SOLO JSON valido (niente testo prima o dopo, niente markdown). "
            f"Schema atteso per tipo «{tipo}»:\n{prompts['schema']}\n\n"
            "Regole:\n"
            "- Se un campo non è presente nel documento, usa null (NON inventare).\n"
            "- Importi in euro (numeri, senza simbolo).\n"
            "- Date in formato YYYY-MM-DD.\n"
            "- In `anomalie` segnala incongruenze, clausole rischiose, scadenze imminenti, importi sospetti.\n"
            "- In `summary` scrivi 2-3 frasi di sintesi esecutiva in italiano.\n\n"
            f"=== DOCUMENTO «{nome}» ({tipo}) ===\n"
            + text_short
        )
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=llm_key,
                session_id=f"doc-analyze-{doc_id}",
                system_message=sys_msg,
            ).with_model("anthropic", "claude-sonnet-4-6")
            reply = await chat.send_message(UserMessage(text="Estrai i dati strutturati del documento."))
        except Exception as e:
            logging.exception("AI analyze error")
            raise HTTPException(500, f"AI error: {str(e)}")

        # parse robust
        analysis: dict = {}
        try:
            t = reply.strip()
            if "```" in t:
                import re as _re
                m = _re.search(r"```(?:json)?\s*([\s\S]*?)```", t)
                if m:
                    t = m.group(1).strip()
            s = t.find("{")
            e = t.rfind("}")
            if s != -1 and e > s:
                t = t[s:e+1]
            analysis = json.loads(t)
        except Exception as ex:
            logging.warning(f"Parse analyze failed: {ex}; raw: {reply[:200]}")
            analysis = {"raw_text": reply[:2000], "parse_error": True, "summary": reply[:500]}

        now = datetime.now(timezone.utc).isoformat()
        await db.documents.update_one(
            {"id": doc_id, "user_id": user["id"]},
            {"$set": {"ai_analysis": analysis, "ai_analyzed_at": now}}
        )

        # Auto-generate alerts dalle anomalie + scadenze estratte
        alerts_gen = await _generate_alerts_from_analysis(db, user["id"], d, analysis, now)
        return {"analysis": analysis, "cached": False, "analyzed_at": now, "alerts_generated": alerts_gen}

    return router


async def _generate_alerts_from_analysis(db, user_id: str, doc: dict, analysis: dict, now_iso: str) -> int:
    """Genera alert dal contenuto AI: anomalie + date di scadenza < 180gg."""
    from datetime import date as _date
    doc_id = doc.get("id")
    doc_name = doc.get("nome", "documento")
    immobile_id = doc.get("immobile_id")
    tipo = doc.get("tipo", "Altro")

    # cancella vecchi alert auto-generated da questo documento
    await db.alerts.delete_many({"user_id": user_id, "source_doc_id": doc_id})

    alerts = []

    # 1) Anomalie → alert tipo documentale
    anomalie = analysis.get("anomalie") or []
    for i, anom in enumerate(anomalie):
        text = str(anom).strip()
        if not text or len(text) < 10:
            continue
        # severity bassa/media in base a keyword
        sev = "media" if any(k in text.lower() for k in ["nulla", "non valida", "scaduto", "illegittim", "rischio", "antiabuso"]) else "bassa"
        alerts.append({
            "id": f"A-DOC-{doc_id}-anom-{i}",
            "user_id": user_id,
            "tipo": "documentale",
            "severity": sev,
            "titolo": f"Anomalia · {tipo} {doc_name[:40]}",
            "descrizione": text[:500],
            "immobile_id": immobile_id,
            "ts": now_iso,
            "auto_generated": True,
            "source_doc_id": doc_id,
            "kind": "doc_anomalia",
        })

    # 2) Date scadenza → alert se entro 180gg
    date_fields = [
        ("data_scadenza", "Scadenza documento"),
        ("data_fine", "Scadenza contratto"),
        ("data_fine_prima_scadenza", "Prima scadenza contratto"),
        ("scadenza_pagamento", "Scadenza pagamento fattura"),
    ]
    for field, label in date_fields:
        val = analysis.get(field)
        if not val or not isinstance(val, str):
            continue
        try:
            target = _date.fromisoformat(val[:10])
        except Exception:
            continue
        days = (target - _date.today()).days
        if days > 180:  # troppo lontano
            continue
        if days < -7:  # già passato da più di una settimana → non spammare
            continue
        if days < 0:
            sev = "alta"
            titolo = f"{label} SCADUTA · {tipo}"
            desc = f"«{doc_name}» — scadenza {val[:10]}: scaduta da {-days} giorni."
        elif days <= 30:
            sev = "alta"
            titolo = f"{label} imminente · {tipo}"
            desc = f"«{doc_name}» — scadenza {val[:10]}: mancano {days} giorni."
        elif days <= 60:
            sev = "media"
            titolo = f"{label} in approssimazione · {tipo}"
            desc = f"«{doc_name}» — scadenza {val[:10]}: mancano {days} giorni."
        else:
            sev = "bassa"
            titolo = f"{label} · {tipo}"
            desc = f"«{doc_name}» — scadenza {val[:10]}: mancano {days} giorni."
        alerts.append({
            "id": f"A-DOC-{doc_id}-scad-{field}",
            "user_id": user_id,
            "tipo": "documentale",
            "severity": sev,
            "titolo": titolo,
            "descrizione": desc,
            "immobile_id": immobile_id,
            "ts": now_iso,
            "days_remaining": days,
            "scadenza": val[:10],
            "auto_generated": True,
            "source_doc_id": doc_id,
            "kind": "doc_scadenza",
        })

    if alerts:
        await db.alerts.insert_many([a.copy() for a in alerts])
    return len(alerts)


def _prompt_by_tipo(tipo: str) -> dict:
    """Schema JSON e suggerimenti per tipo documento."""
    if tipo == "Rogito":
        return {"schema": (
            '{"summary": "...", "data_atto": "YYYY-MM-DD", "notaio": "...", "venditore": "...", "acquirente": "...", '
            '"immobile_indirizzo": "...", "comune": "...", "categoria_catastale": "...", "foglio": "...", "particella": "...", "subalterno": "...", '
            '"prezzo": 0, "imposta_registro": 0, "iva": 0, "ipoteca_eventuale": "...", "spese_notarili": 0, '
            '"clausole_rilevanti": ["..."], "anomalie": ["..."]}'
        )}
    if tipo == "Contratto":
        return {"schema": (
            '{"summary": "...", "data_stipula": "YYYY-MM-DD", "tipo_contratto": "libero/concordato/transitorio/commerciale", '
            '"locatore": "...", "conduttore": "...", "immobile_indirizzo": "...", "durata_anni": 0, '
            '"data_inizio": "YYYY-MM-DD", "data_fine": "YYYY-MM-DD", "canone_mensile": 0, "deposito_cauzionale": 0, '
            '"aggiornamento_istat": true, "spese_condominiali_a_carico": "locatore/conduttore", '
            '"rinnovo_automatico": true, "clausole_rilevanti": ["..."], "anomalie": ["..."]}'
        )}
    if tipo == "APE":
        return {"schema": (
            '{"summary": "...", "classe_energetica": "A/B/C/D/E/F/G", "indice_ep_globale": 0.0, '
            '"data_emissione": "YYYY-MM-DD", "data_scadenza": "YYYY-MM-DD", '
            '"immobile_indirizzo": "...", "certificatore": "...", "anomalie": ["..."]}'
        )}
    if tipo == "Fattura":
        return {"schema": (
            '{"summary": "...", "numero": "...", "data_emissione": "YYYY-MM-DD", "data_scadenza": "YYYY-MM-DD", '
            '"emittente": "...", "destinatario": "...", "imponibile": 0, "iva": 0, "totale": 0, '
            '"descrizione": "...", "modalita_pagamento": "...", "anomalie": ["..."]}'
        )}
    if tipo == "Visura":
        return {"schema": (
            '{"summary": "...", "data_consultazione": "YYYY-MM-DD", "intestatari": ["..."], '
            '"comune": "...", "foglio": "...", "particella": "...", "subalterno": "...", '
            '"categoria_catastale": "...", "classe": "...", "rendita_catastale": 0, '
            '"superficie_catastale": 0, "vani": 0, "anomalie": ["..."]}'
        )}
    if tipo == "Planimetria":
        return {"schema": (
            '{"summary": "...", "data_planimetria": "YYYY-MM-DD", "comune": "...", "foglio": "...", "particella": "...", '
            '"superficie_totale_mq": 0, "vani_principali": 0, "vani_accessori": 0, "anomalie": ["..."]}'
        )}
    # Altro
    return {"schema": '{"summary": "...", "tipo_documento_rilevato": "...", "dati_principali": {...}, "anomalie": ["..."]}'}


def _human_size(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n/1024:.1f} KB"
    return f"{n/1024/1024:.1f} MB"
