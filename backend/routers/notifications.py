"""Solleciti pagamento — AI text generation + mailto/whatsapp deep link.

Approccio "zero costo":
- Trova incassi previsti scaduti (stato=in_ritardo o previsto+mese<oggi)
- Per ogni inquilino, l'AI genera un testo di sollecito (cortese/fermo/legale) basato sui giorni di ritardo
- Endpoint per generare link `mailto:` e `https://wa.me/` precompilati
- Tracking: marca il sollecito come "inviato" quando l'utente clicca

Non invia automaticamente — usa il client mail/whatsapp dell'utente.
Estensione futura: integrazione Resend/SendGrid per invio automatizzato.
"""
import json
import logging
import urllib.parse
import uuid
from datetime import datetime, timezone, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


class GeneraSollecitoIn(BaseModel):
    immobile_id: str
    inquilino_email: Optional[str] = None
    inquilino_telefono: Optional[str] = None
    importo_dovuto: float
    mesi_in_ritardo: int = 1
    tono: Optional[str] = "auto"   # auto | cortese | fermo | legale


class MarcaInviatoIn(BaseModel):
    canale: str  # email | whatsapp
    note: Optional[str] = ""


def _classifica_tono(giorni_ritardo: int, settings: dict = None) -> str:
    s = settings or {}
    g_cortese = int(s.get("sollecito_giorni_cortese", 5) or 5)
    g_fermo = int(s.get("sollecito_giorni_fermo", 15) or 15)
    g_legale = int(s.get("sollecito_giorni_legale", 30) or 30)
    if giorni_ritardo >= g_legale:
        return "legale"
    if giorni_ritardo >= g_fermo:
        return "fermo"
    if giorni_ritardo >= g_cortese:
        return "cortese"
    return "watching"   # non ancora dovuto un sollecito


def _stage_da_tono(tono: str) -> int:
    return {"watching": 0, "cortese": 1, "fermo": 2, "legale": 3}.get(tono, 0)


async def _auto_scan_solleciti(db, user_id: str) -> int:
    """Scansiona i solleciti dovuti e genera (idempotentemente) alert nella campanella.
    Restituisce il numero di alert creati/aggiornati.
    """
    settings = await db.settings.find_one({"user_id": user_id}, {"_id": 0}) or {}
    if not settings.get("sollecito_auto_enabled", True):
        return 0
    today = date.today()
    incassi = await db.incassi.find({
        "user_id": user_id,
        "stato": {"$in": ["previsto", "in_ritardo", "sollecitato"]},
    }, {"_id": 0}).to_list(500)
    created = 0
    for i in incassi:
        anno = int(i.get("anno", 0) or 0)
        mese = int(i.get("mese", 0) or 0)
        if anno == 0 or mese == 0:
            continue
        scad = date(anno, mese, 5)
        gg = (today - scad).days
        tono = _classifica_tono(gg, settings)
        if tono == "watching":
            continue
        stage_needed = _stage_da_tono(tono)
        # Quanti solleciti effettivi sono stati inviati per questo incasso?
        sent = await db.solleciti.count_documents({"user_id": user_id, "incasso_id": i.get("id")})
        if sent >= stage_needed:
            continue   # già inviato il sollecito di questo stadio o superiore
        # Crea/aggiorna alert (un solo alert per incasso, idempotente)
        p = await db.properties.find_one({"id": i.get("immobile_id"), "user_id": user_id}, {"_id": 0})
        if not p or not p.get("inquilino"):
            continue
        importo = float(i.get("previsto") or i.get("importo", 0) or p.get("canone_mensile", 0) or 0)
        alert_id = f"A-SOLL-{i.get('id')}"
        sev = {"cortese": "media", "fermo": "alta", "legale": "alta"}.get(tono, "media")
        await db.alerts.update_one(
            {"id": alert_id, "user_id": user_id},
            {"$set": {
                "id": alert_id,
                "user_id": user_id,
                "tipo": "sollecito",
                "severity": sev,
                "titolo": f"Sollecito {tono} dovuto · {p.get('nome')}",
                "descrizione": f"{p.get('inquilino')} è in ritardo di {gg} giorni · € {importo:.0f}",
                "immobile_id": p["id"],
                "incasso_id": i.get("id"),
                "tono": tono,
                "stage_da_inviare": stage_needed,
                "days_remaining": -gg,
                "auto_generated": True,
                "kind": "sollecito_auto",
                "ts": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
        created += 1
    return created


def make_notifications_router(db, current_user, llm_key: str = ""):
    router = APIRouter(prefix="/api/notifications")

    @router.get("/solleciti-da-inviare")
    async def solleciti_da_inviare(user: dict = Depends(current_user)):
        """Lista degli incassi in ritardo che richiedono un sollecito. Esegue auto-scan."""
        # 1. Auto-scan crea/aggiorna alert nella campanella
        await _auto_scan_solleciti(db, user["id"])
        # 2. Restituisce solleciti dovuti
        today = date.today()
        settings = await db.settings.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
        all_inc = await db.incassi.find({
            "user_id": user["id"],
            "stato": {"$in": ["previsto", "in_ritardo", "sollecitato"]},
        }, {"_id": 0}).to_list(500)
        out = []
        for i in all_inc:
            anno = int(i.get("anno", 0) or 0)
            mese = int(i.get("mese", 0) or 0)
            if anno == 0 or mese == 0:
                continue
            scad_date = date(anno, mese, 5)
            if scad_date > today:
                continue
            giorni_ritardo = (today - scad_date).days
            if giorni_ritardo < 1:
                continue
            tono = _classifica_tono(giorni_ritardo, settings)
            stage_needed = _stage_da_tono(tono)
            p = await db.properties.find_one({"id": i.get("immobile_id"), "user_id": user["id"]}, {"_id": 0})
            if not p or not p.get("inquilino"):
                continue
            sent_count = await db.solleciti.count_documents({"user_id": user["id"], "incasso_id": i.get("id")})
            last_sollecito = await db.solleciti.find_one(
                {"user_id": user["id"], "incasso_id": i.get("id")},
                sort=[("inviato_il", -1)]
            )
            # ready_to_send: c'è uno stadio nuovo da inviare
            ready = sent_count < stage_needed and tono != "watching"
            out.append({
                "incasso_id": i.get("id"),
                "immobile_id": p["id"],
                "immobile_nome": p.get("nome"),
                "inquilino": p.get("inquilino"),
                "inquilino_email": p.get("inquilino_email") or "",
                "inquilino_telefono": p.get("inquilino_telefono") or "",
                "importo": float(i.get("previsto") or i.get("importo", 0) or p.get("canone_mensile", 0) or 0),
                "mese": mese,
                "anno": anno,
                "scadenza": scad_date.isoformat(),
                "giorni_ritardo": giorni_ritardo,
                "tono_consigliato": tono if tono != "watching" else "cortese",
                "stage_da_inviare": stage_needed,
                "solleciti_inviati": sent_count,
                "ready_to_send": ready,
                "ultimo_sollecito": (last_sollecito or {}).get("inviato_il"),
            })
        # Ordina: prima i ready_to_send, poi per gg ritardo
        out.sort(key=lambda x: (not x["ready_to_send"], -x["giorni_ritardo"]))
        return out

    @router.post("/genera-testo")
    async def genera_testo(payload: GeneraSollecitoIn, user: dict = Depends(current_user)):
        """Genera 2 testi (email lungo + whatsapp breve) via Claude AI."""
        p = await db.properties.find_one({"id": payload.immobile_id, "user_id": user["id"]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Immobile non trovato")
        settings = await db.settings.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
        societa = settings.get("nome_societa") or "la proprietà"
        inquilino = p.get("inquilino", "Gentile inquilino")
        tono = payload.tono if payload.tono != "auto" else _classifica_tono(payload.mesi_in_ritardo * 30, settings)
        ctx = {
            "inquilino": inquilino,
            "immobile_nome": p.get("nome"),
            "indirizzo": f"{p.get('indirizzo', '')} {p.get('citta', '')}".strip(),
            "canone_mensile": p.get("canone_mensile", 0),
            "importo_dovuto": payload.importo_dovuto,
            "mesi_in_ritardo": payload.mesi_in_ritardo,
            "societa": societa,
            "tono": tono,
        }
        if not llm_key:
            # Fallback senza AI
            return _fallback_templates(ctx)
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            sys_msg = (
                "Sei un assistente legale-amministrativo italiano. "
                "Scrivi 2 testi per sollecitare il pagamento di un affitto, in italiano impeccabile.\n"
                "Output: SOLO JSON valido (no markdown, no backticks):\n"
                "{\n"
                '  "email_oggetto": "string max 70 char",\n'
                '  "email_corpo": "string formale, 3-5 paragrafi, firma cordiale",\n'
                '  "whatsapp": "string breve max 280 char, informale ma professionale"\n'
                "}\n"
                f"Tono richiesto: {tono} ('cortese'=primo sollecito, 'fermo'=secondo, 'legale'=ultimatum prima di vie legali).\n"
                "NON minacciare se tono 'cortese'. Sii umano: cita il fatto che potrebbe essere una dimenticanza.\n"
                "Per 'legale' menziona art. 1218 c.c. e possibili azioni di sfratto/ingiunzione, MA in modo costruttivo (proponi accordo).\n"
                "Dati specifici:\n" + json.dumps(ctx, ensure_ascii=False, indent=2)
            )
            chat = LlmChat(
                api_key=llm_key,
                session_id=f"sollecito-{uuid.uuid4()}",
                system_message=sys_msg,
            ).with_model("anthropic", "claude-sonnet-4-6")
            reply = await chat.send_message(UserMessage(text="Genera ora i testi."))
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
            return {**parsed, "tono": tono, "ctx": ctx}
        except Exception as e:
            logging.warning(f"AI sollecito fallback: {e}")
            return _fallback_templates(ctx)

    @router.post("/marca-inviato/{incasso_id}")
    async def marca_inviato(incasso_id: str, payload: MarcaInviatoIn, user: dict = Depends(current_user)):
        await db.solleciti.insert_one({
            "id": f"SOL-{uuid.uuid4().hex[:6].upper()}",
            "user_id": user["id"],
            "incasso_id": incasso_id,
            "canale": payload.canale,
            "note": payload.note,
            "inviato_il": datetime.now(timezone.utc).isoformat(),
        })
        # Aggiorna incasso → "sollecitato"
        await db.incassi.update_one(
            {"id": incasso_id, "user_id": user["id"]},
            {"$set": {"stato": "sollecitato"}}
        )
        # Cancella alert auto-generato corrispondente
        await db.alerts.delete_many({
            "user_id": user["id"],
            "kind": "sollecito_auto",
            "incasso_id": incasso_id,
        })
        return {"ok": True}

    @router.get("/storico")
    async def storico(user: dict = Depends(current_user)):
        items = await db.solleciti.find({"user_id": user["id"]}, {"_id": 0}).sort("inviato_il", -1).to_list(200)
        return items

    return router


def _fallback_templates(ctx: dict) -> dict:
    """Template fallback senza AI."""
    inq = ctx.get("inquilino", "Gentile inquilino")
    imm = ctx.get("immobile_nome", "")
    importo = ctx.get("importo_dovuto", 0)
    soc = ctx.get("societa", "la proprietà")
    tono = ctx.get("tono", "cortese")
    if tono == "legale":
        oggetto = f"DIFFIDA: pagamento canone arretrato {imm}"
        corpo = (
            f"Gentile {inq},\n\nle nostre verifiche evidenziano che, alla data odierna, "
            f"risulta non pagato un importo di € {importo:.2f} per la locazione dell'immobile «{imm}».\n\n"
            "Le segnaliamo con riferimento all'art. 1218 c.c. che il prolungato inadempimento legittima il locatore "
            "ad attivare procedura di sfratto per morosità ai sensi della L. 392/1978.\n\n"
            "Le chiediamo di procedere al saldo entro e non oltre 15 giorni dalla ricezione della presente, "
            "oppure di contattarci per concordare un piano di rientro.\n\n"
            f"Cordiali saluti,\n{soc}"
        )
        wa = f"Gentile {inq}, le ricordiamo che è dovuto un importo di € {importo:.0f} per «{imm}», non pagato. La preghiamo di regolarizzare entro 15 giorni o ci contatti per un piano di rientro. {soc}"
    elif tono == "fermo":
        oggetto = f"Sollecito pagamento affitto {imm}"
        corpo = (
            f"Gentile {inq},\n\nle inviamo un secondo sollecito relativo al canone non incassato di € {importo:.2f} "
            f"per l'immobile «{imm}».\n\n"
            "Le chiediamo cortesemente di provvedere al pagamento nei prossimi 7 giorni, oppure di contattarci "
            "per chiarire la situazione e concordare modalità di rientro.\n\n"
            f"Cordiali saluti,\n{soc}"
        )
        wa = f"Gentile {inq}, le ricordiamo che il pagamento di € {importo:.0f} per «{imm}» non risulta ancora effettuato. Può procedere o farci sapere? Grazie. {soc}"
    else:
        oggetto = f"Promemoria pagamento canone {imm}"
        corpo = (
            f"Gentile {inq},\n\nle scriviamo per ricordarle che il canone di € {importo:.2f} relativo all'immobile "
            f"«{imm}» risulta ancora da incassare.\n\n"
            "Si tratta probabilmente di una dimenticanza: la preghiamo gentilmente di procedere al bonifico "
            "appena possibile o, in caso di difficoltà, di contattarci.\n\n"
            f"La ringraziamo per la collaborazione.\nCordiali saluti,\n{soc}"
        )
        wa = f"Buongiorno {inq}, le ricordiamo gentilmente che il canone di € {importo:.0f} per «{imm}» risulta ancora da pagare. Se è una dimenticanza nessun problema, ci faccia sapere. Grazie!"
    return {"email_oggetto": oggetto, "email_corpo": corpo, "whatsapp": wa, "tono": tono, "ctx": ctx}
