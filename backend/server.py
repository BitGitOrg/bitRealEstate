"""
Real Estate Portfolio Control Room — Backend
FastAPI + MongoDB + Emergent LLM (Claude Sonnet 4.6) for AI Autopilot.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import re
import logging
import uuid
from pathlib import Path
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel, EmailStr

from routers._shared import compute_deal_score
from routers.properties import make_properties_router
from routers.imports import make_imports_router
from routers.settings import make_settings_router
from routers.reports import make_reports_router
from routers.forecast import make_forecast_router
from routers.documents import make_documents_router
from routers.alerts import make_alerts_router
from routers.incassi import make_incassi_router
from routers.finance import make_finance_router
from routers.mutui import make_mutui_router
from routers.contracts import make_contracts_router

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'dev-secret')
JWT_ALG = "HS256"
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

app = FastAPI(title="Real Estate Control Room API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# ===== Models =====
ROLES = Literal["admin", "ceo", "amministrazione", "commercialista", "collaboratore"]


class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    role: str


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    token: str
    user: UserPublic


class ChatMessageIn(BaseModel):
    session_id: str
    message: str
    context: Optional[dict] = None


class ChatMessageOut(BaseModel):
    reply: str
    session_id: str


class DealAnalyzeIn(BaseModel):
    prezzo_richiesto: float
    metratura: float
    canone_stimato: Optional[float] = None
    lavori_previsti: Optional[float] = 0
    costi_accessori: Optional[float] = 0
    citta: Optional[str] = ""
    note: Optional[str] = ""
    mutuo_pct: Optional[float] = 0


class DealAnalyzeOut(BaseModel):
    deal_score: int
    giudizio: str
    prezzo_massimo_consigliato: float
    rendimento_lordo: float
    rendimento_netto_stimato: float
    rischio: str
    punti_attenzione: List[str]
    strategia_consigliata: str
    scenari: dict


# ===== Demo users (seeded once) =====
DEMO_USERS = [
    {"email": "ceo@controlroom.it", "password": "demo1234", "name": "Marco Rossi", "role": "admin"},
    {"email": "amministrazione@controlroom.it", "password": "demo1234", "name": "Laura Bianchi", "role": "amministrazione"},
    {"email": "commercialista@controlroom.it", "password": "demo1234", "name": "Paolo Verdi", "role": "commercialista"},
    {"email": "collaboratore@controlroom.it", "password": "demo1234", "name": "Sara Conti", "role": "collaboratore"},
]


async def seed_users():
    existing = await db.users.count_documents({})
    if existing >= len(DEMO_USERS):
        return
    await db.users.delete_many({})
    for u in DEMO_USERS:
        pw_hash = bcrypt.hashpw(u["password"].encode(), bcrypt.gensalt()).decode()
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": u["email"],
            "password_hash": pw_hash,
            "name": u["name"],
            "role": u["role"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


# ===== Auth utilities =====
def create_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ===== Routes =====
@api_router.get("/")
async def root():
    return {"message": "Real Estate Control Room API", "ok": True}


@api_router.post("/auth/login", response_model=TokenOut)
async def login(input: LoginInput):
    await seed_users()
    user = await db.users.find_one({"email": input.email.lower()})
    if not user:
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    if not bcrypt.checkpw(input.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    token = create_token(user)
    return TokenOut(
        token=token,
        user=UserPublic(id=user["id"], email=user["email"], name=user["name"], role=user["role"]),
    )


@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(current_user)):
    return UserPublic(id=user["id"], email=user["email"], name=user["name"], role=user["role"])


@api_router.get("/auth/demo-accounts")
async def demo_accounts():
    return [{"email": u["email"], "password": u["password"], "role": u["role"], "name": u["name"]} for u in DEMO_USERS]


# ===== AI Autopilot — Claude Sonnet 4.6 =====
AUTOPILOT_SYSTEM = (
    "Sei AI Autopilot, un assistente strategico per la gestione di un portafoglio immobiliare italiano. "
    "Rispondi sempre in italiano, in modo conciso, professionale e orientato ai dati. "
    "Aiuti il CEO a prendere decisioni su acquisti, vendite, affitti, rendimenti, cash flow e debito. "
    "Quando ti vengono forniti dati del portafoglio (KPI, immobili, cash flow), usali esplicitamente nelle risposte. "
    "Quando dai consigli, indica numeri concreti, soglie, percentuali, e una raccomandazione finale chiara (Vendere / Tenere / Affittare / Rinegoziare). "
    "Mantieni un tono da analista senior — diretto, niente fronzoli."
)


@api_router.post("/ai/chat", response_model=ChatMessageOut)
async def ai_chat(input: ChatMessageIn, user: dict = Depends(current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key non configurata")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        sys_msg = AUTOPILOT_SYSTEM

        real_props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
        latest_bil = await db.bilanci.find_one({"user_id": user["id"]}, {"_id": 0}, sort=[("created_at", -1)])
        last_3_bil = await db.bilanci.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(3)

        real_block = ""
        if real_props:
            real_block += f"\n\n[DATI REALI — {len(real_props)} immobili importati]\n"
            for p in real_props[:25]:
                real_block += (
                    f"- {p.get('nome')} ({p.get('citta','')}) · {p.get('tipologia','')} {p.get('metratura',0)}m² · "
                    f"costo {p.get('prezzo_acquisto',0):.0f}€ · canone {p.get('canone_mensile',0):.0f}€/mese · "
                    f"stato {p.get('stato','')}\n"
                )
        if latest_bil:
            ce = latest_bil.get("conto_economico", {}) or {}
            sp = latest_bil.get("stato_patrimoniale", {}) or {}
            real_block += (
                f"\n[ULTIMO BILANCIO — {latest_bil.get('periodo','')} ({latest_bil.get('tipo','')})]\n"
                f"Ricavi affitti: {ce.get('ricavi_affitti',0):.0f}€ · Totale ricavi: {ce.get('totale_ricavi',0):.0f}€ · "
                f"Totale costi: {ce.get('totale_costi',0):.0f}€ · Utile netto: {ce.get('utile_netto',0):.0f}€\n"
                f"Valore immobili: {sp.get('valore_immobili',0):.0f}€ · Debito mutui: {sp.get('debito_mutui',0):.0f}€ · "
                f"Liquidità: {sp.get('liquidita',0):.0f}€ · Patrimonio netto: {sp.get('patrimonio_netto',0):.0f}€\n"
            )
        if len(last_3_bil) > 1:
            real_block += "\n[STORICO ULTIMI BILANCI]\n"
            for b in last_3_bil:
                ce = b.get("conto_economico", {}) or {}
                real_block += f"- {b.get('periodo','')}: utile {ce.get('utile_netto',0):.0f}€, ricavi {ce.get('totale_ricavi',0):.0f}€\n"

        if real_block:
            sys_msg += "\n\n=== DATI EFFETTIVI DELLA SOCIETÀ (priorità su qualunque dato demo) ===" + real_block
            sys_msg += "\nUsa SEMPRE questi dati reali nelle risposte e cita esplicitamente periodo/immobile quando li menzioni."
        elif input.context:
            sys_msg += f"\n\n[CONTESTO PORTAFOGLIO]\n{input.context}"

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=input.session_id,
            system_message=sys_msg,
        ).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=input.message))
        await db.ai_messages.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "session_id": input.session_id,
            "user_message": input.message,
            "reply": reply,
            "has_real_data": bool(real_block),
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        return ChatMessageOut(reply=reply, session_id=input.session_id)
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("AI chat error")
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")


@api_router.post("/ai/deal-analyze", response_model=DealAnalyzeOut)
async def deal_analyze(input: DealAnalyzeIn, user: dict = Depends(current_user)):
    prezzo = input.prezzo_richiesto
    lavori = input.lavori_previsti or 0
    accessori = input.costi_accessori or 0
    costo_totale = prezzo + lavori + accessori
    canone = input.canone_stimato or 0
    rendimento_lordo = (canone * 12) / costo_totale * 100 if costo_totale > 0 else 0
    # Abbattimento realistico ~25-28% (Cedolare 21% + ~5% costi gestione su rendita netta)
    rendimento_netto = rendimento_lordo * 0.73

    # Scoring più equilibrato, meno stringente
    score = 55
    score += min(35, max(-35, (rendimento_netto - 4) * 7))   # baricentro su 4% netto (era 5%)
    # Penalità più leggere
    if lavori > 0 and lavori / max(prezzo, 1) > 0.5:
        score -= 8       # era -10
    if input.mutuo_pct and input.mutuo_pct > 0.85:
        score -= 6       # era -8 a 0.8
    if canone == 0:
        score -= 10      # era -15
    # Bonus rendimento lordo alto (deal di valore)
    if rendimento_lordo >= 8:
        score += 6
    elif rendimento_lordo >= 6.5:
        score += 3
    score = max(0, min(100, int(score)))

    if score >= 88:
        giudizio, strategia = "Operazione eccellente", "Affitto a reddito"
    elif score >= 72:
        giudizio, strategia = "Buona operazione", "Affitto a reddito"
    elif score >= 55:
        giudizio, strategia = "Operazione interessante", "Valutare ristrutturazione+vendita"
    elif score >= 38:
        giudizio, strategia = "Operazione rischiosa", "Negoziare prezzo o passare"
    else:
        giudizio, strategia = "Operazione sconsigliata", "Non procedere"

    rischio = "Basso" if score >= 70 else ("Medio" if score >= 45 else "Alto")
    # Prezzo max: punto di break-even per target netto 5% (era 6% troppo stringente)
    target_netto = 5.0
    if canone > 0:
        prezzo_max = (canone * 12) / (target_netto / 100) / 0.73 - lavori - accessori
        prezzo_max = max(0, prezzo_max)
    else:
        prezzo_max = prezzo * 0.90  # era 0.85 più severo

    punti = []
    if canone == 0:
        punti.append("Canone stimato mancante: stima al volo difficile, inserisci un valore di mercato per la zona.")
    if lavori / max(prezzo, 1) > 0.3:
        punti.append(f"Lavori importanti ({lavori/prezzo*100:.0f}% del prezzo): valuta margine di sicurezza sul budget.")
    if rendimento_netto > 0 and rendimento_netto < 3.5:
        punti.append(f"Rendimento netto stimato {rendimento_netto:.1f}% basso (soglia 3.5%): valuta riduzione prezzo o canone più alto.")
    if input.mutuo_pct and input.mutuo_pct > 0.75:
        punti.append(f"Leva alta ({input.mutuo_pct*100:.0f}%): la rata assorbe una grossa fetta del canone.")
    if rendimento_lordo >= 7 and not punti:
        punti.append(f"Rendimento lordo {rendimento_lordo:.1f}% sopra media: operazione interessante.")
    if not punti:
        punti.append("Nessuna criticità rilevata: parametri equilibrati.")

    scenari = {
        "ottimistico": {"rendimento_netto": round(rendimento_netto * 1.15, 2), "note": "Canone +8%, costi gestione contenuti, sfitto azzerato."},
        "realistico": {"rendimento_netto": round(rendimento_netto, 2), "note": "Parametri attuali, costi standard, 1 mese sfitto/anno."},
        "pessimistico": {"rendimento_netto": round(rendimento_netto * 0.78, 2), "note": "Sfitto 2 mesi/anno, lavori +15%, IMU/manutenzioni in linea alta."},
    }
    return DealAnalyzeOut(
        deal_score=score, giudizio=giudizio,
        prezzo_massimo_consigliato=round(prezzo_max, 0),
        rendimento_lordo=round(rendimento_lordo, 2),
        rendimento_netto_stimato=round(rendimento_netto, 2),
        rischio=rischio, punti_attenzione=punti,
        strategia_consigliata=strategia, scenari=scenari,
    )


@api_router.get("/ai/history/{session_id}")
async def ai_history(session_id: str, user: dict = Depends(current_user)):
    msgs = await db.ai_messages.find(
        {"user_id": user["id"], "session_id": session_id},
        {"_id": 0}
    ).sort("ts", 1).to_list(200)
    return msgs


# ============================================================
# ===== Deal Inbox + AI Scout + Watchlists =====
# ============================================================

class DealAnalyzeRequest(BaseModel):
    url: Optional[str] = None
    text: Optional[str] = None
    note: Optional[str] = None


class WatchlistIn(BaseModel):
    nome: str
    citta: Optional[str] = None
    tipologia: Optional[str] = None
    prezzo_max: Optional[float] = None
    metratura_min: Optional[float] = None
    rendimento_min: Optional[float] = None
    attiva: bool = True


class DealStatusUpdate(BaseModel):
    status: Literal["nuovo", "interessato", "scartato", "in_trattativa"]


def strip_html(html: str, limit: int = 8000) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript", "header", "footer", "nav", "svg"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    text = re.sub(r"\s+", " ", text)
    return text[:limit]


async def fetch_url_text(url: str) -> str:
    """Scarica una pagina con fallback automatico se la fonte blocca i bot.
    Strategia: 1) HTTP diretto, 2) Jina Reader (r.jina.ai estrae testo pulito di qualsiasi URL).
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.google.com/",
        "Cache-Control": "no-cache",
    }
    # 1) HTTP diretto
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, headers=headers) as cli:
            r = await cli.get(url)
            if 200 <= r.status_code < 400 and len(r.text) > 500:
                text = strip_html(r.text)
                if len(text) > 200:
                    return text
            logging.info(f"fetch_url_text: HTTP {r.status_code} per {url}, provo fallback Jina")
    except Exception as ex:
        logging.warning(f"fetch_url_text: errore HTTP diretto {ex}, provo Jina")
    # 2) Fallback Jina Reader (https://r.jina.ai/<URL>) — restituisce markdown pulito di qualsiasi pagina, bypassa anti-bot
    try:
        jina_url = "https://r.jina.ai/" + url
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as cli:
            r = await cli.get(jina_url, headers={"Accept": "text/plain", "X-Return-Format": "text"})
            if 200 <= r.status_code < 400 and r.text:
                body = r.text
                # Filtra noise di Jina (cookie warning, errori target)
                bad_patterns = [
                    "Target URL returned error 4",
                    "Target URL returned error 5",
                    "may be requiring CAPTCHA",
                    "consider enabling shadow DOM",
                ]
                # Estrai solo la sezione "Markdown Content:" se presente
                if "Markdown Content:" in body:
                    body = body.split("Markdown Content:", 1)[1].strip()
                # Se dopo filter è ancora troppo corto o contiene cookie banner solo, fallisci
                has_error = any(p.lower() in r.text.lower() for p in bad_patterns)
                # Cleaning: rimuovi cookie banners ricorrenti
                if len(body) > 500 and not has_error:
                    return body[:15000]
                if len(body) > 200 and not has_error:
                    return body[:15000]
            logging.warning(f"Jina HTTP {r.status_code} o contenuto inutile")
    except Exception as ex:
        logging.exception(f"Jina fetch failed: {ex}")
    raise HTTPException(status_code=400, detail=(
        "Il sito (es. Immobiliare.it/Idealista) blocca le richieste automatiche e non è stato possibile recuperare il testo. "
        "Soluzione: 1) apri l'annuncio nel browser, 2) seleziona tutto il testo con Ctrl/Cmd+A, 3) copialo e incollalo qui sotto nel campo «Testo annuncio» invece dell'URL."
    ))


DEAL_EXTRACT_PROMPT = (
    "Sei un sistema di estrazione dati da annunci immobiliari italiani. "
    "Ricevi il testo di un annuncio e devi rispondere SOLO con un JSON valido, niente prefissi, niente markdown, niente backticks. "
    "Struttura JSON richiesta:\n"
    '{\n'
    '  "titolo": "string breve",\n'
    '  "prezzo": numero in EUR (0 se non trovato),\n'
    '  "metratura": numero in m² (0 se non trovato),\n'
    '  "locali": numero (0 se non trovato),\n'
    '  "piano": "string o vuoto",\n'
    '  "tipologia": "Bilocale|Trilocale|Quadrilocale|Monolocale|Villa|Loft|Attico|Altro",\n'
    '  "citta": "string",\n'
    '  "zona": "quartiere o indirizzo se presente, altrimenti vuoto",\n'
    '  "anno_costruzione": numero (0 se non trovato),\n'
    '  "classe_energetica": "A|B|C|D|E|F|G o vuoto",\n'
    '  "canone_stimato": numero EUR/mese stimato in base a zona e metratura italiani (mai 0),\n'
    '  "descrizione_breve": "max 200 caratteri",\n'
    '  "punti_forza": ["3-5 bullet"],\n'
    '  "punti_attenzione": ["3-5 bullet"]\n'
    "}\n"
    "Se un dato non è esplicitamente nel testo, ricavalo con stima ragionevole basata su zona/metratura italiane. "
    "Il canone_stimato deve essere SEMPRE > 0."
)


async def match_watchlists(user_id: str, deal: dict) -> list:
    wls = await db.watchlists.find({"user_id": user_id, "attiva": True}, {"_id": 0}).to_list(50)
    matches = []
    for w in wls:
        ok = True
        if w.get("citta") and deal.get("citta", "").lower() != w["citta"].lower():
            ok = False
        if w.get("tipologia") and deal.get("tipologia") != w["tipologia"]:
            ok = False
        if w.get("prezzo_max") and deal.get("prezzo", 0) > w["prezzo_max"]:
            ok = False
        if w.get("metratura_min") and deal.get("metratura", 0) < w["metratura_min"]:
            ok = False
        if w.get("rendimento_min") and deal.get("rendimento_netto", 0) < w["rendimento_min"]:
            ok = False
        if ok:
            matches.append({"id": w["id"], "nome": w["nome"]})
    return matches


@api_router.post("/deals/analyze")
async def deals_analyze(req: DealAnalyzeRequest, user: dict = Depends(current_user)):
    if not req.url and not req.text:
        raise HTTPException(status_code=400, detail="Inserisci URL oppure testo dell'annuncio.")
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key non configurata")

    raw = req.text or ""
    if req.url and not raw:
        raw = await fetch_url_text(req.url)
    raw = raw[:8000]

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"extract-{uuid.uuid4()}",
            system_message=DEAL_EXTRACT_PROMPT,
        ).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=raw or req.note or ""))
    except Exception as e:
        logging.exception("LLM extract error")
        raise HTTPException(status_code=500, detail=f"Errore estrazione AI: {str(e)}")

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
        raise HTTPException(status_code=500, detail="L'AI non ha restituito JSON valido. Riprova.")

    prezzo_val = float(parsed.get("prezzo", 0) or 0)
    if prezzo_val <= 0:
        raise HTTPException(
            status_code=422,
            detail="Annuncio non riconoscibile: prezzo non trovato. Incolla il testo completo dell'annuncio.",
        )
    score_data = compute_deal_score(
        prezzo_val,
        float(parsed.get("metratura", 0) or 0),
        float(parsed.get("canone_stimato", 0) or 0),
        parsed.get("citta", "") or "",
    )

    deal = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "source_url": req.url, "note": req.note,
        "titolo": parsed.get("titolo", "Annuncio senza titolo"),
        "prezzo": float(parsed.get("prezzo", 0) or 0),
        "metratura": float(parsed.get("metratura", 0) or 0),
        "locali": int(parsed.get("locali", 0) or 0),
        "piano": parsed.get("piano", ""),
        "tipologia": parsed.get("tipologia", "Altro"),
        "citta": parsed.get("citta", ""),
        "zona": parsed.get("zona", ""),
        "anno_costruzione": int(parsed.get("anno_costruzione", 0) or 0),
        "classe_energetica": parsed.get("classe_energetica", ""),
        "canone_stimato": float(parsed.get("canone_stimato", 0) or 0),
        "descrizione_breve": parsed.get("descrizione_breve", ""),
        "punti_forza": parsed.get("punti_forza", []) or [],
        "punti_attenzione": parsed.get("punti_attenzione", []) or [],
        **score_data,
        "status": "nuovo",
        "watchlist_matches": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    deal["watchlist_matches"] = await match_watchlists(user["id"], deal)
    await db.deals.insert_one(deal.copy())
    deal.pop("_id", None)
    return deal


@api_router.get("/deals")
async def list_deals(status: Optional[str] = None, user: dict = Depends(current_user)):
    q = {"user_id": user["id"]}
    if status:
        q["status"] = status
    items = await db.deals.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@api_router.patch("/deals/{deal_id}/status")
async def update_deal_status(deal_id: str, upd: DealStatusUpdate, user: dict = Depends(current_user)):
    res = await db.deals.update_one(
        {"id": deal_id, "user_id": user["id"]},
        {"$set": {"status": upd.status, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Deal non trovato")
    deal = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    return deal


@api_router.delete("/deals/{deal_id}")
async def delete_deal(deal_id: str, user: dict = Depends(current_user)):
    await db.deals.delete_one({"id": deal_id, "user_id": user["id"]})
    return {"ok": True}


@api_router.get("/watchlists")
async def list_watchlists(user: dict = Depends(current_user)):
    items = await db.watchlists.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return items


@api_router.post("/watchlists")
async def create_watchlist(w: WatchlistIn, user: dict = Depends(current_user)):
    item = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        **w.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.watchlists.insert_one(item.copy())
    item.pop("_id", None)
    return item


@api_router.delete("/watchlists/{wid}")
async def delete_watchlist(wid: str, user: dict = Depends(current_user)):
    await db.watchlists.delete_one({"id": wid, "user_id": user["id"]})
    return {"ok": True}


@api_router.patch("/watchlists/{wid}")
async def toggle_watchlist(wid: str, attiva: bool, user: dict = Depends(current_user)):
    await db.watchlists.update_one(
        {"id": wid, "user_id": user["id"]},
        {"$set": {"attiva": attiva}},
    )
    return {"ok": True}


# ===== Mount =====
app.include_router(api_router)
app.include_router(make_properties_router(db, current_user))
app.include_router(make_imports_router(db, current_user, EMERGENT_LLM_KEY))
app.include_router(make_settings_router(db, current_user))
app.include_router(make_reports_router(db, current_user))
app.include_router(make_forecast_router(db, current_user, EMERGENT_LLM_KEY))
app.include_router(make_documents_router(db, current_user, EMERGENT_LLM_KEY))
app.include_router(make_alerts_router(db, current_user))
app.include_router(make_incassi_router(db, current_user))
app.include_router(make_finance_router(db, current_user))
app.include_router(make_mutui_router(db, current_user, EMERGENT_LLM_KEY))
app.include_router(make_contracts_router(db, current_user))

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_start():
    await seed_users()
    logger.info("Backend started, users seeded.")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
