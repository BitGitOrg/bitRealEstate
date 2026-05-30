"""Iter 17 — Locazione PATCH endpoint + PropertyIn locazione fields + Investor Book regression."""
import os
import io
import pytest
import requests
import pdfplumber

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "ceo@controlroom.it", "password": "demo1234"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- New endpoint PATCH /properties/{pid}/locazione ----------
class TestLocazionePatch:
    def test_full_workflow_create_patch_get_partial_delete(self, H):
        # 1) create fresh
        r = requests.post(
            f"{BASE_URL}/api/properties",
            json={"nome": "TEST_Locazione", "prezzo_acquisto": 100000},
            headers=H,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        pid = r.json()["id"]

        try:
            # 2) full PATCH
            payload = {
                "inquilino": "Verdi SRL",
                "data_inizio_contratto": "2024-01-15",
                "scadenza_contratto": "2028-01-14",
                "deposito_cauzionale": 3000,
                "durata_contratto_anni": 4,
                "rinnovo_automatico": True,
                "canone_mensile": 1800,
            }
            r = requests.patch(
                f"{BASE_URL}/api/properties/{pid}/locazione", json=payload, headers=H, timeout=15
            )
            assert r.status_code == 200, r.text
            body = r.json()
            for k, v in payload.items():
                assert body.get(k) == v, f"PATCH response field {k}: {body.get(k)} != {v}"

            # 3) GET confirms persistence
            r = requests.get(f"{BASE_URL}/api/properties/{pid}", headers=H, timeout=15)
            assert r.status_code == 200
            got = r.json()
            for k, v in payload.items():
                assert got.get(k) == v, f"GET field {k}: {got.get(k)} != {v}"

            # 4) partial — only canone
            r = requests.patch(
                f"{BASE_URL}/api/properties/{pid}/locazione",
                json={"canone_mensile": 1900},
                headers=H,
                timeout=15,
            )
            assert r.status_code == 200
            b2 = r.json()
            assert b2["canone_mensile"] == 1900
            assert b2["inquilino"] == "Verdi SRL"
            assert b2["deposito_cauzionale"] == 3000
        finally:
            # 5) cleanup
            requests.delete(f"{BASE_URL}/api/properties/{pid}", headers=H, timeout=15)

    def test_empty_body_returns_400(self, H):
        # Create a temp property
        r = requests.post(
            f"{BASE_URL}/api/properties",
            json={"nome": "TEST_EmptyPatch", "prezzo_acquisto": 1},
            headers=H,
            timeout=15,
        )
        pid = r.json()["id"]
        try:
            r = requests.patch(
                f"{BASE_URL}/api/properties/{pid}/locazione", json={}, headers=H, timeout=15
            )
            assert r.status_code == 400, r.text
        finally:
            requests.delete(f"{BASE_URL}/api/properties/{pid}", headers=H, timeout=15)

    def test_invalid_id_returns_404(self, H):
        r = requests.patch(
            f"{BASE_URL}/api/properties/IMM-NOTEXIST/locazione",
            json={"inquilino": "X"},
            headers=H,
            timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_auth_required(self):
        r = requests.patch(
            f"{BASE_URL}/api/properties/IMM-WHATEVER/locazione",
            json={"inquilino": "X"},
            timeout=15,
        )
        assert r.status_code in (401, 403)


# ---------- PropertyIn extended (POST accepts locazione fields) ----------
class TestPropertyInLocazioneFields:
    def test_post_with_locazione_fields_persists(self, H):
        payload = {
            "nome": "TEST_PostWithLocazione",
            "prezzo_acquisto": 200000,
            "inquilino": "Rossi SRL",
            "data_inizio_contratto": "2025-02-01",
            "scadenza_contratto": "2029-01-31",
            "deposito_cauzionale": 4000,
            "durata_contratto_anni": 4,
            "rinnovo_automatico": True,
        }
        r = requests.post(f"{BASE_URL}/api/properties", json=payload, headers=H, timeout=15)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        try:
            r = requests.get(f"{BASE_URL}/api/properties/{pid}", headers=H, timeout=15)
            got = r.json()
            for k in [
                "inquilino", "data_inizio_contratto", "scadenza_contratto",
                "deposito_cauzionale", "durata_contratto_anni", "rinnovo_automatico",
            ]:
                assert got.get(k) == payload[k], f"{k}: {got.get(k)} != {payload[k]}"
        finally:
            requests.delete(f"{BASE_URL}/api/properties/{pid}", headers=H, timeout=15)


# ---------- Investor Book PDF regression with tenant data ----------
class TestInvestorBookRegression:
    def test_investor_book_reflects_patched_canone(self, H):
        TARGET = "IMM-BE20E5"  # Bilocale Navigli
        # 1) save original
        r = requests.get(f"{BASE_URL}/api/properties/{TARGET}", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        original_canone = r.json().get("canone_mensile")
        original_inquilino = r.json().get("inquilino")
        assert original_canone is not None

        new_canone = 2777  # distinctive value unlikely to collide
        try:
            # 2) PATCH new canone
            r = requests.patch(
                f"{BASE_URL}/api/properties/{TARGET}/locazione",
                json={"canone_mensile": new_canone},
                headers=H,
                timeout=15,
            )
            assert r.status_code == 200

            # 3) Download PDF
            r = requests.get(
                f"{BASE_URL}/api/report/investor-book.pdf", headers=H, timeout=60
            )
            assert r.status_code == 200, r.text[:300]
            assert r.headers.get("content-type", "").startswith("application/pdf")
            assert len(r.content) > 5000

            # 4) Verify new canone appears
            text_all = ""
            with pdfplumber.open(io.BytesIO(r.content)) as pdf:
                for page in pdf.pages:
                    text_all += (page.extract_text() or "") + "\n"
            # Italian formatting may render as 2.777 or 2777
            assert ("2.777" in text_all) or ("2777" in text_all), (
                f"new canone {new_canone} not found in PDF. Sample: {text_all[:400]}"
            )
            # tenant name should still be present
            if original_inquilino:
                # extract first word of tenant for safe match
                first_word = original_inquilino.split()[0]
                assert first_word in text_all, f"Tenant '{first_word}' not in PDF"
        finally:
            # 5) restore
            requests.patch(
                f"{BASE_URL}/api/properties/{TARGET}/locazione",
                json={"canone_mensile": original_canone},
                headers=H,
                timeout=15,
            )
