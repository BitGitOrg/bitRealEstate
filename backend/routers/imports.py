"""Centro Import router — Immobili Excel, Bilanci AI, Estratto conto bancario."""
import io
import re
import json
import uuid
import hashlib
import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import openpyxl
import pdfplumber
import pandas as pd

from routers._shared import enrich_property as _enrich_property, coerce_float, coerce_int, coerce_str

IMMOBILI_COLUMNS = [
    "Nome immobile", "Indirizzo", "Città", "Provincia", "Tipologia", "Metratura (m²)",
    "Piano", "Anno costruzione", "Classe energetica", "Stato",
    "Data acquisto (YYYY-MM-DD)", "Prezzo acquisto (€)", "Notaio (€)", "Agenzia (€)",
    "Imposte (€)", "Lavori (€)", "Valore stimato (€)", "Canone mensile (€)",
    "Banca mutuo", "Capitale residuo (€)", "Rata mutuo (€)", "Tasso mutuo (%)",
    "Note",
]

IMMOBILI_EXAMPLE_ROW = [
    "Bilocale Navigli", "Via Vigevano 12", "Milano", "MI", "Bilocale", 58,
    "2", 1972, "D", "affittato",
    "2022-03-15", 215000, 4200, 6500,
    8900, 18000, 285000, 1450,
    "Intesa Sanpaolo", 95000, 540, 2.8,
    "Esempio — sostituisci con i tuoi dati",
]

BILANCIO_EXTRACT_PROMPT = (
    "Sei un sistema di estrazione dati da bilanci di società immobiliari italiane (Conto Economico + Stato Patrimoniale, "
    "tipicamente esportati da gestionali tipo Arca, Zucchetti, TeamSystem). "
    "Rispondi SOLO con JSON valido, niente prefissi, niente markdown. Schema:\n"
    '{\n'
    '  "periodo": "string es: Gennaio 2026 oppure Q1 2026 oppure 2025",\n'
    '  "tipo": "provvisorio|definitivo",\n'
    '  "conto_economico": {\n'
    '    "ricavi_affitti": numero,\n'
    '    "ricavi_vendite": numero,\n'
    '    "altri_ricavi": numero,\n'
    '    "totale_ricavi": numero,\n'
    '    "costi_gestione": numero,\n'
    '    "costi_manutenzione": numero,\n'
    '    "imu": numero,\n'
    '    "interessi_mutui": numero,\n'
    '    "ammortamenti": numero,\n'
    '    "altri_costi": numero,\n'
    '    "totale_costi": numero,\n'
    '    "utile_netto": numero\n'
    '  },\n'
    '  "stato_patrimoniale": {\n'
    '    "valore_immobili": numero,\n'
    '    "liquidita": numero,\n'
    '    "crediti": numero,\n'
    '    "totale_attivo": numero,\n'
    '    "debito_mutui": numero,\n'
    '    "altri_debiti": numero,\n'
    '    "totale_passivo": numero,\n'
    '    "patrimonio_netto": numero\n'
    '  },\n'
    '  "note_estrazione": "stringa breve con eventuali avvertenze"\n'
    "}\n"
    "Se un valore non è presente, metti 0. Gli importi sono in EUR. Se vedi importi in migliaia (k€), convertili in euro."
)


class ImportImmobiliCommit(BaseModel):
    rows: List[dict]


class BilancioCommit(BaseModel):
    periodo: str
    tipo: Optional[str] = "provvisorio"
    conto_economico: dict
    stato_patrimoniale: dict
    note_estrazione: Optional[str] = ""
    filename: Optional[str] = ""


class BancaCommit(BaseModel):
    movimenti: List[dict]


def _extract_text_from_upload(content: bytes, filename: str) -> str:
    fl = filename.lower()
    if fl.endswith(".pdf"):
        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                text = "\n".join((p.extract_text() or "") for p in pdf.pages[:20])
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"PDF non leggibile: {str(e)}")
        return text[:30000]
    if fl.endswith((".xlsx", ".xls")):
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Excel non leggibile: {str(e)}")
        parts = []
        for sn in wb.sheetnames[:5]:
            ws = wb[sn]
            parts.append(f"## Foglio: {sn}")
            for row in ws.iter_rows(values_only=True, max_row=200):
                line = " | ".join(str(c) if c is not None else "" for c in row)
                if line.strip(" |"):
                    parts.append(line)
        return "\n".join(parts)[:30000]
    if fl.endswith(".csv"):
        try:
            text = content.decode("utf-8", errors="ignore")
        except Exception:
            text = content.decode("latin-1", errors="ignore")
        return text[:30000]
    return content.decode("utf-8", errors="ignore")[:30000]


def _movimento_signature(user_id: str, m: dict) -> str:
    s = f"{user_id}|{m.get('data','')}|{round(float(m.get('importo',0) or 0), 2)}|{(m.get('descrizione','') or '')[:80].strip().lower()}"
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def make_imports_router(db, current_user, llm_key: str):
    router = APIRouter(prefix="/api/import")

    # ============= TEMPLATE & IMMOBILI =============
    @router.get("/template/immobili")
    async def download_immobili_template(user: dict = Depends(current_user)):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Immobili"
        for i, col in enumerate(IMMOBILI_COLUMNS, 1):
            c = ws.cell(row=1, column=i, value=col)
            c.font = openpyxl.styles.Font(bold=True, color="FFFFFF")
            c.fill = openpyxl.styles.PatternFill("solid", fgColor="0066FF")
            c.alignment = openpyxl.styles.Alignment(horizontal="center", vertical="center", wrap_text=True)
            ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = max(16, len(col) + 2)
        ws.row_dimensions[1].height = 32
        for i, v in enumerate(IMMOBILI_EXAMPLE_ROW, 1):
            ws.cell(row=2, column=i, value=v).font = openpyxl.styles.Font(italic=True, color="64748B")
        ws.freeze_panes = "A2"
        ws2 = wb.create_sheet("Istruzioni")
        ws2["A1"] = "Istruzioni compilazione template immobili"
        ws2["A1"].font = openpyxl.styles.Font(bold=True, size=14)
        notes = [
            "1. La prima riga è la riga di intestazione: NON modificarla.",
            "2. La seconda riga è un esempio: cancellala o sovrascrivila.",
            "3. Campi obbligatori: Nome immobile, Prezzo acquisto.",
            "4. Tipologia: Bilocale, Trilocale, Quadrilocale, Monolocale, Villa, Loft, Attico, Altro.",
            "5. Stato: in_valutazione, in_trattativa, acquistato, in_ristrutturazione, disponibile, affittato, sfitto, in_vendita, venduto.",
            "6. Date in formato YYYY-MM-DD (es. 2024-03-15).",
            "7. Importi senza simbolo €, usa il punto come separatore decimale (es. 1450.00).",
            "8. Se l'immobile non ha mutuo lascia vuoti i 4 campi mutuo.",
        ]
        for i, n in enumerate(notes, 3):
            ws2.cell(row=i, column=1, value=n)
        ws2.column_dimensions["A"].width = 90

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="template_immobili_control_room.xlsx"'},
        )

    @router.post("/immobili/parse")
    async def parse_immobili(file: UploadFile = File(...), user: dict = Depends(current_user)):
        content = await file.read()
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
            ws = wb["Immobili"] if "Immobili" in wb.sheetnames else wb.active
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"File Excel non valido: {str(e)}")

        rows = []
        errors_total = 0
        for row_idx in range(2, ws.max_row + 1):
            cells = [ws.cell(row=row_idx, column=i).value for i in range(1, len(IMMOBILI_COLUMNS) + 1)]
            if not any(cells):
                continue
            nome = coerce_str(cells[0])
            if not nome:
                continue
            prezzo = coerce_float(cells[11])
            warnings = []
            if prezzo <= 0:
                warnings.append("Prezzo acquisto mancante o non valido")
            item = {
                "_row": row_idx, "nome": nome, "indirizzo": coerce_str(cells[1]), "citta": coerce_str(cells[2]),
                "provincia": coerce_str(cells[3]), "tipologia": coerce_str(cells[4]) or "Altro",
                "metratura": coerce_float(cells[5]), "piano": coerce_str(cells[6]),
                "anno_costruzione": coerce_int(cells[7]), "classe_energetica": coerce_str(cells[8]),
                "stato": coerce_str(cells[9]) or "acquistato", "data_acquisto": coerce_str(cells[10]),
                "prezzo_acquisto": prezzo, "notaio": coerce_float(cells[12]),
                "agenzia": coerce_float(cells[13]), "imposte": coerce_float(cells[14]),
                "lavori": coerce_float(cells[15]), "valore_stimato": coerce_float(cells[16]) or prezzo,
                "canone_mensile": coerce_float(cells[17]), "mutuo_banca": coerce_str(cells[18]),
                "mutuo_residuo": coerce_float(cells[19]), "mutuo_rata": coerce_float(cells[20]),
                "mutuo_tasso": coerce_float(cells[21]), "note": coerce_str(cells[22]),
                "warnings": warnings, "valid": len(warnings) == 0,
            }
            if warnings:
                errors_total += 1
            rows.append(item)
        return {
            "filename": file.filename, "total_rows": len(rows),
            "valid_rows": sum(1 for r in rows if r["valid"]),
            "rows_with_warnings": errors_total, "rows": rows,
        }

    @router.post("/immobili/commit")
    async def commit_immobili(payload: ImportImmobiliCommit, user: dict = Depends(current_user)):
        created = []
        for r in payload.rows:
            if not r.get("valid", True):
                continue
            mutuo = None
            if r.get("mutuo_banca") and r.get("mutuo_residuo"):
                mutuo = {
                    "banca": r["mutuo_banca"], "residuo": float(r.get("mutuo_residuo", 0) or 0),
                    "rata": float(r.get("mutuo_rata", 0) or 0), "tasso": float(r.get("mutuo_tasso", 0) or 0),
                }
            item = {
                "id": f"IMM-{uuid.uuid4().hex[:6].upper()}", "user_id": user["id"],
                "nome": r["nome"], "indirizzo": r.get("indirizzo", ""), "citta": r.get("citta", ""),
                "provincia": r.get("provincia", ""), "tipologia": r.get("tipologia", "Altro"),
                "metratura": float(r.get("metratura", 0) or 0), "piano": r.get("piano", ""),
                "anno_costruzione": int(r.get("anno_costruzione", 0) or 0),
                "classe_energetica": r.get("classe_energetica", ""), "stato": r.get("stato", "acquistato"),
                "operazione": "reddito" if r.get("canone_mensile", 0) > 0 else "compra_vendi",
                "prezzo_acquisto": float(r.get("prezzo_acquisto", 0) or 0),
                "notaio": float(r.get("notaio", 0) or 0), "agenzia": float(r.get("agenzia", 0) or 0),
                "imposte": float(r.get("imposte", 0) or 0), "lavori": float(r.get("lavori", 0) or 0),
                "valore_stimato": float(r.get("valore_stimato", 0) or 0) or float(r.get("prezzo_acquisto", 0) or 0),
                "canone_mensile": float(r.get("canone_mensile", 0) or 0),
                "data_acquisto": r.get("data_acquisto", ""), "mutuo": mutuo, "note": r.get("note", ""),
                "img": "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?crop=entropy&cs=srgb&fm=jpg&w=800",
                "fromDeal": False, "deal_id": None, "source": "import_excel",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.properties.insert_one(item.copy())
            item.pop("_id", None)
            created.append(_enrich_property(item))
        return {"created": len(created), "items": created}

    # ============= BILANCI =============
    @router.post("/bilancio/parse")
    async def parse_bilancio(file: UploadFile = File(...), user: dict = Depends(current_user)):
        if not llm_key:
            raise HTTPException(status_code=500, detail="LLM key non configurata")
        content = await file.read()
        text = _extract_text_from_upload(content, file.filename or "")
        if not text.strip():
            raise HTTPException(status_code=400, detail="Impossibile estrarre testo dal file.")
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=llm_key, session_id=f"bilancio-{uuid.uuid4()}",
                system_message=BILANCIO_EXTRACT_PROMPT,
            ).with_model("anthropic", "claude-sonnet-4-6")
            reply = await chat.send_message(UserMessage(text=text))
        except Exception as e:
            logging.exception("AI bilancio error")
            raise HTTPException(status_code=500, detail=f"Errore AI: {str(e)}")
        parsed = None
        try:
            parsed = json.loads(reply)
        except Exception:
            m = re.search(r"\{[\s\S]*\}", reply)
            if m:
                try:
                    parsed = json.loads(m.group(0))
                except Exception:
                    parsed = None
        if not parsed:
            raise HTTPException(status_code=500, detail="L'AI non ha restituito JSON valido.")
        parsed["_filename"] = file.filename
        return parsed

    @router.post("/bilancio/commit")
    async def commit_bilancio(b: BilancioCommit, user: dict = Depends(current_user)):
        item = {
            "id": str(uuid.uuid4()), "user_id": user["id"], **b.model_dump(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.bilanci.insert_one(item.copy())
        item.pop("_id", None)
        return item

    @router.get("/bilanci")
    async def list_bilanci(user: dict = Depends(current_user)):
        items = await db.bilanci.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
        return items

    @router.get("/bilanci/storico")
    async def storico_bilanci(user: dict = Depends(current_user)):
        items = await db.bilanci.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
        if not items:
            return {"bilanci": [], "evoluzione": []}

        MESI_IT = {"gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
                   "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12}

        def periodo_key(b):
            p = (b.get("periodo") or "").lower().strip()
            for name, num in MESI_IT.items():
                if name in p:
                    m = re.search(r"(20\d{2})", p)
                    year = int(m.group(1)) if m else 0
                    return (year, num)
            m = re.search(r"q(\d)\s*(20\d{2})", p)
            if m:
                return (int(m.group(2)), int(m.group(1)) * 3)
            m = re.search(r"(20\d{2})", p)
            if m:
                return (int(m.group(1)), 0)
            return (0, 0)

        items_sorted_old_to_new = sorted(items, key=periodo_key)
        METRICS_CE = ["totale_ricavi", "ricavi_affitti", "totale_costi", "utile_netto"]
        METRICS_SP = ["valore_immobili", "debito_mutui", "liquidita", "patrimonio_netto"]

        def delta(curr, prev):
            if prev is None or prev == 0:
                return {"abs": curr, "pct": None}
            return {"abs": round(curr - prev, 2), "pct": round((curr - prev) / prev * 100, 2)}

        enriched = []
        for i, b in enumerate(items_sorted_old_to_new):
            prev = items_sorted_old_to_new[i - 1] if i > 0 else None
            ce = b.get("conto_economico", {}) or {}
            sp = b.get("stato_patrimoniale", {}) or {}
            diff_ce, diff_sp = {}, {}
            if prev:
                prev_ce = prev.get("conto_economico", {}) or {}
                prev_sp = prev.get("stato_patrimoniale", {}) or {}
                for k in METRICS_CE:
                    diff_ce[k] = delta(float(ce.get(k, 0) or 0), float(prev_ce.get(k, 0) or 0))
                for k in METRICS_SP:
                    diff_sp[k] = delta(float(sp.get(k, 0) or 0), float(prev_sp.get(k, 0) or 0))
            enriched.append({
                "id": b["id"], "periodo": b.get("periodo"), "tipo": b.get("tipo"),
                "created_at": b.get("created_at"),
                "conto_economico": ce, "stato_patrimoniale": sp,
                "diff_ce": diff_ce, "diff_sp": diff_sp,
            })

        evoluzione = [
            {
                "periodo": b["periodo"],
                "totale_ricavi": float((b["conto_economico"] or {}).get("totale_ricavi", 0) or 0),
                "totale_costi": float((b["conto_economico"] or {}).get("totale_costi", 0) or 0),
                "utile_netto": float((b["conto_economico"] or {}).get("utile_netto", 0) or 0),
                "patrimonio_netto": float((b["stato_patrimoniale"] or {}).get("patrimonio_netto", 0) or 0),
                "valore_immobili": float((b["stato_patrimoniale"] or {}).get("valore_immobili", 0) or 0),
                "debito_mutui": float((b["stato_patrimoniale"] or {}).get("debito_mutui", 0) or 0),
            }
            for b in items_sorted_old_to_new
        ]

        return {"bilanci": list(reversed(enriched)), "evoluzione": evoluzione}

    @router.get("/bilanci/latest")
    async def latest_bilancio(user: dict = Depends(current_user)):
        item = await db.bilanci.find_one({"user_id": user["id"]}, {"_id": 0}, sort=[("created_at", -1)])
        return item or {}

    @router.delete("/bilanci/{bid}")
    async def delete_bilancio(bid: str, user: dict = Depends(current_user)):
        await db.bilanci.delete_one({"id": bid, "user_id": user["id"]})
        return {"ok": True}

    # ============= BANCA =============
    @router.post("/banca/parse")
    async def parse_banca(file: UploadFile = File(...), user: dict = Depends(current_user)):
        content = await file.read()
        fl = (file.filename or "").lower()
        try:
            if fl.endswith(".csv"):
                try:
                    df = pd.read_csv(io.BytesIO(content), sep=None, engine="python")
                except Exception:
                    df = pd.read_csv(io.BytesIO(content), sep=";", engine="python", encoding="latin-1")
            elif fl.endswith((".xlsx", ".xls")):
                df = pd.read_excel(io.BytesIO(content))
            else:
                raise HTTPException(status_code=400, detail="Carica un file CSV o Excel.")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"File non leggibile: {str(e)}")

        cols = {c.lower().strip(): c for c in df.columns}

        def find_col(*keys):
            for k in keys:
                for cl, orig in cols.items():
                    if k in cl:
                        return orig
            return None

        col_data = find_col("data")
        col_desc = find_col("descrizione", "causale", "movimento")
        col_imp = find_col("importo", "amount", "dare", "avere")

        if not col_data or not col_imp:
            raise HTTPException(status_code=400, detail="Colonne mancanti: serve almeno una colonna 'Data' e una 'Importo'. Trovate: " + ", ".join(df.columns.astype(str)))

        movs = []
        for _, r in df.iterrows():
            importo = r.get(col_imp)
            if pd.isna(importo):
                continue
            try:
                importo = float(str(importo).replace(",", ".").replace("€", "").strip())
            except Exception:
                continue
            data = str(r.get(col_data, ""))[:10]
            desc = str(r.get(col_desc, "") or "")[:200]
            movs.append({
                "data": data, "descrizione": desc, "importo": importo,
                "tipo": "entrata" if importo > 0 else "uscita", "match_canone": None,
            })

        properties_user = await db.properties.find({"user_id": user["id"], "canone_mensile": {"$gt": 0}}, {"_id": 0}).to_list(200)
        for m in movs:
            if m["tipo"] != "entrata":
                continue
            for p in properties_user:
                canone = float(p.get("canone_mensile", 0) or 0)
                if canone <= 0:
                    continue
                if abs(m["importo"] - canone) < 5:
                    m["match_canone"] = {"property_id": p["id"], "property_nome": p["nome"], "canone_atteso": canone}
                    break

        return {
            "filename": file.filename, "total": len(movs),
            "entrate": sum(1 for m in movs if m["tipo"] == "entrata"),
            "uscite": sum(1 for m in movs if m["tipo"] == "uscita"),
            "matched": sum(1 for m in movs if m["match_canone"]),
            "movimenti": movs[:200],
        }

    @router.post("/banca/commit")
    async def commit_banca(payload: BancaCommit, user: dict = Depends(current_user)):
        created = 0
        skipped = 0
        for m in payload.movimenti:
            sig = _movimento_signature(user["id"], m)
            existing = await db.movimenti_bancari.find_one({"user_id": user["id"], "signature": sig})
            if existing:
                skipped += 1
                continue
            item = {
                "id": str(uuid.uuid4()), "user_id": user["id"],
                "data": m.get("data", ""), "descrizione": m.get("descrizione", ""),
                "importo": float(m.get("importo", 0) or 0), "tipo": m.get("tipo", "uscita"),
                "match_canone": m.get("match_canone"), "signature": sig,
                "imported_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.movimenti_bancari.insert_one(item)
            created += 1
        return {"created": created, "skipped_duplicates": skipped}

    @router.get("/banca")
    async def list_movimenti_bancari(
        user: dict = Depends(current_user),
        skip: int = 0, limit: int = 100,
        q: Optional[str] = None, tipo: Optional[str] = None, matched: Optional[bool] = None,
    ):
        query = {"user_id": user["id"]}
        if tipo in ("entrata", "uscita"):
            query["tipo"] = tipo
        if matched is True:
            query["match_canone"] = {"$ne": None}
        if matched is False:
            query["match_canone"] = None
        if q:
            query["descrizione"] = {"$regex": re.escape(q), "$options": "i"}
        total = await db.movimenti_bancari.count_documents(query)
        limit = max(1, min(500, limit))
        items = await db.movimenti_bancari.find(query, {"_id": 0}).sort("data", -1).skip(max(0, skip)).limit(limit).to_list(limit)
        return {"total": total, "skip": skip, "limit": limit, "items": items, "has_more": skip + len(items) < total}

    @router.get("/banca/cashflow-mensile")
    async def banca_cashflow_mensile(months: int = 12, user: dict = Depends(current_user)):
        cur = db.movimenti_bancari.aggregate([
            {"$match": {"user_id": user["id"], "data": {"$ne": ""}}},
            {"$addFields": {"ym": {"$substr": ["$data", 0, 7]}}},
            {"$group": {
                "_id": "$ym",
                "incassi": {"$sum": {"$cond": [{"$gt": ["$importo", 0]}, "$importo", 0]}},
                "uscite":  {"$sum": {"$cond": [{"$lt": ["$importo", 0]}, {"$abs": "$importo"}, 0]}},
            }},
            {"$sort": {"_id": -1}},
            {"$limit": max(1, min(36, months))},
        ])
        rows = await cur.to_list(36)
        rows = list(reversed(rows))
        MESI = {1: "Gen", 2: "Feb", 3: "Mar", 4: "Apr", 5: "Mag", 6: "Giu", 7: "Lug", 8: "Ago", 9: "Set", 10: "Ott", 11: "Nov", 12: "Dic"}
        out = []
        for r in rows:
            ym = r["_id"]
            try:
                y, m = ym.split("-")
                label = f"{MESI.get(int(m), '?')} '{y[-2:]}"
            except Exception:
                label = ym
            inc = round(r["incassi"], 2)
            usc = round(r["uscite"], 2)
            out.append({"mese": label, "ym": ym, "incassi": inc, "uscite": usc, "saldo": round(inc - usc, 2)})
        return {"count": len(out), "rows": out}

    @router.delete("/banca/{mid}")
    async def delete_movimento_bancario(mid: str, user: dict = Depends(current_user)):
        await db.movimenti_bancari.delete_one({"id": mid, "user_id": user["id"]})
        return {"ok": True}

    return router
