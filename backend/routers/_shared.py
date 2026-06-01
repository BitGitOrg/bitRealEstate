"""Shared helpers used by multiple routers (avoid circular imports)."""
from typing import Optional


def compute_deal_score(prezzo: float, metratura: float, canone: float, citta: str) -> dict:
    costo_totale = prezzo * 1.10  # +10% costi accessori stimati
    rend_lordo = (canone * 12) / costo_totale * 100 if costo_totale > 0 else 0
    rend_netto = rend_lordo * 0.65
    score = 50 + min(30, max(-30, (rend_netto - 5) * 6))
    if prezzo > 0 and metratura > 0:
        prezzo_mq = prezzo / metratura
        big_city = (citta or "").lower() in {"milano", "roma", "firenze", "venezia", "bologna"}
        soglia = 5500 if big_city else 3500
        if prezzo_mq > soglia * 1.3:
            score -= 12
        elif prezzo_mq < soglia * 0.7:
            score += 8
    score = max(0, min(100, int(score)))
    if score >= 91:
        giudizio, strategia = "Operazione eccellente", "Affitto a reddito"
    elif score >= 76:
        giudizio, strategia = "Buona operazione", "Affitto a reddito"
    elif score >= 61:
        giudizio, strategia = "Operazione interessante", "Valutare lavori+rivendita"
    elif score >= 41:
        giudizio, strategia = "Operazione rischiosa", "Negoziare prezzo"
    else:
        giudizio, strategia = "Operazione sconsigliata", "Non procedere"
    rischio = "Basso" if score >= 75 else ("Medio" if score >= 50 else "Alto")
    return {
        "deal_score": score,
        "giudizio": giudizio,
        "strategia": strategia,
        "rischio": rischio,
        "rendimento_lordo": round(rend_lordo, 2),
        "rendimento_netto": round(rend_netto, 2),
    }


def enrich_property(p: dict) -> dict:
    """Compute derived metrics for a property in place."""
    prezzo = float(p.get("prezzo_acquisto", 0) or 0)
    notaio = float(p.get("notaio", 0) or 0)
    agenzia = float(p.get("agenzia", 0) or 0)
    imposte = float(p.get("imposte", 0) or 0)
    lavori = float(p.get("lavori", 0) or 0)
    canone = float(p.get("canone_mensile", 0) or 0)
    costo_totale = prezzo + notaio + agenzia + imposte + lavori
    p["costo_totale"] = costo_totale
    if not p.get("valore_stimato"):
        p["valore_stimato"] = prezzo
    rend_lordo = (canone * 12) / costo_totale * 100 if costo_totale > 0 else 0
    rend_netto = rend_lordo * 0.65
    p["rendimento_lordo"] = round(rend_lordo, 2)
    p["rendimento_netto"] = round(rend_netto, 2)
    mutuo_rata = float((p.get("mutuo") or {}).get("rata", 0) or 0)
    p["cash_flow_mensile"] = round(canone - mutuo_rata - canone * 0.15, 0)
    sc = compute_deal_score(prezzo, float(p.get("metratura", 0) or 0), canone, p.get("citta", "") or "")
    p["portfolio_score_base"] = sc["deal_score"]
    p["portfolio_score"] = sc["deal_score"]  # may be overridden by apply_dynamic_score
    return p


def apply_dynamic_score(p: dict, alerts_by_property: dict, incassi_by_property: dict | None = None) -> dict:
    """Aggiusta il portfolio_score in funzione di alert attivi + morosità incassi.
    - Penalità per alert: alta=-10, media=-3, bassa=-1
    - Penalità per incassi in_ritardo/non_pagato: -5 ciascuno
    - Bonus se rendimento_netto > 8%: +5
    - Bonus se cash_flow_mensile > 0: già nello score base
    Score sempre 0-100, intero.
    """
    pid = p.get("id")
    base = int(p.get("portfolio_score_base", p.get("portfolio_score", 50)) or 50)
    score = base
    alerts = alerts_by_property.get(pid, [])
    sev_counts = {"alta": 0, "media": 0, "bassa": 0}
    for a in alerts:
        sev = a.get("severity", "bassa")
        if sev in sev_counts:
            sev_counts[sev] += 1
    penalty_alerts = sev_counts["alta"] * 10 + sev_counts["media"] * 3 + sev_counts["bassa"] * 1
    score -= penalty_alerts

    morosi = 0
    if incassi_by_property is not None:
        for inc in incassi_by_property.get(pid, []):
            if inc.get("stato") in ("in_ritardo", "non_pagato", "parzialmente_pagato"):
                morosi += 1
    score -= morosi * 5

    if (p.get("rendimento_netto") or 0) > 8:
        score += 5

    score = max(0, min(100, int(score)))
    p["portfolio_score"] = score
    p["score_breakdown"] = {
        "base": base,
        "penalty_alerts": penalty_alerts,
        "alerts_alta": sev_counts["alta"],
        "alerts_media": sev_counts["media"],
        "alerts_bassa": sev_counts["bassa"],
        "morosi": morosi,
        "bonus_rend_alto": 5 if (p.get("rendimento_netto") or 0) > 8 else 0,
    }
    return p


def coerce_float(v) -> float:
    if v is None or v == "":
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace("€", "").replace(",", ".").replace(" ", "").strip())
    except Exception:
        return 0.0


def coerce_int(v) -> int:
    try:
        return int(coerce_float(v))
    except Exception:
        return 0


def coerce_str(v) -> str:
    if v is None:
        return ""
    return str(v).strip()
