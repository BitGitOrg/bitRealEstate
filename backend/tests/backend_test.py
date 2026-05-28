"""
Backend API tests for Real Estate Portfolio Control Room.
Tests: auth (login/me/demo-accounts), AI chat (Claude Sonnet 4.6), deal-analyze, history.
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://property-autopilot-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CEO_EMAIL = "ceo@controlroom.it"
CEO_PASSWORD = "demo1234"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def token(session):
    r = session.post(f"{API}/auth/login", json={"email": CEO_EMAIL, "password": CEO_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 10
    assert data["user"]["email"] == CEO_EMAIL
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# === Auth ===
class TestAuth:
    def test_root(self, session):
        r = session.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_login_success(self, session):
        r = session.post(f"{API}/auth/login", json={"email": CEO_EMAIL, "password": CEO_PASSWORD}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] == "admin"
        assert data["user"]["name"] == "Marco Rossi"

    def test_login_invalid(self, session):
        r = session.post(f"{API}/auth/login", json={"email": CEO_EMAIL, "password": "wrong"}, timeout=10)
        assert r.status_code == 401

    def test_login_unknown_email(self, session):
        r = session.post(f"{API}/auth/login", json={"email": "nope@example.com", "password": "x"}, timeout=10)
        assert r.status_code == 401

    def test_me(self, session, auth_headers):
        r = session.get(f"{API}/auth/me", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == CEO_EMAIL
        assert u["role"] == "admin"

    def test_me_no_token(self, session):
        r = session.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401

    def test_me_invalid_token(self, session):
        r = session.get(f"{API}/auth/me", headers={"Authorization": "Bearer invalid.token.here"}, timeout=10)
        assert r.status_code == 401

    def test_demo_accounts(self, session):
        r = session.get(f"{API}/auth/demo-accounts", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 4
        emails = [d["email"] for d in data]
        assert "ceo@controlroom.it" in emails
        assert "amministrazione@controlroom.it" in emails
        assert "commercialista@controlroom.it" in emails
        assert "collaboratore@controlroom.it" in emails


# === Deal Analyze (heuristic, no LLM) ===
class TestDealAnalyze:
    def test_deal_analyze_basic(self, session, auth_headers):
        payload = {
            "prezzo_richiesto": 180000,
            "metratura": 60,
            "canone_stimato": 1100,
            "lavori_previsti": 22000,
            "costi_accessori": 9000,
            "mutuo_pct": 0.6,
        }
        r = session.post(f"{API}/ai/deal-analyze", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert 0 <= d["deal_score"] <= 100
        assert isinstance(d["giudizio"], str) and len(d["giudizio"]) > 0
        assert d["prezzo_massimo_consigliato"] >= 0
        assert "ottimistico" in d["scenari"]
        assert "realistico" in d["scenari"]
        assert "pessimistico" in d["scenari"]
        assert isinstance(d["punti_attenzione"], list)
        assert d["rischio"] in ("Basso", "Medio", "Alto")

    def test_deal_analyze_no_token(self, session):
        r = session.post(f"{API}/ai/deal-analyze", json={"prezzo_richiesto": 100000, "metratura": 50}, timeout=10)
        assert r.status_code == 401

    def test_deal_analyze_no_canone(self, session, auth_headers):
        r = session.post(f"{API}/ai/deal-analyze", json={"prezzo_richiesto": 100000, "metratura": 50}, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        # missing canone => -15 penalty + warning
        assert any("Canone" in p for p in d["punti_attenzione"])


# === AI Chat (Claude Sonnet 4.6 via emergentintegrations) ===
class TestAIChat:
    def test_ai_chat_no_token(self, session):
        r = session.post(f"{API}/ai/chat", json={"session_id": "x", "message": "ciao"}, timeout=10)
        assert r.status_code == 401

    def test_ai_chat_claude(self, session, auth_headers):
        sid = f"test-sess-{uuid.uuid4().hex[:8]}"
        r = session.post(
            f"{API}/ai/chat",
            json={"session_id": sid, "message": "Rispondi solo con la parola: CIAO"},
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"AI chat failed: {r.status_code} {r.text}"
        d = r.json()
        assert d["session_id"] == sid
        assert isinstance(d["reply"], str)
        assert len(d["reply"].strip()) > 0
        # Save session id for history test
        TestAIChat.session_id = sid

    def test_ai_history(self, session, auth_headers):
        sid = getattr(TestAIChat, "session_id", None)
        if not sid:
            pytest.skip("AI chat did not run successfully; skipping history check")
        time.sleep(1)
        r = session.get(f"{API}/ai/history/{sid}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        msgs = r.json()
        assert isinstance(msgs, list)
        assert len(msgs) >= 1
        assert msgs[0]["session_id"] == sid
        assert "user_message" in msgs[0]
        assert "reply" in msgs[0]
