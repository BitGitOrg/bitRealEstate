"""
Script: svuota i dati operativi del CEO e popola con i 5 immobili Torino reali.
Esegui con: python /app/backend/scripts/reset_and_seed_torino.py
"""
import asyncio
import os
import uuid
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

CEO_EMAIL = "ceo@controlroom.it"

PROPS = [
    {
        "id": "IMM-001",
        "nome": "Via Foligno", "indirizzo": "Via Foligno 18", "citta": "Torino", "provincia": "TO",
        "tipologia": "Bilocale", "metratura": 55, "piano": "2°", "anno_costruzione": 1965, "classe_energetica": "E",
        "stato": "affittato", "operazione": "reddito",
        "data_acquisto": "2025-02-15", "prezzo_acquisto": 24000, "notaio": 0, "agenzia": 3000, "imposte": 2160,
        "lavori": 0, "valore_stimato": 32000,
        "canone_mensile": 320,
        "mutuo": None,
        "inquilino": "Inquilino Via Foligno",
        "data_inizio_contratto": "2026-01-01", "scadenza_contratto": "2030-01-01",
        "deposito_cauzionale": 640, "durata_contratto_anni": 4, "rinnovo_automatico": True,
        "note": "Acquisto cash. Atto ~9% incluso in imposte.",
        "img": "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?crop=entropy&cs=srgb&fm=jpg&w=800",
    },
    {
        "id": "IMM-002",
        "nome": "Negozio P.za De Amicis", "indirizzo": "Piazza Edmondo De Amicis 4", "citta": "Torino", "provincia": "TO",
        "tipologia": "Negozio", "metratura": 78, "piano": "T", "anno_costruzione": 1955, "classe_energetica": "F",
        "stato": "affittato", "operazione": "reddito",
        "data_acquisto": "2025-05-10", "prezzo_acquisto": 60000, "notaio": 0, "agenzia": 0, "imposte": 5400,
        "lavori": 0, "valore_stimato": 70000,
        "canone_mensile": 590,
        "mutuo": None,
        "inquilino": "Conduttore Negozio",
        "data_inizio_contratto": "2026-01-01", "scadenza_contratto": "2032-01-01",
        "deposito_cauzionale": 1770, "durata_contratto_anni": 6, "rinnovo_automatico": True,
        "note": "Negozio commerciale. Acquisto cash. Atto ~9% incluso in imposte.",
        "img": "https://images.unsplash.com/photo-1582407947304-fd86f028f716?crop=entropy&cs=srgb&fm=jpg&w=800",
    },
    {
        "id": "IMM-003",
        "nome": "Via Borgaro", "indirizzo": "Via Borgaro 86", "citta": "Torino", "provincia": "TO",
        "tipologia": "Bilocale", "metratura": 52, "piano": "1°", "anno_costruzione": 1968, "classe_energetica": "E",
        "stato": "affittato", "operazione": "reddito",
        "data_acquisto": "2025-07-08", "prezzo_acquisto": 52000, "notaio": 0, "agenzia": 3000, "imposte": 4680,
        "lavori": 0, "valore_stimato": 62000,
        "canone_mensile": 480,
        "mutuo": None,
        "inquilino": "Inquilino Via Borgaro",
        "data_inizio_contratto": "2026-01-01", "scadenza_contratto": "2030-01-01",
        "deposito_cauzionale": 960, "durata_contratto_anni": 4, "rinnovo_automatico": True,
        "note": "Acquisto cash. Atto ~9% incluso in imposte.",
        "img": "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?crop=entropy&cs=srgb&fm=jpg&w=800",
    },
    {
        "id": "IMM-004",
        "nome": "Via Don Bosco", "indirizzo": "Via Don Giovanni Bosco 22", "citta": "Torino", "provincia": "TO",
        "tipologia": "Bilocale", "metratura": 50, "piano": "3°", "anno_costruzione": 1960, "classe_energetica": "F",
        "stato": "affittato", "operazione": "reddito",
        "data_acquisto": "2025-09-15", "prezzo_acquisto": 51000, "notaio": 0, "agenzia": 6000, "imposte": 4590,
        "lavori": 0, "valore_stimato": 63000,
        "canone_mensile": 420,
        "mutuo": None,
        "inquilino": "Inquilino Via Don Bosco",
        "data_inizio_contratto": "2026-01-01", "scadenza_contratto": "2030-01-01",
        "deposito_cauzionale": 840, "durata_contratto_anni": 4, "rinnovo_automatico": True,
        "note": "Acquisto cash. Atto ~9% incluso in imposte.",
        "img": "https://images.unsplash.com/photo-1493809842364-78817add7ffb?crop=entropy&cs=srgb&fm=jpg&w=800",
    },
    {
        "id": "IMM-005",
        "nome": "Via Lauro Rossi", "indirizzo": "Via Lauro Rossi 14", "citta": "Torino", "provincia": "TO",
        "tipologia": "Bilocale", "metratura": 54, "piano": "2°", "anno_costruzione": 1963, "classe_energetica": "E",
        "stato": "affittato", "operazione": "reddito",
        "data_acquisto": "2025-11-20", "prezzo_acquisto": 58000, "notaio": 0, "agenzia": 4000, "imposte": 5220,
        "lavori": 0, "valore_stimato": 70000,
        "canone_mensile": 480,
        "mutuo": None,
        "inquilino": "Inquilino Lauro Rossi",
        "data_inizio_contratto": "2026-01-01", "scadenza_contratto": "2030-01-01",
        "deposito_cauzionale": 960, "durata_contratto_anni": 4, "rinnovo_automatico": True,
        "note": "Acquisto cash. Atto ~9% incluso in imposte.",
        "img": "https://images.unsplash.com/photo-1505691938895-1758d7feb511?crop=entropy&cs=srgb&fm=jpg&w=800",
    },
]


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    user = await db.users.find_one({"email": CEO_EMAIL})
    if not user:
        print(f"❌ Utente {CEO_EMAIL} non trovato")
        return
    uid = user["id"]
    print(f"✔ User CEO trovato: {uid}")

    # 1) Reset collezioni operative del CEO
    cleared = {}
    for coll in [
        "properties", "scenarios", "scenario_messages", "strategist_jobs",
        "bilanci", "movimenti_bancari", "alerts", "deals", "ai_conversations",
        "documenti", "lavori", "contratti", "incassi",
    ]:
        try:
            res = await db[coll].delete_many({"user_id": uid})
            cleared[coll] = res.deleted_count
        except Exception as e:
            cleared[coll] = f"err: {e}"
    print("✔ Reset:", cleared)

    # 2) Insert 5 immobili Torino
    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for p in PROPS:
        d = {
            **p,
            "user_id": uid,
            "fromDeal": False,
            "deal_id": None,
            "created_at": now,
        }
        docs.append(d)
    await db.properties.insert_many(docs)
    print(f"✔ Inseriti {len(docs)} immobili Torino")

    # 3) Riepilogo
    tot_costo = sum(p["prezzo_acquisto"] + p["agenzia"] + p["imposte"] for p in PROPS)
    tot_canone = sum(p["canone_mensile"] for p in PROPS)
    tot_valore_stim = sum(p["valore_stimato"] for p in PROPS)
    print(f"  Investimento totale: € {tot_costo:,}")
    print(f"  Affitti mensili:     € {tot_canone:,} ({tot_canone*12:,}/anno)")
    print(f"  Valore stimato:      € {tot_valore_stim:,}")
    print(f"  Rend.lordo medio:    {tot_canone*12/tot_costo*100:.2f}%")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
