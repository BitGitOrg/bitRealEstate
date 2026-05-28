"""
Real Estate Portfolio Control Room — Backend
FastAPI + MongoDB + Emergent LLM (Claude Sonnet 4.6) for AI Autopilot.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt

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
    context: Optional[dict] = None  # optional snapshot of portfolio metrics

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
    mutuo_pct: Optional[float] = 0  # 0..1

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
        if input.context:
            sys_msg += f"\n\n[CONTESTO PORTAFOGLIO]\n{input.context}"
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=input.session_id,
            system_message=sys_msg,
        ).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=input.message))
        # persist
        await db.ai_messages.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "session_id": input.session_id,
            "user_message": input.message,
            "reply": reply,
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
    # Heuristic local scoring + optional LLM enrichment for the verdict text.
    prezzo = input.prezzo_richiesto
    lavori = input.lavori_previsti or 0
    accessori = input.costi_accessori or 0
    costo_totale = prezzo + lavori + accessori
    canone = input.canone_stimato or 0
    rendimento_lordo = (canone * 12) / costo_totale * 100 if costo_totale > 0 else 0
    # Heuristic: net ≈ lordo * 0.65 (taxes/condo/maint)
    rendimento_netto = rendimento_lordo * 0.65

    score = 50
    score += min(30, max(-30, (rendimento_netto - 5) * 6))  # +/- 30 around 5% target
    if lavori > 0 and lavori / prezzo > 0.5:
        score -= 10
    if input.mutuo_pct and input.mutuo_pct > 0.8:
        score -= 8
    if canone == 0:
        score -= 15
    score = max(0, min(100, int(score)))

    if score >= 91: giudizio, strategia = "Operazione eccellente", "Affitto a reddito"
    elif score >= 76: giudizio, strategia = "Buona operazione", "Affitto a reddito"
    elif score >= 61: giudizio, strategia = "Operazione interessante", "Valutare ristrutturazione+vendita"
    elif score >= 41: giudizio, strategia = "Operazione rischiosa", "Negoziare prezzo o passare"
    else: giudizio, strategia = "Operazione sconsigliata", "Non procedere"

    rischio = "Basso" if score >= 75 else ("Medio" if score >= 50 else "Alto")
    # Prezzo max consigliato: per centrare un netto del 6%
    target_netto = 6.0
    if canone > 0:
        prezzo_max = (canone * 12) / (target_netto / 100) / 0.65 - lavori - accessori
        prezzo_max = max(0, prezzo_max)
    else:
        prezzo_max = prezzo * 0.85

    punti = []
    if canone == 0: punti.append("Canone stimato mancante: difficile calcolare rendimento.")
    if lavori / max(prezzo, 1) > 0.3: punti.append(f"Lavori importanti ({lavori/prezzo*100:.0f}% del prezzo): rischio scostamento budget.")
    if rendimento_netto < 4: punti.append(f"Rendimento netto stimato {rendimento_netto:.1f}% sotto soglia 4%.")
    if input.mutuo_pct and input.mutuo_pct > 0.7: punti.append(f"Leva alta ({input.mutuo_pct*100:.0f}%): rata potenzialmente vicina al canone.")
    if not punti: punti.append("Nessuna criticità rilevata sui parametri inseriti.")

    scenari = {
        "ottimistico": {"rendimento_netto": round(rendimento_netto * 1.2, 2), "note": "Canone +10%, lavori a budget."},
        "realistico": {"rendimento_netto": round(rendimento_netto, 2), "note": "Parametri attuali."},
        "pessimistico": {"rendimento_netto": round(rendimento_netto * 0.7, 2), "note": "Sfitto 2 mesi/anno, lavori +20%."},
    }
    return DealAnalyzeOut(
        deal_score=score,
        giudizio=giudizio,
        prezzo_massimo_consigliato=round(prezzo_max, 0),
        rendimento_lordo=round(rendimento_lordo, 2),
        rendimento_netto_stimato=round(rendimento_netto, 2),
        rischio=rischio,
        punti_attenzione=punti,
        strategia_consigliata=strategia,
        scenari=scenari,
    )

@api_router.get("/ai/history/{session_id}")
async def ai_history(session_id: str, user: dict = Depends(current_user)):
    msgs = await db.ai_messages.find(
        {"user_id": user["id"], "session_id": session_id},
        {"_id": 0}
    ).sort("ts", 1).to_list(200)
    return msgs

# ===== Mount =====
app.include_router(api_router)

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
