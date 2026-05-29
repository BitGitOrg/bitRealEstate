"""
Backend tests for Centro Import (iter 5):
- /api/import/template/immobili (XLSX template download)
- /api/import/immobili/parse + /commit
- /api/import/bilancio/parse + /commit + GET /api/import/bilanci
- /api/import/banca/parse + /commit
"""
import io
import os
import pytest
import requests
import openpyxl

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://property-autopilot-4.preview.emergentagent.com").rstrip("/")
EMAIL = "ceo@controlroom.it"
PASSWORD = "demo1234"


@pytest.fixture(scope="module")
def auth():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ----- Immobili template -----
@pytest.fixture(scope="module")
def template_bytes(auth):
    r = auth.get(f"{BASE_URL}/api/import/template/immobili", timeout=20)
    assert r.status_code == 200, f"template download {r.status_code}: {r.text[:300]}"
    assert "spreadsheet" in r.headers.get("content-type", ""), r.headers.get("content-type")
    assert len(r.content) > 4000, f"template too small: {len(r.content)}"
    return r.content


def test_template_download_content(template_bytes):
    wb = openpyxl.load_workbook(io.BytesIO(template_bytes))
    assert "Immobili" in wb.sheetnames
    assert "Istruzioni" in wb.sheetnames
    ws = wb["Immobili"]
    headers = [ws.cell(row=1, column=i).value for i in range(1, 24)]
    # 23 columns
    assert len([h for h in headers if h]) == 23
    joined = " | ".join(str(h) for h in headers)
    for needed in ["Nome immobile", "Prezzo acquisto", "Banca mutuo", "Capitale residuo", "Rata mutuo", "Tasso mutuo"]:
        assert needed in joined, f"Missing header: {needed}"


def test_parse_immobili_with_template(auth, template_bytes):
    files = {"file": ("template.xlsx", template_bytes,
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    r = auth.post(f"{BASE_URL}/api/import/immobili/parse", files=files, timeout=20)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
    data = r.json()
    assert data["total_rows"] == 1
    assert data["valid_rows"] == 1
    row = data["rows"][0]
    assert row["nome"] == "Bilocale Navigli"
    assert row["prezzo_acquisto"] == 215000
    assert row["mutuo_banca"] == "Intesa Sanpaolo"
    assert row["mutuo_residuo"] == 95000
    assert row["valid"] is True


# ----- Commit immobili -----
def test_commit_immobili_creates_property(auth):
    payload = {"rows": [{
        "nome": "TEST_bulk_import",
        "citta": "Roma",
        "prezzo_acquisto": 200000,
        "canone_mensile": 1000,
        "valid": True,
    }]}
    r = auth.post(f"{BASE_URL}/api/import/immobili/commit", json=payload, timeout=20)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
    data = r.json()
    assert data["created"] == 1
    item = data["items"][0]
    assert item["id"].startswith("IMM-")
    assert item["nome"] == "TEST_bulk_import"
    new_id = item["id"]

    # Verify visible via GET /api/properties
    r2 = auth.get(f"{BASE_URL}/api/properties", timeout=20)
    assert r2.status_code == 200
    ids = [p["id"] for p in r2.json()]
    assert new_id in ids

    # cleanup
    auth.delete(f"{BASE_URL}/api/properties/{new_id}", timeout=10)


# ----- Bilancio AI -----
def _build_bilancio_xlsx() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Bilancio 2025"
    rows = [
        ["CONTO ECONOMICO", ""],
        ["Ricavi affitti", 28500],
        ["Altri ricavi", 0],
        ["Costi di gestione", 4200],
        ["IMU", 1800],
        ["Interessi mutui", 5100],
        ["Utile netto", 16100],
        ["", ""],
        ["STATO PATRIMONIALE", ""],
        ["Valore immobili", 3650000],
        ["Liquidità", 142500],
        ["Debito mutui", 1310000],
        ["Patrimonio netto", 2482500],
    ]
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


def test_parse_bilancio_ai(auth):
    xlsx = _build_bilancio_xlsx()
    files = {"file": ("bilancio.xlsx", xlsx,
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    r = auth.post(f"{BASE_URL}/api/import/bilancio/parse", files=files, timeout=60)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
    data = r.json()
    assert "conto_economico" in data
    assert "stato_patrimoniale" in data
    ce = data["conto_economico"]
    sp = data["stato_patrimoniale"]
    # Validate numbers extracted by Claude (allow some tolerance / 0-fallback)
    assert ce.get("ricavi_affitti") == 28500, f"ricavi_affitti={ce.get('ricavi_affitti')}"
    assert ce.get("imu") == 1800, f"imu={ce.get('imu')}"
    assert ce.get("utile_netto") == 16100, f"utile_netto={ce.get('utile_netto')}"
    assert sp.get("valore_immobili") == 3650000
    assert sp.get("debito_mutui") == 1310000
    assert sp.get("patrimonio_netto") == 2482500
    # Store for next test
    pytest.bilancio_parsed = data


def test_commit_bilancio_and_list(auth):
    parsed = getattr(pytest, "bilancio_parsed", None)
    if not parsed:
        pytest.skip("parse_bilancio failed; commit cannot run")
    body = {
        "periodo": parsed.get("periodo") or "2025",
        "tipo": parsed.get("tipo") or "provvisorio",
        "conto_economico": parsed["conto_economico"],
        "stato_patrimoniale": parsed["stato_patrimoniale"],
        "note_estrazione": parsed.get("note_estrazione", ""),
        "filename": parsed.get("_filename", "bilancio.xlsx"),
    }
    r = auth.post(f"{BASE_URL}/api/import/bilancio/commit", json=body, timeout=20)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
    saved = r.json()
    assert saved["id"]
    saved_id = saved["id"]

    # list
    r2 = auth.get(f"{BASE_URL}/api/import/bilanci", timeout=20)
    assert r2.status_code == 200
    ids = [b["id"] for b in r2.json()]
    assert saved_id in ids

    # cleanup
    auth.delete(f"{BASE_URL}/api/import/bilanci/{saved_id}", timeout=10)


# ----- Banca -----
@pytest.fixture(scope="module")
def seed_property_for_match(auth):
    """Create a property with canone_mensile=1450 so match_canone has a target."""
    r = auth.post(f"{BASE_URL}/api/import/immobili/commit", json={"rows": [{
        "nome": "TEST_banca_match", "citta": "Milano",
        "prezzo_acquisto": 215000, "canone_mensile": 1450, "valid": True,
    }]}, timeout=20)
    assert r.status_code == 200
    pid = r.json()["items"][0]["id"]
    yield pid
    auth.delete(f"{BASE_URL}/api/properties/{pid}", timeout=10)


def test_parse_banca_matches_canone(auth, seed_property_for_match):
    csv_content = (
        "Data;Descrizione;Importo\n"
        "2026-02-03;Bonifico affitto;1450\n"
        "2026-02-05;Pagamento condominio;-200\n"
    )
    files = {"file": ("estratto.csv", csv_content.encode("utf-8"), "text/csv")}
    r = auth.post(f"{BASE_URL}/api/import/banca/parse", files=files, timeout=20)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
    data = r.json()
    assert data["total"] == 2
    assert data["entrate"] == 1
    assert data["uscite"] == 1
    movs = data["movimenti"]
    entry = next(m for m in movs if m["tipo"] == "entrata")
    assert entry["importo"] == 1450
    assert entry["match_canone"] is not None
    assert entry["match_canone"]["canone_atteso"] == 1450
    # store for commit
    pytest.banca_movs = movs


def test_commit_banca(auth):
    movs = getattr(pytest, "banca_movs", None)
    if not movs:
        pytest.skip("parse_banca failed; commit skipped")
    r = auth.post(f"{BASE_URL}/api/import/banca/commit", json={"movimenti": movs}, timeout=20)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
    assert r.json()["created"] == len(movs)
