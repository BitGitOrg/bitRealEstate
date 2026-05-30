"""Iter 16 — Investor Book PDF report tests."""
import os
import io
import pytest
import requests
import pdfplumber

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
LOGIN = {"email": "ceo@controlroom.it", "password": "demo1234"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=LOGIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"] if "access_token" in r.json() else r.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Endpoint contract ----------
class TestInvestorBookEndpoint:
    def test_no_token_401(self):
        r = requests.get(f"{BASE_URL}/api/report/investor-book.pdf", timeout=30)
        assert r.status_code in (401, 403), r.status_code

    def test_unknown_report_404(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/report/unknown.pdf", headers=auth_headers, timeout=30)
        assert r.status_code == 404

    def test_invalid_fmt_400(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/report/investor-book.csv", headers=auth_headers, timeout=30)
        assert r.status_code == 400

    def test_investor_book_pdf_200(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/report/investor-book.pdf", headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text[:500]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        body = r.content
        assert body[:4] == b"%PDF", f"Bad magic: {body[:8]}"
        assert len(body) > 50_000, f"PDF too small: {len(body)} bytes"


# ---------- Regression: existing reports ----------
class TestExistingReportsRegression:
    def test_stato_salute_pdf(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/report/stato-salute.pdf", headers=auth_headers, timeout=60)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_business_plan_pdf(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/report/business-plan.pdf", headers=auth_headers, timeout=60)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


# ---------- PDF content verification ----------
@pytest.fixture(scope="module")
def investor_pdf_bytes(auth_headers):
    r = requests.get(f"{BASE_URL}/api/report/investor-book.pdf", headers=auth_headers, timeout=90)
    assert r.status_code == 200
    return r.content


@pytest.fixture(scope="module")
def investor_pdf_text(investor_pdf_bytes):
    text_pages = []
    with pdfplumber.open(io.BytesIO(investor_pdf_bytes)) as pdf:
        for p in pdf.pages:
            text_pages.append(p.extract_text() or "")
    return text_pages


class TestInvestorBookContent:
    def test_min_pages(self, investor_pdf_text):
        # cover + 2 properties + recap = at least 4 pages
        assert len(investor_pdf_text) >= 4, f"Only {len(investor_pdf_text)} pages"

    def test_cover_brand_and_title(self, investor_pdf_text):
        all_text = "\n".join(investor_pdf_text)
        assert "Investor Book" in all_text
        # default brand
        assert "Control Room" in all_text or "Real Estate" in all_text

    def test_cover_kpis(self, investor_pdf_text):
        cover = investor_pdf_text[0]
        # KPI table values
        assert "Numero immobili" in cover
        # 2 properties expected
        assert "2" in cover
        assert "Canone mensile complessivo" in cover
        assert "Valore di mercato totale" in cover.lower() or "Valore di mercato totale" in cover
        assert "Debito residuo totale" in cover
        assert "Plusvalenza" in cover

    def test_kpi_aggregates_numeric(self, investor_pdf_text):
        cover = investor_pdf_text[0]
        # Canone 1450+2100=3550 ; values formatted in eur (likely "3.550" with dot or "3,550")
        # tolerant: look for digits 3.550 or 3550 substring
        assert ("3.550" in cover) or ("3550" in cover) or ("3 550" in cover), cover[-1500:]
        # Valore totale 705.000
        assert ("705.000" in cover) or ("705000" in cover) or ("705 000" in cover)
        # Debito 275.000
        assert ("275.000" in cover) or ("275000" in cover)

    def test_property_section_headers(self, investor_pdf_text):
        all_text = "\n".join(investor_pdf_text)
        assert "Bilocale Navigli" in all_text
        assert "Trilocale Isola" in all_text

    def test_property_sections_present(self, investor_pdf_text):
        all_text = "\n".join(investor_pdf_text)
        assert "Dati economici" in all_text
        assert "Finanziamento" in all_text
        assert "Locazione in corso" in all_text

    def test_tenants_and_dates(self, investor_pdf_text):
        all_text = "\n".join(investor_pdf_text)
        # at least one tenant name should appear
        assert ("Mario" in all_text and "Bianchi" in all_text) or ("Studio Legale" in all_text and "Verdi" in all_text), \
            "No tenant names found"
        # scadenze
        assert ("2026-03-14" in all_text) or ("2027-06-09" in all_text), "No contract end dates found"

    def test_recap_table(self, investor_pdf_text):
        last = investor_pdf_text[-1]
        assert "Recap" in last or "Recap portafoglio" in last
        # Columns
        for col in ["Nome", "Città", "Acquisto", "Valore attuale", "Canone", "Inquilino"]:
            assert col in last, f"Missing column '{col}' in recap page"

    def test_images_embedded_size(self, investor_pdf_bytes):
        # size should be > 50KB; with images typically ~100KB+
        assert len(investor_pdf_bytes) > 50_000
