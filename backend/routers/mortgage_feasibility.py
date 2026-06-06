"""
Mortgage Feasibility Simulator — Banker-grade analysis con AI.

Endpoint:
  GET  /api/mortgage-feasibility/rate-suggestions
       → Restituisce tassi suggeriti (medi tuoi mutui + medie mercato).
  POST /api/mortgage-feasibility/analyze
       → Calcola tutti i KPI bancari (DSCR, LTV post, DTI, rata/reddito), chiama Claude
         e restituisce un'analisi banker-grade strutturata. Salva nello storico.
  GET  /api/mortgage-feasibility/history
       → Storico simulazioni dell'utente.
  DELETE /api/mortgage-feasibility/{sim_id}
       → Elimina una simulazione.
"""
import os
import re
import json
import uuid
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Tassi mercato (aggiornati Feb 2026 — orientamento short-term/bridge per società immobiliari)
MARKET_RATES = {
    "fisso_2": 4.80,
    "fisso_3": 4.40,
    "fisso_5": 3.90,
    "fisso_7": 3.70,
    "fisso_8": 3.60,
    "variabile_3": 5.30,
    "variabile_5": 4.70,
    "variabile_8": 4.40,
}

# Soglie banker italiane standard (ABI / EBA guidelines investitori immobiliari)
SOGLIE = {
    "ltv_max_immobile_reddito": 0.80,   # 80% per immobile a reddito (privato 80%, investimento spesso 60-70%)
    "ltv_max_consigliato": 0.70,        # Soglia conservativa per società di investimento
    "dscr_min": 1.20,                    # Debt Service Coverage Ratio minimo
    "dscr_buono": 1.40,
    "rata_su_reddito_max": 0.33,         # 1/3 reddito mensile (regola generale CRR/EBA)
    "rata_su_reddito_critico": 0.40,
    "dti_max": 0.50,                     # Debt-to-Income complessivo
    "liquidita_min_mesi": 6,             # Riserva minima cassa = 6 mesi rata
}


class MortgageInput(BaseModel):
    importo: float                       # Importo mutuo richiesto (€)
    durata_anni: int                     # 10-30
    tasso_pct: float                     # Tasso annuo nominale (TAN)
    tipo_tasso: str = "fisso"            # fisso | variabile | misto
    finalita: str = "immobile_reddito"   # immobile_reddito | ristrutturazione | sostituzione
    prezzo_immobile_target: Optional[float] = None
    canone_atteso_mensile: Optional[float] = None
    banca_target: Optional[str] = None
    note: Optional[str] = None
    tag: Optional[str] = None            # Etichetta libera per storico


def _rata_francese(capitale: float, tasso_annuo_pct: float, durata_anni: int) -> float:
    """Rata mensile francese (sistema rate costanti)."""
    if capitale <= 0 or durata_anni <= 0:
        return 0
    n = durata_anni * 12
    i = (tasso_annuo_pct / 100.0) / 12.0
    if i == 0:
        return capitale / n
    return capitale * (i * (1 + i) ** n) / ((1 + i) ** n - 1)


async def _aggregate_portfolio(db, user_id: str) -> dict:
    """Aggrega TUTTI i dati patrimoniali reali dal sistema gestionale.
    Usa stesse fonti di Dashboard, Forecast, Mutui."""
    props = await db.properties.find({"user_id": user_id}, {"_id": 0}).to_list(500)
    mutui = await db.mutui.find({"user_id": user_id}, {"_id": 0}).to_list(200)
    bilanci = await db.bilanci.find({"user_id": user_id}, {"_id": 0}).sort("periodo", -1).to_list(5)

    # Valore patrimoniale immobili
    valore_immobili = sum(float(p.get("valore_attuale") or p.get("prezzo_acquisto") or 0) for p in props)

    # Ricavi mensili reali (affitti)
    ricavi_mensili = 0.0
    for p in props:
        c = float(p.get("canone_mensile") or 0)
        # Vacancy stimato: tasso_occupazione (default 100% se mancante)
        occ = float(p.get("tasso_occupazione") or 100) / 100.0
        ricavi_mensili += c * occ
    ricavi_annui = ricavi_mensili * 12

    # Costi mensili operativi medi
    costi_op_annui = 0.0
    for p in props:
        costi_op_annui += float(p.get("costi_gestione_annui") or 0)
        costi_op_annui += float(p.get("imu_annua") or 0)
        costi_op_annui += float(p.get("manutenzione_annua") or 0)
        costi_op_annui += float(p.get("assicurazione_annua") or 0)
    # Fallback se costi non popolati: stima 20% dei ricavi
    if costi_op_annui == 0 and ricavi_annui > 0:
        costi_op_annui = ricavi_annui * 0.20
    costi_op_mensili = costi_op_annui / 12.0

    # NOI (Net Operating Income, prima del debito)
    noi_annuo = ricavi_annui - costi_op_annui

    # Debito mutui in essere
    debito_residuo = 0.0
    rata_mensile_attuale = 0.0
    tassi_in_essere_fisso = []
    tassi_in_essere_variabile = []
    for m in mutui:
        debito_residuo += float(m.get("capitale_residuo") or 0)
        rata_mensile_attuale += float(m.get("rata_mensile") or 0)
        t = float(m.get("tasso") or 0)
        if t > 0:
            if (m.get("tipo_tasso") or "").lower().startswith("var"):
                tassi_in_essere_variabile.append(t)
            else:
                tassi_in_essere_fisso.append(t)
    rata_annua_attuale = rata_mensile_attuale * 12

    # Liquidità (da ultimo bilancio o stima)
    liquidita = 0.0
    patrimonio_netto = 0.0
    if bilanci:
        sp = (bilanci[0].get("stato_patrimoniale") or {})
        liquidita = float(sp.get("liquidita") or 0)
        patrimonio_netto = float(sp.get("patrimonio_netto") or 0)
        if not patrimonio_netto:
            patrimonio_netto = float(sp.get("totale_attivo") or valore_immobili) - float(sp.get("totale_passivo") or debito_residuo)
    if patrimonio_netto == 0:
        patrimonio_netto = valore_immobili - debito_residuo

    # DSCR e indicatori attuali
    dscr_attuale = (noi_annuo / rata_annua_attuale) if rata_annua_attuale > 0 else None
    cashflow_mensile_attuale = ricavi_mensili - costi_op_mensili - rata_mensile_attuale

    return {
        "n_immobili": len(props),
        "valore_immobili": round(valore_immobili, 2),
        "ricavi_mensili_attuali": round(ricavi_mensili, 2),
        "ricavi_annui_attuali": round(ricavi_annui, 2),
        "costi_op_mensili": round(costi_op_mensili, 2),
        "costi_op_annui": round(costi_op_annui, 2),
        "noi_annuo": round(noi_annuo, 2),
        "debito_residuo_totale": round(debito_residuo, 2),
        "rata_mensile_attuale": round(rata_mensile_attuale, 2),
        "rata_annua_attuale": round(rata_annua_attuale, 2),
        "liquidita_disponibile": round(liquidita, 2),
        "patrimonio_netto": round(patrimonio_netto, 2),
        "dscr_attuale": round(dscr_attuale, 3) if dscr_attuale else None,
        "cashflow_mensile_attuale": round(cashflow_mensile_attuale, 2),
        "tasso_medio_fisso_in_essere": round(sum(tassi_in_essere_fisso) / len(tassi_in_essere_fisso), 2) if tassi_in_essere_fisso else None,
        "tasso_medio_variabile_in_essere": round(sum(tassi_in_essere_variabile) / len(tassi_in_essere_variabile), 2) if tassi_in_essere_variabile else None,
        "n_mutui_attivi": len(mutui),
        "bilancio_periodo": bilanci[0].get("periodo") if bilanci else None,
    }


def _compute_kpi(p: dict, inp: MortgageInput) -> dict:
    """Calcola KPI banker post-richiesta."""
    rata_new = _rata_francese(inp.importo, inp.tasso_pct, inp.durata_anni)
    rata_mensile_post = (p["rata_mensile_attuale"] or 0) + rata_new
    rata_annua_post = rata_mensile_post * 12
    debito_post = (p["debito_residuo_totale"] or 0) + inp.importo

    # Ricavi attesi post (se l'immobile target produce affitto)
    ricavi_post_mensili = p["ricavi_mensili_attuali"]
    canone_target = float(inp.canone_atteso_mensile or 0)
    if canone_target > 0:
        # Assumiamo 11 mesi/anno effettivi (1 mese vacancy)
        ricavi_post_mensili += canone_target * (11 / 12.0)
    ricavi_post_annui = ricavi_post_mensili * 12

    # Costi post: aggiungiamo stima costi target (15% del canone se nuovo)
    costi_post_annui = p["costi_op_annui"]
    if canone_target > 0:
        costi_post_annui += canone_target * 12 * 0.15
    noi_post = ricavi_post_annui - costi_post_annui

    dscr_post = (noi_post / rata_annua_post) if rata_annua_post > 0 else None
    cashflow_post = ricavi_post_mensili - (costi_post_annui / 12.0) - rata_mensile_post

    # LTV: se c'è prezzo target → ratio sul valore singolo. Altrimenti LTV portfolio totale.
    ltv_immobile = None
    if inp.prezzo_immobile_target and inp.prezzo_immobile_target > 0:
        ltv_immobile = inp.importo / inp.prezzo_immobile_target
    ltv_portfolio_post = debito_post / (p["valore_immobili"] + (inp.prezzo_immobile_target or 0)) if (p["valore_immobili"] + (inp.prezzo_immobile_target or 0)) > 0 else None

    # Rata su reddito
    rata_su_reddito = (rata_mensile_post / ricavi_post_mensili) if ricavi_post_mensili > 0 else None

    # DTI: debito totale / patrimonio
    dti_post = (debito_post / (p["valore_immobili"] + (inp.prezzo_immobile_target or 0))) if (p["valore_immobili"] + (inp.prezzo_immobile_target or 0)) > 0 else None

    # Cap rate sull'immobile target
    cap_rate_target = None
    if inp.prezzo_immobile_target and canone_target > 0:
        noi_target = canone_target * 11 - (canone_target * 12 * 0.15)
        cap_rate_target = noi_target / inp.prezzo_immobile_target

    # Mesi di liquidità rispetto alla rata
    mesi_liquidita = (p["liquidita_disponibile"] / rata_mensile_post) if rata_mensile_post > 0 else None

    # Capitale proprio richiesto stimato (se prezzo target noto)
    capitale_proprio = None
    if inp.prezzo_immobile_target:
        capitale_proprio = inp.prezzo_immobile_target - inp.importo
        # Aggiungi costi accessori ~10%
        capitale_proprio += inp.prezzo_immobile_target * 0.10

    # Score formula deterministica (sarà rifinita da Claude poi)
    # 0-100 dove pesi: DSCR (35) + LTV (25) + Rata/reddito (20) + Liquidità (10) + Cap rate (10)
    score = 0
    contrib = {}
    if dscr_post is not None:
        s_dscr = max(0, min(100, ((dscr_post - 1.0) / 0.6) * 100))  # 1.0 → 0, 1.6 → 100
        contrib["dscr"] = round(s_dscr * 0.35, 1)
        score += contrib["dscr"]
    else:
        contrib["dscr"] = 0
    if ltv_portfolio_post is not None:
        s_ltv = max(0, min(100, (1 - ltv_portfolio_post / 0.85) * 100))
        contrib["ltv"] = round(s_ltv * 0.25, 1)
        score += contrib["ltv"]
    else:
        contrib["ltv"] = 0
    if rata_su_reddito is not None:
        s_rr = max(0, min(100, (1 - rata_su_reddito / 0.50) * 100))
        contrib["rata_su_reddito"] = round(s_rr * 0.20, 1)
        score += contrib["rata_su_reddito"]
    else:
        contrib["rata_su_reddito"] = 0
    if mesi_liquidita is not None:
        s_liq = max(0, min(100, (mesi_liquidita / 12.0) * 100))
        contrib["liquidita"] = round(s_liq * 0.10, 1)
        score += contrib["liquidita"]
    else:
        contrib["liquidita"] = 0
    if cap_rate_target is not None:
        # Cap rate 5% → 50, 8% → 100
        s_cap = max(0, min(100, ((cap_rate_target - 0.03) / 0.05) * 100))
        contrib["cap_rate"] = round(s_cap * 0.10, 1)
        score += contrib["cap_rate"]
    else:
        contrib["cap_rate"] = 0

    score = round(min(100, max(0, score)))

    # Semaforo
    if score >= 70:
        semaforo = "verde"
    elif score >= 45:
        semaforo = "giallo"
    else:
        semaforo = "rosso"

    return {
        "rata_nuova_mensile": round(rata_new, 2),
        "rata_mensile_post": round(rata_mensile_post, 2),
        "rata_annua_post": round(rata_annua_post, 2),
        "debito_post": round(debito_post, 2),
        "ricavi_post_mensili": round(ricavi_post_mensili, 2),
        "ricavi_post_annui": round(ricavi_post_annui, 2),
        "noi_post": round(noi_post, 2),
        "dscr_post": round(dscr_post, 3) if dscr_post else None,
        "cashflow_mensile_post": round(cashflow_post, 2),
        "ltv_immobile_pct": round(ltv_immobile * 100, 1) if ltv_immobile else None,
        "ltv_portfolio_post_pct": round(ltv_portfolio_post * 100, 1) if ltv_portfolio_post else None,
        "rata_su_reddito_pct": round(rata_su_reddito * 100, 1) if rata_su_reddito else None,
        "dti_post_pct": round(dti_post * 100, 1) if dti_post else None,
        "cap_rate_target_pct": round(cap_rate_target * 100, 2) if cap_rate_target else None,
        "mesi_liquidita_coperti": round(mesi_liquidita, 1) if mesi_liquidita else None,
        "capitale_proprio_richiesto": round(capitale_proprio, 2) if capitale_proprio else None,
        "score_deterministico": score,
        "semaforo": semaforo,
        "score_breakdown": contrib,
    }


async def _ai_banker_analysis(llm_key: str, portfolio: dict, inp: MortgageInput, kpi: dict) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    sys_msg = (
        "Sei un Senior Credit Officer di una banca commerciale italiana specializzato in finanziamenti "
        "a società immobiliari (SRL real estate investitori). Hai 20 anni di esperienza, applichi le "
        "linee guida ABI, le EBA Guidelines on Loan Origination, le indicazioni Banca d'Italia (Circolare 285), "
        "e parametri Basilea III/IV. Devi valutare in modo TECNICO una richiesta di mutuo per investimento immobiliare.\n\n"
        "Restituisci ESCLUSIVAMENTE JSON valido (no markdown, no prefisso) con questa struttura ESATTA:\n"
        "{\n"
        '  "punteggio_fattibilita": 0-100 (rifina lo score_deterministico in base a context qualitativo),\n'
        '  "semaforo": "verde|giallo|rosso",\n'
        '  "giudizio_sintetico": "1 frase 15-25 parole in linguaggio banker tecnico",\n'
        '  "esito_atteso": "approvabile_standard | approvabile_con_garanzie | rinegoziabile | rifiuto_probabile",\n'
        '  "analisi_dettagliata": "Markdown 200-350 parole: situazione patrimoniale attuale, impatto della richiesta, '
        'confronto con soglie EBA/ABI, riferimenti normativi, valutazione DSCR/LTV/rata-su-reddito, conclusione",\n'
        '  "punti_forza": ["max 5 bullet tecnici"],\n'
        '  "punti_critici": ["max 5 bullet con quantificazione precisa"],\n'
        '  "raccomandazioni": [\n'
        '    {"azione": "str", "impatto_atteso": "str (es. \'DSCR sale a 1.42\')", "priorita": "alta|media|bassa"}\n'
        "  ],\n"
        '  "scenari_alternativi": [\n'
        '    {"label": "str", "modifica": "es. \'Riduci richiesta a 250k\'", "score_stimato": 0-100, "note": "str breve"}\n'
        "  ],\n"
        '  "banche_consigliate": ["tipi di istituto adatti, es. Intesa SP private investment, BPER imprese, Credito '
        'Cooperativo locale, ecc. — solo categorie, max 4"],\n'
        '  "covenant_attesi": ["es. \'Mantenere DSCR > 1.20\', \'Vincolo non distribuzione dividendi\', ecc.\'"],\n'
        '  "documenti_richiesti": ["Lista documenti che la banca chiederà sicuramente"]\n'
        "}\n\n"
        "REGOLE DI VALUTAZIONE (applica con rigore):\n"
        f"- DSCR ≥ {SOGLIE['dscr_min']} obbligatorio per immobile a reddito; ≥ {SOGLIE['dscr_buono']} per ottimo rating\n"
        f"- LTV singolo immobile ≤ {SOGLIE['ltv_max_immobile_reddito']*100:.0f}%; LTV portfolio post ≤ {SOGLIE['ltv_max_consigliato']*100:.0f}% conservativo\n"
        f"- Rata totale / ricavi mensili ≤ {SOGLIE['rata_su_reddito_max']*100:.0f}% (critico oltre {SOGLIE['rata_su_reddito_critico']*100:.0f}%)\n"
        f"- Liquidità ≥ {SOGLIE['liquidita_min_mesi']} mesi di rate (riserva minima)\n"
        "- Cap rate immobile target ≥ 5% per giustificare l'operazione\n"
        "- Cita SEMPRE i numeri esatti del cliente nei bullet (es. 'DSCR scenderebbe a 1.08, sotto soglia 1.20')\n"
        "- Usa terminologia tecnica banker: NOI, DSCR, LTV, DTI, Cap Rate, Cash-on-Cash, Loan Tenor, Stress Test\n"
        "- Se l'operazione è chiaramente rifiutabile (semaforo rosso), proponi covenant alternativi o ristrutturazione richiesta\n"
        "- Cita normative quando rilevante: 'EBA/GL/2020/06', 'ABI Lettera circolare', 'CRR Art. 124' per LTV\n\n"
    )

    user_msg = (
        f"=== RICHIESTA MUTUO ===\n"
        f"Importo: {inp.importo:,.0f}€\n"
        f"Durata: {inp.durata_anni} anni\n"
        f"Tasso: {inp.tasso_pct}% {inp.tipo_tasso}\n"
        f"Finalità: {inp.finalita}\n"
        f"Prezzo immobile target: {inp.prezzo_immobile_target:,.0f}€\n" if inp.prezzo_immobile_target else ""
    )
    user_msg = (
        f"=== RICHIESTA MUTUO ===\n"
        f"Importo: {inp.importo:,.0f}€\n"
        f"Durata: {inp.durata_anni} anni\n"
        f"Tasso: {inp.tasso_pct}% {inp.tipo_tasso}\n"
        f"Finalità: {inp.finalita}\n"
    )
    if inp.prezzo_immobile_target:
        user_msg += f"Prezzo immobile target: {inp.prezzo_immobile_target:,.0f}€\n"
    if inp.canone_atteso_mensile:
        user_msg += f"Canone atteso: {inp.canone_atteso_mensile:,.0f}€/mese\n"
    if inp.banca_target:
        user_msg += f"Banca target: {inp.banca_target}\n"
    if inp.note:
        user_msg += f"Note cliente: {inp.note}\n"

    user_msg += "\n=== SITUAZIONE PATRIMONIALE ATTUALE (dati reali gestionale) ===\n"
    user_msg += f"Immobili: {portfolio['n_immobili']} · Valore: {portfolio['valore_immobili']:,.0f}€\n"
    user_msg += f"Ricavi affitti: {portfolio['ricavi_annui_attuali']:,.0f}€/anno ({portfolio['ricavi_mensili_attuali']:,.0f}€/mese)\n"
    user_msg += f"Costi operativi: {portfolio['costi_op_annui']:,.0f}€/anno\n"
    user_msg += f"NOI: {portfolio['noi_annuo']:,.0f}€/anno\n"
    user_msg += f"Debito mutui in essere: {portfolio['debito_residuo_totale']:,.0f}€ · Rata mensile attuale: {portfolio['rata_mensile_attuale']:,.0f}€\n"
    user_msg += f"DSCR attuale: {portfolio['dscr_attuale']}\n"
    user_msg += f"Cash flow mensile attuale: {portfolio['cashflow_mensile_attuale']:,.0f}€\n"
    user_msg += f"Liquidità: {portfolio['liquidita_disponibile']:,.0f}€\n"
    user_msg += f"Patrimonio netto: {portfolio['patrimonio_netto']:,.0f}€\n"
    if portfolio.get("bilancio_periodo"):
        user_msg += f"Ultimo bilancio: {portfolio['bilancio_periodo']}\n"

    user_msg += "\n=== KPI POST-RICHIESTA (calcolati deterministicamente) ===\n"
    user_msg += f"Rata nuova: {kpi['rata_nuova_mensile']:,.0f}€/mese\n"
    user_msg += f"Rata totale post: {kpi['rata_mensile_post']:,.0f}€/mese\n"
    user_msg += f"DSCR post: {kpi['dscr_post']}\n"
    user_msg += f"LTV immobile target: {kpi['ltv_immobile_pct']}%\n" if kpi.get('ltv_immobile_pct') is not None else ""
    user_msg += f"LTV portfolio post: {kpi['ltv_portfolio_post_pct']}%\n"
    user_msg += f"Rata / ricavi mensili: {kpi['rata_su_reddito_pct']}%\n"
    user_msg += f"DTI post: {kpi['dti_post_pct']}%\n"
    user_msg += f"Cap rate immobile: {kpi['cap_rate_target_pct']}%\n" if kpi.get('cap_rate_target_pct') is not None else ""
    user_msg += f"Mesi liquidità coperti: {kpi['mesi_liquidita_coperti']}\n"
    user_msg += f"Capitale proprio richiesto: {kpi['capitale_proprio_richiesto']:,.0f}€\n" if kpi.get('capitale_proprio_richiesto') is not None else ""
    user_msg += f"Cash flow mensile post: {kpi['cashflow_mensile_post']:,.0f}€\n"
    user_msg += f"Score deterministico iniziale: {kpi['score_deterministico']}/100 (semaforo {kpi['semaforo']})\n"

    user_msg += "\nProduci ora il JSON banker-grade richiesto."

    chat = LlmChat(
        api_key=llm_key,
        session_id=f"mortgage-{uuid.uuid4().hex[:8]}",
        system_message=sys_msg
    ).with_model("anthropic", "claude-sonnet-4-6")
    reply = await chat.send_message(UserMessage(text=user_msg))

    text = (reply or "").strip()
    if "```" in text:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if m:
            text = m.group(1).strip()
    s = text.find("{")
    e = text.rfind("}")
    if s == -1 or e <= s:
        raise ValueError("AI non ha restituito JSON valido")
    return json.loads(text[s:e+1])


def make_mortgage_feasibility_router(db, current_user, llm_key: Optional[str] = None):
    router = APIRouter(prefix="/api/mortgage-feasibility")

    @router.get("/rate-suggestions")
    async def rate_suggestions(user: dict = Depends(current_user)):
        agg = await _aggregate_portfolio(db, user["id"])
        opts = []
        if agg["tasso_medio_fisso_in_essere"] is not None:
            opts.append({
                "id": "tuo_fisso",
                "label": f"Tuo tasso medio fisso ({agg['tasso_medio_fisso_in_essere']}%)",
                "value": agg["tasso_medio_fisso_in_essere"],
                "tipo_tasso": "fisso",
                "fonte": f"Media {agg['n_mutui_attivi']} mutui fissi in essere",
            })
        if agg["tasso_medio_variabile_in_essere"] is not None:
            opts.append({
                "id": "tuo_variabile",
                "label": f"Tuo tasso medio variabile ({agg['tasso_medio_variabile_in_essere']}%)",
                "value": agg["tasso_medio_variabile_in_essere"],
                "tipo_tasso": "variabile",
                "fonte": "Media tuoi mutui variabili",
            })
        opts.extend([
            {"id": "mkt_fix_2", "label": f"Mercato fisso 2a ({MARKET_RATES['fisso_2']}%)", "value": MARKET_RATES['fisso_2'], "tipo_tasso": "fisso", "fonte": "Bridge short-term Feb 2026"},
            {"id": "mkt_fix_3", "label": f"Mercato fisso 3a ({MARKET_RATES['fisso_3']}%)", "value": MARKET_RATES['fisso_3'], "tipo_tasso": "fisso", "fonte": "Bridge short-term Feb 2026"},
            {"id": "mkt_fix_5", "label": f"Mercato fisso 5a ({MARKET_RATES['fisso_5']}%)", "value": MARKET_RATES['fisso_5'], "tipo_tasso": "fisso", "fonte": "Media indicativa Feb 2026"},
            {"id": "mkt_fix_7", "label": f"Mercato fisso 7a ({MARKET_RATES['fisso_7']}%)", "value": MARKET_RATES['fisso_7'], "tipo_tasso": "fisso", "fonte": "Media indicativa Feb 2026"},
            {"id": "mkt_fix_8", "label": f"Mercato fisso 8a ({MARKET_RATES['fisso_8']}%)", "value": MARKET_RATES['fisso_8'], "tipo_tasso": "fisso", "fonte": "Media indicativa Feb 2026"},
            {"id": "mkt_var_3", "label": f"Mercato variabile 3a ({MARKET_RATES['variabile_3']}%)", "value": MARKET_RATES['variabile_3'], "tipo_tasso": "variabile", "fonte": "Bridge short-term Feb 2026"},
            {"id": "mkt_var_5", "label": f"Mercato variabile 5a ({MARKET_RATES['variabile_5']}%)", "value": MARKET_RATES['variabile_5'], "tipo_tasso": "variabile", "fonte": "Media indicativa Feb 2026"},
            {"id": "mkt_var_8", "label": f"Mercato variabile 8a ({MARKET_RATES['variabile_8']}%)", "value": MARKET_RATES['variabile_8'], "tipo_tasso": "variabile", "fonte": "Media indicativa Feb 2026"},
        ])
        return {
            "options": opts,
            "tuoi_dati": {
                "n_mutui_attivi": agg["n_mutui_attivi"],
                "tasso_medio_fisso": agg["tasso_medio_fisso_in_essere"],
                "tasso_medio_variabile": agg["tasso_medio_variabile_in_essere"],
            }
        }

    @router.post("/analyze")
    async def analyze(inp: MortgageInput, user: dict = Depends(current_user)):
        if not llm_key:
            raise HTTPException(503, "LLM non configurato")
        if inp.importo <= 0 or inp.durata_anni <= 0 or inp.tasso_pct <= 0:
            raise HTTPException(400, "Importo, durata e tasso devono essere positivi")

        portfolio = await _aggregate_portfolio(db, user["id"])
        kpi = _compute_kpi(portfolio, inp)

        try:
            ai = await _ai_banker_analysis(llm_key, portfolio, inp, kpi)
        except Exception as e:
            logger.exception(f"AI banker analysis failed: {e}")
            raise HTTPException(500, f"AI analysis failed: {str(e)[:120]}")

        result = {
            "id": f"MF-{uuid.uuid4().hex[:8].upper()}",
            "user_id": user["id"],
            "input": inp.model_dump(),
            "portfolio_snapshot": portfolio,
            "kpi": kpi,
            "ai": ai,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        # Salva storico (sempre, scelta utente confermata)
        await db.mortgage_simulations.insert_one(result.copy())
        # Output non include user_id
        result_out = {k: v for k, v in result.items() if k != "user_id"}
        return result_out

    @router.get("/history")
    async def history(user: dict = Depends(current_user)):
        items = await db.mortgage_simulations.find(
            {"user_id": user["id"]}, {"_id": 0, "user_id": 0}
        ).sort("created_at", -1).to_list(100)
        return items

    @router.delete("/{sim_id}")
    async def delete_sim(sim_id: str, user: dict = Depends(current_user)):
        r = await db.mortgage_simulations.delete_one({"id": sim_id, "user_id": user["id"]})
        if r.deleted_count == 0:
            raise HTTPException(404, "Simulazione non trovata")
        return {"ok": True}

    return router
