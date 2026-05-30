"""
Tests for POST /api/forecast/auto-optimize (AI Strategist).
Heavy LLM calls — long timeouts. Validate structure + broad trends, not exact values.
"""
import os
import time
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://property-autopilot-4.preview.emergentagent.com").rstrip("/")
TIMEOUT = 120  # generous for Claude


@pytest.fixture(scope="session")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "ceo@controlroom.it", "password": "demo1234"},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.text}"
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    assert auth_token, "no token"
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def created_test_ids():
    return []


def _call_auto(body, headers):
    return requests.post(
        f"{BASE_URL}/api/forecast/auto-optimize",
        json=body,
        headers=headers,
        timeout=TIMEOUT,
    )


def _validate_response_shape(data, horizon):
    assert "draft_scenario" in data
    assert "simulation" in data
    assert "strategy_summary" in data and isinstance(data["strategy_summary"], str)
    assert "expected_outcome" in data and isinstance(data["expected_outcome"], str)
    assert "key_risks" in data and isinstance(data["key_risks"], list)
    assert "goal_summary" in data
    assert "saved_id" in data
    gs = data["goal_summary"]
    for k in ("target_pn", "pn_finale_simulato", "gap_pct", "target_raggiunto", "ltv_max", "ltv_finale", "ltv_rispettato"):
        assert k in gs, f"missing goal_summary.{k}"
    ds = data["draft_scenario"]
    assert ds["use_real_baseline"] is True
    assert ds["horizon_years"] == horizon
    sim = data["simulation"]
    assert len(sim["snapshots"]) == horizon + 1
    summary = sim["summary"]
    for k in ("verdict", "verdict_severity", "alerts_critical", "alerts_warning", "ltv_finale"):
        assert k in summary, f"missing simulation.summary.{k}"


# === Auth ===
class TestAuth:
    def test_login_works(self, auth_token):
        assert auth_token

    def test_no_token_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/forecast/auto-optimize", json={"target_patrimonio_netto": 1000000}, timeout=15)
        assert r.status_code in (401, 403)


# === Validation ===
class TestValidation:
    def test_missing_body_422(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/forecast/auto-optimize", json={}, headers=auth_headers, timeout=30)
        assert r.status_code == 422

    def test_only_required_field_succeeds(self, auth_headers):
        # Provide only required field; horizon defaults to 5 → should run (LLM call)
        body = {"target_patrimonio_netto": 800000}
        r = _call_auto(body, auth_headers)
        assert r.status_code == 200, f"unexpected status {r.status_code}: {r.text[:300]}"
        data = r.json()
        _validate_response_shape(data, horizon=5)


# === Basic success ===
class TestBasicSuccess:
    def test_basic_mista_5y(self, auth_headers):
        body = {
            "target_patrimonio_netto": 1000000,
            "horizon_years": 5,
            "max_ltv": 60,
            "capitale_disponibile": 250000,
            "strategia": "mista",
            "propensione_rischio": "media",
        }
        r = _call_auto(body, auth_headers)
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        _validate_response_shape(data, horizon=5)
        ops = data["draft_scenario"]["operations"]
        assert len(ops) >= 1


# === Profile / strategy semantics (allow tolerance — non-deterministic) ===
class TestProfilesAndStrategies:
    def test_propensione_bassa(self, auth_headers):
        body = {
            "target_patrimonio_netto": 600000,
            "horizon_years": 3,
            "max_ltv": 50,
            "capitale_disponibile": 200000,
            "strategia": "mista",
            "propensione_rischio": "bassa",
        }
        r = _call_auto(body, auth_headers)
        assert r.status_code == 200, r.text[:400]
        ops = r.json()["draft_scenario"]["operations"]
        if ops:
            mortgages = [o["mutuo_pct"] for o in ops if o["tipo"] == "acquisto"]
            if mortgages:
                avg = sum(mortgages) / len(mortgages)
                # generous tolerance
                assert avg <= 0.65, f"bassa avg mutuo_pct too high: {avg}"

    def test_propensione_alta_more_ops(self, auth_headers):
        # Run alta and compare op count to bassa baseline indirectly via count threshold
        body = {
            "target_patrimonio_netto": 2000000,
            "horizon_years": 5,
            "max_ltv": 75,
            "capitale_disponibile": 400000,
            "strategia": "mista",
            "propensione_rischio": "alta",
        }
        r = _call_auto(body, auth_headers)
        assert r.status_code == 200, r.text[:400]
        ops = r.json()["draft_scenario"]["operations"]
        # avg ops/year > 1 is the relaxed bound
        assert len(ops) >= 5, f"alta expected >=5 ops over 5y, got {len(ops)}"

    def test_strategia_reddito_no_vendite(self, auth_headers):
        body = {
            "target_patrimonio_netto": 800000,
            "horizon_years": 5,
            "max_ltv": 60,
            "capitale_disponibile": 250000,
            "strategia": "reddito",
            "propensione_rischio": "media",
        }
        r = _call_auto(body, auth_headers)
        assert r.status_code == 200, r.text[:400]
        ops = r.json()["draft_scenario"]["operations"]
        vendite = [o for o in ops if o["tipo"] == "vendita"]
        # tolerant
        assert len(vendite) <= 1, f"reddito should have ~0 vendite, got {len(vendite)}"

    def test_strategia_rivendita_has_vendite(self, auth_headers):
        body = {
            "target_patrimonio_netto": 1200000,
            "horizon_years": 5,
            "max_ltv": 65,
            "capitale_disponibile": 300000,
            "strategia": "rivendita",
            "propensione_rischio": "media",
        }
        r = _call_auto(body, auth_headers)
        assert r.status_code == 200, r.text[:400]
        ops = r.json()["draft_scenario"]["operations"]
        acquisti = [o for o in ops if o["tipo"] == "acquisto"]
        vendite = [o for o in ops if o["tipo"] == "vendita"]
        assert len(acquisti) >= 1
        assert len(vendite) >= 1, f"rivendita expected >=1 vendita, got {len(vendite)}"


# === Edge cases ===
class TestEdgeCases:
    def test_unreachable_target_no_500(self, auth_headers):
        body = {
            "target_patrimonio_netto": 50000000,
            "horizon_years": 3,
            "max_ltv": 60,
            "capitale_disponibile": 50000,
            "strategia": "mista",
            "propensione_rischio": "media",
        }
        r = _call_auto(body, auth_headers)
        assert r.status_code == 200, f"expected 200 even when unreachable, got {r.status_code}: {r.text[:300]}"
        gs = r.json()["goal_summary"]
        assert gs["target_raggiunto"] is False
        assert gs["gap_pct"] < 0

    def test_vincoli_extra_first_years_no_vendita(self, auth_headers):
        body = {
            "target_patrimonio_netto": 1000000,
            "horizon_years": 5,
            "max_ltv": 60,
            "capitale_disponibile": 250000,
            "strategia": "mista",
            "propensione_rischio": "media",
            "vincoli_extra": "Solo immobili a Bologna, no vendite nei primi 2 anni, mantenere almeno €30000 di liquidità",
        }
        r = _call_auto(body, auth_headers)
        assert r.status_code == 200, r.text[:400]
        ops = r.json()["draft_scenario"]["operations"]
        early_vendite = [o for o in ops if o["tipo"] == "vendita" and o["anno"] <= 2]
        # best-effort tolerance
        assert len(early_vendite) <= 1, f"AI did not respect 'no vendite primi 2 anni' (got {len(early_vendite)})"

    def test_capitale_disponibile_null_fallback(self, auth_headers):
        body = {
            "target_patrimonio_netto": 900000,
            "horizon_years": 5,
            "capitale_disponibile": None,
            "strategia": "mista",
            "propensione_rischio": "media",
        }
        r = _call_auto(body, auth_headers)
        assert r.status_code == 200, r.text[:400]
        _validate_response_shape(r.json(), horizon=5)


# === Operations normalization ===
class TestOperationsNormalization:
    def test_operations_well_formed(self, auth_headers):
        body = {
            "target_patrimonio_netto": 1000000,
            "horizon_years": 5,
            "max_ltv": 60,
            "capitale_disponibile": 250000,
            "strategia": "mista",
            "propensione_rischio": "media",
        }
        r = _call_auto(body, auth_headers)
        assert r.status_code == 200
        ops = r.json()["draft_scenario"]["operations"]
        valid_tipos = {"acquisto", "vendita", "ristrutturazione", "rinegoziazione_mutuo", "sfitto", "aumento_canone"}
        for op in ops:
            assert isinstance(op["id"], str) and len(op["id"]) >= 8
            assert isinstance(op["anno"], int)
            assert 1 <= op["anno"] <= 5
            assert op["tipo"] in valid_tipos
            assert isinstance(op.get("label"), str)
            assert 0.0 <= op["mutuo_pct"] <= 0.9


# === Save / Persistence ===
class TestSaveFlag:
    def test_save_false_no_persist(self, auth_headers):
        before = requests.get(f"{BASE_URL}/api/forecast/scenarios", headers=auth_headers, timeout=15).json()
        body = {
            "target_patrimonio_netto": 700000,
            "horizon_years": 5,
            "save": False,
        }
        r = _call_auto(body, auth_headers)
        assert r.status_code == 200
        assert r.json()["saved_id"] is None
        after = requests.get(f"{BASE_URL}/api/forecast/scenarios", headers=auth_headers, timeout=15).json()
        assert len(after) == len(before)

    def test_save_true_persists_and_cleanup(self, auth_headers, created_test_ids):
        name = f"TEST_AUTO_SAVE_{int(time.time())}"
        body = {
            "target_patrimonio_netto": 900000,
            "horizon_years": 5,
            "save": True,
            "nome": name,
        }
        r = _call_auto(body, auth_headers)
        assert r.status_code == 200
        saved_id = r.json()["saved_id"]
        assert saved_id, "saved_id should not be null when save=true"
        created_test_ids.append(saved_id)
        scenarios = requests.get(f"{BASE_URL}/api/forecast/scenarios", headers=auth_headers, timeout=15).json()
        match = [s for s in scenarios if s.get("id") == saved_id]
        assert match, "saved scenario not present in GET /scenarios"
        assert match[0].get("ai_generated") is True
        assert match[0].get("nome") == name


# === Regression ===
class TestRegression:
    def test_login_endpoint(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "ceo@controlroom.it", "password": "demo1234"}, timeout=15)
        assert r.status_code == 200

    def test_get_scenarios(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/forecast/scenarios", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_simulate_existing_scenario(self, auth_headers):
        scenarios = requests.get(f"{BASE_URL}/api/forecast/scenarios", headers=auth_headers, timeout=15).json()
        # pick the first non-TEST one
        target = next((s for s in scenarios if not (s.get("nome") or "").startswith("TEST_")), None)
        if not target:
            pytest.skip("no pre-existing scenario to simulate")
        r = requests.post(f"{BASE_URL}/api/forecast/scenarios/{target['id']}/simulate", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert "snapshots" in r.json()

    def test_stato_salute_pdf(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/report/stato-salute.pdf", headers=auth_headers, timeout=60)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 1000


# === Cleanup ===
class TestCleanup:
    def test_cleanup_test_scenarios(self, auth_headers, created_test_ids):
        scenarios = requests.get(f"{BASE_URL}/api/forecast/scenarios", headers=auth_headers, timeout=15).json()
        to_delete = set(created_test_ids)
        for s in scenarios:
            if (s.get("nome") or "").startswith("TEST_"):
                to_delete.add(s.get("id"))
        for sid in to_delete:
            requests.delete(f"{BASE_URL}/api/forecast/scenarios/{sid}", headers=auth_headers, timeout=15)
        after = requests.get(f"{BASE_URL}/api/forecast/scenarios", headers=auth_headers, timeout=15).json()
        remaining_test = [s for s in after if (s.get("nome") or "").startswith("TEST_")]
        assert not remaining_test, f"test scenarios left: {remaining_test}"
