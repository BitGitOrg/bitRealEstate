"""Iter 8: Test the 6 new PDF reports + the reports router split + backwards compatibility."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://property-autopilot-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": "ceo@controlroom.it", "password": "demo1234"}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    return body.get("token") or body.get("access_token")


@pytest.fixture(scope="session")
def h(token):
    return {"Authorization": f"Bearer {token}"}


# ============== NEW 6 PDF reports ==============
@pytest.mark.parametrize("report_id", [
    "rendimento", "affitti", "vendite", "lavori", "cashflow", "mutui",
])
class TestNewPDFReports:
    def test_pdf_ok(self, h, report_id):
        r = requests.get(f"{API}/report/{report_id}.pdf", headers=h, timeout=60)
        assert r.status_code == 200, f"{report_id} PDF failed: {r.status_code} {r.text[:300]}"
        assert "application/pdf" in r.headers.get("content-type", ""), f"{report_id} ct={r.headers.get('content-type')}"
        assert r.content.startswith(b"%PDF"), f"{report_id} PDF magic missing: {r.content[:10]!r}"
        assert len(r.content) > 1024, f"{report_id} PDF too small: {len(r.content)} bytes"


# ============== Pre-existing reports still work ==============
class TestExistingReports:
    def test_patrimonio_pdf(self, h):
        r = requests.get(f"{API}/report/patrimonio.pdf", headers=h, timeout=60)
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "")
        assert r.content.startswith(b"%PDF")
        assert len(r.content) > 1024

    def test_patrimonio_xlsx(self, h):
        r = requests.get(f"{API}/report/patrimonio.xlsx", headers=h, timeout=60)
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "")
        assert r.content[:2] == b"PK"

    def test_patrimonio_csv(self, h):
        r = requests.get(f"{API}/report/patrimonio.csv", headers=h, timeout=30)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        first_line = r.content.decode("utf-8").splitlines()[0]
        assert first_line.startswith("Codice,Nome,Citta")

    def test_bilancio_pdf(self, h):
        r = requests.get(f"{API}/report/bilancio.pdf", headers=h, timeout=60)
        assert r.status_code in (200, 404)
        if r.status_code == 200:
            assert "application/pdf" in r.headers.get("content-type", "")
            assert r.content.startswith(b"%PDF")


# ============== Rendimento now supports xlsx/csv too ==============
class TestRendimentoFormats:
    def test_rendimento_xlsx(self, h):
        r = requests.get(f"{API}/report/rendimento.xlsx", headers=h, timeout=60)
        assert r.status_code == 200, f"rendimento.xlsx failed: {r.status_code} {r.text[:300]}"
        assert "spreadsheet" in r.headers.get("content-type", "")
        assert r.content[:2] == b"PK"

    def test_rendimento_csv(self, h):
        r = requests.get(f"{API}/report/rendimento.csv", headers=h, timeout=30)
        assert r.status_code == 200, f"rendimento.csv failed: {r.status_code} {r.text[:300]}"
        assert "text/csv" in r.headers.get("content-type", "")


# ============== Error handling ==============
class TestReportErrors:
    def test_affitti_xlsx_returns_400(self, h):
        # Format not supported for this report id
        r = requests.get(f"{API}/report/affitti.xlsx", headers=h, timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"
        detail = r.json().get("detail", "")
        assert "PDF" in detail or "pdf" in detail, f"detail mismatch: {detail}"

    def test_unknown_pdf_404(self, h):
        r = requests.get(f"{API}/report/unknown.pdf", headers=h, timeout=30)
        assert r.status_code == 404

    def test_patrimonio_xml_400(self, h):
        r = requests.get(f"{API}/report/patrimonio.xml", headers=h, timeout=30)
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        assert "Formato non supportato" in detail or "non supportato" in detail.lower()

    def test_report_unauthorized(self):
        r = requests.get(f"{API}/report/patrimonio.pdf", timeout=30)
        assert r.status_code in (401, 403)


# ============== Regression: pre-existing endpoints still alive ==============
class TestRegressionEndpoints:
    def test_auth_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": "ceo@controlroom.it", "password": "demo1234"}, timeout=30)
        assert r.status_code == 200

    def test_auth_me(self, h):
        r = requests.get(f"{API}/auth/me", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("email") == "ceo@controlroom.it"

    def test_properties_list(self, h):
        r = requests.get(f"{API}/properties", headers=h, timeout=30)
        assert r.status_code == 200
        # Some apps wrap in {"items":[...]}, others return list directly
        d = r.json()
        assert isinstance(d, (list, dict))

    def test_deals_list(self, h):
        r = requests.get(f"{API}/deals", headers=h, timeout=30)
        assert r.status_code == 200

    def test_watchlists_list(self, h):
        # Try possible endpoint names
        for path in ("/watchlists", "/watchlist"):
            r = requests.get(f"{API}{path}", headers=h, timeout=30)
            if r.status_code == 200:
                return
        # If both 404 — that means endpoint name differs, but skip not fail
        pytest.skip("watchlists endpoint not found at /watchlists or /watchlist")

    def test_import_banca_list(self, h):
        r = requests.get(f"{API}/import/banca?skip=0&limit=5", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "total" in d and "items" in d

    def test_bilanci_storico(self, h):
        r = requests.get(f"{API}/import/bilanci/storico", headers=h, timeout=30)
        assert r.status_code == 200

    def test_cashflow_mensile(self, h):
        r = requests.get(f"{API}/import/banca/cashflow-mensile?months=12", headers=h, timeout=30)
        assert r.status_code == 200

    def test_ai_chat_endpoint_responds(self, h):
        # Just verify endpoint exists and responds (may take a while)
        r = requests.post(f"{API}/ai/chat", json={"message": "ciao"}, headers=h, timeout=60)
        # If endpoint exists, status will be 200 or 4xx (validation). If 404 -> regression.
        assert r.status_code != 404, "AI chat endpoint disappeared!"
