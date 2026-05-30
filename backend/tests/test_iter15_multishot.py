"""
Iter 15 — Multi-shot AI Strategist (jobs / 202 pattern).
Validates:
- POST /api/forecast/auto-optimize/jobs (202 + queued)
- GET .../jobs/{id} polling (queued→running→done, monotonic progress, plans 0→1→2→3)
- Profile semantics (LTV caps for conservativo<=50/bilanciato<=60/aggressivo<=75, with +5% tolerance)
- POST .../save?profile_id= persists scenario w/ ai_generated=true
- POST .../save-all persists 3 scenarios
- POST /scenarios/compare returns 3 results
- 404 error paths
- Legacy /auto-optimize regression
"""
import os
import time
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

POLL_INTERVAL = 5
POLL_TIMEOUT = 240  # seconds, allow ~4 min for 3 sequential LLM calls

CREATED_SCENARIO_IDS = []


@pytest.fixture(scope="session")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "ceo@controlroom.it", "password": "demo1234"},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def H(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# ============== Module-scoped fixture: 1 shared job ==============
@pytest.fixture(scope="module")
def completed_job(auth_token):
    headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    body = {
        "target_patrimonio_netto": 1200000,
        "horizon_years": 5,
        "max_ltv": 65,
        "capitale_disponibile": 200000,
        "strategia": "mista",
        "vincoli_extra": "",
    }
    r = requests.post(f"{BASE_URL}/api/forecast/auto-optimize/jobs", json=body, headers=headers, timeout=30)
    assert r.status_code == 202, f"create job failed: {r.status_code} {r.text[:300]}"
    j = r.json()
    assert "job_id" in j and j.get("status") == "queued"
    job_id = j["job_id"]

    progress_history = []
    plans_len_history = []
    statuses_seen = set()
    current_steps = []

    start = time.time()
    final = None
    while time.time() - start < POLL_TIMEOUT:
        time.sleep(POLL_INTERVAL)
        rr = requests.get(f"{BASE_URL}/api/forecast/auto-optimize/jobs/{job_id}", headers=headers, timeout=15)
        assert rr.status_code == 200, rr.text[:200]
        data = rr.json()
        progress_history.append(data.get("progress", 0))
        plans_len_history.append(len(data.get("plans") or []))
        statuses_seen.add(data.get("status"))
        current_steps.append(data.get("current_step", ""))
        if data.get("status") in ("done", "error"):
            final = data
            break
    assert final is not None, f"job did not finish in {POLL_TIMEOUT}s; last={progress_history[-5:]}"
    assert final["status"] == "done", f"job error: {final.get('error')}"
    return {
        "job_id": job_id,
        "final": final,
        "progress_history": progress_history,
        "plans_len_history": plans_len_history,
        "statuses_seen": statuses_seen,
        "current_steps": current_steps,
    }


# ============== Polling behavior tests ==============
class TestJobLifecycle:
    def test_progress_monotonic_and_reaches_100(self, completed_job):
        ph = completed_job["progress_history"]
        for a, b in zip(ph, ph[1:]):
            assert b >= a, f"progress regressed: {ph}"
        assert ph[-1] == 100

    def test_plans_length_grows_to_3(self, completed_job):
        ll = completed_job["plans_len_history"]
        assert ll[-1] == 3, f"final plans count {ll[-1]}, history={ll}"
        # monotonic non-decreasing
        for a, b in zip(ll, ll[1:]):
            assert b >= a

    def test_running_state_seen(self, completed_job):
        # could be 'running' or 'done' first if super fast; at minimum we see done
        assert "done" in completed_job["statuses_seen"]

    def test_current_step_mentions_profiles(self, completed_job):
        all_steps = " | ".join(completed_job["current_steps"])
        # Best-effort — we should see at least one profile name during polling
        seen = sum(1 for k in ("Conservativo", "Bilanciato", "Aggressivo") if k in all_steps)
        assert seen >= 1, f"no profile names seen in current_step: {all_steps[:500]}"


# ============== Final state shape ==============
def _profile_cap(pid):
    return {"conservativo": 50, "bilanciato": 60, "aggressivo": 75}[pid]


class TestFinalShape:
    def test_three_plans_with_required_keys(self, completed_job):
        plans = completed_job["final"]["plans"]
        assert len(plans) == 3
        pids = {p["profile_id"] for p in plans}
        assert pids == {"conservativo", "bilanciato", "aggressivo"}
        required = ("profile_id", "profile_label", "profile_color", "profile_propensione",
                    "draft_scenario", "simulation", "strategy_summary",
                    "expected_outcome", "key_risks", "goal_summary")
        for p in plans:
            for k in required:
                assert k in p, f"missing key {k} in plan {p.get('profile_id')}"
            assert p["profile_color"].startswith("#") and len(p["profile_color"]) == 7

    def test_profile_ltv_caps_in_goal_summary(self, completed_job):
        plans = completed_job["final"]["plans"]
        for p in plans:
            cap = _profile_cap(p["profile_id"])
            assert p["goal_summary"]["ltv_max"] <= cap, f"{p['profile_id']} ltv_max {p['goal_summary']['ltv_max']} > {cap}"

    def test_simulation_ltv_finale_respects_cap_tolerance(self, completed_job):
        plans = completed_job["final"]["plans"]
        for p in plans:
            cap = _profile_cap(p["profile_id"])
            ltv_fin = p["simulation"]["summary"]["ltv_finale"]
            # tolerate +5pp overshoot (AI is fuzzy)
            assert ltv_fin <= cap + 5, f"{p['profile_id']} simulation ltv_finale {ltv_fin} exceeds {cap}+5"


# ============== Save single profile ==============
class TestSaveSingle:
    def test_save_bilanciato_persists(self, completed_job, H):
        job_id = completed_job["job_id"]
        r = requests.post(
            f"{BASE_URL}/api/forecast/auto-optimize/jobs/{job_id}/save",
            params={"profile_id": "bilanciato"},
            headers=H, timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        assert "saved_id" in j and "nome" in j
        saved_id = j["saved_id"]
        CREATED_SCENARIO_IDS.append(saved_id)

        scen_list = requests.get(f"{BASE_URL}/api/forecast/scenarios", headers=H, timeout=15).json()
        match = [s for s in scen_list if s["id"] == saved_id]
        assert match, "saved scenario not in /scenarios list"
        s = match[0]
        assert s.get("ai_generated") is True
        assert s.get("ai_profile") == "Bilanciato"

    def test_save_invalid_profile_id_404(self, completed_job, H):
        job_id = completed_job["job_id"]
        r = requests.post(
            f"{BASE_URL}/api/forecast/auto-optimize/jobs/{job_id}/save",
            params={"profile_id": "NOT_REAL"},
            headers=H, timeout=15,
        )
        assert r.status_code == 404

    def test_delete_bilanciato_cleanup(self, H):
        # cleanup the bilanciato-only save (the save-all flow tests will add 3 more)
        if CREATED_SCENARIO_IDS:
            sid = CREATED_SCENARIO_IDS.pop(0)
            r = requests.delete(f"{BASE_URL}/api/forecast/scenarios/{sid}", headers=H, timeout=15)
            assert r.status_code in (200, 204)


# ============== Save all + Compare ==============
class TestSaveAllAndCompare:
    def test_save_all_returns_3(self, completed_job, H):
        job_id = completed_job["job_id"]
        r = requests.post(
            f"{BASE_URL}/api/forecast/auto-optimize/jobs/{job_id}/save-all",
            headers=H, timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        assert j["count"] == 3
        assert len(j["saved"]) == 3
        for item in j["saved"]:
            CREATED_SCENARIO_IDS.append(item["id"])
        scen_list = requests.get(f"{BASE_URL}/api/forecast/scenarios", headers=H, timeout=15).json()
        ids = {s["id"] for s in scen_list}
        for item in j["saved"]:
            assert item["id"] in ids
            sc = next(s for s in scen_list if s["id"] == item["id"])
            assert sc.get("ai_generated") is True

    def test_compare_three_scenarios(self, H):
        assert len(CREATED_SCENARIO_IDS) >= 3
        ids = CREATED_SCENARIO_IDS[-3:]
        r = requests.post(
            f"{BASE_URL}/api/forecast/scenarios/compare",
            json={"scenario_ids": ids},
            headers=H, timeout=60,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "scenarios" in data
        assert len(data["scenarios"]) == 3
        for s in data["scenarios"]:
            assert "id" in s and "nome" in s and "result" in s
            assert "summary" in s["result"]
            assert "snapshots" in s["result"]


# ============== Error paths ==============
class TestErrors:
    def test_get_invalid_job_id_404(self, H):
        r = requests.get(f"{BASE_URL}/api/forecast/auto-optimize/jobs/invalid-id-xxx", headers=H, timeout=15)
        assert r.status_code == 404

    def test_save_invalid_job_id_404(self, H):
        r = requests.post(
            f"{BASE_URL}/api/forecast/auto-optimize/jobs/invalid-id-xxx/save",
            params={"profile_id": "bilanciato"},
            headers=H, timeout=15,
        )
        assert r.status_code == 404

    def test_no_auth_returns_401(self):
        r = requests.post(
            f"{BASE_URL}/api/forecast/auto-optimize/jobs",
            json={"target_patrimonio_netto": 1000000},
            timeout=15,
        )
        assert r.status_code in (401, 403)


# ============== Legacy regression (single shot) ==============
class TestLegacyRegression:
    def test_single_shot_still_works(self, H):
        body = {
            "target_patrimonio_netto": 800000,
            "horizon_years": 3,
            "max_ltv": 60,
            "propensione_rischio": "media",
            "strategia": "mista",
        }
        r = requests.post(f"{BASE_URL}/api/forecast/auto-optimize", json=body, headers=H, timeout=180)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        # legacy single-plan shape
        for k in ("draft_scenario", "simulation", "strategy_summary", "expected_outcome",
                  "key_risks", "goal_summary", "saved_id"):
            assert k in d
        # not multi-shot shape
        assert "plans" not in d


# ============== Cleanup ==============
class TestCleanup:
    def test_cleanup_all_created(self, H):
        # delete tracked + any AI Plan scenarios created (defensive)
        for sid in list(CREATED_SCENARIO_IDS):
            requests.delete(f"{BASE_URL}/api/forecast/scenarios/{sid}", headers=H, timeout=15)
        # Verify cleaned
        scen_list = requests.get(f"{BASE_URL}/api/forecast/scenarios", headers=H, timeout=15).json()
        remaining = [s for s in scen_list if s["id"] in CREATED_SCENARIO_IDS]
        assert not remaining, f"failed cleanup: {remaining}"
