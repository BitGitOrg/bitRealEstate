"""Iteration 19 — POST /api/forecast/quick endpoint tests.

Covers:
- params-only (deterministic) mode — sanity check
- prompt-only mode (LLM call) — must return operations >= 5 for a 5y horizon
- cleanup: removes any 'Forecast rapido' scenario potentially persisted
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

EMAIL = "ceo@controlroom.it"
PASSWORD = "demo1234"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- params-only mode ----------------
def test_quick_forecast_params_only(auth_headers):
    payload = {
        "horizon_years": 5,
        "params": {
            "acquisti_per_anno": 2,
            "tipologia": "Bilocale",
            "prezzo_medio": 150000,
            "canone_medio": 900,
            "citta_preferita": "Bologna",
            "leva_pct": 60,
        },
        "save": False,
    }
    r = requests.post(f"{BASE_URL}/api/forecast/quick", headers=auth_headers, json=payload, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "simulation" in data and "draft_scenario" in data
    ops = data["draft_scenario"]["operations"]
    assert len(ops) == 10, f"expected 10 ops (2/y * 5y), got {len(ops)}"
    assert all(o["tipo"] == "acquisto" for o in ops)
    snapshots = data["simulation"].get("snapshots") or []
    assert len(snapshots) >= 5
    summary = data["simulation"].get("summary") or {}
    assert summary, "simulation.summary should be present"


# ---------------- prompt-only mode (LLM) ----------------
def test_quick_forecast_prompt_only(auth_headers):
    payload = {
        "horizon_years": 5,
        "prompt": "Compro 1 bilocale Bologna anno, 150k, canone 900",
        "save": False,
    }
    r = requests.post(f"{BASE_URL}/api/forecast/quick", headers=auth_headers, json=payload, timeout=120)
    assert r.status_code == 200, f"status={r.status_code} body={r.text[:500]}"
    data = r.json()
    assert "draft_scenario" in data
    ops = data["draft_scenario"]["operations"]
    assert len(ops) >= 5, f"expected >=5 ops from LLM, got {len(ops)}: {ops}"
    # operations should have valid structure
    for o in ops:
        assert o.get("tipo") in {"acquisto", "vendita", "ristrutturazione", "rinegoziazione_mutuo", "sfitto", "aumento_canone"}
        assert 1 <= o.get("anno", 0) <= 5
    assert data.get("strategy_summary"), "strategy_summary should be non-empty for LLM run"
    assert data["simulation"].get("snapshots")


# ---------------- error path ----------------
def test_quick_forecast_missing_both(auth_headers):
    r = requests.post(f"{BASE_URL}/api/forecast/quick", headers=auth_headers, json={"horizon_years": 3, "save": False}, timeout=30)
    assert r.status_code == 400


# ---------------- cleanup ----------------
def test_cleanup_quick_scenarios(auth_headers):
    """Delete any persisted 'Forecast rapido' scenarios (if save=true was used)."""
    r = requests.get(f"{BASE_URL}/api/scenarios", headers=auth_headers, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"cannot list scenarios: {r.status_code}")
    scenarios = r.json() if isinstance(r.json(), list) else r.json().get("scenarios", [])
    removed = 0
    for s in scenarios:
        nome = (s.get("nome") or "").lower()
        if "forecast rapido" in nome or s.get("quick_mode") is True:
            sid = s.get("id")
            if sid:
                d = requests.delete(f"{BASE_URL}/api/scenarios/{sid}", headers=auth_headers, timeout=15)
                if d.status_code in (200, 204):
                    removed += 1
    print(f"cleanup removed {removed} quick scenarios")
