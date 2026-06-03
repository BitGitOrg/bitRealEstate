"""
Email Inbox IMAP — Importa annunci immobiliari dalle email di alert dei portali.

Flusso:
  1. Utente configura IMAP (host, port, user, password) in Impostazioni
  2. Click "Sync inbox" → backend si connette IMAP, legge email UNSEEN
  3. Per ogni email: detecta portale (Immobiliare/Idealista/Casa.it/altro)
  4. Estrae HTML body → Claude Sonnet estrae LISTA annunci (una email può contenerne 5-20)
  5. Per ogni annuncio: AI Deal Score → crea Deal in Pipeline con sorgente "email"
  6. Marca email come letta (\\Seen flag)
"""
import os
import re
import json
import uuid
import imaplib
import email as email_lib
from email.header import decode_header
from datetime import datetime, timezone, date
from typing import Optional, List
import logging
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_INBOX_KEY = os.environ.get("INBOX_KEY")
_fernet = Fernet(_INBOX_KEY.encode()) if _INBOX_KEY else None


def _encrypt(s: str) -> str:
    if not _fernet or not s:
        return s
    return _fernet.encrypt(s.encode()).decode()


def _decrypt(s: str) -> str:
    if not _fernet or not s:
        return s
    try:
        return _fernet.decrypt(s.encode()).decode()
    except InvalidToken:
        return ""


def _decode(s) -> str:
    if not s:
        return ""
    parts = decode_header(s)
    out = ""
    for text, enc in parts:
        if isinstance(text, bytes):
            try:
                out += text.decode(enc or "utf-8", errors="ignore")
            except (LookupError, UnicodeDecodeError):
                out += text.decode("utf-8", errors="ignore")
        else:
            out += text
    return out


def _extract_body_html(msg) -> str:
    """Estrae HTML body dall'email (preferenza text/html, fallback text/plain)."""
    html = ""
    plain = ""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disp = str(part.get("Content-Disposition") or "")
            if "attachment" in disp:
                continue
            try:
                payload = part.get_payload(decode=True)
                if not payload:
                    continue
                charset = part.get_content_charset() or "utf-8"
                text = payload.decode(charset, errors="ignore")
                if ctype == "text/html":
                    html += text
                elif ctype == "text/plain":
                    plain += text
            except Exception:
                continue
    else:
        try:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                content = payload.decode(charset, errors="ignore")
                if msg.get_content_type() == "text/html":
                    html = content
                else:
                    plain = content
        except Exception:
            pass
    return html or plain


def _html_to_text(html: str) -> str:
    """Converte HTML in testo leggibile preservando URL e struttura."""
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        # Rimuovi script/style
        for tag in soup(["script", "style"]):
            tag.decompose()
        # Mantieni href su <a>
        for a in soup.find_all("a", href=True):
            label = a.get_text(" ", strip=True)
            a.replace_with(f"{label} [{a['href']}]")
        text = soup.get_text("\n", strip=True)
        return re.sub(r"\n{3,}", "\n\n", text)[:25000]
    except Exception:
        return re.sub(r"<[^>]+>", " ", html)[:25000]


def _detect_portal(sender: str) -> str:
    s = (sender or "").lower()
    if "immobiliare.it" in s:
        return "immobiliare"
    if "idealista" in s:
        return "idealista"
    if "casa.it" in s:
        return "casa"
    if "subito" in s:
        return "subito"
    if "wikicasa" in s:
        return "wikicasa"
    if "bakeca" in s:
        return "bakeca"
    return "altro"


async def _ai_extract_listings(llm_key: str, portal: str, subject: str, body_text: str) -> list:
    """Chiede a Claude di estrarre TUTTI gli annunci presenti nell'email."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    sys_msg = (
        "Sei un esperto di alert email immobiliari italiani. "
        f"Questa è un'email da {portal} con oggetto: \"{subject}\". "
        "Estrai TUTTI gli annunci immobiliari presenti nel testo. "
        "Rispondi SOLO con JSON valido (no markdown) nel formato esatto:\n"
        '{"annunci": ['
        '{"url":"str|null","indirizzo":"str|null","citta":"str|null",'
        '"prezzo_richiesto":num|null,"metratura":num|null,'
        '"tipologia":"bilocale|trilocale|quadrilocale|monolocale|negozio|ufficio|villa|altro",'
        '"canone_atteso":num|null,"note":"str max 150 char"}]}\n'
        "Regole CRITICHE:\n"
        "- prezzo_richiesto e metratura SOLO numeri puri (no €, no mq, no separatori)\n"
        "- url DEVE essere il link reale verso l'annuncio nel portale (cerca 'https://')\n"
        "- Se l'email contiene un singolo annuncio, restituisci un array con un solo elemento\n"
        "- Se non trovi nessun annuncio valido, restituisci {\"annunci\":[]}\n"
        "- Stima il canone_atteso solo se molto evidente, altrimenti null\n"
        "- Nelle note inserisci SOLO: stato (nuovo/da ristrutturare), piano, classe energetica\n\n"
        f"TESTO EMAIL:\n{body_text}"
    )
    chat = LlmChat(
        api_key=llm_key,
        session_id=f"inbox-{uuid.uuid4().hex[:8]}",
        system_message=sys_msg,
    ).with_model("anthropic", "claude-sonnet-4-6")
    reply = await chat.send_message(UserMessage(text="Estrai gli annunci ora."))
    text = reply.strip()
    if "```" in text:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if m:
            text = m.group(1).strip()
    s = text.find("{")
    e = text.rfind("}")
    if s == -1 or e <= s:
        return []
    try:
        data = json.loads(text[s : e + 1])
        return data.get("annunci", []) or []
    except json.JSONDecodeError:
        return []


class IMAPConfig(BaseModel):
    host: str
    port: int = 993
    use_ssl: bool = True
    username: str
    password: str  # in chiaro al POST, encrypted in DB
    folder: str = "INBOX"
    enabled: bool = True


def make_email_inbox_router(db, current_user, llm_key: Optional[str] = None):
    router = APIRouter(prefix="/api/email-inbox")

    @router.get("/config")
    async def get_config(user: dict = Depends(current_user)):
        cfg = await db.email_inbox_config.find_one({"user_id": user["id"]}, {"_id": 0})
        if not cfg:
            return {
                "configured": False, "host": "", "port": 993, "use_ssl": True,
                "username": "", "folder": "INBOX", "enabled": False,
                "last_sync_at": None, "last_sync_result": None,
            }
        return {
            "configured": True,
            "host": cfg.get("host"),
            "port": cfg.get("port", 993),
            "use_ssl": cfg.get("use_ssl", True),
            "username": cfg.get("username"),
            "folder": cfg.get("folder", "INBOX"),
            "enabled": cfg.get("enabled", True),
            "password_set": bool(cfg.get("password_enc")),
            "last_sync_at": cfg.get("last_sync_at"),
            "last_sync_result": cfg.get("last_sync_result"),
        }

    @router.post("/config")
    async def save_config(payload: IMAPConfig, user: dict = Depends(current_user)):
        doc = {
            "user_id": user["id"],
            "host": payload.host.strip(),
            "port": int(payload.port),
            "use_ssl": bool(payload.use_ssl),
            "username": payload.username.strip(),
            "password_enc": _encrypt(payload.password) if payload.password else None,
            "folder": payload.folder.strip() or "INBOX",
            "enabled": bool(payload.enabled),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        existing = await db.email_inbox_config.find_one({"user_id": user["id"]})
        if existing:
            # Se password vuota nel form, mantieni quella esistente
            if not payload.password:
                doc["password_enc"] = existing.get("password_enc")
            await db.email_inbox_config.update_one(
                {"user_id": user["id"]}, {"$set": doc}
            )
        else:
            await db.email_inbox_config.insert_one(doc)
        return {"ok": True}

    @router.delete("/config")
    async def delete_config(user: dict = Depends(current_user)):
        await db.email_inbox_config.delete_one({"user_id": user["id"]})
        return {"ok": True}

    def _connect_imap(cfg: dict):
        host = cfg["host"]
        port = int(cfg.get("port", 993))
        username = cfg["username"]
        password = _decrypt(cfg.get("password_enc") or "")
        if not password:
            raise ValueError("Password IMAP non configurata")
        if cfg.get("use_ssl", True):
            imap = imaplib.IMAP4_SSL(host, port)
        else:
            imap = imaplib.IMAP4(host, port)
        imap.login(username, password)
        return imap

    @router.post("/test")
    async def test_connection(user: dict = Depends(current_user)):
        cfg = await db.email_inbox_config.find_one({"user_id": user["id"]})
        if not cfg:
            raise HTTPException(404, "Configurazione IMAP mancante")
        try:
            def _do_test():
                imap = _connect_imap(cfg)
                imap.select(cfg.get("folder", "INBOX"), readonly=True)
                status, data = imap.search(None, "ALL")
                total = len(data[0].split()) if data and data[0] else 0
                status_un, data_un = imap.search(None, "UNSEEN")
                unseen = len(data_un[0].split()) if data_un and data_un[0] else 0
                imap.logout()
                return {"total": total, "unseen": unseen}
            stats = await asyncio.to_thread(_do_test)
            return {"ok": True, **stats}
        except imaplib.IMAP4.error as e:
            raise HTTPException(400, f"Login IMAP fallito: {str(e)[:150]}")
        except Exception as e:
            raise HTTPException(400, f"Connessione fallita: {str(e)[:150]}")

    @router.post("/sync")
    async def sync_inbox(payload: dict = None, user: dict = Depends(current_user)):
        cfg = await db.email_inbox_config.find_one({"user_id": user["id"]})
        if not cfg:
            raise HTTPException(404, "Configurazione IMAP mancante")
        if not llm_key:
            raise HTTPException(503, "AI non configurata")

        limit = int((payload or {}).get("limit") or 20)
        limit = max(1, min(50, limit))
        mark_seen = (payload or {}).get("mark_seen", True)

        def _fetch_emails():
            """Sync IMAP fetch in thread separato."""
            imap = _connect_imap(cfg)
            imap.select(cfg.get("folder", "INBOX"))
            status, data = imap.search(None, "UNSEEN")
            if status != "OK" or not data or not data[0]:
                imap.logout()
                return []
            ids = data[0].split()
            # Prendi i più recenti
            ids = ids[-limit:]
            emails = []
            for uid in ids:
                status, msg_data = imap.fetch(uid, "(RFC822)")
                if status != "OK" or not msg_data or not msg_data[0]:
                    continue
                raw = msg_data[0][1]
                msg = email_lib.message_from_bytes(raw)
                emails.append({
                    "uid": uid.decode() if isinstance(uid, bytes) else str(uid),
                    "from": _decode(msg.get("From")),
                    "subject": _decode(msg.get("Subject")),
                    "date": msg.get("Date"),
                    "body_html": _extract_body_html(msg),
                })
            # Mark seen
            if mark_seen:
                for uid in ids:
                    try:
                        imap.store(uid, "+FLAGS", "\\Seen")
                    except Exception:
                        pass
            imap.logout()
            return emails

        try:
            emails = await asyncio.to_thread(_fetch_emails)
        except imaplib.IMAP4.error as e:
            raise HTTPException(400, f"Login IMAP fallito: {str(e)[:150]}")
        except Exception as e:
            raise HTTPException(400, f"Errore IMAP: {str(e)[:150]}")

        if not emails:
            await db.email_inbox_config.update_one(
                {"user_id": user["id"]},
                {"$set": {
                    "last_sync_at": datetime.now(timezone.utc).isoformat(),
                    "last_sync_result": {"emails": 0, "deals_creati": 0, "skipped": 0},
                }},
            )
            return {
                "emails_processate": 0, "deals_creati": 0, "annunci_trovati": 0,
                "skipped_no_listing": 0, "dettagli": [],
            }

        from routers.pipeline import _compute_ai_score

        dettagli = []
        total_listings = 0
        total_created = 0
        skipped = 0

        for em in emails:
            portal = _detect_portal(em["from"])
            body_text = _html_to_text(em["body_html"])
            if len(body_text) < 100:
                skipped += 1
                dettagli.append({
                    "from": em["from"], "subject": em["subject"],
                    "portal": portal, "annunci": 0, "creati": 0,
                    "note": "Body email vuoto o non leggibile",
                })
                continue
            try:
                listings = await _ai_extract_listings(
                    llm_key, portal, em["subject"], body_text
                )
            except Exception as e:
                logger.warning(f"AI parse failed for email {em['uid']}: {e}")
                listings = []

            created_in_email = 0
            seen_urls = set()
            for ann in listings:
                indirizzo = (ann.get("indirizzo") or "").strip()
                prezzo = ann.get("prezzo_richiesto")
                if not indirizzo or not prezzo:
                    continue
                url = (ann.get("url") or "").strip()
                # Dedup intra-email
                if url and url in seen_urls:
                    continue
                if url:
                    seen_urls.add(url)
                # Dedup cross-DB su URL (se già importato non duplicare)
                if url:
                    exists = await db.deals.find_one(
                        {"user_id": user["id"], "url_annuncio": url}
                    )
                    if exists:
                        continue

                ai = await _compute_ai_score(
                    db, user["id"], float(prezzo), ann.get("canone_atteso")
                )
                now = datetime.now(timezone.utc).isoformat()
                item = {
                    "id": f"DEAL-{uuid.uuid4().hex[:6].upper()}",
                    "user_id": user["id"],
                    "is_pipeline": True,
                    "stage": "visionato",
                    "convertito": False,
                    "indirizzo": indirizzo[:160],
                    "citta": (ann.get("citta") or "")[:80],
                    "prezzo_richiesto": float(prezzo),
                    "prezzo_corrente": float(prezzo),
                    "fonte": portal,
                    "metratura": ann.get("metratura"),
                    "tipologia": ann.get("tipologia") or "",
                    "canone_atteso": ann.get("canone_atteso"),
                    "note": (ann.get("note") or "")[:300],
                    "url_annuncio": url or None,
                    "sorgente_email": {
                        "from": em["from"], "subject": em["subject"], "date": em["date"],
                    },
                    **ai,
                    "created_at": now,
                    "stage_updated_at": now,
                    "timeline": [{
                        "id": f"EVT-{uuid.uuid4().hex[:6].upper()}",
                        "tipo": "visione",
                        "data": date.today().isoformat(),
                        "descrizione": f"Importato da email {portal} · AI Score {ai.get('ai_deal_score','-')}/100 ({ai.get('ai_giudizio','-')})",
                        "stage_dopo": "visionato",
                    }],
                }
                await db.deals.insert_one(item)
                created_in_email += 1
                total_created += 1
            total_listings += len(listings)
            dettagli.append({
                "from": em["from"], "subject": em["subject"], "portal": portal,
                "annunci": len(listings), "creati": created_in_email,
            })

        result = {
            "emails_processate": len(emails),
            "deals_creati": total_created,
            "annunci_trovati": total_listings,
            "skipped_no_listing": skipped,
            "dettagli": dettagli,
        }
        await db.email_inbox_config.update_one(
            {"user_id": user["id"]},
            {"$set": {
                "last_sync_at": datetime.now(timezone.utc).isoformat(),
                "last_sync_result": {
                    "emails": result["emails_processate"],
                    "deals_creati": result["deals_creati"],
                    "skipped": result["skipped_no_listing"],
                },
            }},
        )
        return result

    return router
