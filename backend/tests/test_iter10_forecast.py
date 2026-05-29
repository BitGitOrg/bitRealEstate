"""
Iteration 10 — Forecast / Piano Industriale module tests.
Covers: scenario CRUD, simulate, op-type semantics, compare, AI coach, PDF export,
real-data baseline, and regression on report + settings endpoints.
"""
import os
import time
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
    # teardown
    try:
        r = requests.post(f"{API}/auth/login", json={"email": CEO_EMAIL, "password": CEO_PASSWORD}, timeout=15)
        tok = r.json().get("token") or r.json().get("access_token")
        H = {"Authorization": f"Bearer {tok}"}
        for sid in ids:
            try:
                requests.delete(f"{API}/forecast/scenarios/{sid}", headers=H, timeout=15)
            except Exception:
                pass
    except Exception:
        pass


# ---------- Helpers ----------
def base_scenario_payload(name_suffix: str, operations=None, horizon=5, use_real=False):
    return {
        "nome": f"TEST_iter10_{name_suffix}_{uuid.uuid4().hex[:6]}",
        "descrizione": "scenario di test",
        "horizon_years": horizon,
        "use_real_baseline": use_real,
        "initial_patrimonio": 500000,
        "initial_debito": 150000,
        "initial_liquidita": 80000,
        "initial_canone_mensile": 2200,
        "initial_rata_mutui": 650,
        "initial_numero_immobili": 3,
        "rivalutazione_immobili": 2,
        "istat_canoni": 2,
        "tassazione_pct": 26,
        "operations": operations or [],
    }


def create_scenario(H, payload, created_ids):
    r = requests.post(f"{API}/forecast/scenarios", headers=H, json=payload, timeout=30)
    assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
    item = r.json()
    assert "id" in item
    created_ids.append(item["id"])
    return item


def simulate(H, sid):
    r = requests.post(f"{API}/forecast/scenarios/{sid}/simulate", headers=H, timeout=60)
    assert r.status_code == 200, f"Simulate failed: {r.status_code} {r.text}"
    return r.json()


# ---------- CRUD ----------
class TestForecastCRUD:
    def test_create_scenario_basic(self, H, created_ids):
        payload = base_scenario_payload("crud_create", operations=[{
            "id": "o1", "anno": 1, "tipo": "acquisto", "label": "Bilocale BO",
            "prezzo": 150000, "lavori": 8000, "canone_mensile": 750,
            "mutuo_pct": 0.7, "tasso_mutuo": 3, "durata_mutuo": 20,
        }])
        item = create_scenario(H, payload, created_ids)
        assert item["nome"] == payload["nome"]
        assert item["horizon_years"] == 5
        assert len(item["operations"]) == 1
        assert item["operations"][0]["tipo"] == "acquisto"

    def test_list_scenarios(self, H, created_ids):
        # ensure at least one scenario exists
        payload = base_scenario_payload("crud_list")
        create_scenario(H, payload, created_ids)
        r = requests.get(f"{API}/forecast/scenarios", headers=H, timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert any(it["id"] == created_ids[-1] for it in items)

    def test_get_scenario(self, H, created_ids):
        payload = base_scenario_payload("crud_get")
        item = create_scenario(H, payload, created_ids)
        r = requests.get(f"{API}/forecast/scenarios/{item['id']}", headers=H, timeout=20)
        assert r.status_code == 200
        assert r.json()["nome"] == payload["nome"]

    def test_update_scenario(self, H, created_ids):
        payload = base_scenario_payload("crud_update")
        item = create_scenario(H, payload, created_ids)
        updated = {**payload, "descrizione": "AGGIORNATO", "horizon_years": 10}
        r = requests.put(f"{API}/forecast/scenarios/{item['id']}", headers=H, json=updated, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["descrizione"] == "AGGIORNATO"
        assert body["horizon_years"] == 10
        # verify persisted
        g = requests.get(f"{API}/forecast/scenarios/{item['id']}", headers=H, timeout=20)
        assert g.json()["descrizione"] == "AGGIORNATO"

    def test_delete_scenario(self, H, created_ids):
        payload = base_scenario_payload("crud_delete")
        item = create_scenario(H, payload, created_ids)
        r = requests.delete(f"{API}/forecast/scenarios/{item['id']}", headers=H, timeout=20)
        assert r.status_code == 200
        g = requests.get(f"{API}/forecast/scenarios/{item['id']}", headers=H, timeout=20)
        assert g.status_code == 404
        if item["id"] in created_ids:
            created_ids.remove(item["id"])

    def test_get_unknown_404(self, H):
        r = requests.get(f"{API}/forecast/scenarios/{uuid.uuid4()}", headers=H, timeout=20)
        assert r.status_code == 404


# ---------- Simulate shape ----------
class TestSimulate:
    def test_simulate_basic_shape(self, H, created_ids):
        payload = base_scenario_payload("sim_shape", operations=[{
            "id": "o1", "anno": 1, "tipo": "acquisto", "label": "Bilocale",
            "prezzo": 150000, "lavori": 8000, "canone_mensile": 750,
            "mutuo_pct": 0.7, "tasso_mutuo": 3, "durata_mutuo": 20,
        }])
        item = create_scenario(H, payload, created_ids)
        sim = simulate(H, item["id"])
        assert sim["horizon_years"] == 5
        assert len(sim["snapshots"]) == 6  # 0..5
        for key in ["patrimonio_netto_iniziale", "patrimonio_netto_finale", "crescita_pct",
                    "ricavi_totali_periodo", "utile_totale_periodo", "cash_flow_cumulato",
                    "ltv_finale", "numero_immobili_finale"]:
            assert key in sim["summary"], f"missing summary.{key}"
        # snapshot required fields
        snap_keys = ["anno", "numero_immobili", "valore_immobili", "debito_residuo",
                     "patrimonio_netto", "canone_mensile", "rata_mutui_mensile",
                     "ricavi_annui", "costi_annui", "utile_netto", "cash_flow_annuo",
                     "ltv", "roi_anno", "logs"]
        s1 = sim["snapshots"][1]
        for k in snap_keys:
            assert k in s1, f"snapshot missing key {k}"

    def test_simulate_acquisto_effect(self, H, created_ids):
        payload = base_scenario_payload("sim_acquisto", operations=[{
            "id": "a1", "anno": 1, "tipo": "acquisto", "label": "Trilocale",
            "prezzo": 200000, "lavori": 0, "canone_mensile": 900,
            "mutuo_pct": 0.6, "tasso_mutuo": 3, "durata_mutuo": 20,
        }])
        item = create_scenario(H, payload, created_ids)
        sim = simulate(H, item["id"])
        s0, s1 = sim["snapshots"][0], sim["snapshots"][1]
        assert s1["numero_immobili"] == s0["numero_immobili"] + 1
        # debito increased by mutuo (200000 * 0.6 = 120000) minus amortization in year
        # so it should be greater than baseline minus some normal amortization
        assert s1["debito_residuo"] > s0["debito_residuo"] + 50000
        # canone: baseline 2200 * (1.02) + 900 ≈ 3144
        assert s1["canone_mensile"] >= 3000


# ---------- Operation types ----------
class TestOperationTypes:
    def _run(self, H, created_ids, ops, suffix):
        payload = base_scenario_payload(suffix, operations=ops)
        item = create_scenario(H, payload, created_ids)
        return simulate(H, item["id"])

    def test_vendita(self, H, created_ids):
        sim = self._run(H, created_ids, [{
            "id": "v1", "anno": 1, "tipo": "vendita", "label": "Box",
            "prezzo": 80000,
        }], "vendita")
        s0, s1 = sim["snapshots"][0], sim["snapshots"][1]
        assert s1["numero_immobili"] == max(0, s0["numero_immobili"] - 1)
        # valore decreased
        assert s1["valore_immobili"] < s0["valore_immobili"] * 1.02 + 1  # less than mere rivalutazione

    def test_ristrutturazione(self, H, created_ids):
        sim = self._run(H, created_ids, [{
            "id": "r1", "anno": 1, "tipo": "ristrutturazione", "label": "App. centro",
            "lavori": 20000, "canone_mensile": 150,
        }], "ristrutturazione")
        s0, s1 = sim["snapshots"][0], sim["snapshots"][1]
        # canone +150/m on top of istat
        assert s1["canone_mensile"] >= s0["canone_mensile"] * 1.02 + 100
        # value lift > pure rivalutazione
        assert s1["valore_immobili"] > s0["valore_immobili"] * 1.02 + 1000

    def test_rinegoziazione(self, H, created_ids):
        # compare two scenarios identical except one has rinegoziazione
        base = base_scenario_payload("rineg_base")
        base["operations"] = []
        b_item = create_scenario(H, base, created_ids)
        b_sim = simulate(H, b_item["id"])

        ren = base_scenario_payload("rineg_with")
        ren["operations"] = [{
            "id": "rn1", "anno": 1, "tipo": "rinegoziazione_mutuo",
            "tasso_mutuo": 4.0, "nuovo_tasso": 2.0,
        }]
        r_item = create_scenario(H, ren, created_ids)
        r_sim = simulate(H, r_item["id"])
        assert r_sim["snapshots"][1]["rata_mutui_mensile"] < b_sim["snapshots"][1]["rata_mutui_mensile"]

    def test_sfitto(self, H, created_ids):
        sim_no = self._run(H, created_ids, [], "sfitto_none")
        sim_sf = self._run(H, created_ids, [{
            "id": "s1", "anno": 1, "tipo": "sfitto", "mesi": 2,
        }], "sfitto_2m")
        # ricavi anno 1 ridotti
        assert sim_sf["snapshots"][1]["ricavi_annui"] < sim_no["snapshots"][1]["ricavi_annui"]

    def test_aumento_canone(self, H, created_ids):
        sim_no = self._run(H, created_ids, [], "aumcan_none")
        sim_au = self._run(H, created_ids, [{
            "id": "a1", "anno": 1, "tipo": "aumento_canone", "canone_mensile": 100,
        }], "aumcan_100")
        assert sim_au["snapshots"][1]["canone_mensile"] > sim_no["snapshots"][1]["canone_mensile"] + 50


# ---------- Compare ----------
class TestCompare:
    def test_compare_two(self, H, created_ids):
        a = create_scenario(H, base_scenario_payload("cmp_a"), created_ids)
        b = create_scenario(H, base_scenario_payload("cmp_b", operations=[{
            "id": "o1", "anno": 1, "tipo": "acquisto", "prezzo": 100000,
            "mutuo_pct": 0.5, "tasso_mutuo": 3, "durata_mutuo": 20, "canone_mensile": 500,
        }]), created_ids)
        r = requests.post(f"{API}/forecast/scenarios/compare", headers=H,
                          json={"scenario_ids": [a["id"], b["id"]]}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "scenarios" in data
        assert len(data["scenarios"]) == 2
        for s in data["scenarios"]:
            assert "id" in s and "nome" in s and "result" in s
            assert "snapshots" in s["result"] and "summary" in s["result"]


# ---------- AI Coach ----------
class TestAICoach:
    def test_ai_chat_and_history(self, H, created_ids):
        item = create_scenario(H, base_scenario_payload("ai_coach"), created_ids)
        r = requests.post(f"{API}/forecast/scenarios/{item['id']}/ai", headers=H,
                          json={"message": "Lo scenario è sostenibile? Rispondi breve."},
                          timeout=90)
        assert r.status_code == 200, f"AI call failed: {r.status_code} {r.text}"
        body = r.json()
        assert "reply" in body
        assert isinstance(body["reply"], str)
        assert len(body["reply"].strip()) > 5
        # history
        h = requests.get(f"{API}/forecast/scenarios/{item['id']}/ai/history", headers=H, timeout=20)
        assert h.status_code == 200
        msgs = h.json()
        assert isinstance(msgs, list)
        assert len(msgs) >= 1
        assert msgs[-1]["reply"] == body["reply"]
        assert "ts" in msgs[-1]


# ---------- PDF ----------
class TestPDF:
    def test_pdf_export(self, H, created_ids):
        item = create_scenario(H, base_scenario_payload("pdf_exp", operations=[{
            "id": "p1", "anno": 1, "tipo": "acquisto", "prezzo": 150000,
            "mutuo_pct": 0.7, "tasso_mutuo": 3, "durata_mutuo": 20, "canone_mensile": 750,
        }]), created_ids)
        r = requests.get(f"{API}/forecast/scenarios/{item['id']}/pdf", headers=H, timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 3000


# ---------- Baseline real data ----------
class TestRealBaseline:
    def test_use_real_baseline_no_crash(self, H, created_ids):
        payload = base_scenario_payload("real_baseline", use_real=True)
        payload["operations"] = []
        item = create_scenario(H, payload, created_ids)
        sim = simulate(H, item["id"])
        assert sim["horizon_years"] == 5
        s0 = sim["snapshots"][0]
        # Should not crash; defaults to 0 if no data
        assert "numero_immobili" in s0
        assert "valore_immobili" in s0
        assert isinstance(s0["numero_immobili"], int)


# ---------- Regression: reports + settings + properties ----------
class TestRegression:
    def test_report_stato_salute(self, H):
        r = requests.get(f"{API}/report/stato-salute.pdf", headers=H, timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert r.content[:4] == b"%PDF"

    def test_report_business_plan(self, H):
        r = requests.get(f"{API}/report/business-plan.pdf", headers=H, timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert r.content[:4] == b"%PDF"

    def test_settings_get(self, H):
        r = requests.get(f"{API}/settings", headers=H, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_settings_put(self, H):
        cur = requests.get(f"{API}/settings", headers=H, timeout=20).json()
        payload = {**cur, "nome_societa": cur.get("nome_societa") or "Acme RE SRL"}
        r = requests.put(f"{API}/settings", headers=H, json=payload, timeout=20)
        assert r.status_code == 200

    def test_properties_list(self, H):
        r = requests.get(f"{API}/properties", headers=H, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
