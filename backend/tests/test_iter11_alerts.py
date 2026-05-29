"""
Iteration 11 — Proactive Alerts on Forecast scenarios.
Verifies alerts per snapshot, summary aggregates, settings-driven thresholds,
AI Coach context inclusion, PDF size growth, compare endpoint shape, and
regression on existing endpoints.
"""
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

CEO_EMAIL = "ceo@controlroom.it"
CEO_PASSWORD = "demo1234"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": CEO_EMAIL, "password": CEO_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="session")
def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def created_ids():
    ids = []
    yield ids
    try:
        r = requests.post(f"{API}/auth/login", json={"email": CEO_EMAIL, "password": CEO_PASSWORD}, timeout=15)
        tok = r.json().get("token") or r.json().get("access_token")
        hh = {"Authorization": f"Bearer {tok}"}
        for sid in ids:
            try:
                requests.delete(f"{API}/forecast/scenarios/{sid}", headers=hh, timeout=15)
            except Exception:
                pass
        # reset settings defaults
        try:
            requests.put(
                f"{API}/settings",
                headers={**hh, "Content-Type": "application/json"},
                json={"target_netto": 5, "limite_indebitamento": 70},
                timeout=15,
            )
        except Exception:
            pass
    except Exception:
        pass


def _create(H, payload, created_ids):
    r = requests.post(f"{API}/forecast/scenarios", headers=H, json=payload, timeout=30)
    assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
    sid = r.json()["id"]
    created_ids.append(sid)
    return sid


def _simulate(H, sid):
    r = requests.post(f"{API}/forecast/scenarios/{sid}/simulate", headers=H, timeout=60)
    assert r.status_code == 200, f"Simulate failed: {r.status_code} {r.text}"
    return r.json()


def _base(name, **overrides):
    p = {
        "nome": f"TEST_iter11_{name}_{uuid.uuid4().hex[:6]}",
        "descrizione": "alert test",
        "horizon_years": 5,
        "use_real_baseline": False,
        "initial_patrimonio": 500000,
        "initial_debito": 100000,
        "initial_liquidita": 80000,
        "initial_canone_mensile": 2200,
        "initial_rata_mutui": 400,
        "initial_numero_immobili": 3,
        "rivalutazione_immobili": 1.5,
        "istat_canoni": 1.5,
        "tassazione_pct": 26,
        "operations": [],
    }
    p.update(overrides)
    return p


# ---------- High-leverage scenario fixture (re-used across multiple tests) ----------
@pytest.fixture(scope="module")
def high_leverage(H, created_ids):
    payload = _base(
        "highlev",
        initial_patrimonio=200000,
        initial_debito=180000,
        initial_liquidita=1000,
        initial_canone_mensile=300,
        initial_rata_mutui=1500,
        operations=[
            {
                "anno": 1,
                "tipo": "acquisto",
                "label": "Acquisto leva alta",
                "prezzo": 400000,
                "lavori": 20000,
                "canone_mensile": 800,
                "mutuo_pct": 0.9,
                "tasso_mutuo": 4.5,
                "durata_mutuo": 25,
            }
        ],
    )
    sid = _create(H, payload, created_ids)
    sim = _simulate(H, sid)
    return {"id": sid, "sim": sim}


# ---------- Tests ----------
class TestAlertShape:
    """Each snapshot must expose an alerts[] array with severity/code/message."""

    def test_simulate_returns_alerts_per_snapshot(self, high_leverage):
        sim = high_leverage["sim"]
        assert "snapshots" in sim and len(sim["snapshots"]) > 1
        for snap in sim["snapshots"]:
            assert "alerts" in snap and isinstance(snap["alerts"], list)
            for a in snap["alerts"]:
                assert a.get("severity") in ("critical", "warning")
                assert isinstance(a.get("code"), str) and a["code"]
                assert isinstance(a.get("message"), str) and a["message"]


class TestAlertTypes:
    """Verify each documented alert code triggers in the right scenario."""

    def test_ltv_alto_critical(self, high_leverage):
        sim = high_leverage["sim"]
        # year 1 should have LTV > 70% given mutuo_pct=0.9 + existing debt
        codes_y1 = [a["code"] for a in sim["snapshots"][1]["alerts"]]
        assert "ltv_alto" in codes_y1, f"Expected ltv_alto in year1, got {codes_y1}"
        ltv_alert = next(a for a in sim["snapshots"][1]["alerts"] if a["code"] == "ltv_alto")
        assert ltv_alert["severity"] == "critical"

    def test_cash_flow_negativo(self, H, created_ids):
        sid = _create(
            H,
            _base("cfneg", initial_canone_mensile=300, initial_rata_mutui=1500, operations=[]),
            created_ids,
        )
        sim = _simulate(H, sid)
        # year 1 (or any year) should trigger cash_flow_negativo
        found = any(
            "cash_flow_negativo" in [a["code"] for a in s["alerts"]]
            for s in sim["snapshots"][1:]
        )
        assert found, "Expected cash_flow_negativo alert when rata > canone"

    def test_liquidita_negativa_and_first_year_set(self, H, created_ids):
        sid = _create(
            H,
            _base(
                "liqneg",
                initial_liquidita=1000,
                initial_canone_mensile=200,
                initial_rata_mutui=2500,
            ),
            created_ids,
        )
        sim = _simulate(H, sid)
        codes_all = [a["code"] for s in sim["snapshots"][1:] for a in s["alerts"]]
        assert "liquidita_negativa" in codes_all, f"got: {codes_all}"
        fyn = sim["summary"].get("first_year_negative_liquidity")
        assert isinstance(fyn, int) and fyn >= 1

    def test_patrimonio_negativo_debt_gt_assets(self, H, created_ids):
        sid = _create(
            H,
            _base(
                "patneg",
                initial_patrimonio=50000,
                initial_debito=200000,
                initial_liquidita=10000,
                initial_canone_mensile=1500,
                initial_rata_mutui=900,
            ),
            created_ids,
        )
        sim = _simulate(H, sid)
        codes_all = [a["code"] for s in sim["snapshots"] for a in s["alerts"]]
        assert "patrimonio_negativo" in codes_all, f"got: {codes_all}"

    def test_rata_su_canone_warning(self, H, created_ids):
        sid = _create(
            H,
            _base(
                "ratacanone",
                initial_patrimonio=500000,
                initial_debito=100000,
                initial_liquidita=50000,
                initial_canone_mensile=800,
                initial_rata_mutui=1200,
            ),
            created_ids,
        )
        sim = _simulate(H, sid)
        codes_all = [a["code"] for s in sim["snapshots"] for a in s["alerts"]]
        assert "rata_su_canone" in codes_all, f"got: {codes_all}"
        # confirm severity
        for s in sim["snapshots"]:
            for a in s["alerts"]:
                if a["code"] == "rata_su_canone":
                    assert a["severity"] == "warning"
                    return

    def test_patrimonio_in_calo_yoy_drop(self, H, created_ids):
        # Force a YoY drop > 5% on patrimonio_netto by setting negative rivalutazione
        sid = _create(
            H,
            _base(
                "pncalo",
                initial_patrimonio=200000,
                initial_debito=50000,
                initial_liquidita=20000,
                initial_canone_mensile=1500,
                initial_rata_mutui=500,
                rivalutazione_immobili=-15,  # immobili lose 15%/year -> pn drops
                istat_canoni=0,
            ),
            created_ids,
        )
        sim = _simulate(H, sid)
        codes_all = [a["code"] for s in sim["snapshots"] for a in s["alerts"]]
        # patrimonio_in_calo should appear in at least one year
        assert "patrimonio_in_calo" in codes_all, f"got: {codes_all}"


class TestSummaryAggregates:
    """The summary must include the new alert aggregate fields."""

    REQUIRED = (
        "alerts_critical",
        "alerts_warning",
        "years_with_neg_cash_flow",
        "years_with_high_ltv",
        "first_year_negative_liquidity",
        "verdict",
        "verdict_severity",
        "patrimonio_netto_finale",
    )

    def test_summary_fields_present(self, high_leverage):
        s = high_leverage["sim"]["summary"]
        for k in self.REQUIRED:
            assert k in s, f"Missing summary.{k}"
        assert isinstance(s["alerts_critical"], int)
        assert isinstance(s["alerts_warning"], int)
        assert isinstance(s["years_with_neg_cash_flow"], list)
        assert isinstance(s["years_with_high_ltv"], list)
        assert s["verdict_severity"] in ("critical", "warning", "ok")
        assert isinstance(s["verdict"], str) and s["verdict"]

    def test_high_leverage_is_critical(self, high_leverage):
        s = high_leverage["sim"]["summary"]
        assert s["alerts_critical"] >= 5, f"Expected >=5 critical, got {s['alerts_critical']}"
        assert s["verdict_severity"] == "critical"


class TestHealthyScenario:
    """Regression: a healthy scenario should not raise critical alerts."""

    def test_healthy(self, H, created_ids):
        sid = _create(
            H,
            _base(
                "healthy",
                initial_patrimonio=500000,
                initial_debito=100000,
                initial_liquidita=80000,
                initial_canone_mensile=2200,
                initial_rata_mutui=400,
                operations=[],
            ),
            created_ids,
        )
        sim = _simulate(H, sid)
        s = sim["summary"]
        assert s["alerts_critical"] == 0, f"healthy scenario has critical alerts: {s}"
        assert s["verdict_severity"] in ("ok", "warning")
        v = s["verdict"].lower()
        assert ("sostenibile" in v) or ("praticabile" in v), f"Unexpected verdict: {s['verdict']}"


class TestSettingsThresholds:
    """LTV threshold from settings.limite_indebitamento and target_netto must drive alerts."""

    def test_thresholds_picked_from_settings(self, H, created_ids):
        # Create a scenario with LTV ~55-65% — no ltv_alto with default 70%
        sid = _create(
            H,
            _base(
                "thresh",
                initial_patrimonio=300000,
                initial_debito=180000,  # ~60% LTV on patrimonio 300k+debito 180k -> valore = patr+debito? need to check
                initial_liquidita=30000,
                initial_canone_mensile=1500,
                initial_rata_mutui=800,
            ),
            created_ids,
        )
        # default thresholds
        sim_default = _simulate(H, sid)

        # Now tighten: target_netto=8, limite_indebitamento=50
        r = requests.put(
            f"{API}/settings",
            headers=H,
            json={"target_netto": 8, "limite_indebitamento": 50},
            timeout=20,
        )
        assert r.status_code == 200, r.text

        sim_strict = _simulate(H, sid)

        # Reset settings for downstream tests
        requests.put(
            f"{API}/settings",
            headers=H,
            json={"target_netto": 5, "limite_indebitamento": 70},
            timeout=20,
        )

        # We expect strict run to have at least as many critical alerts as default
        assert sim_strict["summary"]["alerts_critical"] >= sim_default["summary"]["alerts_critical"], (
            f"Strict thresholds did not increase or keep critical count: "
            f"default={sim_default['summary']['alerts_critical']} strict={sim_strict['summary']['alerts_critical']}"
        )
        # And total warnings should be >= as well (rendimento_sotto_target very likely)
        strict_codes = [a["code"] for s in sim_strict["snapshots"] for a in s["alerts"]]
        default_codes = [a["code"] for s in sim_default["snapshots"] for a in s["alerts"]]
        # rendimento_sotto_target most likely fires at 8% (warning) but only when utile>0; tolerant check:
        # if rendimento_sotto_target appeared in either, that's fine.
        # The strict test must show new behavior:  either ltv_alto starts firing OR rendimento_sotto_target starts firing.
        gained = set(strict_codes) - set(default_codes)
        assert ("ltv_alto" in gained) or ("rendimento_sotto_target" in gained) or (
            sim_strict["summary"]["alerts_critical"] > sim_default["summary"]["alerts_critical"]
        ), f"Expected new alerts when tightening thresholds. gained={gained}"


class TestAICoachContext:
    """AI Coach should reference alerts when asked about them."""

    def test_ai_coach_mentions_alerts(self, H, high_leverage):
        sid = high_leverage["id"]
        r = requests.post(
            f"{API}/forecast/scenarios/{sid}/ai",
            headers=H,
            json={"message": "Quali sono gli alert critici?"},
            timeout=90,
        )
        assert r.status_code == 200, f"AI failed: {r.status_code} {r.text}"
        data = r.json()
        reply = (data.get("reply") or data.get("message") or "").lower()
        assert reply, f"Empty AI reply: {data}"
        assert any(k in reply for k in ("ltv", "cash flow", "cashflow", "liquid")), (
            f"AI reply does not mention alerts terms: {reply[:300]}"
        )


class TestPDFSize:
    """High-leverage PDF should now be larger because of the alert section."""

    def test_pdf_larger_for_risky(self, H, high_leverage, created_ids):
        sid_risky = high_leverage["id"]
        # clean scenario
        sid_clean = _create(
            H,
            _base(
                "pdfclean",
                initial_patrimonio=500000,
                initial_debito=100000,
                initial_liquidita=80000,
                initial_canone_mensile=2200,
                initial_rata_mutui=400,
                operations=[],
            ),
            created_ids,
        )
        _simulate(H, sid_clean)
        _simulate(H, sid_risky)

        r1 = requests.get(f"{API}/forecast/scenarios/{sid_risky}/pdf", headers=H, timeout=60)
        r2 = requests.get(f"{API}/forecast/scenarios/{sid_clean}/pdf", headers=H, timeout=60)
        assert r1.status_code == 200 and r1.content[:4] == b"%PDF"
        assert r2.status_code == 200 and r2.content[:4] == b"%PDF"
        assert len(r1.content) > len(r2.content), (
            f"Risky PDF ({len(r1.content)}B) should be larger than clean ({len(r2.content)}B)"
        )
        # And risky should be in the ~7KB+ range
        assert len(r1.content) >= 6500, f"Risky PDF too small: {len(r1.content)} bytes"


class TestCompareIncludesAlerts:
    """Compare endpoint results must include new alert summary fields."""

    def test_compare_alerts_fields(self, H, high_leverage, created_ids):
        risky_id = high_leverage["id"]
        safe_id = _create(
            H,
            _base("safecomp", initial_canone_mensile=2200, initial_rata_mutui=400),
            created_ids,
        )
        _simulate(H, safe_id)

        r = requests.post(
            f"{API}/forecast/scenarios/compare",
            headers=H,
            json={"scenario_ids": [risky_id, safe_id]},
            timeout=60,
        )
        assert r.status_code == 200, f"compare failed: {r.status_code} {r.text}"
        data = r.json()
        results = data.get("scenarios") or data.get("results") or []
        assert isinstance(results, list) and len(results) == 2, f"Unexpected compare shape: {data}"
        for item in results:
            summary = (item.get("result") or {}).get("summary") or item.get("summary")
            assert summary, f"Missing summary in {item}"
            for k in ("alerts_critical", "alerts_warning", "verdict_severity"):
                assert k in summary, f"Compare result missing {k}: {summary}"


class TestRegression:
    """Existing endpoints unchanged."""

    def test_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": CEO_EMAIL, "password": CEO_PASSWORD}, timeout=15)
        assert r.status_code == 200

    def test_list_scenarios(self, H):
        r = requests.get(f"{API}/forecast/scenarios", headers=H, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_stato_salute_pdf(self, H):
        r = requests.get(f"{API}/report/stato-salute.pdf", headers=H, timeout=60)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_properties(self, H):
        r = requests.get(f"{API}/properties", headers=H, timeout=20)
        assert r.status_code == 200

    def test_settings(self, H):
        r = requests.get(f"{API}/settings", headers=H, timeout=20)
        assert r.status_code == 200
