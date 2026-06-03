"""
Forecast / Scenario Builder router.
Lets the user define multi-year scenarios (3/5/10 anni) with operations per year
(acquisto, vendita, ristrutturazione, rinegoziazione mutuo, sfitto, aumento canone)
and produces yearly KPI projections. Also exposes:
  - AI Coach chat per scenario
  - PDF export "Piano industriale"
  - Side-by-side comparison
"""
import io
import json
import logging
import asyncio
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Literal
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from reportlab.platypus import Paragraph, Spacer, PageBreak

from routers._shared import enrich_property
from routers.settings import get_user_settings
from routers._pdf_chrome import setup_doc, make_table, eur, pct


OP_TYPES = ("acquisto", "vendita", "ristrutturazione", "rinegoziazione_mutuo", "sfitto", "aumento_canone")


class Operation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    anno: int  # 1..N (relative to year 0 = today)
    tipo: Literal["acquisto", "vendita", "ristrutturazione", "rinegoziazione_mutuo", "sfitto", "aumento_canone"]
    label: Optional[str] = ""
    # acquisto / vendita
    prezzo: Optional[float] = 0
    # acquisto / ristrutturazione (lavori) / sfitto.mesi_da_canone
    lavori: Optional[float] = 0
    # acquisto / aumento_canone (incremento canone mensile)
    canone_mensile: Optional[float] = 0
    # acquisto
    mutuo_pct: Optional[float] = 0          # 0..1 share of price financed
    tasso_mutuo: Optional[float] = 0        # annual rate %
    durata_mutuo: Optional[int] = 20        # years
    # vendita / ristrutturazione / rinegoziazione → optional link to a real property
    immobile_id: Optional[str] = None
    # rinegoziazione_mutuo
    nuovo_tasso: Optional[float] = 0
    # sfitto
    mesi: Optional[int] = 0
    # aumento_canone — increment as % o come euro (preferiamo euro su canone_mensile)
    pct_canone: Optional[float] = 0


class ScenarioIn(BaseModel):
    nome: str
    descrizione: Optional[str] = ""
    horizon_years: int = 5
    use_real_baseline: bool = True
    initial_patrimonio: Optional[float] = 0
    initial_debito: Optional[float] = 0
    initial_liquidita: Optional[float] = 0
    initial_canone_mensile: Optional[float] = 0
    initial_rata_mutui: Optional[float] = 0
    initial_numero_immobili: Optional[int] = 0
    # assumptions
    inflation_rate: float = 2.0
    rivalutazione_immobili: float = 1.5
    istat_canoni: float = 1.5
    tassazione_pct: float = 26.0
    operations: List[Operation] = []


class ScenarioOut(ScenarioIn):
    id: str
    user_id: str
    created_at: str
    updated_at: Optional[str] = None


class CompareIn(BaseModel):
    scenario_ids: List[str]


class ChatIn(BaseModel):
    message: str


class AutoOptimizeIn(BaseModel):
    target_patrimonio_netto: float
    horizon_years: int = 5
    max_ltv: float = 60.0
    capitale_disponibile: Optional[float] = None  # se None usa settings
    strategia: Literal["reddito", "rivendita", "mista"] = "mista"
    propensione_rischio: Literal["bassa", "media", "alta"] = "media"
    vincoli_extra: Optional[str] = ""
    save: bool = False
    nome: Optional[str] = None


class AutoOptimizeJobIn(BaseModel):
    """Multi-shot async optimization. Generates 3 alternative plans (conservativo / bilanciato / aggressivo)."""
    target_patrimonio_netto: float
    horizon_years: int = 5
    max_ltv: float = 60.0
    capitale_disponibile: Optional[float] = None
    strategia: Literal["reddito", "rivendita", "mista"] = "mista"
    vincoli_extra: Optional[str] = ""


class QuickForecastParams(BaseModel):
    acquisti_per_anno: Optional[int] = None
    prezzo_medio: Optional[float] = None
    canone_medio: Optional[float] = None
    citta_preferita: Optional[str] = None
    leva_pct: Optional[float] = None  # 0..100
    tipologia: Optional[str] = None  # bilocale/trilocale/...


class Vincoli(BaseModel):
    """Hard constraints applicati durante la simulazione."""
    blocca_acquisti_cassa_negativa: bool = False
    riserva_minima_liquidita: float = 0  # € — se >0 blocca acquisti che farebbero scendere cassa sotto questa soglia


class SensitivityIn(BaseModel):
    delta_tasso_pct: float = 0           # +/- punti % sul tasso interesse implicito (base 3%)
    delta_canone_pct: float = 0          # -30..+30 (% sul canone)
    delta_rivalutazione_pct: float = 0   # +/- punti % sulla rivalutazione annua
    vacancy_mesi_anno: int = 0           # 0..6
    costi_gestione_pct: Optional[float] = None  # default 15.0


class QuickForecastIn(BaseModel):
    horizon_years: int = 5
    prompt: Optional[str] = ""
    params: Optional[QuickForecastParams] = None
    vincoli: Optional[Vincoli] = None
    save: bool = True
    nome: Optional[str] = None


# ---------- Computation ----------
def pmt(principal: float, rate_annual_pct: float, years: int) -> float:
    if principal <= 0 or years <= 0:
        return 0.0
    if rate_annual_pct <= 0:
        return principal / (years * 12)
    r = rate_annual_pct / 100 / 12
    n = years * 12
    return principal * r * (1 + r) ** n / ((1 + r) ** n - 1)


async def build_baseline(db, user_id: str, scenario: dict) -> dict:
    """Year 0 state from real data or custom initial inputs."""
    if not scenario.get("use_real_baseline"):
        canone_init = float(scenario.get("initial_canone_mensile") or 0)
        rata_init = float(scenario.get("initial_rata_mutui") or 0)
        ricavi_init = canone_init * 12
        costi_init = ricavi_init * 0.15  # stima costi gestione 15% sui ricavi
        rata_annua_init = rata_init * 12
        utile_init = max(0, ricavi_init - costi_init - rata_annua_init)
        return {
            "anno": 0, "label": "Oggi (input)",
            "numero_immobili": int(scenario.get("initial_numero_immobili") or 0),
            "valore_immobili": float(scenario.get("initial_patrimonio") or 0),
            "debito_residuo": float(scenario.get("initial_debito") or 0),
            "liquidita": float(scenario.get("initial_liquidita") or 0),
            "canone_mensile": canone_init,
            "rata_mutui_mensile": rata_init,
            "ricavi_annui": ricavi_init,
            "costi_annui": round(costi_init, 0),
            "utile_netto": round(utile_init, 0),
            "cash_flow_annuo": round(ricavi_init - costi_init - rata_annua_init, 0),
        }
    props = await db.properties.find({"user_id": user_id}, {"_id": 0}).to_list(500)
    props = [enrich_property(p) for p in props]
    latest = await db.bilanci.find_one({"user_id": user_id}, {"_id": 0}, sort=[("created_at", -1)])
    sp = ((latest or {}).get("stato_patrimoniale") or {})
    ce = ((latest or {}).get("conto_economico") or {})

    canone_mens = sum(float(p.get("canone_mensile", 0) or 0) for p in props)
    valore = sp.get("valore_immobili") or sum(float(p.get("valore_stimato", p.get("prezzo_acquisto", 0)) or 0) for p in props)
    debito = sp.get("debito_mutui") or sum(float((p.get("mutuo") or {}).get("residuo", 0) or 0) for p in props)
    rata = sum(float((p.get("mutuo") or {}).get("rata", 0) or 0) for p in props)
    # Liquidità: usa la fonte di verità unificata (settings + movimenti bancari + bilancio)
    from routers.incassi import _compute_liquidity
    liq_data = await _compute_liquidity(db, user_id)
    liquidita = liq_data.get("liquidita", 0)

    # Tasso medio reale dei mutui in essere (per calcolo interessi corretto nel simulate)
    mutui_validi = [(p.get("mutuo") or {}) for p in props if (p.get("mutuo") or {}).get("residuo")]
    if mutui_validi:
        tot_debito = sum(float(m.get("residuo", 0) or 0) for m in mutui_validi)
        tassi_pesati = sum(float(m.get("residuo", 0) or 0) * float(m.get("tasso", 3.0) or 3.0) for m in mutui_validi)
        tasso_medio = tassi_pesati / tot_debito if tot_debito > 0 else 3.0
    else:
        tasso_medio = 3.0

    # Cash flow annuo baseline reale = canone netto - rata - costi stima
    ricavi_annui = float(ce.get("totale_ricavi") or canone_mens * 12)
    costi_annui = float(ce.get("totale_costi") or ricavi_annui * 0.15)
    utile_netto = float(ce.get("utile_netto") or 0)
    rata_annua = float(rata) * 12
    if not utile_netto:
        utile_netto = max(0, ricavi_annui - costi_annui - rata_annua * 0.5)  # rough: rata mezza interessi/capitale
    cash_flow_baseline = ricavi_annui - costi_annui - rata_annua

    return {
        "anno": 0, "label": "Oggi (reale)",
        "numero_immobili": len(props),
        "valore_immobili": float(valore),
        "debito_residuo": float(debito),
        "liquidita": float(liquidita),
        "canone_mensile": float(canone_mens),
        "rata_mutui_mensile": float(rata),
        "ricavi_annui": round(ricavi_annui, 0),
        "costi_annui": round(costi_annui, 0),
        "utile_netto": round(utile_netto, 0),
        "cash_flow_annuo": round(cash_flow_baseline, 0),
        "_tasso_medio_reale": round(tasso_medio, 2),  # consumato da simulate()
    }


def apply_operations(state: dict, year: int, operations: List[dict], log: list, props_by_id: dict, vincoli: Optional[dict] = None):
    vincoli = vincoli or {}
    riserva_min = float(vincoli.get("riserva_minima_liquidita") or 0)
    blocca_neg = bool(vincoli.get("blocca_acquisti_cassa_negativa") or False)
    for op in [o for o in operations if int(o.get("anno", 0)) == year]:
        t = op.get("tipo")
        label = op.get("label") or t
        if t == "acquisto":
            prezzo = float(op.get("prezzo") or 0)
            lavori = float(op.get("lavori") or 0)
            mutuo_pct = float(op.get("mutuo_pct") or 0)
            tasso = float(op.get("tasso_mutuo") or 0)
            durata = int(op.get("durata_mutuo") or 20)
            canone = float(op.get("canone_mensile") or 0)
            mutuo = prezzo * mutuo_pct
            equity = prezzo + lavori - mutuo
            # Hard constraint: blocca se cassa post-acquisto sotto riserva
            liquidita_post = state["liquidita"] - equity
            min_required = riserva_min if (blocca_neg or riserva_min > 0) else None
            if min_required is not None and liquidita_post < min_required:
                state.setdefault("_blocked_ops", []).append({
                    "anno": year, "tipo": t, "label": label,
                    "reason": "liquidita_insufficiente",
                    "liquidita_attesa": round(liquidita_post, 0),
                    "riserva_richiesta": round(min_required, 0),
                })
                log.append(f"⚠️ BLOCCATO «{label}»: liquidità post-op €{liquidita_post:,.0f} < riserva €{min_required:,.0f}")
                continue
            rata_op = pmt(mutuo, tasso, durata)
            state["numero_immobili"] += 1
            state["valore_immobili"] += prezzo
            state["debito_residuo"] += mutuo
            state["liquidita"] -= equity
            state["canone_mensile"] += canone
            state["rata_mutui_mensile"] += rata_op
            log.append(f"Acquisto «{label}»: prezzo €{prezzo:,.0f}, mutuo €{mutuo:,.0f}, rata €{rata_op:,.0f}/mese, canone €{canone}/mese")
        elif t == "vendita":
            prezzo_v = float(op.get("prezzo") or 0)
            ref = op.get("immobile_id")
            valore_libro = 0
            debito_libero = 0
            rata_libera = 0
            canone_liberato = 0
            if ref and ref in props_by_id:
                p = props_by_id[ref]
                valore_libro = float(p.get("valore_stimato") or p.get("prezzo_acquisto") or 0)
                debito_libero = float((p.get("mutuo") or {}).get("residuo") or 0)
                rata_libera = float((p.get("mutuo") or {}).get("rata") or 0)
                canone_liberato = float(p.get("canone_mensile") or 0)
            else:
                valore_libro = prezzo_v * 0.95
            state["liquidita"] += prezzo_v - debito_libero
            state["valore_immobili"] = max(0, state["valore_immobili"] - valore_libro)
            state["debito_residuo"] = max(0, state["debito_residuo"] - debito_libero)
            state["rata_mutui_mensile"] = max(0, state["rata_mutui_mensile"] - rata_libera)
            state["canone_mensile"] = max(0, state["canone_mensile"] - canone_liberato)
            state["numero_immobili"] = max(0, state["numero_immobili"] - 1)
            log.append(f"Vendita «{label}»: incasso €{prezzo_v:,.0f}, debito estinto €{debito_libero:,.0f}")
        elif t == "ristrutturazione":
            lavori = float(op.get("lavori") or 0)
            extra_canone = float(op.get("canone_mensile") or 0)
            state["liquidita"] -= lavori
            state["valore_immobili"] += lavori * 1.4
            state["canone_mensile"] += extra_canone
            log.append(f"Ristrutturazione «{label}»: spesa €{lavori:,.0f}, +€{extra_canone}/mese canone, +€{lavori*1.4:,.0f} valore stimato")
        elif t == "rinegoziazione_mutuo":
            old_rate = float(op.get("tasso_mutuo") or 3.5)
            new_rate = float(op.get("nuovo_tasso") or 2.5)
            saving = max(0, (old_rate - new_rate) / 100 * state["debito_residuo"] / 12)
            state["rata_mutui_mensile"] = max(0, state["rata_mutui_mensile"] - saving)
            log.append(f"Rinegoziazione mutuo: tasso da {old_rate}% a {new_rate}%, risparmio €{saving:,.0f}/mese")
        elif t == "sfitto":
            mesi = int(op.get("mesi") or 0)
            state["_one_off_revenue_loss"] = state.get("_one_off_revenue_loss", 0) + state["canone_mensile"] * mesi
            log.append(f"Sfitto: {mesi} mesi, perdita stimata €{state['canone_mensile']*mesi:,.0f}")
        elif t == "aumento_canone":
            extra = float(op.get("canone_mensile") or 0)
            pct_extra = float(op.get("pct_canone") or 0)
            inc = extra + state["canone_mensile"] * pct_extra / 100
            state["canone_mensile"] += inc
            log.append(f"Aumento canone: +€{inc:,.0f}/mese")


def compute_snapshot_alerts(snap: dict, prev: dict, settings: dict) -> list:
    """Returns list of dicts {severity, code, message} based on the snapshot state."""
    alerts = []
    target_netto = float((settings or {}).get("target_netto") or 4)
    ltv_max = float((settings or {}).get("limite_indebitamento") or 70)
    ltv = snap.get("ltv", 0)
    cf = snap.get("cash_flow_annuo", 0)
    liq = snap.get("liquidita", 0)
    debito = snap.get("debito_residuo", 0)
    valore = snap.get("valore_immobili", 0)
    canone = snap.get("canone_mensile", 0)
    rata = snap.get("rata_mutui_mensile", 0)
    utile = snap.get("utile_netto", 0)
    pn = snap.get("patrimonio_netto", 0)

    if ltv > ltv_max:
        alerts.append({"severity": "critical", "code": "ltv_alto", "message": f"LTV {ltv:.1f}% sopra la soglia {ltv_max:.0f}%"})
    elif ltv > ltv_max * 0.9:
        alerts.append({"severity": "warning", "code": "ltv_vicino_soglia", "message": f"LTV {ltv:.1f}% vicino alla soglia {ltv_max:.0f}%"})
    if cf < 0:
        alerts.append({"severity": "critical", "code": "cash_flow_negativo", "message": f"Cash flow annuo negativo (€{cf:,.0f})"})
    if liq < 0:
        alerts.append({"severity": "critical", "code": "liquidita_negativa", "message": f"Liquidità sotto zero (€{liq:,.0f}) — tensione finanziaria"})
    elif liq < canone * 3:
        alerts.append({"severity": "warning", "code": "liquidita_bassa", "message": f"Liquidità inferiore a 3 mensilità di canone (€{liq:,.0f})"})
    if debito > valore and valore > 0:
        alerts.append({"severity": "critical", "code": "patrimonio_negativo", "message": f"Debito €{debito:,.0f} > valore immobili €{valore:,.0f}"})
    if canone > 0 and rata > canone:
        alerts.append({"severity": "warning", "code": "rata_su_canone", "message": f"Rata mutui €{rata:,.0f}/m > canone €{canone:,.0f}/m"})
    if valore > 0 and utile > 0 and pn > 0:
        rend = utile / pn * 100
        if rend < target_netto:
            alerts.append({"severity": "warning", "code": "rendimento_sotto_target", "message": f"Rendimento netto {rend:.1f}% sotto target {target_netto:.1f}%"})
    if prev is not None:
        prev_pn = prev.get("patrimonio_netto", 0)
        if prev_pn > 0 and pn < prev_pn and (prev_pn - pn) / prev_pn > 0.05:
            alerts.append({"severity": "warning", "code": "patrimonio_in_calo", "message": f"Patrimonio netto in calo di €{(prev_pn - pn):,.0f} ({(prev_pn - pn)/prev_pn*100:.1f}%) rispetto all'anno precedente"})
    return alerts


def simulate(baseline: dict, scenario: dict, props: list, settings: dict = None, modifiers: Optional[dict] = None) -> dict:
    horizon = max(1, min(15, int(scenario.get("horizon_years", 5))))
    modifiers = modifiers or {}
    rival = float(scenario.get("rivalutazione_immobili") or 0) + float(modifiers.get("delta_rivalutazione_pct") or 0)
    istat = float(scenario.get("istat_canoni") or 0)
    # Tassazione: priorità a (1) modifier esplicito (2) scenario.tassazione_pct se override="custom"
    # (3) altrimenti usa il regime fiscale REALE dalle Impostazioni utente.
    if modifiers.get("tassazione_pct") is not None:
        tax_pct = float(modifiers["tassazione_pct"])
        tax_source = "modifier"
    elif scenario.get("tax_override_custom") and scenario.get("tassazione_pct") is not None:
        tax_pct = float(scenario.get("tassazione_pct"))
        tax_source = "scenario_custom"
    elif settings:
        from routers._shared import tax_rate_from_settings
        tax_pct = round(tax_rate_from_settings(settings) * 100, 2)
        tax_source = f"settings_{settings.get('tipo_societa','srl')}"
    else:
        tax_pct = float(scenario.get("tassazione_pct") or 26)
        tax_source = "default"
    delta_canone_pct = float(modifiers.get("delta_canone_pct") or 0)
    vacancy_mesi = max(0, int(modifiers.get("vacancy_mesi_anno") or 0))
    costi_pct = (float(modifiers["costi_gestione_pct"]) if modifiers.get("costi_gestione_pct") is not None else 15.0) / 100.0
    # Tasso medio: prima i modifiers (override esplicito), poi il tasso reale dei mutui, poi 3% default
    if modifiers.get("tasso_medio_pct") is not None:
        base_rate = float(modifiers["tasso_medio_pct"])
    else:
        base_rate = float(baseline.get("_tasso_medio_reale") or 3.0)
    interest_rate_implied = base_rate + float(modifiers.get("delta_tasso_pct") or 0)
    vincoli = scenario.get("vincoli") or {}
    operations = scenario.get("operations") or []
    props_by_id = {p["id"]: p for p in props}

    snapshots = [baseline.copy()]
    yearly_logs = {0: ["Stato iniziale"]}
    state = baseline.copy()
    state["_blocked_ops"] = []

    for y in range(1, horizon + 1):
        # 1) automatic events
        state["valore_immobili"] *= (1 + rival / 100)
        state["canone_mensile"] *= (1 + istat / 100)
        state["_one_off_revenue_loss"] = 0

        # 2) operations
        log = []
        apply_operations(state, y, operations, log, props_by_id, vincoli)

        # 3) yearly P&L (con modifiers)
        canone_eff = state["canone_mensile"] * (1 + delta_canone_pct / 100)
        ricavi = canone_eff * (12 - vacancy_mesi) - state.get("_one_off_revenue_loss", 0)
        costi_gestione = ricavi * costi_pct
        interessi_annui = state["debito_residuo"] * interest_rate_implied / 100
        rata_annua = state["rata_mutui_mensile"] * 12
        # Ammortamento capitale: max tra (rata - interessi) e quota minima per non bloccare il piano
        # Se la rata copre solo interessi (raro ma possibile), forza almeno il 2% di ammortamento del debito
        ammortamento_capitale = rata_annua - interessi_annui
        if ammortamento_capitale < 0:
            # rata insufficiente: c'è un buco mensile che pesa sulla cassa
            ammortamento_capitale = max(0, state["debito_residuo"] * 0.02)  # min 2% / anno
        utile_lordo = ricavi - costi_gestione - interessi_annui
        tasse = max(0, utile_lordo) * tax_pct / 100
        utile_netto = utile_lordo - tasse
        cash_flow = ricavi - costi_gestione - rata_annua - tasse

        # 4) update state
        state["debito_residuo"] = max(0, state["debito_residuo"] - ammortamento_capitale)
        if state["debito_residuo"] <= 0:
            state["rata_mutui_mensile"] = 0
        state["liquidita"] += cash_flow

        # 5) snapshot
        snap = {
            "anno": y, "label": f"Anno {y}",
            "numero_immobili": state["numero_immobili"],
            "valore_immobili": round(state["valore_immobili"], 0),
            "debito_residuo": round(state["debito_residuo"], 0),
            "liquidita": round(state["liquidita"], 0),
            "patrimonio_netto": round(state["valore_immobili"] - state["debito_residuo"], 0),
            "canone_mensile": round(canone_eff, 0),
            "rata_mutui_mensile": round(state["rata_mutui_mensile"], 0),
            "ricavi_annui": round(ricavi, 0),
            "costi_annui": round(costi_gestione + interessi_annui, 0),
            "interessi_annui": round(interessi_annui, 0),
            "tasse": round(tasse, 0),
            "utile_netto": round(utile_netto, 0),
            "cash_flow_annuo": round(cash_flow, 0),
            "ltv": round(state["debito_residuo"] / state["valore_immobili"] * 100, 2) if state["valore_immobili"] > 0 else 0,
            "roi_anno": round(utile_netto / max(1, state["valore_immobili"] - state["debito_residuo"]) * 100, 2),
            "logs": log,
        }
        snap["alerts"] = compute_snapshot_alerts(snap, snapshots[-1], settings)
        snapshots.append(snap)
        yearly_logs[y] = log

    # add patrimonio_netto + alerts to baseline too
    snapshots[0]["patrimonio_netto"] = round(snapshots[0]["valore_immobili"] - snapshots[0]["debito_residuo"], 0)
    snapshots[0]["alerts"] = compute_snapshot_alerts(snapshots[0], None, settings)
    # rimuovi campi interni
    snapshots[0].pop("_tasso_medio_reale", None)

    # global risk roll-up
    all_alerts = [(s["anno"], a) for s in snapshots for a in (s.get("alerts") or [])]
    n_critical = sum(1 for _, a in all_alerts if a["severity"] == "critical")
    n_warning = sum(1 for _, a in all_alerts if a["severity"] == "warning")
    years_with_neg_cf = [s["anno"] for s in snapshots[1:] if s["cash_flow_annuo"] < 0]
    years_with_high_ltv = [s["anno"] for s in snapshots[1:] if s["ltv"] > float((settings or {}).get("limite_indebitamento") or 70)]
    first_neg_liquidity = next((s["anno"] for s in snapshots if s.get("liquidita", 0) < 0), None)

    if n_critical >= 3:
        verdict = "Scenario critico — alta probabilità di tensione finanziaria"
        verdict_severity = "critical"
    elif n_critical >= 1:
        verdict = "Scenario rischioso — richiede aggiustamenti"
        verdict_severity = "warning"
    elif n_warning >= 2:
        verdict = "Scenario praticabile con punti di attenzione"
        verdict_severity = "warning"
    else:
        verdict = "Scenario sostenibile"
        verdict_severity = "ok"

    return {
        "horizon_years": horizon,
        "snapshots": snapshots,
        "summary": {
            "patrimonio_netto_finale": snapshots[-1]["patrimonio_netto"],
            "patrimonio_netto_iniziale": snapshots[0]["patrimonio_netto"],
            "crescita_pct": round(
                (snapshots[-1]["patrimonio_netto"] - snapshots[0]["patrimonio_netto"]) /
                max(1, snapshots[0]["patrimonio_netto"]) * 100, 1
            ),
            "ricavi_totali_periodo": round(sum(s["ricavi_annui"] for s in snapshots[1:]), 0),
            "utile_totale_periodo": round(sum(s["utile_netto"] for s in snapshots[1:]), 0),
            "cash_flow_cumulato": round(sum(s["cash_flow_annuo"] for s in snapshots[1:]), 0),
            "ltv_finale": snapshots[-1]["ltv"],
            "numero_immobili_finale": snapshots[-1]["numero_immobili"],
            "alerts_critical": n_critical,
            "alerts_warning": n_warning,
            "years_with_neg_cash_flow": years_with_neg_cf,
            "years_with_high_ltv": years_with_high_ltv,
            "first_year_negative_liquidity": first_neg_liquidity,
            "verdict": verdict,
            "verdict_severity": verdict_severity,
            "blocked_ops": state.get("_blocked_ops", []),
            # Trasparenza assunzioni di calcolo
            "assumptions": {
                "tassazione_pct": tax_pct,
                "tax_source": tax_source,
                "tasso_interessi_pct": interest_rate_implied,
                "tasso_source": "modifier" if modifiers.get("tasso_medio_pct") is not None else ("real_mortgages" if baseline.get("_tasso_medio_reale") else "default_3pct"),
                "costi_gestione_pct": round(costi_pct * 100, 1),
                "rivalutazione_pct": rival,
                "istat_pct": istat,
                "vacancy_mesi_anno": vacancy_mesi,
            },
        },
    }


async def _generate_strategist_plan(
    db, llm_key: str, user_id: str,
    target_patrimonio_netto: float, horizon_years: int, max_ltv: float,
    capitale_disponibile: Optional[float], strategia: str, propensione_rischio: str,
    vincoli_extra: str = "",
    baseline: Optional[dict] = None, props: Optional[list] = None, settings: Optional[dict] = None,
) -> dict:
    """Run a single Claude call → parse → normalize → simulate → return plan dict.
    Reused by both /auto-optimize (single shot) and /auto-optimize/jobs (multi-shot, 3 variants).
    Raises HTTPException on hard errors."""
    if settings is None:
        settings = await get_user_settings(db, user_id)
    capitale = capitale_disponibile if capitale_disponibile is not None else float(settings.get("capitale_disponibile") or 0)
    ltv_cap = float(settings.get("limite_indebitamento") or 70)
    target_netto = float(settings.get("target_netto") or 5)

    if baseline is None:
        baseline = await build_baseline(db, user_id, {"use_real_baseline": True, "horizon_years": horizon_years})
    if props is None:
        props = await db.properties.find({"user_id": user_id}, {"_id": 0}).to_list(500)

    pn_iniziale = baseline.get("valore_immobili", 0) - baseline.get("debito_residuo", 0)
    ctx_lines = [
        "=== STATO ATTUALE SOCIETÀ ===",
        f"Immobili in portafoglio: {baseline.get('numero_immobili', 0)}",
        f"Valore immobili: €{baseline.get('valore_immobili', 0):,.0f}",
        f"Debito residuo: €{baseline.get('debito_residuo', 0):,.0f}",
        f"Patrimonio netto iniziale: €{pn_iniziale:,.0f}",
        f"Liquidità: €{baseline.get('liquidita', 0):,.0f}",
        f"Canone mensile attuale: €{baseline.get('canone_mensile', 0):,.0f}/m",
        f"Rata mutui mensile: €{baseline.get('rata_mutui_mensile', 0):,.0f}/m",
        "",
        "=== OBIETTIVO ===",
        f"Patrimonio netto target a {horizon_years} anni: €{target_patrimonio_netto:,.0f}",
        f"Crescita richiesta: {((target_patrimonio_netto - pn_iniziale) / max(1, pn_iniziale) * 100):.1f}%",
        f"LTV massimo accettato: {max_ltv}% (cap società: {ltv_cap}%)",
        f"Capitale proprio disponibile: €{capitale:,.0f}",
        f"Strategia preferita: {strategia}",
        f"Propensione al rischio: {propensione_rischio}",
        f"Target rendimento netto società: {target_netto}%",
    ]
    if vincoli_extra:
        ctx_lines.append(f"Vincoli extra dell'utente: {vincoli_extra}")
    if props:
        ctx_lines.append("")
        ctx_lines.append("=== IMMOBILI ESISTENTI (potenziali candidati a vendita/ristrutturazione) ===")
        for p in props[:25]:
            ctx_lines.append(
                f"- id={p.get('id')} · {p.get('nome','')} ({p.get('citta','')}) · "
                f"valore €{p.get('valore_stimato', p.get('prezzo_acquisto', 0)):,.0f} · "
                f"canone €{p.get('canone_mensile', 0):,.0f}/m · stato {p.get('stato','')}"
            )

    sys_msg = (
        "Sei AI Strategist, un consulente di portafoglio immobiliare con licenza fiduciaria. "
        "Riceverai lo stato attuale di una società immobiliare italiana e un obiettivo di crescita pluri-annuale. "
        "Il tuo compito: progettare il PIANO OPERATIVO OTTIMALE — la sequenza di operazioni (anno per anno) che "
        "raggiunge il target rispettando i vincoli di leva (LTV), capitale disponibile e propensione al rischio.\n\n"
        "Rispondi SOLO con JSON valido (niente prefissi, niente markdown, niente backticks).\n\n"
        "Schema obbligatorio:\n"
        "{\n"
        '  "strategy_summary": "string 2-4 frasi in italiano che spiegano la strategia",\n'
        '  "expected_outcome": "string 1-2 frasi su patrimonio finale atteso e LTV finale",\n'
        '  "key_risks": ["3-5 bullet brevi"],\n'
        '  "assumptions": {\n'
        '    "rivalutazione_immobili": float (default 2.0),\n'
        '    "istat_canoni": float (default 1.8),\n'
        '    "tassazione_pct": float (default 26)\n'
        "  },\n"
        '  "operations": [\n'
        "    {\n"
        '      "anno": int (1..horizon),\n'
        '      "tipo": "acquisto"|"vendita"|"ristrutturazione"|"rinegoziazione_mutuo"|"aumento_canone",\n'
        '      "label": "string descrittiva 30-60 caratteri (es. Bilocale Bologna Navile, 60m²)",\n'
        '      "prezzo": float (solo per acquisto/vendita — prezzo realistico mercato italiano),\n'
        '      "lavori": float (per acquisto/ristrutturazione — 0 se non servono),\n'
        '      "canone_mensile": float (per acquisto = canone atteso; per ristrutturazione/aumento_canone = INCREMENTO €/mese),\n'
        '      "mutuo_pct": float 0..0.8 (frazione finanziata, default 0.6 — RISPETTA il vincolo max_ltv),\n'
        '      "tasso_mutuo": float (3.0-4.0 tipico oggi),\n'
        '      "durata_mutuo": int 15-25,\n'
        '      "nuovo_tasso": float (solo per rinegoziazione_mutuo),\n'
        '      "immobile_id": "string (solo per vendita/ristrutturazione su immobile esistente — usa id reale dalla lista)"\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "REGOLE:\n"
        "- Distribuisci le operazioni nell'orizzonte (no tutto nell'anno 1).\n"
        "- L'investimento di capitale proprio cumulato non deve superare il capitale disponibile finché non rientra dai cash flow.\n"
        "- Se la propensione è BASSA: leva massima 50%, max 1 acquisto/anno, no operazioni speculative.\n"
        "- Se la propensione è MEDIA: leva 50-65%, 1-2 operazioni/anno.\n"
        "- Se la propensione è ALTA: leva fino a max_ltv, anche 2-3 op/anno.\n"
        "- Strategia RIVENDITA: usa più acquisto+ristrutturazione+vendita short-term (24 mesi).\n"
        "- Strategia REDDITO: usa acquisti tenuti a reddito, no vendite, considera aumento_canone su immobili esistenti.\n"
        "- Strategia MISTA: bilancia.\n"
        "- Considera l'effetto delle operazioni sull'LTV: dopo ogni acquisto verifica che il debito totale resti < max_ltv del valore totale.\n"
        "- Prezzi mercato italiano: bilocale 130-220k Milano/Roma 180-350k, trilocale +50%, etc.\n"
        "- Canoni realistici: bilocale 700-1100€, trilocale 900-1500€.\n\n"
        "=== INPUT ===\n"
        + "\n".join(ctx_lines)
    )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=llm_key,
            session_id=f"strategist-{uuid.uuid4()}",
            system_message=sys_msg,
        ).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text="Progetta il piano ottimale rispettando vincoli e obiettivo."))
    except Exception as e:
        logging.exception("AI Strategist error")
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")

    parsed = None
    try:
        parsed = json.loads(reply)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", reply)
        if m:
            try:
                parsed = json.loads(m.group(0))
            except Exception:
                parsed = None
    if not parsed or "operations" not in parsed:
        raise HTTPException(status_code=500, detail="L'AI Strategist non ha restituito un piano valido. Riprova.")

    clean_ops = []
    for op in parsed.get("operations") or []:
        try:
            anno = max(1, min(horizon_years, int(op.get("anno", 1))))
        except Exception:
            anno = 1
        tipo = op.get("tipo", "acquisto")
        if tipo not in ("acquisto", "vendita", "ristrutturazione", "rinegoziazione_mutuo", "sfitto", "aumento_canone"):
            continue
        clean_ops.append({
            "id": str(uuid.uuid4()),
            "anno": anno, "tipo": tipo,
            "label": (op.get("label") or "")[:80],
            "prezzo": float(op.get("prezzo") or 0),
            "lavori": float(op.get("lavori") or 0),
            "canone_mensile": float(op.get("canone_mensile") or 0),
            "mutuo_pct": min(0.9, max(0.0, float(op.get("mutuo_pct") or 0))),
            "tasso_mutuo": float(op.get("tasso_mutuo") or 0),
            "durata_mutuo": int(op.get("durata_mutuo") or 20),
            "nuovo_tasso": float(op.get("nuovo_tasso") or 0),
            "mesi": int(op.get("mesi") or 0),
            "pct_canone": float(op.get("pct_canone") or 0),
            "immobile_id": op.get("immobile_id"),
        })

    assumptions = parsed.get("assumptions") or {}
    draft_scenario = {
        "nome": f"AI Plan {propensione_rischio.capitalize()} · target €{target_patrimonio_netto/1000:.0f}k @ {horizon_years}y",
        "descrizione": parsed.get("strategy_summary", "")[:500],
        "horizon_years": horizon_years,
        "use_real_baseline": True,
        "initial_patrimonio": 0, "initial_debito": 0, "initial_liquidita": 0,
        "initial_canone_mensile": 0, "initial_rata_mutui": 0, "initial_numero_immobili": 0,
        "inflation_rate": 2.0,
        "rivalutazione_immobili": float(assumptions.get("rivalutazione_immobili", 2.0)),
        "istat_canoni": float(assumptions.get("istat_canoni", 1.8)),
        "tassazione_pct": float(assumptions.get("tassazione_pct", 26.0)),
        "operations": clean_ops,
    }

    sim = simulate(baseline, draft_scenario, props, settings)
    pn_finale = sim["summary"]["patrimonio_netto_finale"]
    ltv_finale = sim["summary"]["ltv_finale"]

    # ===== LTV cap enforcement: if simulated LTV materially breaches the profile cap,
    # retry ONCE with a stricter prompt asking AI to reduce leverage / acquisitions.
    if ltv_finale > max_ltv + 10 and not getattr(_generate_strategist_plan, "_in_retry", False):
        try:
            _generate_strategist_plan._in_retry = True  # type: ignore[attr-defined]
            retry_msg = (
                f"Il tuo piano precedente ha prodotto un LTV finale del {ltv_finale:.1f}%, "
                f"ben oltre il vincolo dichiarato di {max_ltv:.0f}%. "
                "Rigeneralo riducendo gli acquisti finanziati con mutuo, abbassando mutuo_pct e/o introducendo "
                "vendite che liberino debito. RISPETTA TASSATIVAMENTE l'LTV massimo."
            )
            try:
                from emergentintegrations.llm.chat import LlmChat, UserMessage
                chat = LlmChat(
                    api_key=llm_key,
                    session_id=f"strategist-retry-{uuid.uuid4()}",
                    system_message=sys_msg + "\n\n=== RETRY ===\n" + retry_msg,
                ).with_model("anthropic", "claude-sonnet-4-6")
                reply2 = await chat.send_message(UserMessage(text=retry_msg))
                parsed2 = None
                try:
                    parsed2 = json.loads(reply2)
                except Exception:
                    m2 = re.search(r"\{[\s\S]*\}", reply2)
                    if m2:
                        try:
                            parsed2 = json.loads(m2.group(0))
                        except Exception:
                            parsed2 = None
                if parsed2 and "operations" in parsed2:
                    clean_ops2 = []
                    for op in parsed2.get("operations") or []:
                        try:
                            anno = max(1, min(horizon_years, int(op.get("anno", 1))))
                        except Exception:
                            anno = 1
                        tipo = op.get("tipo", "acquisto")
                        if tipo not in ("acquisto", "vendita", "ristrutturazione", "rinegoziazione_mutuo", "sfitto", "aumento_canone"):
                            continue
                        clean_ops2.append({
                            "id": str(uuid.uuid4()), "anno": anno, "tipo": tipo,
                            "label": (op.get("label") or "")[:80],
                            "prezzo": float(op.get("prezzo") or 0),
                            "lavori": float(op.get("lavori") or 0),
                            "canone_mensile": float(op.get("canone_mensile") or 0),
                            "mutuo_pct": min(0.9, max(0.0, float(op.get("mutuo_pct") or 0))),
                            "tasso_mutuo": float(op.get("tasso_mutuo") or 0),
                            "durata_mutuo": int(op.get("durata_mutuo") or 20),
                            "nuovo_tasso": float(op.get("nuovo_tasso") or 0),
                            "mesi": int(op.get("mesi") or 0),
                            "pct_canone": float(op.get("pct_canone") or 0),
                            "immobile_id": op.get("immobile_id"),
                        })
                    a2 = parsed2.get("assumptions") or {}
                    draft_retry = {
                        **draft_scenario,
                        "descrizione": (parsed2.get("strategy_summary") or parsed.get("strategy_summary") or "")[:500],
                        "rivalutazione_immobili": float(a2.get("rivalutazione_immobili", draft_scenario["rivalutazione_immobili"])),
                        "istat_canoni": float(a2.get("istat_canoni", draft_scenario["istat_canoni"])),
                        "tassazione_pct": float(a2.get("tassazione_pct", draft_scenario["tassazione_pct"])),
                        "operations": clean_ops2,
                    }
                    sim_retry = simulate(baseline, draft_retry, props, settings)
                    # Use the retry only if it actually improved LTV
                    if sim_retry["summary"]["ltv_finale"] < ltv_finale:
                        draft_scenario = draft_retry
                        sim = sim_retry
                        pn_finale = sim["summary"]["patrimonio_netto_finale"]
                        ltv_finale = sim["summary"]["ltv_finale"]
                        parsed["strategy_summary"] = parsed2.get("strategy_summary") or parsed.get("strategy_summary")
                        parsed["expected_outcome"] = parsed2.get("expected_outcome") or parsed.get("expected_outcome")
                        parsed["key_risks"] = parsed2.get("key_risks") or parsed.get("key_risks")
            except Exception:
                logging.exception("Strategist retry failed")
        finally:
            _generate_strategist_plan._in_retry = False  # type: ignore[attr-defined]

    goal_summary = {
        "target_pn": target_patrimonio_netto,
        "pn_finale_simulato": pn_finale,
        "gap_pct": round((pn_finale - target_patrimonio_netto) / max(1, target_patrimonio_netto) * 100, 1),
        "target_raggiunto": pn_finale >= target_patrimonio_netto * 0.95,
        "ltv_max": max_ltv,
        "ltv_finale": ltv_finale,
        "ltv_rispettato": ltv_finale <= max_ltv,
    }

    return {
        "draft_scenario": draft_scenario,
        "simulation": sim,
        "strategy_summary": parsed.get("strategy_summary", ""),
        "expected_outcome": parsed.get("expected_outcome", ""),
        "key_risks": parsed.get("key_risks") or [],
        "goal_summary": goal_summary,
    }


async def _run_multishot_job(db, llm_key: str, user_id: str, job_id: str, payload: dict):
    """Background runner: generates 3 alternative plans (conservativo/bilanciato/aggressivo), updating job progress."""
    try:
        # shared baseline + settings — fetched once
        settings = await get_user_settings(db, user_id)
        baseline = await build_baseline(db, user_id, {"use_real_baseline": True, "horizon_years": payload["horizon_years"]})
        props = await db.properties.find({"user_id": user_id}, {"_id": 0}).to_list(500)

        profiles = [
            {"id": "conservativo", "label": "Conservativo", "color": "#059669",
             "propensione": "bassa", "max_ltv": min(payload["max_ltv"], 50.0)},
            {"id": "bilanciato",  "label": "Bilanciato",  "color": "#0066FF",
             "propensione": "media", "max_ltv": min(payload["max_ltv"], 60.0)},
            {"id": "aggressivo",  "label": "Aggressivo",  "color": "#B45309",
             "propensione": "alta",  "max_ltv": min(payload["max_ltv"], 75.0)},
        ]

        await db.strategist_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "running", "progress": 5, "current_step": "Preparazione dati portafoglio"}},
        )

        plans = []
        n = len(profiles)
        for i, prof in enumerate(profiles):
            await db.strategist_jobs.update_one(
                {"id": job_id},
                {"$set": {
                    "progress": 10 + int(i * 80 / n),
                    "current_step": f"Generazione piano {prof['label']} ({i+1}/{n})…",
                }},
            )
            plan = await _generate_strategist_plan(
                db, llm_key, user_id,
                target_patrimonio_netto=payload["target_patrimonio_netto"],
                horizon_years=payload["horizon_years"],
                max_ltv=prof["max_ltv"],
                capitale_disponibile=payload.get("capitale_disponibile"),
                strategia=payload.get("strategia", "mista"),
                propensione_rischio=prof["propensione"],
                vincoli_extra=payload.get("vincoli_extra", ""),
                baseline=baseline, props=props, settings=settings,
            )
            # Rename draft using the profile label (clearer in Compare tab)
            plan["draft_scenario"]["nome"] = (
                f"AI {prof['label']} · €{payload['target_patrimonio_netto']/1000:.0f}k @ {payload['horizon_years']}y"
            )
            plan["profile_id"] = prof["id"]
            plan["profile_label"] = prof["label"]
            plan["profile_color"] = prof["color"]
            plan["profile_propensione"] = prof["propensione"]
            plans.append(plan)
            await db.strategist_jobs.update_one(
                {"id": job_id},
                {"$set": {"plans": plans, "progress": 10 + int((i + 1) * 80 / n)}},
            )

        await db.strategist_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "done", "progress": 100,
                "current_step": "Completato",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
    except Exception as e:
        logging.exception("Multi-shot job error")
        await db.strategist_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "error", "error": str(e), "progress": 100}},
        )


def make_forecast_router(db, current_user, llm_key: str):
    router = APIRouter(prefix="/api/forecast")

    @router.get("/scenarios")
    async def list_scenarios(user: dict = Depends(current_user)):
        items = await db.scenarios.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
        return items

    @router.post("/scenarios")
    async def create_scenario(s: ScenarioIn, user: dict = Depends(current_user)):
        item = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            **s.model_dump(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.scenarios.insert_one(item.copy())
        item.pop("_id", None)
        return item

    @router.get("/scenarios/{sid}")
    async def get_scenario(sid: str, user: dict = Depends(current_user)):
        item = await db.scenarios.find_one({"id": sid, "user_id": user["id"]}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Scenario non trovato")
        return item

    @router.put("/scenarios/{sid}")
    async def update_scenario(sid: str, s: ScenarioIn, user: dict = Depends(current_user)):
        data = s.model_dump()
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.scenarios.update_one({"id": sid, "user_id": user["id"]}, {"$set": data})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Scenario non trovato")
        item = await db.scenarios.find_one({"id": sid, "user_id": user["id"]}, {"_id": 0})
        return item

    @router.delete("/scenarios/{sid}")
    async def delete_scenario(sid: str, user: dict = Depends(current_user)):
        await db.scenarios.delete_one({"id": sid, "user_id": user["id"]})
        await db.scenario_messages.delete_many({"scenario_id": sid, "user_id": user["id"]})
        return {"ok": True}

    @router.post("/scenarios/{sid}/simulate")
    async def simulate_scenario(sid: str, user: dict = Depends(current_user)):
        scen = await db.scenarios.find_one({"id": sid, "user_id": user["id"]}, {"_id": 0})
        if not scen:
            raise HTTPException(status_code=404, detail="Scenario non trovato")
        baseline = await build_baseline(db, user["id"], scen)
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        settings = await get_user_settings(db, user["id"])
        return simulate(baseline, scen, props, settings)

    @router.post("/scenarios/compare")
    async def compare_scenarios(payload: CompareIn, user: dict = Depends(current_user)):
        out = []
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        settings = await get_user_settings(db, user["id"])
        for sid in payload.scenario_ids[:4]:
            scen = await db.scenarios.find_one({"id": sid, "user_id": user["id"]}, {"_id": 0})
            if not scen:
                continue
            baseline = await build_baseline(db, user["id"], scen)
            sim = simulate(baseline, scen, props, settings)
            out.append({"id": sid, "nome": scen.get("nome"), "result": sim})
        return {"scenarios": out}

    # ===== AI Coach per scenario =====
    @router.post("/scenarios/{sid}/ai")
    async def scenario_ai(sid: str, payload: ChatIn, user: dict = Depends(current_user)):
        if not llm_key:
            raise HTTPException(status_code=500, detail="LLM key non configurata")
        scen = await db.scenarios.find_one({"id": sid, "user_id": user["id"]}, {"_id": 0})
        if not scen:
            raise HTTPException(status_code=404, detail="Scenario non trovato")
        baseline = await build_baseline(db, user["id"], scen)
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        settings = await get_user_settings(db, user["id"])
        sim = simulate(baseline, scen, props, settings)

        ctx_lines = [
            f"Scenario «{scen.get('nome')}» — orizzonte {scen.get('horizon_years')} anni",
            f"Verdetto automatico: {sim['summary']['verdict']} (severity: {sim['summary']['verdict_severity']})",
            f"Alert totali: {sim['summary']['alerts_critical']} critici · {sim['summary']['alerts_warning']} warning",
            f"Patrimonio netto iniziale: € {sim['summary']['patrimonio_netto_iniziale']:,.0f}",
            f"Patrimonio netto finale:   € {sim['summary']['patrimonio_netto_finale']:,.0f}  (Δ {sim['summary']['crescita_pct']}%)",
            f"Ricavi totali periodo:     € {sim['summary']['ricavi_totali_periodo']:,.0f}",
            f"Utile totale periodo:      € {sim['summary']['utile_totale_periodo']:,.0f}",
            f"Cash flow cumulato:        € {sim['summary']['cash_flow_cumulato']:,.0f}",
            f"LTV finale:                {sim['summary']['ltv_finale']}%",
            f"Immobili a fine periodo:   {sim['summary']['numero_immobili_finale']}",
        ]
        if sim['summary']['years_with_neg_cash_flow']:
            ctx_lines.append(f"Anni con cash flow negativo: {sim['summary']['years_with_neg_cash_flow']}")
        if sim['summary']['years_with_high_ltv']:
            ctx_lines.append(f"Anni con LTV sopra soglia: {sim['summary']['years_with_high_ltv']}")
        if sim['summary']['first_year_negative_liquidity']:
            ctx_lines.append(f"Primo anno con liquidità negativa: {sim['summary']['first_year_negative_liquidity']}")
        ctx_lines.append("")
        ctx_lines.append("Snapshot annuali (Anno · NumImmobili · ValPatrimonio · DebitoResiduo · CanoneMese · UtileNetto · CashFlow · LTV% · #Alerts):")
        for s in sim["snapshots"]:
            n_a = len(s.get("alerts") or [])
            ctx_lines.append(
                f"  - Anno {s['anno']:>2}: {s['numero_immobili']} imm · €{s['valore_immobili']:,.0f} · "
                f"debito €{s['debito_residuo']:,.0f} · canone €{s.get('canone_mensile',0):,.0f}/m · "
                f"utile €{s.get('utile_netto',0):,.0f} · CF €{s.get('cash_flow_annuo',0):,.0f} · "
                f"LTV {s.get('ltv',0)}% · alerts: {n_a}"
            )
        ctx_lines.append("")
        ctx_lines.append("Alert proattivi rilevati:")
        for s in sim["snapshots"]:
            for a in (s.get("alerts") or []):
                ctx_lines.append(f"  · Anno {s['anno']} [{a['severity'].upper()}] {a['message']}")
        ctx_lines.append("")
        ctx_lines.append("Operazioni pianificate:")
        for op in scen.get("operations") or []:
            ctx_lines.append(f"  · Anno {op.get('anno')} · {op.get('tipo')} · {op.get('label') or ''} · prezzo €{op.get('prezzo') or 0:,.0f} · canone €{op.get('canone_mensile') or 0}/m")

        sys_msg = (
            "Sei AI Coach, un consulente finanziario senior specializzato in real estate. "
            "Stai analizzando uno SCENARIO PLURI-ANNALE costruito dall'utente. "
            "Rispondi in italiano, concreto, con numeri presi dal contesto. "
            "Cita SEMPRE gli alert proattivi quando rilevanti (LTV alto, cash flow negativo, liquidità in tensione). "
            "Quando proponi modifiche, indica esplicitamente: anno, tipo operazione, parametri. "
            "Quando l'utente chiede un'opinione, dai sempre una raccomandazione netta (Procedi / Modifica / Scartare lo scenario) motivata.\n\n"
            "=== CONTESTO SCENARIO ===\n"
            + "\n".join(ctx_lines)
        )
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=llm_key,
                session_id=f"forecast-{sid}",
                system_message=sys_msg,
            ).with_model("anthropic", "claude-sonnet-4-6")
            reply = await chat.send_message(UserMessage(text=payload.message))
        except Exception as e:
            logging.exception("AI forecast chat error")
            raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")

        await db.scenario_messages.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"], "scenario_id": sid,
            "user_message": payload.message, "reply": reply,
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        return {"reply": reply}

    @router.get("/scenarios/{sid}/ai/history")
    async def ai_history(sid: str, user: dict = Depends(current_user)):
        msgs = await db.scenario_messages.find(
            {"user_id": user["id"], "scenario_id": sid}, {"_id": 0}
        ).sort("ts", 1).to_list(200)
        return msgs

    # ===== AI Strategist — Single-shot Auto-Optimize (legacy/sync) =====
    @router.post("/auto-optimize")
    async def auto_optimize(payload: AutoOptimizeIn, user: dict = Depends(current_user)):
        if not llm_key:
            raise HTTPException(status_code=500, detail="LLM key non configurata")
        plan = await _generate_strategist_plan(
            db, llm_key, user["id"],
            target_patrimonio_netto=payload.target_patrimonio_netto,
            horizon_years=payload.horizon_years,
            max_ltv=payload.max_ltv,
            capitale_disponibile=payload.capitale_disponibile,
            strategia=payload.strategia,
            propensione_rischio=payload.propensione_rischio,
            vincoli_extra=payload.vincoli_extra or "",
        )
        saved_id = None
        if payload.save:
            item = {
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                **plan["draft_scenario"],
                "nome": payload.nome or plan["draft_scenario"]["nome"],
                "ai_generated": True,
                "ai_strategy_summary": plan["strategy_summary"],
                "ai_key_risks": plan["key_risks"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.scenarios.insert_one(item.copy())
            saved_id = item["id"]
        return {**plan, "saved_id": saved_id}

    # ===== Quick Forecast — Simple prompt/params endpoint for the simplified page =====
    @router.post("/quick")
    async def quick_forecast(payload: QuickForecastIn, user: dict = Depends(current_user)):
        """Simple forecast: prompt + optional params → operations → simulation in one shot.
        If only params: deterministic expansion (no LLM). If prompt: LLM call."""
        horizon = max(1, min(15, int(payload.horizon_years or 5)))
        params = payload.params.model_dump() if payload.params else {}
        prompt = (payload.prompt or "").strip()

        settings = await get_user_settings(db, user["id"])
        baseline = await build_baseline(db, user["id"], {"use_real_baseline": True, "horizon_years": horizon})
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)

        operations: list = []
        strategy_summary = ""
        key_risks: list = []

        if prompt:
            if not llm_key:
                raise HTTPException(status_code=500, detail="LLM key non configurata per modalità prompt")
            pn_iniziale = baseline.get("valore_immobili", 0) - baseline.get("debito_residuo", 0)
            ctx = [
                "=== STATO ATTUALE SOCIETÀ ===",
                f"Immobili: {baseline.get('numero_immobili', 0)} · Valore €{baseline.get('valore_immobili', 0):,.0f}",
                f"Debito €{baseline.get('debito_residuo', 0):,.0f} · Liquidità €{baseline.get('liquidita', 0):,.0f}",
                f"PN €{pn_iniziale:,.0f} · Canone €{baseline.get('canone_mensile', 0):,.0f}/m",
                "",
                f"=== ORIZZONTE: {horizon} ANNI ===",
                "",
                "=== RICHIESTA UTENTE ===",
                prompt,
            ]
            if params:
                ctx.append("\n=== PARAMETRI ESPLICITI ===")
                if params.get("acquisti_per_anno"): ctx.append(f"- Acquisti/anno: {params['acquisti_per_anno']}")
                if params.get("prezzo_medio"): ctx.append(f"- Prezzo medio: €{params['prezzo_medio']:,.0f}")
                if params.get("canone_medio"): ctx.append(f"- Canone medio: €{params['canone_medio']:,.0f}/m")
                if params.get("citta_preferita"): ctx.append(f"- Città: {params['citta_preferita']}")
                if params.get("leva_pct") is not None: ctx.append(f"- Leva mutuo: {params['leva_pct']}%")
                if params.get("tipologia"): ctx.append(f"- Tipologia: {params['tipologia']}")

            sys_msg = (
                "Sei AI Forecaster. Trasformi descrizione testuale + parametri in piano operativo annuale immobiliare italiano. "
                "Rispondi SOLO JSON: {strategy_summary, key_risks[], operations:[{anno,tipo,label,prezzo,lavori,canone_mensile,mutuo_pct,tasso_mutuo,durata_mutuo,nuovo_tasso,immobile_id}]}. "
                "tipo ∈ {acquisto,vendita,ristrutturazione,rinegoziazione_mutuo,aumento_canone}. mutuo_pct 0..0.8. Distribuisci ops nell'orizzonte.\n\n"
                + "\n".join(ctx)
            )
            try:
                from emergentintegrations.llm.chat import LlmChat, UserMessage
                chat = LlmChat(api_key=llm_key, session_id=f"quickfc-{uuid.uuid4()}", system_message=sys_msg).with_model("anthropic", "claude-sonnet-4-6")
                reply = await chat.send_message(UserMessage(text="Genera il piano."))
            except Exception as e:
                logging.exception("Quick forecast AI error")
                raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")
            parsed = None
            try:
                parsed = json.loads(reply)
            except Exception:
                m = re.search(r"\{[\s\S]*\}", reply)
                if m:
                    try: parsed = json.loads(m.group(0))
                    except Exception: parsed = None
            if not parsed or "operations" not in parsed:
                raise HTTPException(status_code=500, detail="L'AI non ha restituito un piano valido")
            strategy_summary = parsed.get("strategy_summary", "")
            key_risks = parsed.get("key_risks") or []
            for op in parsed.get("operations") or []:
                try: anno = max(1, min(horizon, int(op.get("anno", 1))))
                except Exception: anno = 1
                tipo = op.get("tipo", "acquisto")
                if tipo not in ("acquisto","vendita","ristrutturazione","rinegoziazione_mutuo","sfitto","aumento_canone"): continue
                operations.append({
                    "id": str(uuid.uuid4()), "anno": anno, "tipo": tipo,
                    "label": (op.get("label") or "")[:80],
                    "prezzo": float(op.get("prezzo") or 0), "lavori": float(op.get("lavori") or 0),
                    "canone_mensile": float(op.get("canone_mensile") or 0),
                    "mutuo_pct": min(0.9, max(0.0, float(op.get("mutuo_pct") or 0))),
                    "tasso_mutuo": float(op.get("tasso_mutuo") or 0),
                    "durata_mutuo": int(op.get("durata_mutuo") or 20),
                    "nuovo_tasso": float(op.get("nuovo_tasso") or 0),
                    "mesi": int(op.get("mesi") or 0), "pct_canone": float(op.get("pct_canone") or 0),
                    "immobile_id": op.get("immobile_id"),
                })
        elif params:
            n_per_year = int(params.get("acquisti_per_anno") or 1)
            prezzo = float(params.get("prezzo_medio") or 180000)
            canone = float(params.get("canone_medio") or 1000)
            citta = params.get("citta_preferita") or "Milano"
            tipologia = params.get("tipologia") or "Bilocale"
            leva = max(0.0, min(0.9, float(params.get("leva_pct") or 60) / 100))
            for y in range(1, horizon + 1):
                for i in range(n_per_year):
                    operations.append({
                        "id": str(uuid.uuid4()), "anno": y, "tipo": "acquisto",
                        "label": f"{tipologia} {citta} #{(y-1)*n_per_year + i + 1}",
                        "prezzo": prezzo, "lavori": 0, "canone_mensile": canone,
                        "mutuo_pct": leva, "tasso_mutuo": 3.2, "durata_mutuo": 20,
                        "nuovo_tasso": 0, "mesi": 0, "pct_canone": 0, "immobile_id": None,
                    })
            strategy_summary = (
                f"Acquisto programmatico di {n_per_year} {tipologia.lower()}/anno a {citta} "
                f"a ~€{prezzo:,.0f}, canone medio €{canone:,.0f}/m, leva {leva*100:.0f}%."
            )
            key_risks = ["Concentrazione geografica", "Sensibilità a tassi mutuo", "Rischio sfitto su volumi crescenti"]
        else:
            raise HTTPException(status_code=400, detail="Specificare prompt o parametri")

        vincoli_dict = payload.vincoli.model_dump() if payload.vincoli else {}
        draft = {
            "nome": payload.nome or f"Forecast rapido @ {horizon}y",
            "descrizione": strategy_summary[:500],
            "horizon_years": horizon, "use_real_baseline": True,
            "initial_patrimonio": 0, "initial_debito": 0, "initial_liquidita": 0,
            "initial_canone_mensile": 0, "initial_rata_mutui": 0, "initial_numero_immobili": 0,
            "inflation_rate": 2.0, "rivalutazione_immobili": 2.0,
            "istat_canoni": 1.8, "tassazione_pct": 26.0, "operations": operations,
            "vincoli": vincoli_dict,
        }
        sim = simulate(baseline, draft, props, settings)

        saved_id = None
        if payload.save and operations:
            item = {
                "id": str(uuid.uuid4()), "user_id": user["id"], **draft,
                "ai_generated": bool(prompt),
                "ai_strategy_summary": strategy_summary, "ai_key_risks": key_risks,
                "quick_mode": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.scenarios.insert_one(item.copy())
            saved_id = item["id"]
        return {"draft_scenario": draft, "simulation": sim, "strategy_summary": strategy_summary, "key_risks": key_risks, "saved_id": saved_id}

    # ===== Sensitivity analysis — re-simulate scenario with modifiers =====
    @router.post("/scenarios/{sid}/sensitivity")
    async def scenario_sensitivity(sid: str, payload: SensitivityIn, user: dict = Depends(current_user)):
        scen = await db.scenarios.find_one({"id": sid, "user_id": user["id"]}, {"_id": 0})
        if not scen:
            raise HTTPException(status_code=404, detail="Scenario non trovato")
        baseline = await build_baseline(db, user["id"], scen)
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        settings = await get_user_settings(db, user["id"])
        sim = simulate(baseline, scen, props, settings, modifiers=payload.model_dump())
        return {"simulation": sim, "modifiers": payload.model_dump()}

    # ===== Tornado analysis — ±range per parameter, ranks by impact on PN finale =====
    @router.post("/scenarios/{sid}/tornado")
    async def scenario_tornado(sid: str, user: dict = Depends(current_user)):
        scen = await db.scenarios.find_one({"id": sid, "user_id": user["id"]}, {"_id": 0})
        if not scen:
            raise HTTPException(status_code=404, detail="Scenario non trovato")
        baseline = await build_baseline(db, user["id"], scen)
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        settings = await get_user_settings(db, user["id"])

        base_sim = simulate(baseline, scen, props, settings)
        base_pn = base_sim["summary"]["patrimonio_netto_finale"]
        base_cf = base_sim["summary"]["cash_flow_cumulato"]

        # Define ±perturbations for each parameter
        perturbations = [
            ("Tasso mutuo (Δ punti %)", "delta_tasso_pct", -1.5, +1.5, "%"),
            ("Canone affitto (%)",      "delta_canone_pct", -15, +15, "%"),
            ("Rivalutazione (Δ punti %)", "delta_rivalutazione_pct", -2, +2, "%"),
            ("Vacancy (mesi/anno)",     "vacancy_mesi_anno", 0, 3, "m"),
            ("Costi gestione (%)",      "costi_gestione_pct", 10, 25, "%"),
        ]
        items = []
        for label, field, low, high, unit in perturbations:
            mods_low = {field: low}
            mods_high = {field: high}
            # For costi_gestione_pct base = 15.0 (None means default). For vacancy base = 0.
            sim_low = simulate(baseline, scen, props, settings, modifiers=mods_low)
            sim_high = simulate(baseline, scen, props, settings, modifiers=mods_high)
            pn_low = sim_low["summary"]["patrimonio_netto_finale"]
            pn_high = sim_high["summary"]["patrimonio_netto_finale"]
            cf_low = sim_low["summary"]["cash_flow_cumulato"]
            cf_high = sim_high["summary"]["cash_flow_cumulato"]
            # impact = max swing from base
            swing = max(abs(pn_high - base_pn), abs(pn_low - base_pn))
            items.append({
                "param": label, "field": field, "unit": unit,
                "low_value": low, "high_value": high,
                "pn_low": pn_low, "pn_high": pn_high,
                "cf_low": cf_low, "cf_high": cf_high,
                "delta_pn_low": pn_low - base_pn,
                "delta_pn_high": pn_high - base_pn,
                "swing": swing,
            })
        items.sort(key=lambda x: x["swing"], reverse=True)
        return {"base_pn": base_pn, "base_cf": base_cf, "items": items}

    # ===== AI Action Plan — cosa fare per raggiungere gli obiettivi della simulazione =====
    @router.post("/scenarios/{sid}/action-plan")
    async def scenario_action_plan(sid: str, user: dict = Depends(current_user)):
        if not llm_key:
            raise HTTPException(status_code=500, detail="LLM key non configurata")
        scen = await db.scenarios.find_one({"id": sid, "user_id": user["id"]}, {"_id": 0})
        if not scen:
            raise HTTPException(status_code=404, detail="Scenario non trovato")
        baseline = await build_baseline(db, user["id"], scen)
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        settings = await get_user_settings(db, user["id"])
        sim = simulate(baseline, scen, props, settings)
        s = sim["summary"]

        # Build context for AI
        ops_by_year: dict = {}
        for op in scen.get("operations", []):
            ops_by_year.setdefault(int(op.get("anno", 0)), []).append(
                f"{op.get('tipo')} «{op.get('label','')}»"
            )
        ops_lines = "\n".join([f"- Anno {y}: {', '.join(v)}" for y, v in sorted(ops_by_year.items())]) or "- Nessuna operazione programmata"
        sn = sim["snapshots"]
        pn_iniziale = sn[0].get("patrimonio_netto", 0) if sn else 0
        crescita_pn = s.get("patrimonio_netto_finale", 0) - pn_iniziale

        ctx = (
            f"PORTAFOGLIO ATTUALE: {len(props)} immobili, valore {sn[0].get('valore_immobili',0):,.0f} €, "
            f"debito {sn[0].get('debito_residuo',0):,.0f} €, liquidità {sn[0].get('liquidita',0):,.0f} €, "
            f"canone mensile {sn[0].get('canone_mensile',0):,.0f} €.\n"
            f"OBIETTIVO SCENARIO ({scen.get('nome','')}): orizzonte {scen.get('horizon_years')} anni, "
            f"PN finale {s.get('patrimonio_netto_finale',0):,.0f} €, "
            f"crescita PN {crescita_pn:,.0f} €, "
            f"cash flow cumulato {s.get('cash_flow_cumulato',0):,.0f} €, "
            f"LTV finale {s.get('ltv_finale',0)}%, "
            f"verdict {s.get('verdict','')}.\n"
            f"OPERAZIONI PIANIFICATE:\n{ops_lines}\n"
            f"STRATEGIA SINTESI: {scen.get('descrizione','')[:400]}"
        )

        sys_msg = (
            "Sei un consulente strategico immobiliare. Produci un piano d'azione concreto per i prossimi 12-18 mesi "
            "che permetta all'utente di raggiungere gli obiettivi della simulazione. "
            "Output: SOLO JSON valido nel formato {\"actions\": [...]}, niente testo prima o dopo. "
            "Ogni azione DEVE avere: "
            "{\"priority\": \"P0|P1|P2\" (P0=urgente entro 30gg, P1=entro 3-6 mesi, P2=entro 12-18 mesi), "
            "\"timeline\": \"es. Entro 30gg / Entro Q3 2026 / Anno 2\", "
            "\"title\": \"titolo breve dell'azione\", "
            "\"description\": \"descrizione concreta in 1-2 frasi, includi numeri reali quando possibile\", "
            "\"kpi\": \"metrica da monitorare per capire se l'azione sta funzionando\", "
            "\"category\": \"acquisto|finanziamento|gestione|vendita|ottimizzazione|monitoraggio\"}. "
            "Produci 5-7 azioni totali, mix di P0/P1/P2, ordinate per priorità. "
            "Le azioni devono essere ESEGUIBILI dall'utente, non generiche. "
            "Considera vincoli reali italiani (cedolare 21%, mutui banca, tempi notarili). "
            "Esempi BUONI: «Aprire 2 watchlist su immocasa.it per bilocali Torino zona Aurora 60-80k€», "
            "«Richiedere a Intesa Sanpaolo preventivo mutuo per surroga su Via Foligno (€24k → finanziabile 60% = €14k cash liberato)». "
            "Esempi DA EVITARE: «Diversifica il portafoglio», «Monitora il mercato».\n\n"
            + ctx
        )

        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=llm_key,
                session_id=f"action-plan-{sid}",
                system_message=sys_msg,
            ).with_model("anthropic", "claude-sonnet-4-6")
            reply = await chat.send_message(UserMessage(text="Genera il piano d'azione."))
        except Exception as e:
            logging.exception("AI action-plan error")
            raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")

        # Parse JSON robustly
        actions: list = []
        try:
            text = reply.strip()
            if "```" in text:
                # estrai blocco json se presente
                import re as _re
                m = _re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
                if m:
                    text = m.group(1).strip()
            # estrai primo oggetto json
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end > start:
                text = text[start:end+1]
            parsed = json.loads(text)
            actions = parsed.get("actions", []) if isinstance(parsed, dict) else []
        except Exception as e:
            logging.warning(f"Parse action plan failed: {e}; raw: {reply[:200]}")
            # fallback: 1 azione "raw" con testo grezzo
            actions = [{
                "priority": "P1", "timeline": "Da definire",
                "title": "Sintesi AI (parsing fallito)",
                "description": reply[:400],
                "kpi": "n/d", "category": "monitoraggio",
            }]

        await db.scenarios.update_one(
            {"id": sid, "user_id": user["id"]},
            {"$set": {"action_plan": actions, "action_plan_ts": datetime.now(timezone.utc).isoformat()}}
        )
        return {"actions": actions}


    @router.post("/auto-optimize/jobs", status_code=202)
    async def create_auto_optimize_job(payload: AutoOptimizeJobIn, user: dict = Depends(current_user)):
        if not llm_key:
            raise HTTPException(status_code=500, detail="LLM key non configurata")
        job = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "status": "queued",
            "progress": 0,
            "current_step": "In coda…",
            "payload": payload.model_dump(),
            "plans": [],
            "error": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.strategist_jobs.insert_one(job.copy())
        # spawn background task (asyncio.create_task survives because event loop is shared with FastAPI)
        asyncio.create_task(_run_multishot_job(db, llm_key, user["id"], job["id"], payload.model_dump()))
        return {"job_id": job["id"], "status": "queued"}

    @router.get("/auto-optimize/jobs/{job_id}")
    async def get_auto_optimize_job(job_id: str, user: dict = Depends(current_user)):
        job = await db.strategist_jobs.find_one(
            {"id": job_id, "user_id": user["id"]},
            {"_id": 0},
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job non trovato")
        return job

    @router.post("/auto-optimize/jobs/{job_id}/save")
    async def save_plan_from_job(
        job_id: str,
        profile_id: str,
        nome: Optional[str] = None,
        user: dict = Depends(current_user),
    ):
        job = await db.strategist_jobs.find_one({"id": job_id, "user_id": user["id"]}, {"_id": 0})
        if not job:
            raise HTTPException(status_code=404, detail="Job non trovato")
        if job.get("status") != "done":
            raise HTTPException(status_code=400, detail="Job non ancora completato")
        plan = next((p for p in (job.get("plans") or []) if p.get("profile_id") == profile_id), None)
        if not plan:
            raise HTTPException(status_code=404, detail=f"Profilo '{profile_id}' non trovato nel job")
        item = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            **plan["draft_scenario"],
            "nome": nome or plan["draft_scenario"]["nome"],
            "ai_generated": True,
            "ai_profile": plan.get("profile_label"),
            "ai_strategy_summary": plan.get("strategy_summary", ""),
            "ai_key_risks": plan.get("key_risks") or [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.scenarios.insert_one(item.copy())
        return {"saved_id": item["id"], "nome": item["nome"]}

    @router.post("/auto-optimize/jobs/{job_id}/save-all")
    async def save_all_plans_from_job(job_id: str, user: dict = Depends(current_user)):
        job = await db.strategist_jobs.find_one({"id": job_id, "user_id": user["id"]}, {"_id": 0})
        if not job:
            raise HTTPException(status_code=404, detail="Job non trovato")
        if job.get("status") != "done":
            raise HTTPException(status_code=400, detail="Job non ancora completato")
        saved = []
        for plan in (job.get("plans") or []):
            item = {
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                **plan["draft_scenario"],
                "nome": plan["draft_scenario"]["nome"],
                "ai_generated": True,
                "ai_profile": plan.get("profile_label"),
                "ai_strategy_summary": plan.get("strategy_summary", ""),
                "ai_key_risks": plan.get("key_risks") or [],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.scenarios.insert_one(item.copy())
            saved.append({"id": item["id"], "nome": item["nome"], "profile_id": plan.get("profile_id")})
        return {"saved": saved, "count": len(saved)}


    # ===== PDF — Piano industriale =====
    @router.get("/scenarios/{sid}/pdf")
    async def scenario_pdf(sid: str, user: dict = Depends(current_user)):
        scen = await db.scenarios.find_one({"id": sid, "user_id": user["id"]}, {"_id": 0})
        if not scen:
            raise HTTPException(status_code=404, detail="Scenario non trovato")
        baseline = await build_baseline(db, user["id"], scen)
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        settings = await get_user_settings(db, user["id"])
        sim = simulate(baseline, scen, props, settings)
        brand = settings.get("nome_societa") or "Real Estate Control Room"

        buf, doc, h1, sub, h2, body, cb = setup_doc(
            f"Piano Industriale · {sim['horizon_years']} anni", brand, settings.get("logo_base64")
        )
        story = []
        story.append(Paragraph(f"Piano Industriale — {scen.get('nome')}", h1))
        story.append(Paragraph(
            f"Orizzonte: {sim['horizon_years']} anni · Generato il {datetime.now().strftime('%d/%m/%Y %H:%M')} · "
            f"Baseline: {'dati reali società' if scen.get('use_real_baseline') else 'input manuale'}",
            sub,
        ))
        if scen.get("descrizione"):
            story.append(Paragraph(f"<i>{scen['descrizione']}</i>", body))
            story.append(Spacer(1, 0.3 * 28))  # ~ pt

        # 1) Riepilogo strategico
        story.append(Paragraph("1 · Riepilogo strategico", h2))
        s = sim["summary"]
        story.append(make_table([
            ["Indicatore", "Valore"],
            ["Patrimonio netto iniziale", eur(s["patrimonio_netto_iniziale"])],
            ["Patrimonio netto finale", eur(s["patrimonio_netto_finale"])],
            ["Crescita patrimonio (%)", f"{s['crescita_pct']}%"],
            ["Ricavi totali periodo", eur(s["ricavi_totali_periodo"])],
            ["Utile totale periodo", eur(s["utile_totale_periodo"])],
            ["Cash flow cumulato", eur(s["cash_flow_cumulato"])],
            ["LTV finale", f"{s['ltv_finale']}%"],
            ["Immobili a fine periodo", str(s["numero_immobili_finale"])],
        ], [320, 180], highlight_last=False))

        # 2) Operazioni pianificate
        ops = scen.get("operations") or []
        if ops:
            story.append(Paragraph("2 · Operazioni pianificate", h2))
            rows = [["Anno", "Tipo", "Descrizione", "Prezzo / Lavori", "Canone Δ/mese"]]
            for op in sorted(ops, key=lambda o: (int(o.get("anno", 0)), o.get("tipo", ""))):
                p_or_l = op.get("prezzo") or op.get("lavori") or 0
                rows.append([
                    str(op.get("anno", "")), (op.get("tipo") or "").replace("_", " "),
                    (op.get("label") or "")[:38], eur(p_or_l),
                    eur(op.get("canone_mensile") or 0),
                ])
            story.append(make_table(rows, [50, 110, 160, 100, 80]))

        # 3) Proiezione anno per anno
        story.append(PageBreak())
        story.append(Paragraph("3 · Proiezione anno per anno", h2))
        rows = [["Anno", "Immobili", "Val.Patrimonio", "Debito", "PN", "Canone/m", "Utile netto", "Cash flow", "LTV"]]
        for snap in sim["snapshots"]:
            rows.append([
                str(snap["anno"]), str(snap["numero_immobili"]),
                eur(snap["valore_immobili"]), eur(snap["debito_residuo"]),
                eur(snap.get("patrimonio_netto", 0)),
                eur(snap.get("canone_mensile", 0)),
                eur(snap.get("utile_netto", 0)),
                eur(snap.get("cash_flow_annuo", 0)),
                f"{snap.get('ltv', 0)}%",
            ])
        story.append(make_table(rows, [35, 50, 75, 65, 65, 55, 65, 65, 45]))

        # 4) Assunzioni di scenario
        story.append(Paragraph("4 · Assunzioni di scenario", h2))
        story.append(make_table([
            ["Parametro", "Valore"],
            ["Rivalutazione immobili annua", f"{scen.get('rivalutazione_immobili', 0)}%"],
            ["Aggiornamento ISTAT canoni", f"{scen.get('istat_canoni', 0)}%"],
            ["Inflazione attesa", f"{scen.get('inflation_rate', 0)}%"],
            ["Tassazione utile (%)", f"{scen.get('tassazione_pct', 0)}%"],
            ["Tasso di interesse implicito su debito", "3,00% (mix portafoglio)"],
        ], [320, 180]))

        # 5) Alert proattivi rilevati
        all_alerts = []
        for snap in sim["snapshots"]:
            for a in (snap.get("alerts") or []):
                all_alerts.append({"anno": snap["anno"], **a})
        if all_alerts:
            story.append(Paragraph(f"5 · Alert proattivi rilevati ({s['alerts_critical']} critici · {s['alerts_warning']} warning)", h2))
            rows = [["Anno", "Severità", "Descrizione"]]
            for a in all_alerts[:30]:
                rows.append([str(a["anno"]), a["severity"].upper(), a["message"][:90]])
            color = "#DC2626" if s["alerts_critical"] > 0 else "#B45309"
            story.append(make_table(rows, [40, 70, 400], header_color=color))

        # 6) Conclusioni e raccomandazioni
        story.append(Paragraph("6 · Conclusioni", h2))
        story.append(Paragraph(
            f"<b>{s['verdict']}</b>. Patrimonio atteso a fine periodo: {eur(s['patrimonio_netto_finale'])}, "
            f"con LTV finale al {s['ltv_finale']}% e {s['numero_immobili_finale']} immobili in portafoglio. "
            f"Alert totali nello scenario: {s['alerts_critical']} critici, {s['alerts_warning']} warning.",
            body
        ))

        doc.build(story, onFirstPage=cb, onLaterPages=cb)
        buf.seek(0)
        return StreamingResponse(
            io.BytesIO(buf.read()),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="piano_industriale_{sid[:8]}.pdf"'},
        )

    return router
