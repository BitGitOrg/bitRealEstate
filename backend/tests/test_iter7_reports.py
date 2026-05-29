"""Iter 7 tests: Storico bilanci con MoM, Cashflow mensile da banca, paginazione movimenti, Report PDF/Excel/CSV reali."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://property-autopilot-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": "ceo@controlroom.it", "password": "demo1234"}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def h(token):
    return {"Authorization": f"Bearer {token}"}


# ------------------- Storico bilanci -------------------
class TestStoricoBilanci:
    def test_storico_structure(self, h):
        r = requests.get(f"{API}/import/bilanci/storico", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "bilanci" in data and "evoluzione" in data
        assert isinstance(data["bilanci"], list)
        assert isinstance(data["evoluzione"], list)

    def test_storico_with_data_has_diff(self, h):
        r = requests.get(f"{API}/import/bilanci/storico", headers=h, timeout=30)
        data = r.json()
        bilanci = data["bilanci"]
        if len(bilanci) < 2:
            pytest.skip(f"Only {len(bilanci)} bilancio(i) in DB - need 2+ for MoM diff")
        # bilanci returned newest-first; the *newest* should have diff populated
        newest = bilanci[0]
        oldest = bilanci[-1]
        assert "diff_ce" in newest and "diff_sp" in newest
        # newest has actual diff values
        assert len(newest["diff_ce"]) > 0, "newest bilancio should have diff_ce computed"
        for k in ["totale_ricavi", "ricavi_affitti", "totale_costi", "utile_netto"]:
            assert k in newest["diff_ce"], f"Missing CE diff key {k}"
            assert "abs" in newest["diff_ce"][k]
            assert "pct" in newest["diff_ce"][k]
        for k in ["valore_immobili", "debito_mutui", "liquidita", "patrimonio_netto"]:
            assert k in newest["diff_sp"], f"Missing SP diff key {k}"
        # oldest has empty diffs (no prior)
        assert oldest["diff_ce"] == {} and oldest["diff_sp"] == {}

    def test_storico_chronological_order(self, h):
        """Newest first; evoluzione oldest-to-newest. Gennaio 2026 should be newer than Dicembre 2025."""
        data = requests.get(f"{API}/import/bilanci/storico", headers=h, timeout=30).json()
        evol = data["evoluzione"]
        if len(evol) < 2:
            pytest.skip("Need 2+ bilanci")
        periodi = [e["periodo"] for e in evol]
        # The chronologically last (newest) should be in the last position of evoluzione
        # and first position of bilanci. Validate that bilanci[0].periodo == evoluzione[-1].periodo
        assert data["bilanci"][0]["periodo"] == evol[-1]["periodo"], \
            f"Order mismatch: bilanci[0]={data['bilanci'][0]['periodo']} vs evoluzione[-1]={evol[-1]['periodo']}"


# ------------------- Banca pagination -------------------
class TestBancaPagination:
    def test_default_structure(self, h):
        r = requests.get(f"{API}/import/banca?skip=0&limit=10", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("total", "skip", "limit", "items", "has_more"):
            assert k in d, f"missing key {k}"
        assert d["skip"] == 0
        assert d["limit"] == 10
        assert isinstance(d["items"], list)
        assert isinstance(d["has_more"], bool)

    def test_pagination_second_page(self, h):
        # get total count
        d0 = requests.get(f"{API}/import/banca?skip=0&limit=2", headers=h, timeout=30).json()
        if d0["total"] < 3:
            pytest.skip(f"Need 3+ movimenti, got {d0['total']}")
        d2 = requests.get(f"{API}/import/banca?skip=2&limit=2", headers=h, timeout=30).json()
        assert d2["skip"] == 2
        # items should not overlap
        ids0 = {i.get("id") for i in d0["items"]}
        ids2 = {i.get("id") for i in d2["items"]}
        assert ids0.isdisjoint(ids2), "skip should give non-overlapping items"

    def test_filter_tipo(self, h):
        r = requests.get(f"{API}/import/banca?tipo=entrata&limit=100", headers=h, timeout=30)
        d = r.json()
        for it in d["items"]:
            assert it["tipo"] == "entrata"
        r2 = requests.get(f"{API}/import/banca?tipo=uscita&limit=100", headers=h, timeout=30)
        for it in r2.json()["items"]:
            assert it["tipo"] == "uscita"

    def test_filter_q_case_insensitive(self, h):
        d = requests.get(f"{API}/import/banca?q=AFFITTO&limit=100", headers=h, timeout=30).json()
        for it in d["items"]:
            assert "affitto" in (it.get("descrizione", "") or "").lower()


# ------------------- Cashflow mensile -------------------
class TestCashflowMensile:
    def test_structure(self, h):
        r = requests.get(f"{API}/import/banca/cashflow-mensile?months=12", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "count" in d and "rows" in d
        assert isinstance(d["rows"], list)
        assert d["count"] == len(d["rows"])
        for row in d["rows"]:
            for k in ("mese", "ym", "incassi", "uscite", "saldo"):
                assert k in row, f"missing key {k} in row"
            assert isinstance(row["ym"], str)
            assert len(row["ym"]) == 7  # YYYY-MM

    def test_chronological(self, h):
        d = requests.get(f"{API}/import/banca/cashflow-mensile?months=12", headers=h, timeout=30).json()
        ym_list = [r["ym"] for r in d["rows"]]
        assert ym_list == sorted(ym_list), f"rows must be ordered ASC by ym, got {ym_list}"


# ------------------- Report download -------------------
class TestReport:
    def test_pdf_patrimonio(self, h):
        r = requests.get(f"{API}/report/patrimonio.pdf", headers=h, timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert "application/pdf" in r.headers.get("content-type", "")
        assert r.content.startswith(b"%PDF"), f"PDF magic missing: {r.content[:10]!r}"
        assert len(r.content) > 1024, f"PDF too small: {len(r.content)} bytes"

    def test_xlsx_patrimonio(self, h):
        r = requests.get(f"{API}/report/patrimonio.xlsx", headers=h, timeout=60)
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "")
        # XLSX is zip → PK magic
        assert r.content[:2] == b"PK", f"XLSX magic missing: {r.content[:4]!r}"
        assert len(r.content) > 3 * 1024, f"XLSX too small: {len(r.content)}"

    def test_csv_patrimonio(self, h):
        r = requests.get(f"{API}/report/patrimonio.csv", headers=h, timeout=30)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        first_line = r.content.decode("utf-8").splitlines()[0]
        assert first_line.startswith("Codice,Nome,Citta"), f"Bad header: {first_line}"

    def test_pdf_bilancio(self, h):
        r = requests.get(f"{API}/report/bilancio.pdf", headers=h, timeout=60)
        # if 404, must have right detail
        if r.status_code == 404:
            assert "Nessun bilancio" in r.json().get("detail", "")
        else:
            assert r.status_code == 200
            assert "application/pdf" in r.headers.get("content-type", "")
            assert r.content.startswith(b"%PDF")
            assert len(r.content) > 1024

    def test_unknown_report_404(self, h):
        r = requests.get(f"{API}/report/unknownReportId.pdf", headers=h, timeout=30)
        assert r.status_code == 404

    def test_unsupported_format_400(self, h):
        r = requests.get(f"{API}/report/patrimonio.xml", headers=h, timeout=30)
        assert r.status_code == 400

    def test_report_unauthorized(self):
        r = requests.get(f"{API}/report/patrimonio.pdf", timeout=30)
        assert r.status_code in (401, 403)
