"""
Iteration 4 backend tests:
- /api/properties CRUD (list/get/create/delete) with enrichment fields
- /api/deals/{id}/convert workflow (one-click + with overrides + mutuo)
"""
import os
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
    return {"Authorization": f"Bearer {r.json()['token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def cleanup(session, auth_headers):
    """Purge existing test properties + deals so we start clean."""
    r = session.get(f"{API}/properties", headers=auth_headers, timeout=10)
    if r.status_code == 200:
        for p in r.json():
            session.delete(f"{API}/properties/{p['id']}",
                           headers=auth_headers, timeout=10)
    r = session.get(f"{API}/deals", headers=auth_headers, timeout=10)
    if r.status_code == 200:
        for d in r.json():
            session.delete(f"{API}/deals/{d['id']}",
                           headers=auth_headers, timeout=10)
    yield


# ===== Properties CRUD =====
class TestPropertiesCRUD:
    created_id = None

    def test_list_initial_empty(self, session, auth_headers, cleanup):
        r = session.get(f"{API}/properties", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 0  # after cleanup

    def test_create_property_minimal(self, session, auth_headers):
        payload = {
            "nome": "TEST_Imm",
            "prezzo_acquisto": 200000,
            "citta": "Roma",
            "metratura": 70,
            "canone_mensile": 1100,
            "notaio": 3000,
            "agenzia": 5000,
            "imposte": 7000,
            "lavori": 10000,
        }
        r = session.post(f"{API}/properties",
                         json=payload, headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        # id format
        assert d["id"].startswith("IMM-")
        TestPropertiesCRUD.created_id = d["id"]
        # enrichment computed
        # costo_totale = 200000 + 3000 + 5000 + 7000 + 10000 = 225000
        assert d["costo_totale"] == 225000
        # rendimento_lordo = 1100*12/225000*100 ≈ 5.87
        assert 5.5 < d["rendimento_lordo"] < 6.2
        # rendimento_netto ≈ 5.87 * 0.65 ≈ 3.81
        assert 3.5 < d["rendimento_netto"] < 4.2
        assert "portfolio_score" in d
        assert 0 <= d["portfolio_score"] <= 100
        assert d["fromDeal"] is False
        assert d["deal_id"] is None
        assert d["nome"] == "TEST_Imm"

    def test_get_property_by_id(self, session, auth_headers):
        pid = TestPropertiesCRUD.created_id
        assert pid
        r = session.get(f"{API}/properties/{pid}",
                        headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] == pid
        assert d["nome"] == "TEST_Imm"
        # enrichment present on GET too
        assert "costo_totale" in d and "rendimento_lordo" in d
        assert "portfolio_score" in d

    def test_get_property_404(self, session, auth_headers):
        r = session.get(f"{API}/properties/IMM-NOPE99",
                        headers=auth_headers, timeout=10)
        assert r.status_code == 404

    def test_list_contains_created(self, session, auth_headers):
        r = session.get(f"{API}/properties", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert TestPropertiesCRUD.created_id in ids

    def test_delete_property(self, session, auth_headers):
        pid = TestPropertiesCRUD.created_id
        r = session.delete(f"{API}/properties/{pid}",
                           headers=auth_headers, timeout=10)
        assert r.status_code == 200
        # verify gone
        r = session.get(f"{API}/properties/{pid}",
                        headers=auth_headers, timeout=10)
        assert r.status_code == 404


# ===== Convert deal -> property =====
class TestConvertDealQuick:
    """One-click conversion (no overrides) on a freshly analyzed deal."""
    deal_id = None
    property_id = None

    def test_analyze_deal(self, session, auth_headers):
        r = session.post(f"{API}/deals/analyze",
                         json={"text": "Trilocale Bologna 85mq prezzo 230000 zona Bolognina"},
                         headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["prezzo"] > 0
        assert "bologna" in d["citta"].lower()
        TestConvertDealQuick.deal_id = d["id"]

    def test_convert_quick(self, session, auth_headers):
        did = TestConvertDealQuick.deal_id
        assert did
        body = {"stato": "in_trattativa", "operazione": "reddito"}
        r = session.post(f"{API}/deals/{did}/convert",
                         json=body, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["id"].startswith("IMM-")
        assert p["fromDeal"] is True
        assert p["deal_id"] == did
        # punti copied from deal
        assert isinstance(p.get("punti_forza"), list)
        assert isinstance(p.get("punti_attenzione"), list)
        # operazione/stato from overrides
        assert p["stato"] == "in_trattativa"
        assert p["operazione"] == "reddito"
        # prezzo_acquisto = deal.prezzo (>0)
        assert p["prezzo_acquisto"] > 0
        # enrichment
        assert "costo_totale" in p and "portfolio_score" in p
        TestConvertDealQuick.property_id = p["id"]

    def test_deal_marked_converted(self, session, auth_headers):
        did = TestConvertDealQuick.deal_id
        # filter not allowed for 'convertito' via PATCH model, but list should
        # show the deal w/ status=convertito and converted_property_id set
        r = session.get(f"{API}/deals", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        found = next((x for x in r.json() if x["id"] == did), None)
        assert found is not None
        assert found["status"] == "convertito"
        assert found.get("converted_property_id") == TestConvertDealQuick.property_id

    def test_convert_404(self, session, auth_headers):
        r = session.post(f"{API}/deals/DOES-NOT-EXIST/convert",
                         json={}, headers=auth_headers, timeout=10)
        assert r.status_code == 404

    def test_cleanup_quick_property(self, session, auth_headers):
        pid = TestConvertDealQuick.property_id
        if pid:
            session.delete(f"{API}/properties/{pid}",
                           headers=auth_headers, timeout=10)


class TestConvertDealDetailed:
    """Detailed conversion with overrides (data_acquisto, notaio, agenzia,
    imposte, lavori, mutuo)."""
    deal_id = None
    property_id = None

    def test_analyze_deal(self, session, auth_headers):
        r = session.post(f"{API}/deals/analyze",
                         json={"text": "Bilocale Milano Navigli 55mq prezzo 260000 zona Navigli"},
                         headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        TestConvertDealDetailed.deal_id = r.json()["id"]

    def test_convert_with_overrides(self, session, auth_headers):
        did = TestConvertDealDetailed.deal_id
        assert did
        body = {
            "data_acquisto": "2026-03-15",
            "notaio": 4200,
            "agenzia": 6800,
            "imposte": 8500,
            "lavori": 15000,
            "stato": "acquistato",
            "operazione": "reddito",
            "mutuo": {"banca": "Intesa", "residuo": 120000,
                      "rata": 680, "tasso": 3.1},
        }
        r = session.post(f"{API}/deals/{did}/convert",
                         json=body, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        p = r.json()
        TestConvertDealDetailed.property_id = p["id"]

        # overrides persisted
        assert p["data_acquisto"] == "2026-03-15"
        assert p["notaio"] == 4200
        assert p["agenzia"] == 6800
        assert p["imposte"] == 8500
        assert p["lavori"] == 15000

        # mutuo persisted
        assert p.get("mutuo") is not None
        assert p["mutuo"]["banca"] == "Intesa"
        assert p["mutuo"]["residuo"] == 120000
        assert p["mutuo"]["rata"] == 680
        assert p["mutuo"]["tasso"] == 3.1

        # costo_totale = prezzo + sum(overrides)
        expected = p["prezzo_acquisto"] + 4200 + 6800 + 8500 + 15000
        assert p["costo_totale"] == expected

        # fromDeal + deal_id
        assert p["fromDeal"] is True
        assert p["deal_id"] == did

    def test_get_converted_property(self, session, auth_headers):
        pid = TestConvertDealDetailed.property_id
        r = session.get(f"{API}/properties/{pid}",
                        headers=auth_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == pid
        assert d["fromDeal"] is True
        assert d.get("mutuo", {}).get("banca") == "Intesa"

    def test_cleanup_detailed(self, session, auth_headers):
        pid = TestConvertDealDetailed.property_id
        if pid:
            session.delete(f"{API}/properties/{pid}",
                           headers=auth_headers, timeout=10)
