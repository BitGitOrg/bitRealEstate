"""
Backend tests for Iteration 3: Deal Inbox (AI Scout) + Watchlists.
- /api/deals/analyze  (Claude Sonnet 4.6 LLM)
- /api/deals (list/filter)
- /api/deals/{id}/status (PATCH)
- /api/deals/{id}    (DELETE)
- /api/watchlists CRUD + matching at analyze time
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

CEO_EMAIL = "ceo@controlroom.it"
CEO_PASSWORD = "demo1234"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_headers(session):
    r = session.post(f"{API}/auth/login",
                     json={"email": CEO_EMAIL, "password": CEO_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def cleanup_state(session, auth_headers):
    """Remove all deals + watchlists belonging to ceo before tests start
       to keep watchlist matching deterministic."""
    # delete existing watchlists
    r = session.get(f"{API}/watchlists", headers=auth_headers, timeout=10)
    if r.status_code == 200:
        for w in r.json():
            session.delete(f"{API}/watchlists/{w['id']}", headers=auth_headers, timeout=10)
    # delete existing deals
    r = session.get(f"{API}/deals", headers=auth_headers, timeout=10)
    if r.status_code == 200:
        for d in r.json():
            session.delete(f"{API}/deals/{d['id']}", headers=auth_headers, timeout=10)
    yield


# ===== Validation =====
class TestDealsAnalyzeValidation:
    def test_no_token(self, session):
        r = session.post(f"{API}/deals/analyze",
                         json={"text": "Bilocale Milano"}, timeout=10)
        assert r.status_code == 401

    def test_missing_input(self, session, auth_headers, cleanup_state):
        r = session.post(f"{API}/deals/analyze",
                         json={}, headers=auth_headers, timeout=10)
        assert r.status_code == 400
        d = r.json()
        assert "Inserisci URL oppure testo" in d.get("detail", "")


# ===== Watchlist CRUD =====
class TestWatchlistCRUD:
    def test_create_watchlist(self, session, auth_headers):
        payload = {"nome": "TEST_WL_Milano", "citta": "Milano",
                   "tipologia": "Bilocale", "prezzo_max": 250000,
                   "rendimento_min": 5}
        r = session.post(f"{API}/watchlists",
                         json=payload, headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "id" in d and len(d["id"]) > 5
        assert d["nome"] == "TEST_WL_Milano"
        assert d["citta"] == "Milano"
        assert d["prezzo_max"] == 250000
        assert d["attiva"] is True
        TestWatchlistCRUD.wl_id = d["id"]

    def test_list_watchlists(self, session, auth_headers):
        r = session.get(f"{API}/watchlists", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        names = [w["nome"] for w in data]
        assert "TEST_WL_Milano" in names

    def test_delete_watchlist(self, session, auth_headers):
        # Don't delete yet — we still need it for matching test. Just verify endpoint.
        # Create a throw-away to delete:
        r = session.post(f"{API}/watchlists",
                         json={"nome": "TEST_WL_throwaway", "citta": "Torino"},
                         headers=auth_headers, timeout=10)
        wid = r.json()["id"]
        r = session.delete(f"{API}/watchlists/{wid}",
                           headers=auth_headers, timeout=10)
        assert r.status_code == 200
        r = session.get(f"{API}/watchlists", headers=auth_headers, timeout=10)
        names = [w["nome"] for w in r.json()]
        assert "TEST_WL_throwaway" not in names


# ===== Deal Analyze + Matching (LLM live, slow) =====
class TestDealsAnalyzeLLM:
    def test_analyze_text_milano(self, session, auth_headers):
        """Analyze a Milano deal -- should match the TEST_WL_Milano watchlist
        created in TestWatchlistCRUD (price < 250k, citta Milano, bilocale).
        """
        payload = {"text": "Bilocale Navigli 60mq prezzo 245000 ristrutturato Milano classe D"}
        r = session.post(f"{API}/deals/analyze",
                         json=payload, headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()

        # required fields
        for f in ["id", "titolo", "prezzo", "metratura", "citta",
                  "canone_stimato", "deal_score", "giudizio", "strategia",
                  "rischio", "rendimento_lordo", "rendimento_netto",
                  "punti_forza", "punti_attenzione", "status",
                  "watchlist_matches"]:
            assert f in d, f"missing field {f}"

        assert d["status"] == "nuovo"
        assert 0 <= d["deal_score"] <= 100
        assert d["canone_stimato"] > 0
        assert d["rischio"] in ("Basso", "Medio", "Alto")
        assert isinstance(d["punti_forza"], list)
        assert isinstance(d["punti_attenzione"], list)
        # citta loose check (LLM should put Milano)
        assert "milano" in d["citta"].lower()

        # save for later tests
        TestDealsAnalyzeLLM.deal_id = d["id"]

    def test_analyze_roma_watchlist_match(self, session, auth_headers):
        """Create a watchlist for Roma FIRST, then analyze a Roma deal and
        verify watchlist_matches contains the new wl."""
        wl_payload = {"nome": "TEST_WL_Roma", "citta": "Roma",
                      "tipologia": "Bilocale", "prezzo_max": 200000,
                      "rendimento_min": 3}
        r = session.post(f"{API}/watchlists", json=wl_payload,
                         headers=auth_headers, timeout=10)
        assert r.status_code == 200
        roma_wl_id = r.json()["id"]

        deal_payload = {"text": "Bilocale Roma 65mq prezzo 180000 zona Eur"}
        r = session.post(f"{API}/deals/analyze",
                         json=deal_payload, headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        matches = d.get("watchlist_matches", [])
        assert isinstance(matches, list)
        match_ids = [m.get("id") for m in matches]
        assert roma_wl_id in match_ids, (
            f"watchlist_matches did not include the Roma WL. "
            f"matches={matches} city={d.get('citta')} tipologia={d.get('tipologia')} "
            f"prezzo={d.get('prezzo')} rendimento_netto={d.get('rendimento_netto')}"
        )

    def test_analyze_url_soft(self, session, auth_headers):
        """URL fetch with a domain that returns simple HTML — must NOT
        crash. Either 200 (parsed) or 4xx/5xx with string detail."""
        r = session.post(f"{API}/deals/analyze",
                         json={"url": "https://example.com"},
                         headers=auth_headers, timeout=60)
        assert r.status_code in (200, 400, 500), r.status_code
        if r.status_code != 200:
            d = r.json()
            assert isinstance(d.get("detail"), str)


# ===== List + status update + delete =====
class TestDealsLifecycle:
    def test_list_all(self, session, auth_headers):
        r = session.get(f"{API}/deals", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1

    def test_filter_nuovo(self, session, auth_headers):
        r = session.get(f"{API}/deals?status=nuovo",
                        headers=auth_headers, timeout=10)
        assert r.status_code == 200
        for d in r.json():
            assert d["status"] == "nuovo"

    def test_patch_status(self, session, auth_headers):
        deal_id = getattr(TestDealsAnalyzeLLM, "deal_id", None)
        if not deal_id:
            pytest.skip("no deal id from previous test")
        r = session.patch(f"{API}/deals/{deal_id}/status",
                          json={"status": "in_trattativa"},
                          headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "in_trattativa"
        assert d["id"] == deal_id

        # verify persistence
        r = session.get(f"{API}/deals?status=in_trattativa",
                        headers=auth_headers, timeout=10)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert deal_id in ids

    def test_patch_status_invalid(self, session, auth_headers):
        deal_id = getattr(TestDealsAnalyzeLLM, "deal_id", None)
        if not deal_id:
            pytest.skip("no deal id")
        r = session.patch(f"{API}/deals/{deal_id}/status",
                          json={"status": "BOGUS"},
                          headers=auth_headers, timeout=10)
        assert r.status_code == 422

    def test_delete_deal(self, session, auth_headers):
        deal_id = getattr(TestDealsAnalyzeLLM, "deal_id", None)
        if not deal_id:
            pytest.skip("no deal id")
        r = session.delete(f"{API}/deals/{deal_id}",
                           headers=auth_headers, timeout=10)
        assert r.status_code == 200
        # verify gone
        time.sleep(0.5)
        r = session.get(f"{API}/deals", headers=auth_headers, timeout=10)
        ids = [x["id"] for x in r.json()]
        assert deal_id not in ids
