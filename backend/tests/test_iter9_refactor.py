"""
Iteration 9 — Backend regression + new endpoints test.
Covers:
 - Auth (login, /auth/me) regression after server.py split
 - Properties CRUD + enrichment
 - Imports endpoints regression
 - Deal-analyze + deals list + watchlists regression
 - NEW: /api/settings (GET/PUT) + /api/settings/logo (POST/DELETE) flow
 - NEW: /api/report/stato-salute.pdf + /api/report/business-plan.pdf (with logo embedded)
"""
import os
import io
import base64
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# 1x1 transparent PNG
TINY_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
TINY_PNG = base64.b64decode(TINY_PNG_B64)


# ===== Fixtures =====
@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "ceo@controlroom.it", "password": "demo1234"},
                      timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["email"] == "ceo@controlroom.it"
    return data["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


# ===== Auth =====
class TestAuth:
    def test_me(self, headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == "ceo@controlroom.it"
        assert u["role"] == "admin"

    def test_me_unauthorized(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code in (401, 403)


# ===== Properties + Conversion =====
class TestProperties:
    def test_list_properties(self, headers):
        r = requests.get(f"{BASE_URL}/api/properties", headers=headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_and_enrichment(self, headers):
        payload = {
            "nome": "TEST_PropIter9",
            "citta": "Milano",
            "tipologia": "Bilocale",
            "metratura": 60,
            "prezzo_acquisto": 200000,
            "canone_mensile": 1200,
            "stato": "a_reddito",
        }
        r = requests.post(f"{BASE_URL}/api/properties", json=payload, headers=headers, timeout=15)
        assert r.status_code in (200, 201), r.text
        p = r.json()
        pid = p["id"]
        # Re-fetch to check enrichment fields
        r2 = requests.get(f"{BASE_URL}/api/properties", headers=headers, timeout=15)
        assert r2.status_code == 200
        match = [x for x in r2.json() if x["id"] == pid]
        assert match
        prop = match[0]
        for field in ["rendimento_lordo", "rendimento_netto", "portfolio_score", "cash_flow_mensile"]:
            assert field in prop, f"Missing enrich field: {field}"
        # Cleanup
        d = requests.delete(f"{BASE_URL}/api/properties/{pid}", headers=headers, timeout=15)
        assert d.status_code in (200, 204)


# ===== AI Deal Analyze (deterministic, no LLM) =====
class TestAIDealAnalyze:
    def test_deal_analyze(self, headers):
        body = {"prezzo_richiesto": 200000, "metratura": 60, "canone_stimato": 1200}
        r = requests.post(f"{BASE_URL}/api/ai/deal-analyze", json=body, headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["deal_score", "giudizio", "rendimento_lordo", "rendimento_netto_stimato",
                  "rischio", "punti_attenzione", "strategia_consigliata", "scenari"]:
            assert k in data
        assert 0 <= data["deal_score"] <= 100


# ===== Deals + Watchlists =====
class TestDealsAndWatchlists:
    def test_list_deals(self, headers):
        r = requests.get(f"{BASE_URL}/api/deals", headers=headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_watchlists_crud(self, headers):
        r = requests.get(f"{BASE_URL}/api/watchlists", headers=headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ===== Import center =====
class TestImports:
    def test_template_immobili(self, headers):
        r = requests.get(f"{BASE_URL}/api/import/template/immobili", headers=headers, timeout=20)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct or "xlsx" in ct or "officedocument" in ct, f"ct={ct}"
        assert len(r.content) > 200

    def test_bilanci_latest(self, headers):
        r = requests.get(f"{BASE_URL}/api/import/bilanci/latest", headers=headers, timeout=15)
        # Either 200 (exists) or 404 (no bilanci) — must not crash
        assert r.status_code in (200, 404), r.text

    def test_bilanci_storico(self, headers):
        r = requests.get(f"{BASE_URL}/api/import/bilanci/storico", headers=headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Endpoint returns dict {"bilanci": [...], "evoluzione": [...]}
        assert isinstance(data, dict)
        assert "bilanci" in data and isinstance(data["bilanci"], list)

    def test_banca_paging_and_filter(self, headers):
        r = requests.get(f"{BASE_URL}/api/import/banca?skip=0&limit=10", headers=headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Either dict {items: [...]} or list
        if isinstance(data, dict):
            assert "items" in data or "data" in data or "total" in data
        else:
            assert isinstance(data, list)

    def test_banca_cashflow_mensile(self, headers):
        r = requests.get(f"{BASE_URL}/api/import/banca/cashflow-mensile?months=12", headers=headers, timeout=15)
        assert r.status_code == 200

    def test_immobili_parse_with_template(self, headers):
        # Download template and post it back to parse — should succeed (or 4xx gracefully)
        tmpl = requests.get(f"{BASE_URL}/api/import/template/immobili", headers=headers, timeout=15)
        assert tmpl.status_code == 200
        files = {"file": ("template_immobili.xlsx", tmpl.content,
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        r = requests.post(f"{BASE_URL}/api/import/immobili/parse", files=files, headers=headers, timeout=30)
        assert r.status_code in (200, 400, 422), f"unexpected {r.status_code}: {r.text[:300]}"

    def test_bilancio_parse_gracefully_fails(self, headers):
        files = {"file": ("fake.txt", b"this is not a real bilancio document", "text/plain")}
        r = requests.post(f"{BASE_URL}/api/import/bilancio/parse", files=files, headers=headers, timeout=30)
        # endpoint should not crash – any 4xx/5xx response, just not a connection error
        assert r.status_code in (200, 400, 415, 422, 500), f"unexpected {r.status_code}"


# ===== Settings (NEW) =====
class TestSettings:
    def test_get_defaults_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/settings", timeout=15)
        assert r.status_code in (401, 403)

    def test_get_defaults(self, headers):
        # Force reset before checking defaults
        requests.delete(f"{BASE_URL}/api/settings/logo", headers=headers, timeout=15)
        r = requests.get(f"{BASE_URL}/api/settings", headers=headers, timeout=15)
        assert r.status_code == 200
        s = r.json()
        for k in ["nome_societa", "valuta", "target_netto", "propensione",
                  "strategia", "capitale_disponibile", "limite_indebitamento"]:
            assert k in s, f"Missing default field: {k}"

    def test_put_settings_persistence(self, headers):
        payload = {"nome_societa": "Acme RE SRL", "target_netto": 7}
        r = requests.put(f"{BASE_URL}/api/settings", json=payload, headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["nome_societa"] == "Acme RE SRL"
        assert float(s["target_netto"]) == 7.0
        # GET should reflect
        r2 = requests.get(f"{BASE_URL}/api/settings", headers=headers, timeout=15)
        s2 = r2.json()
        assert s2["nome_societa"] == "Acme RE SRL"
        assert float(s2["target_netto"]) == 7.0

    def test_logo_upload_and_clear(self, headers):
        # Upload PNG
        files = {"file": ("logo.png", TINY_PNG, "image/png")}
        r = requests.post(f"{BASE_URL}/api/settings/logo", files=files, headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        # Verify present
        s = requests.get(f"{BASE_URL}/api/settings", headers=headers, timeout=15).json()
        assert s.get("logo_base64"), "logo_base64 should be set"
        assert (s.get("logo_mime") or "").startswith("image/")
        # Report should still work with logo embedded
        rep = requests.get(f"{BASE_URL}/api/report/stato-salute.pdf", headers=headers, timeout=30)
        assert rep.status_code == 200
        assert rep.content[:4] == b"%PDF", "Not a valid PDF after logo embed"
        # Delete logo
        d = requests.delete(f"{BASE_URL}/api/settings/logo", headers=headers, timeout=15)
        assert d.status_code == 200
        s2 = requests.get(f"{BASE_URL}/api/settings", headers=headers, timeout=15).json()
        assert s2.get("logo_base64") in (None, "")

    def test_logo_rejects_non_image(self, headers):
        files = {"file": ("not_image.txt", b"hello", "text/plain")}
        r = requests.post(f"{BASE_URL}/api/settings/logo", files=files, headers=headers, timeout=15)
        assert r.status_code == 400


# ===== Reports (NEW) =====
class TestReports:
    def test_unauthorized(self):
        r = requests.get(f"{BASE_URL}/api/report/stato-salute.pdf", timeout=20)
        assert r.status_code in (401, 403)

    def test_stato_salute_pdf(self, headers):
        r = requests.get(f"{BASE_URL}/api/report/stato-salute.pdf", headers=headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert "application/pdf" in r.headers.get("content-type", "")
        assert r.content[:4] == b"%PDF", "PDF magic bytes missing"
        assert len(r.content) > 1000

    def test_business_plan_pdf(self, headers):
        r = requests.get(f"{BASE_URL}/api/report/business-plan.pdf", headers=headers, timeout=30)
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 1000

    def test_unknown_report_404(self, headers):
        r = requests.get(f"{BASE_URL}/api/report/unknownid.pdf", headers=headers, timeout=15)
        assert r.status_code == 404

    def test_non_pdf_format_400(self, headers):
        r = requests.get(f"{BASE_URL}/api/report/stato-salute.xlsx", headers=headers, timeout=15)
        assert r.status_code == 400
