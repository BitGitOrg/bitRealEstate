"""
WhatsApp Bot via Twilio — Crea/aggiorna deal in Pipeline da messaggi WhatsApp.

Flusso:
  1. Utente configura Twilio (Account SID, Auth Token, Numero WhatsApp) in Impostazioni.
     Il backend genera un webhook_token univoco e mostra l'URL completo da incollare in Twilio.
  2. L'utente imposta il webhook nel Twilio Console → Messaging → Try it out → Send a WhatsApp message
     → URL: https://<dominio>/api/whatsapp/webhook/<webhook_token>
  3. Twilio POSTa ogni messaggio in ingresso. Backend:
     - Identifica tenant via webhook_token
     - (opzionale) verifica X-Twilio-Signature con auth_token
     - (opzionale) verifica From in allowed_senders whitelist
     - Parsa il messaggio con Claude (intent: create_deal | update_deal | note | help)
     - Esegue azione su MongoDB (collection deals)
     - Risponde via TwiML con un riepilogo per l'utente

Sicurezza:
  - Auth Token criptato con Fernet (riusa INBOX_KEY)
  - Signature validation Twilio (HMAC-SHA1 con auth_token)
  - Webhook token random 32 char (path-secret, non guessable)
"""
import os
import re
import json
import uuid
import logging
import secrets
import asyncio
from datetime import date, datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_KEY = os.environ.get("INBOX_KEY")
_fernet = Fernet(_KEY.encode()) if _KEY else None


def _enc(s: str) -> str:
    if not _fernet or not s:
        return s
    return _fernet.encrypt(s.encode()).decode()


def _dec(s: str) -> str:
    if not _fernet or not s:
        return s
    try:
        return _fernet.decrypt(s.encode()).decode()
    except InvalidToken:
        return ""


class WhatsAppConfig(BaseModel):
    account_sid: str
    auth_token: Optional[str] = None      # se vuoto al re-save → mantieni esistente
    whatsapp_number: str                  # es. "whatsapp:+14155238886"
    allowed_senders: Optional[List[str]] = None  # es. ["+393331234567"]; vuoto = nessuna restrizione
    enabled: bool = True


def _normalize_phone(s: str) -> str:
    if not s:
        return ""
    s = s.strip()
    # strip "whatsapp:" prefix se presente
    if s.lower().startswith("whatsapp:"):
        s = s[9:]
    # Solo cifre e "+" iniziale
    if s.startswith("+"):
        return "+" + re.sub(r"\D", "", s[1:])
    return re.sub(r"\D", "", s)


async def _ai_parse_whatsapp(llm_key: str, body: str, recent_deals: list) -> dict:
    """Chiede a Claude di interpretare il messaggio WhatsApp e restituire un'azione strutturata."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    recent_ctx = "\n".join([
        f"- {d.get('id')}: {d.get('indirizzo','')} ({d.get('citta','')}) · {d.get('prezzo_richiesto',0):.0f}€ · stage={d.get('stage','')}"
        for d in recent_deals[:8]
    ]) or "(nessun deal recente)"

    sys_msg = (
        "Sei l'interprete di messaggi WhatsApp per un CRM immobiliare italiano. "
        "Ricevi un messaggio breve dell'utente e restituisci SOLO un JSON valido (no markdown, no testo) "
        "con l'azione da eseguire sul CRM:\n"
        '{"azione":"create_deal|update_deal|note|help|unknown",'
        '"deal_ref":"DEAL-XXXXXX|null (se update_deal o note, l\'ID del deal da cercare; se citato per indirizzo/città, metti il match più vicino dai deals recenti)",'
        '"indirizzo":"str|null","citta":"str|null","prezzo":num|null,"canone_atteso":num|null,'
        '"metratura":num|null,"tipologia":"bilocale|trilocale|monolocale|quadrilocale|villa|altro|null",'
        '"fonte":"immobiliare|idealista|agenzia|passaparola|altro",'
        '"nuovo_stage":"visionato|visitato|offerta_inviata|trattativa|accettato|verifica_doc|mutuo_richiesto|preliminare|rogito|null",'
        '"note":"str|null (testo da salvare in timeline o note del deal)"}\n\n'
        "REGOLE:\n"
        "- 'create_deal': se il messaggio contiene un nuovo annuncio (indirizzo + prezzo) o frasi tipo 'aggiungi', 'nuovo immobile', 'trovato a...'\n"
        "- 'update_deal': se cita un deal esistente per ID o indirizzo e cambia stato/prezzo, es: 'sono andato a vedere DEAL-XXX', 'offerta inviata per via Roma 12', 'compromesso firmato'\n"
        "- 'note': se è solo un commento/osservazione su un deal esistente\n"
        "- 'help': se chiede aiuto/comandi\n"
        "- 'unknown': altrimenti\n"
        "- prezzo e canone: solo numeri (no € o /mese), in Euro.\n"
        "- Quando 'update_deal', se non sei sicuro del deal, scegli il più vicino come indirizzo/città.\n\n"
        f"DEAL RECENTI (per match):\n{recent_ctx}\n\n"
        f"MESSAGGIO UTENTE:\n{body}"
    )

    chat = LlmChat(
        api_key=llm_key,
        session_id=f"wa-parse-{uuid.uuid4().hex[:8]}",
        system_message=sys_msg
    ).with_model("anthropic", "claude-sonnet-4-6")
    reply = await chat.send_message(UserMessage(text="Interpreta il messaggio."))
    text = (reply or "").strip()
    if "```" in text:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if m:
            text = m.group(1).strip()
    s = text.find("{")
    e = text.rfind("}")
    if s == -1 or e <= s:
        raise ValueError("AI non ha restituito JSON valido")
    return json.loads(text[s:e+1])


def _twiml_reply(message: str) -> Response:
    safe = (message or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    body = f'<?xml version="1.0" encoding="UTF-8"?>\n<Response><Message>{safe}</Message></Response>'
    return Response(content=body, media_type="application/xml")


def _deal_short(deal_id: str) -> str:
    """DEAL-AB1234 → AB1234 (per short URL)."""
    if not deal_id:
        return ""
    return deal_id.split("-", 1)[-1].upper()


def _deep_link(base_url: str, deal_id: str) -> str:
    """Costruisce short URL es: https://app.tld/d/AB1234"""
    s = _deal_short(deal_id)
    return f"{base_url.rstrip('/')}/d/{s}" if s and base_url else ""


def _help_text() -> str:
    return (
        "🤖 *Control Room — comandi WhatsApp*\n"
        "\n"
        "🏠 *Crea deal*\n"
        "  `Aggiungi <indirizzo>, <città>, <prezzo>€, <mq>mq`\n"
        "  es: Aggiungi via Roma 12 Milano, 180000€, 55mq, canone 800\n"
        "\n"
        "📈 *Aggiorna stage*\n"
        "  `<DEAL-ID o indirizzo>: <stage>`\n"
        "  Stages: visitato · offerta_inviata · trattativa · accettato · "
        "verifica_doc · mutuo_richiesto · preliminare · rogito\n"
        "  es: DEAL-AB1234: offerta inviata a 175000\n"
        "\n"
        "📝 *Nota rapida*\n"
        "  `<DEAL-ID>: nota libera`\n"
        "  es: DEAL-AB1234: il proprietario chiede chiusura entro luglio\n"
        "\n"
        "📊 *stats* — KPI pipeline di oggi\n"
        "🔍 *lista* — top 5 deal aperti per AI Score\n"
        "🆘 *help* — questo menu"
    )


async def _stats_text(db, user_id: str, base_url: str = "") -> str:
    try:
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        week_ago = (now - timedelta(days=7)).isoformat()
        all_open = await db.deals.find(
            {"user_id": user_id, "is_pipeline": True, "convertito": {"$ne": True}},
            {"_id": 0, "id": 1, "stage": 1, "ai_deal_score": 1, "created_at": 1, "prezzo_corrente": 1}
        ).to_list(500)
        n_total = len(all_open)
        n_new = sum(1 for d in all_open if (d.get("created_at") or "") >= week_ago)
        in_tratt = sum(1 for d in all_open if d.get("stage") in ("trattativa", "offerta_inviata", "accettato"))
        in_chius = sum(1 for d in all_open if d.get("stage") in ("verifica_doc", "mutuo_richiesto", "preliminare"))
        scores = [d.get("ai_deal_score") for d in all_open if d.get("ai_deal_score") is not None]
        avg_score = round(sum(scores) / len(scores), 1) if scores else 0
        max_score_d = max(all_open, key=lambda x: x.get("ai_deal_score") or 0, default=None)
        tot_eur = sum(float(d.get("prezzo_corrente") or 0) for d in all_open)
        lines = [
            "📊 *Stats Pipeline*",
            f"Deal aperti: *{n_total}*  ·  Nuovi 7gg: *{n_new}*",
            f"In trattativa: *{in_tratt}*  ·  Verso closing: *{in_chius}*",
            f"AI Score medio: *{avg_score}/100*",
            f"Valore complessivo: *{tot_eur:,.0f}€*".replace(",", "."),
        ]
        if max_score_d and max_score_d.get("ai_deal_score"):
            link = _deep_link(base_url, max_score_d.get("id"))
            link_s = f"\n   {link}" if link else ""
            lines.append(
                f"⭐ Top: {max_score_d['id']} · score {max_score_d.get('ai_deal_score')}/100{link_s}"
            )
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"stats failed: {e}")
        return "Impossibile generare le statistiche al momento."


async def _list_text(db, user_id: str, base_url: str = "") -> str:
    try:
        items = await db.deals.find(
            {"user_id": user_id, "is_pipeline": True, "convertito": {"$ne": True}},
            {"_id": 0}
        ).sort([("ai_deal_score", -1), ("created_at", -1)]).to_list(5)
        if not items:
            return "Nessun deal in pipeline. Inviami il primo annuncio per cominciare."
        out = ["🔍 *Top deal aperti (per AI Score)*"]
        for d in items:
            score = d.get("ai_deal_score")
            score_s = f" · score {score}/100" if score is not None else ""
            prezzo = float(d.get("prezzo_corrente") or d.get("prezzo_richiesto") or 0)
            link = _deep_link(base_url, d.get("id"))
            link_s = f"\n   🔗 {link}" if link else ""
            out.append(
                f"• *{d.get('id')}* {d.get('indirizzo','')[:30]} ({d.get('citta','')[:20]}) · "
                f"{prezzo:,.0f}€".replace(",", ".") + f" · {d.get('stage','')}{score_s}{link_s}"
            )
        return "\n".join(out)
    except Exception as e:
        logger.warning(f"list failed: {e}")
        return "Impossibile recuperare la lista al momento."


async def _touch_inbound(db, webhook_token: str, from_phone: str, body: str, azione: str):
    try:
        await db.whatsapp_config.update_one(
            {"webhook_token": webhook_token},
            {"$set": {
                "last_inbound_at": datetime.now(timezone.utc).isoformat(),
                "last_inbound_summary": {"from": from_phone, "body": body[:240], "azione": azione},
            }}
        )
    except Exception:
        pass


def make_whatsapp_router(db, current_user, llm_key: Optional[str] = None):
    router = APIRouter(prefix="/api/whatsapp")

    # ── Endpoints di configurazione (autenticati) ─────────────────────────
    def _public_base(request: Request) -> str:
        # Rispetta header del reverse proxy (ingress K8s / Cloudflare)
        fwd_host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
        fwd_proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
        if fwd_host:
            return f"{fwd_proto}://{fwd_host}"
        return str(request.base_url).rstrip("/")

    @router.get("/config")
    async def get_config(request: Request, user: dict = Depends(current_user)):
        cfg = await db.whatsapp_config.find_one({"user_id": user["id"]}, {"_id": 0})
        base = _public_base(request)
        if not cfg:
            return {
                "configured": False, "account_sid": "", "whatsapp_number": "",
                "allowed_senders": [], "enabled": False,
                "auth_token_set": False, "webhook_url": "",
                "last_inbound_at": None, "last_inbound_summary": None,
            }
        wt = cfg.get("webhook_token", "")
        return {
            "configured": True,
            "account_sid": cfg.get("account_sid", ""),
            "whatsapp_number": cfg.get("whatsapp_number", ""),
            "allowed_senders": cfg.get("allowed_senders", []) or [],
            "enabled": cfg.get("enabled", True),
            "auth_token_set": bool(cfg.get("auth_token_enc")),
            "webhook_url": f"{base}/api/whatsapp/webhook/{wt}" if wt else "",
            "last_inbound_at": cfg.get("last_inbound_at"),
            "last_inbound_summary": cfg.get("last_inbound_summary"),
        }

    @router.post("/config")
    async def save_config(payload: WhatsAppConfig, user: dict = Depends(current_user)):
        existing = await db.whatsapp_config.find_one({"user_id": user["id"]})
        webhook_token = existing.get("webhook_token") if existing else None
        if not webhook_token:
            webhook_token = secrets.token_urlsafe(24)

        clean_allowed = []
        for p in (payload.allowed_senders or []):
            n = _normalize_phone(p)
            if n:
                clean_allowed.append(n)

        doc = {
            "user_id": user["id"],
            "account_sid": payload.account_sid.strip(),
            "whatsapp_number": payload.whatsapp_number.strip(),
            "allowed_senders": clean_allowed,
            "enabled": bool(payload.enabled),
            "webhook_token": webhook_token,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if payload.auth_token:
            doc["auth_token_enc"] = _enc(payload.auth_token.strip())
        elif existing:
            doc["auth_token_enc"] = existing.get("auth_token_enc")
        else:
            doc["auth_token_enc"] = None

        if existing:
            await db.whatsapp_config.update_one({"user_id": user["id"]}, {"$set": doc})
        else:
            await db.whatsapp_config.insert_one(doc)
        return {"ok": True, "webhook_token": webhook_token}

    @router.delete("/config")
    async def delete_config(user: dict = Depends(current_user)):
        await db.whatsapp_config.delete_one({"user_id": user["id"]})
        return {"ok": True}

    @router.post("/test-send")
    async def test_send(payload: dict, user: dict = Depends(current_user)):
        """Invia un messaggio al numero indicato (whatsapp:+...).
        Se payload.template == 'help' invia il menu comandi, altrimenti un test breve."""
        to = (payload or {}).get("to", "").strip()
        template = (payload or {}).get("template") or "ping"
        if not to:
            raise HTTPException(400, "Campo 'to' obbligatorio (es. whatsapp:+39333...)")
        if not to.lower().startswith("whatsapp:"):
            to = "whatsapp:" + to
        cfg = await db.whatsapp_config.find_one({"user_id": user["id"]})
        if not cfg:
            raise HTTPException(404, "Configurazione mancante")
        sid = cfg.get("account_sid")
        tok = _dec(cfg.get("auth_token_enc") or "")
        frm = cfg.get("whatsapp_number")
        if not sid or not tok or not frm:
            raise HTTPException(400, "Credenziali Twilio incomplete")
        if template == "help":
            body_msg = _help_text()
        else:
            body_msg = "✅ Control Room WhatsApp Bot connesso. Scrivimi 'help' per i comandi."
        try:
            from twilio.rest import Client
            client = Client(sid, tok)
            msg = await asyncio.to_thread(
                client.messages.create,
                from_=frm, to=to, body=body_msg
            )
            return {"ok": True, "sid": msg.sid}
        except Exception as e:
            raise HTTPException(400, f"Twilio error: {str(e)[:200]}")

    # ── Webhook pubblico (ricezione messaggi da Twilio) ───────────────────
    @router.post("/webhook/{webhook_token}", include_in_schema=False)
    async def whatsapp_webhook(webhook_token: str, request: Request):
        cfg = await db.whatsapp_config.find_one({"webhook_token": webhook_token})
        if not cfg:
            return _twiml_reply("Configurazione non trovata. Controlla il webhook URL.")
        if not cfg.get("enabled", True):
            return _twiml_reply("Bot WhatsApp temporaneamente disabilitato.")

        # Parse form data Twilio
        form = await request.form()
        params = dict(form)
        from_raw = params.get("From", "")
        body = (params.get("Body") or "").strip()
        from_phone = _normalize_phone(from_raw)

        # Verifica signature Twilio (best-effort)
        sig = request.headers.get("X-Twilio-Signature", "")
        auth_token = _dec(cfg.get("auth_token_enc") or "")
        url = str(request.url)
        if sig and auth_token:
            try:
                from twilio.request_validator import RequestValidator
                v = RequestValidator(auth_token)
                if not v.validate(url, params, sig):
                    logger.warning(f"Twilio signature mismatch on URL {url}")
                    return _twiml_reply("Firma webhook non valida.")
            except Exception as e:
                logger.warning(f"Signature validation error: {e}")

        # Whitelist
        allowed = cfg.get("allowed_senders") or []
        if allowed and from_phone not in allowed:
            logger.warning(f"WhatsApp from {from_phone} not in whitelist for user {cfg.get('user_id')}")
            return _twiml_reply("Mittente non autorizzato.")

        if not body:
            return _twiml_reply("Messaggio vuoto. Inviami l'indirizzo + prezzo dell'annuncio oppure un aggiornamento.")

        user_id = cfg["user_id"]
        low = body.lower().strip()
        base_url = _public_base(request)

        # ── Comandi rapidi (no LLM, risposta immediata) ──────────────────
        if low in ("help", "aiuto", "menu", "comandi", "?"):
            await _touch_inbound(db, webhook_token, from_phone, body, "help")
            return _twiml_reply(_help_text())

        if low in ("stats", "statistiche", "stats oggi", "statistiche oggi"):
            txt = await _stats_text(db, user_id, base_url)
            await _touch_inbound(db, webhook_token, from_phone, body, "stats")
            return _twiml_reply(txt)

        if low in ("lista", "list", "deal aperti", "deals", "pipeline"):
            txt = await _list_text(db, user_id, base_url)
            await _touch_inbound(db, webhook_token, from_phone, body, "lista")
            return _twiml_reply(txt)

        if not llm_key:
            return _twiml_reply("AI non configurata sul server.")

        # Recupera deals recenti per match (LLM parser)
        try:
            recent = await db.deals.find(
                {"user_id": user_id, "is_pipeline": True, "convertito": {"$ne": True}},
                {"_id": 0}
            ).sort("created_at", -1).to_list(20)
        except Exception:
            recent = []

        # Parse con Claude
        try:
            parsed = await _ai_parse_whatsapp(llm_key, body, recent)
        except Exception as e:
            logger.warning(f"AI parse whatsapp failed: {e}")
            return _twiml_reply("Non sono riuscito a interpretare il messaggio. Riprova con 'aggiungi <indirizzo> a <prezzo>€'.")

        azione = (parsed.get("azione") or "unknown").lower()
        result_text = ""

        try:
            if azione == "help":
                result_text = _help_text()

            elif azione == "create_deal":
                indirizzo = (parsed.get("indirizzo") or "").strip()
                prezzo = parsed.get("prezzo")
                if not indirizzo or not prezzo:
                    result_text = "Per creare un deal serve almeno indirizzo + prezzo. Esempio: 'Via Roma 12 Milano, 180000€, bilocale 55mq'."
                else:
                    from routers.pipeline import _compute_ai_score
                    ai = await _compute_ai_score(db, user_id, float(prezzo), parsed.get("canone_atteso"))
                    now = datetime.now(timezone.utc).isoformat()
                    deal = {
                        "id": f"DEAL-{uuid.uuid4().hex[:6].upper()}",
                        "user_id": user_id,
                        "is_pipeline": True,
                        "stage": "visionato",
                        "convertito": False,
                        "indirizzo": indirizzo[:160],
                        "citta": (parsed.get("citta") or "")[:80],
                        "cap": "",
                        "prezzo_richiesto": float(prezzo),
                        "prezzo_corrente": float(prezzo),
                        "fonte": parsed.get("fonte") or "passaparola",
                        "metratura": parsed.get("metratura"),
                        "tipologia": parsed.get("tipologia") or "",
                        "canone_atteso": parsed.get("canone_atteso"),
                        "note": (parsed.get("note") or "")[:300],
                        "source_channel": "whatsapp",
                        "source_phone": from_phone,
                        **ai,
                        "created_at": now,
                        "stage_updated_at": now,
                        "timeline": [{
                            "id": f"EVT-{uuid.uuid4().hex[:6].upper()}",
                            "tipo": "visione",
                            "data": date.today().isoformat(),
                            "descrizione": f"Creato da WhatsApp ({from_phone}) · AI Score {ai.get('ai_deal_score','?')}/100",
                            "stage_dopo": "visionato",
                        }],
                    }
                    await db.deals.insert_one(deal.copy())
                    score = ai.get("ai_deal_score")
                    giud = ai.get("ai_giudizio", "")
                    pmax = ai.get("ai_prezzo_max")
                    pmax_s = f"\n💰 Prezzo max consigliato: {pmax:,.0f}€".replace(",", ".") if pmax else ""
                    link = _deep_link(base_url, deal["id"])
                    link_s = f"\n🔗 Apri scheda: {link}" if link else ""
                    result_text = (
                        f"✅ Deal creato *{deal['id']}*\n"
                        f"{indirizzo}{' · ' + (parsed.get('citta') or '') if parsed.get('citta') else ''}\n"
                        f"Prezzo: {float(prezzo):,.0f}€".replace(",", ".") + "\n"
                        f"🎯 AI Score: {score}/100 ({giud}){pmax_s}{link_s}"
                    )
                    # Push notification real-time
                    try:
                        from routers.push_notifications import send_push_to_user
                        await send_push_to_user(db, user_id, {
                            "title": f"🆕 Nuovo deal da WhatsApp · score {score}/100",
                            "body": f"{indirizzo[:80]} · {float(prezzo):,.0f}€".replace(",", "."),
                            "url": f"/d/{deal['id'].split('-',1)[-1]}",
                            "tag": f"deal-{deal['id']}",
                            "icon": "/icons/icon-192.png",
                        })
                    except Exception as ep:
                        logger.warning(f"push notification on create_deal failed: {ep}")

            elif azione == "update_deal":
                ref = (parsed.get("deal_ref") or "").strip()
                deal = None
                if ref and ref.upper().startswith("DEAL-"):
                    deal = await db.deals.find_one({"user_id": user_id, "id": ref.upper()})
                if not deal:
                    # Fallback: match per indirizzo/città
                    hint_addr = (parsed.get("indirizzo") or "").strip().lower()
                    hint_city = (parsed.get("citta") or "").strip().lower()
                    for d in recent:
                        addr = (d.get("indirizzo") or "").lower()
                        city = (d.get("citta") or "").lower()
                        if hint_addr and hint_addr in addr:
                            deal = d
                            break
                        if hint_city and hint_city == city:
                            deal = d
                if not deal:
                    result_text = "Non ho trovato il deal a cui ti riferisci. Usa l'ID DEAL-XXXX o un indirizzo presente."
                else:
                    updates = {}
                    if parsed.get("prezzo"):
                        updates["prezzo_corrente"] = float(parsed["prezzo"])
                    if parsed.get("nuovo_stage"):
                        updates["stage"] = parsed["nuovo_stage"]
                        updates["stage_updated_at"] = datetime.now(timezone.utc).isoformat()
                    note_text = parsed.get("note") or body
                    evento = {
                        "id": f"EVT-{uuid.uuid4().hex[:6].upper()}",
                        "tipo": "nota",
                        "data": date.today().isoformat(),
                        "descrizione": f"[WhatsApp] {note_text[:240]}",
                        "stage_dopo": updates.get("stage", deal.get("stage")),
                    }
                    await db.deals.update_one(
                        {"id": deal["id"], "user_id": user_id},
                        {"$set": updates, "$push": {"timeline": evento}}
                    )
                    parts = [f"📝 *{deal['id']}* aggiornato"]
                    if updates.get("stage"):
                        parts.append(f"Stage → *{updates['stage']}*")
                    if updates.get("prezzo_corrente"):
                        parts.append(f"Prezzo corrente: {updates['prezzo_corrente']:,.0f}€".replace(",", "."))
                    parts.append("Nota aggiunta alla timeline.")
                    link = _deep_link(base_url, deal["id"])
                    if link:
                        parts.append(f"🔗 {link}")
                    result_text = "\n".join(parts)

            elif azione == "note":
                ref = (parsed.get("deal_ref") or "").strip()
                deal = None
                if ref and ref.upper().startswith("DEAL-"):
                    deal = await db.deals.find_one({"user_id": user_id, "id": ref.upper()})
                if not deal and recent:
                    deal = recent[0]
                if not deal:
                    result_text = "Nessun deal a cui collegare la nota. Crea prima un deal."
                else:
                    evento = {
                        "id": f"EVT-{uuid.uuid4().hex[:6].upper()}",
                        "tipo": "nota",
                        "data": date.today().isoformat(),
                        "descrizione": f"[WhatsApp] {(parsed.get('note') or body)[:240]}",
                        "stage_dopo": deal.get("stage"),
                    }
                    await db.deals.update_one(
                        {"id": deal["id"], "user_id": user_id},
                        {"$push": {"timeline": evento}}
                    )
                    link = _deep_link(base_url, deal["id"])
                    link_s = f"\n🔗 {link}" if link else ""
                    result_text = f"📝 Nota aggiunta a *{deal['id']}*.{link_s}"

            else:
                result_text = (
                    "🤔 Non ho capito. Esempi validi:\n"
                    "• 'Aggiungi via Roma 12 Milano, 180000€, bilocale 55mq'\n"
                    "• 'DEAL-AB1234: offerta inviata a 175000'\n"
                    "• 'help'"
                )

            # Aggiorna ultima attività
            await _touch_inbound(db, webhook_token, from_phone, body, azione)
        except Exception as e:
            logger.exception(f"WhatsApp action failed: {e}")
            result_text = "Errore nell'elaborazione del messaggio. Riprova."

        return _twiml_reply(result_text)

    return router
