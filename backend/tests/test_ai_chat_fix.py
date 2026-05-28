"""Retest FIX-1: POST /api/ai/chat with context as dict must return 200 with non-empty reply."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://property-autopilot-4.preview.emergentagent.com").rstrip("/")


@pytest.fixture
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def auth_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "ceo@controlroom.it",
        "password": "demo1234"
    })
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"no token in login response: {data}"
    return token


@pytest.fixture
def authed(session, auth_token):
    session.headers.update({"Authorization": f"Bearer {auth_token}"})
    return session


def test_ai_chat_with_dict_context(authed):
    sid = f"test-sess-iter2-{uuid.uuid4()}"
    payload = {
        "session_id": sid,
        "message": "Riepiloga in una riga lo stato del portafoglio.",
        "context": {
            "valore_stimato_totale": 2350000,
            "capitale_investito": 1820000,
            "ricavi_mensili": 9800,
            "cash_flow_mensile": 3200,
            "debito_residuo": 480000,
            "rendimento_medio_netto": 4.8,
            "totale_immobili": 10,
            "immobili_sfitti": 1,
            "immobili_in_lavorazione": 2,
        },
    }
    r = authed.post(f"{BASE_URL}/api/ai/chat", json=payload, timeout=90)
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:500]}"
    data = r.json()
    assert "reply" in data, f"missing reply key: {data}"
    assert isinstance(data["reply"], str)
    assert len(data["reply"].strip()) > 5, f"reply too short: {data['reply']!r}"


def test_ai_chat_without_context(authed):
    sid = f"test-sess-iter2-{uuid.uuid4()}"
    r = authed.post(f"{BASE_URL}/api/ai/chat", json={
        "session_id": sid,
        "message": "Ciao",
    }, timeout=90)
    assert r.status_code == 200, f"expected 200 (context optional), got {r.status_code}: {r.text[:500]}"
    assert len(r.json().get("reply", "")) > 0
