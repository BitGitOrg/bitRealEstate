"""
Banker Pack v2 — Credit Dossier completo per fattibilità mutuo.

Genera un PDF impaginato come un vero dossier creditizio bancario:
  - Cover con verdict AI (score, semaforo, esito atteso)
  - Executive Summary con KPI bancari (DSCR, LTV, NOI, rata/reddito)
  - Bilanci ultimi 3 anni (Conto Economico + Stato Patrimoniale)
  - Trend DSCR e LTV (calcolato per anno)
  - Una pagina per ogni immobile in portafoglio (anagrafica + economici + mutuo collegato)
  - Tabella covenant proposti dall'AI
  - Documenti richiesti dalla banca
  - Note credit officer
"""
import io
import logging
from datetime import datetime, timezone, date
from fastapi import APIRouter, Depends, HTTPException, Response

logger = logging.getLogger(__name__)


def _fmt_eur(v):
    try:
        return f"€ {float(v):,.0f}".replace(",", ".")
    except Exception:
        return "€ —"


def _fmt_pct(v, decimals=1):
    try:
        return f"{float(v):.{decimals}f}%"
    except Exception:
        return "—"


def _fmt_num(v, decimals=2):
    try:
        return f"{float(v):.{decimals}f}"
    except Exception:
        return "—"


def make_banker_pack_v2_router(db, current_user):
    router = APIRouter(prefix="/api/banker-pack")

    @router.post("/v2/from-simulation/{sim_id}")
    async def from_simulation(sim_id: str, user: dict = Depends(current_user)):
        sim = await db.mortgage_simulations.find_one({"id": sim_id, "user_id": user["id"]}, {"_id": 0, "user_id": 0})
        if not sim:
            raise HTTPException(404, "Simulazione non trovata")

        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import cm
            from reportlab.lib.colors import HexColor
            from reportlab.platypus import (
                SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether,
            )
            from reportlab.lib import colors
            from reportlab.lib.enums import TA_LEFT
        except ImportError as e:
            raise HTTPException(500, f"reportlab non installato: {e}")

        # ── Carica TUTTI i dati necessari ─────────────────────────────────
        settings = await db.settings.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
        props = await db.properties.find(
            {"user_id": user["id"], "stato": {"$ne": "venduto"}}, {"_id": 0}
        ).to_list(500)
        mutui = await db.mutui.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
        bilanci = await db.bilanci.find({"user_id": user["id"]}, {"_id": 0}).sort("periodo", -1).to_list(3)
        bilanci = list(reversed(bilanci))  # cronologico

        inp = sim.get("input", {})
        kpi = sim.get("kpi", {})
        ai = sim.get("ai", {})
        snap = sim.get("portfolio_snapshot", {})

        nome_soc = settings.get("nome_societa", "Real Estate Holding")
        today_label = date.today().strftime("%d %B %Y")
        score = ai.get("punteggio_fattibilita") or kpi.get("score_deterministico") or 0
        semaforo = ai.get("semaforo") or kpi.get("semaforo") or "giallo"

        # Colori semaforo
        SEM_COLOR = {
            "verde":  {"fill": "#ECFDF5", "border": "#A7F3D0", "text": "#065F46", "strong": "#059669"},
            "giallo": {"fill": "#FFFBEB", "border": "#FDE68A", "text": "#92400E", "strong": "#B45309"},
            "rosso":  {"fill": "#FEF2F2", "border": "#FECACA", "text": "#991B1B", "strong": "#DC2626"},
        }.get(semaforo, {"fill": "#F8FAFC", "border": "#E2E8F0", "text": "#475569", "strong": "#0F172A"})

        # ── PDF setup ─────────────────────────────────────────────────────
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=A4,
            rightMargin=1.8 * cm, leftMargin=1.8 * cm,
            topMargin=1.5 * cm, bottomMargin=1.5 * cm,
            title=f"Banker Pack v2 — {nome_soc}",
        )
        styles = getSampleStyleSheet()
        h1 = ParagraphStyle("h1", parent=styles["Title"], fontSize=22, leading=26, textColor=HexColor("#0F172A"), spaceAfter=6, alignment=TA_LEFT)
        h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=14, leading=18, textColor=HexColor("#0066FF"), spaceBefore=14, spaceAfter=6)
        h3 = ParagraphStyle("h3", parent=styles["Heading3"], fontSize=11, leading=15, textColor=HexColor("#1E293B"), spaceBefore=8, spaceAfter=4)
        sub = ParagraphStyle("sub", parent=styles["Normal"], fontSize=10, textColor=HexColor("#475569"))
        body = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, leading=13, textColor=HexColor("#0F172A"))
        body_just = ParagraphStyle("bodyj", parent=body, alignment=4)  # JUSTIFY
        small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=HexColor("#64748B"))
        score_text = ParagraphStyle("score", parent=styles["Normal"], fontSize=48, leading=52, textColor=HexColor(SEM_COLOR["strong"]), alignment=1)
        score_sub = ParagraphStyle("scoresub", parent=styles["Normal"], fontSize=10, leading=14, textColor=HexColor(SEM_COLOR["text"]), alignment=1)

        story = []

        ESITO_LABEL = {
            "approvabile_standard": "Approvabile in iter standard",
            "approvabile_con_garanzie": "Approvabile con garanzie aggiuntive",
            "rinegoziabile": "Rinegoziabile con modifiche",
            "rifiuto_probabile": "Rifiuto probabile",
        }

        # ═══════════════════════════════════════════════════════════════════
        # COVER
        # ═══════════════════════════════════════════════════════════════════
        story.append(Paragraph("BANKER PACK v2", h1))
        story.append(Paragraph("Credit Dossier · Fattibilità Mutuo", ParagraphStyle("dossiersub", parent=h1, fontSize=12, textColor=HexColor("#2563EB"))))
        story.append(Spacer(1, 0.4 * cm))
        story.append(Paragraph(f"<b>{nome_soc}</b>", body))
        story.append(Paragraph(f"Documento riservato per istituto di credito · Generato il {today_label}", sub))
        if inp.get("banca_target"):
            story.append(Paragraph(f"Destinatario: <b>{inp.get('banca_target')}</b>", sub))
        story.append(Spacer(1, 1 * cm))

        # Verdict box
        verdict_inner = [
            [Paragraph(f"<b>{score}</b>", score_text), Paragraph("<b>VERDICT AI BANKER</b>", h3)],
            [Paragraph("/ 100", score_sub), Paragraph(f"Esito atteso: <b>{ESITO_LABEL.get(ai.get('esito_atteso'), ai.get('esito_atteso',''))}</b>", body)],
            ["", Paragraph(f"{ai.get('giudizio_sintetico','')}", body_just)],
        ]
        tv = Table(verdict_inner, colWidths=[5 * cm, 11 * cm])
        tv.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), HexColor(SEM_COLOR["fill"])),
            ("BOX", (0, 0), (-1, -1), 1.5, HexColor(SEM_COLOR["border"])),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("SPAN", (0, 0), (0, 1)),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING", (0, 0), (-1, -1), 14),
            ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ]))
        story.append(tv)

        story.append(Spacer(1, 0.6 * cm))

        # Richiesta
        story.append(Paragraph("Richiesta in oggetto", h2))
        req_data = [
            ["Importo richiesto", _fmt_eur(inp.get("importo"))],
            ["Durata", f"{inp.get('durata_anni')} anni"],
            ["Tasso", f"{inp.get('tasso_pct')}% {inp.get('tipo_tasso','').title()}"],
            ["Finalità", (inp.get("finalita", "") or "").replace("_", " ").title()],
        ]
        if inp.get("prezzo_immobile_target"):
            req_data.append(["Prezzo immobile target", _fmt_eur(inp.get("prezzo_immobile_target"))])
        if inp.get("canone_atteso_mensile"):
            req_data.append(["Canone atteso", f"{_fmt_eur(inp.get('canone_atteso_mensile'))}/mese"])
        if inp.get("tag"):
            req_data.append(["Tag operazione", inp.get("tag")])

        t = Table(req_data, colWidths=[7 * cm, 9 * cm])
        t.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TEXTCOLOR", (0, 0), (0, -1), HexColor("#475569")),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("BACKGROUND", (0, 0), (-1, -1), HexColor("#F8FAFC")),
            ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E2E8F0")),
            ("LINEBELOW", (0, 0), (-1, -2), 0.25, HexColor("#E2E8F0")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(t)

        story.append(PageBreak())

        # ═══════════════════════════════════════════════════════════════════
        # EXECUTIVE SUMMARY — KPI BANCARI
        # ═══════════════════════════════════════════════════════════════════
        story.append(Paragraph("Executive Summary — KPI Bancari", h2))

        kpi_table = [
            ["Indicatore", "Pre-richiesta", "Post-richiesta", "Soglia ABI/EBA"],
            ["DSCR (Debt Service Coverage Ratio)",
             _fmt_num(snap.get("dscr_attuale"), 2),
             _fmt_num(kpi.get("dscr_post"), 2),
             "≥ 1.20 · Buono ≥ 1.40"],
            ["LTV portfolio",
             _fmt_pct((snap.get("debito_residuo_totale", 0) / snap.get("valore_immobili", 1)) * 100 if snap.get("valore_immobili") else 0),
             _fmt_pct(kpi.get("ltv_portfolio_post_pct")),
             "≤ 80% · Conservativo 70%"],
            ["LTV immobile target",
             "—",
             _fmt_pct(kpi.get("ltv_immobile_pct")),
             "≤ 80%"],
            ["Rata mensile totale",
             _fmt_eur(snap.get("rata_mensile_attuale")),
             _fmt_eur(kpi.get("rata_mensile_post")),
             "≤ 33% ricavi"],
            ["Rata / ricavi mensili",
             _fmt_pct((snap.get("rata_mensile_attuale", 0) / snap.get("ricavi_mensili_attuali", 1)) * 100 if snap.get("ricavi_mensili_attuali") else 0),
             _fmt_pct(kpi.get("rata_su_reddito_pct")),
             "≤ 33%"],
            ["NOI annuo",
             _fmt_eur(snap.get("noi_annuo")),
             _fmt_eur(kpi.get("noi_post")),
             "—"],
            ["Cash flow mensile",
             _fmt_eur(snap.get("cashflow_mensile_attuale")),
             _fmt_eur(kpi.get("cashflow_mensile_post")),
             "> 0"],
            ["Debito totale",
             _fmt_eur(snap.get("debito_residuo_totale")),
             _fmt_eur(kpi.get("debito_post")),
             "—"],
            ["Liquidità (mesi rate)", "—", _fmt_num(kpi.get("mesi_liquidita_coperti"), 1), "≥ 6 mesi"],
            ["Cap rate immobile target", "—", _fmt_pct(kpi.get("cap_rate_target_pct")), "≥ 5%"],
        ]
        t = Table(kpi_table, colWidths=[5.5 * cm, 3.3 * cm, 3.3 * cm, 4 * cm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), HexColor("#0F172A")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, HexColor("#F8FAFC")]),
            ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E2E8F0")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor("#E2E8F0")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(t)

        story.append(Spacer(1, 0.4 * cm))

        # Analisi AI estesa
        story.append(Paragraph("Analisi banker-grade (AI Senior Credit Officer)", h3))
        analisi_md = (ai.get("analisi_dettagliata") or "").replace("\n\n", "<br/><br/>").replace("\n", "<br/>")
        # Bold markdown **xxx** → <b>xxx</b>
        import re
        analisi_md = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", analisi_md)
        story.append(Paragraph(analisi_md, body_just))

        # Punti forza + critici (2 colonne)
        if ai.get("punti_forza") or ai.get("punti_critici"):
            forza = "<br/>".join([f"• {p}" for p in (ai.get("punti_forza") or [])]) or "—"
            critici = "<br/>".join([f"• {p}" for p in (ai.get("punti_critici") or [])]) or "—"
            story.append(Spacer(1, 0.4 * cm))
            t = Table([
                [Paragraph("<b>Punti di forza</b>", h3), Paragraph("<b>Punti critici</b>", h3)],
                [Paragraph(forza, body), Paragraph(critici, body)],
            ], colWidths=[8 * cm, 8 * cm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, 0), HexColor("#ECFDF5")),
                ("BACKGROUND", (1, 0), (1, 0), HexColor("#FEF2F2")),
                ("BACKGROUND", (0, 1), (0, 1), HexColor("#F0FDF4")),
                ("BACKGROUND", (1, 1), (1, 1), HexColor("#FEF7F7")),
                ("BOX", (0, 0), (0, -1), 0.5, HexColor("#A7F3D0")),
                ("BOX", (1, 0), (1, -1), 0.5, HexColor("#FECACA")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(t)

        # ═══════════════════════════════════════════════════════════════════
        # BILANCI ULTIMI 3 ANNI
        # ═══════════════════════════════════════════════════════════════════
        if bilanci:
            story.append(PageBreak())
            story.append(Paragraph("Bilanci storici (ultimi 3 esercizi)", h2))

            # Conto Economico
            story.append(Paragraph("Conto Economico", h3))
            ce_rows = [["Voce"] + [b.get("periodo", "") for b in bilanci]]
            CE_KEYS = [
                ("ricavi_affitti", "Ricavi affitti"),
                ("ricavi_vendite", "Ricavi vendite immobili"),
                ("altri_ricavi", "Altri ricavi"),
                ("totale_ricavi", "TOTALE RICAVI"),
                ("costi_gestione", "Costi gestione"),
                ("costi_manutenzione", "Manutenzioni"),
                ("imu_imposte", "IMU e imposte"),
                ("interessi_mutui", "Interessi mutui"),
                ("totale_costi", "TOTALE COSTI"),
                ("utile_lordo", "Utile lordo"),
                ("imposte_societarie", "Imposte (IRES + IRAP)"),
                ("utile_netto", "UTILE NETTO"),
            ]
            for key, label in CE_KEYS:
                row = [label]
                for b in bilanci:
                    v = (b.get("conto_economico") or {}).get(key, 0)
                    row.append(_fmt_eur(v) if v else "—")
                ce_rows.append(row)

            col_widths = [6 * cm] + [3.3 * cm] * len(bilanci)
            t = Table(ce_rows, colWidths=col_widths, repeatRows=1)
            ce_style = [
                ("BACKGROUND", (0, 0), (-1, 0), HexColor("#0F172A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E2E8F0")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor("#E2E8F0")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]
            # Bold rows for totals
            for i, (k, _) in enumerate(CE_KEYS, start=1):
                if k in ("totale_ricavi", "totale_costi", "utile_netto"):
                    ce_style.append(("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"))
                    ce_style.append(("BACKGROUND", (0, i), (-1, i), HexColor("#F1F5F9")))
            t.setStyle(TableStyle(ce_style))
            story.append(t)
            story.append(Spacer(1, 0.4 * cm))

            # Stato Patrimoniale
            story.append(Paragraph("Stato Patrimoniale", h3))
            sp_rows = [["Voce"] + [b.get("periodo", "") for b in bilanci]]
            SP_KEYS = [
                ("valore_immobili", "Immobili (valore di carico)"),
                ("liquidita", "Liquidità e disponibilità"),
                ("crediti", "Crediti"),
                ("totale_attivo", "TOTALE ATTIVO"),
                ("debito_mutui", "Debito mutui"),
                ("altri_debiti", "Altri debiti"),
                ("totale_passivo", "TOTALE PASSIVO"),
                ("patrimonio_netto", "PATRIMONIO NETTO"),
            ]
            for key, label in SP_KEYS:
                row = [label]
                for b in bilanci:
                    v = (b.get("stato_patrimoniale") or {}).get(key, 0)
                    row.append(_fmt_eur(v) if v else "—")
                sp_rows.append(row)

            t = Table(sp_rows, colWidths=col_widths, repeatRows=1)
            sp_style = list(ce_style)
            for i, (k, _) in enumerate(SP_KEYS, start=1):
                if k in ("totale_attivo", "totale_passivo", "patrimonio_netto"):
                    sp_style.append(("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"))
                    sp_style.append(("BACKGROUND", (0, i), (-1, i), HexColor("#F1F5F9")))
            t.setStyle(TableStyle(sp_style))
            story.append(t)
            story.append(Spacer(1, 0.4 * cm))

            # ─── Trend DSCR e LTV (calcolati per anno) ─────────────────────
            story.append(Paragraph("Evoluzione indicatori bancari", h3))
            trend_rows = [["Indicatore"] + [b.get("periodo", "") for b in bilanci]]
            for label, kpi_fn in [
                ("LTV (Debito mutui / Valore immobili)", lambda b: (
                    (b.get("stato_patrimoniale") or {}).get("debito_mutui", 0) /
                    (b.get("stato_patrimoniale") or {}).get("valore_immobili", 1) * 100
                ) if (b.get("stato_patrimoniale") or {}).get("valore_immobili") else 0),
                ("Patrimonio netto / Totale attivo", lambda b: (
                    (b.get("stato_patrimoniale") or {}).get("patrimonio_netto", 0) /
                    (b.get("stato_patrimoniale") or {}).get("totale_attivo", 1) * 100
                ) if (b.get("stato_patrimoniale") or {}).get("totale_attivo") else 0),
                ("ROI portfolio (Utile netto / Patrimonio)", lambda b: (
                    (b.get("conto_economico") or {}).get("utile_netto", 0) /
                    (b.get("stato_patrimoniale") or {}).get("patrimonio_netto", 1) * 100
                ) if (b.get("stato_patrimoniale") or {}).get("patrimonio_netto") else 0),
                ("DSCR (Ricavi - Costi) / Interessi mutui", lambda b: (
                    ((b.get("conto_economico") or {}).get("totale_ricavi", 0) -
                     (b.get("conto_economico") or {}).get("totale_costi", 0) +
                     (b.get("conto_economico") or {}).get("interessi_mutui", 0)) /
                    max(1, (b.get("conto_economico") or {}).get("interessi_mutui", 1))
                )),
            ]:
                trend_row = [label]
                for b in bilanci:
                    v = kpi_fn(b)
                    if "DSCR" in label:
                        trend_row.append(_fmt_num(v, 2))
                    else:
                        trend_row.append(_fmt_pct(v))
                trend_rows.append(trend_row)
            t = Table(trend_rows, colWidths=col_widths, repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), HexColor("#1E40AF")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("BACKGROUND", (0, 1), (-1, -1), HexColor("#EFF6FF")),
                ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#BFDBFE")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor("#BFDBFE")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]))
            story.append(t)

        # ═══════════════════════════════════════════════════════════════════
        # COVENANT PROPOSTI
        # ═══════════════════════════════════════════════════════════════════
        if ai.get("covenant_attesi"):
            story.append(PageBreak())
            story.append(Paragraph("Covenant proposti / attesi", h2))
            story.append(Paragraph(
                "Vincoli contrattuali coerenti con il profilo di rischio e con le linee guida EBA/GL/2020/06 "
                "(Loan Origination and Monitoring) applicabili al portafoglio.",
                sub,
            ))
            cov_rows = [["#", "Covenant"]]
            for i, c in enumerate(ai.get("covenant_attesi") or [], start=1):
                cov_rows.append([str(i), Paragraph(c, body)])
            t = Table(cov_rows, colWidths=[1 * cm, 15 * cm], repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), HexColor("#0F172A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 10),
                ("FONTSIZE", (0, 1), (-1, -1), 10),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 1), (0, -1), "CENTER"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, HexColor("#F8FAFC")]),
                ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E2E8F0")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor("#E2E8F0")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(t)

        # Documenti richiesti
        if ai.get("documenti_richiesti"):
            story.append(Spacer(1, 0.4 * cm))
            story.append(Paragraph("Documenti richiesti dall'istituto", h3))
            doc_rows = [["#", "Documento"]]
            for i, d in enumerate(ai.get("documenti_richiesti") or [], start=1):
                doc_rows.append([str(i), Paragraph(d, body)])
            t = Table(doc_rows, colWidths=[1 * cm, 15 * cm], repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), HexColor("#7C3AED")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 1), (0, -1), "CENTER"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, HexColor("#FAF5FF")]),
                ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E9D5FF")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor("#E9D5FF")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(t)

        # ═══════════════════════════════════════════════════════════════════
        # PORTAFOGLIO — pagina riepilogo + 1 pagina per immobile
        # ═══════════════════════════════════════════════════════════════════
        if props:
            story.append(PageBreak())
            story.append(Paragraph("Portafoglio Immobiliare — Riepilogo", h2))
            tot_valore = sum(float(p.get("valore_stimato", 0) or 0) for p in props)
            tot_canone = sum(float(p.get("canone_mensile", 0) or 0) for p in props)
            tot_costo = sum(float(p.get("costo_totale", 0) or 0) for p in props)
            sum_rows = [
                ["Numero immobili", f"{len(props)}"],
                ["Valore di carico totale", _fmt_eur(tot_costo)],
                ["Valore stimato attuale", _fmt_eur(tot_valore)],
                ["Plusvalore latente", _fmt_eur(tot_valore - tot_costo)],
                ["Canone mensile aggregato", _fmt_eur(tot_canone)],
                ["Canone annuo aggregato", _fmt_eur(tot_canone * 12)],
                ["Rendimento lordo medio", _fmt_pct((tot_canone * 12 / tot_costo * 100) if tot_costo else 0)],
            ]
            t = Table(sum_rows, colWidths=[10 * cm, 6 * cm])
            t.setStyle(TableStyle([
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
                ("BACKGROUND", (0, 0), (-1, -1), HexColor("#F8FAFC")),
                ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E2E8F0")),
                ("LINEBELOW", (0, 0), (-1, -2), 0.25, HexColor("#E2E8F0")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(t)

            # Index dei mutui per immobile
            mutui_by_prop = {m.get("immobile_id"): m for m in mutui if m.get("immobile_id")}

            # 1 pagina per immobile (max 30)
            for p in props[:30]:
                story.append(PageBreak())
                story.append(Paragraph(f"Scheda Immobile: {p.get('nome','—')}", h2))
                story.append(Paragraph(
                    f"{p.get('indirizzo','—')} · {p.get('citta','—')} · {(p.get('stato','') or '').replace('_',' ').title()}",
                    sub,
                ))

                # Anagrafica
                story.append(Spacer(1, 0.2 * cm))
                story.append(Paragraph("Anagrafica catastale e tecnica", h3))
                anag_rows = [
                    ["Categoria catastale", p.get("categoria_catastale") or "—"],
                    ["Tipologia", p.get("tipologia") or "—"],
                    ["Superficie", f"{p.get('superficie','—')} mq"],
                    ["Numero locali", str(p.get("numero_locali", "—"))],
                    ["Piano", str(p.get("piano", "—"))],
                    ["Box/posto auto", p.get("box_posto_auto") or "—"],
                    ["Anno costruzione", str(p.get("anno_costruzione", "—"))],
                    ["Classe energetica", p.get("classe_energetica") or "—"],
                    ["Rendita catastale", _fmt_eur(p.get("rendita_catastale"))],
                ]
                t = Table(anag_rows, colWidths=[7 * cm, 9 * cm])
                t.setStyle(TableStyle([
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                    ("TEXTCOLOR", (0, 0), (0, -1), HexColor("#475569")),
                    ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
                    ("BACKGROUND", (0, 0), (-1, -1), HexColor("#FAFBFC")),
                    ("LINEBELOW", (0, 0), (-1, -2), 0.25, HexColor("#E2E8F0")),
                    ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E2E8F0")),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                ]))
                story.append(t)

                # Dati economici
                story.append(Spacer(1, 0.3 * cm))
                story.append(Paragraph("Dati economici", h3))
                econ_rows = [
                    ["Data acquisto", str(p.get("data_acquisto", "—"))[:10]],
                    ["Prezzo acquisto", _fmt_eur(p.get("prezzo_acquisto"))],
                    ["Costi accessori (notaio + agenzia + imposte)", _fmt_eur(
                        (p.get("notaio") or 0) + (p.get("agenzia") or 0) + (p.get("imposte_acquisto") or 0)
                    )],
                    ["Lavori sostenuti", _fmt_eur(p.get("lavori_sostenuti"))],
                    ["Costo totale investimento", _fmt_eur(p.get("costo_totale"))],
                    ["Valore stimato attuale", _fmt_eur(p.get("valore_stimato"))],
                    ["Canone mensile", _fmt_eur(p.get("canone_mensile"))],
                    ["Canone annuo", _fmt_eur((p.get("canone_mensile") or 0) * 12)],
                    ["Rendimento lordo", _fmt_pct(p.get("rendimento_lordo"))],
                    ["Rendimento netto", _fmt_pct(p.get("rendimento_netto"))],
                    ["Cash flow mensile", _fmt_eur(p.get("cash_flow_mensile"))],
                ]
                t = Table(econ_rows, colWidths=[7 * cm, 9 * cm])
                t.setStyle(TableStyle([
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                    ("TEXTCOLOR", (0, 0), (0, -1), HexColor("#475569")),
                    ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
                    ("BACKGROUND", (0, 0), (-1, -1), HexColor("#F0F9FF")),
                    ("LINEBELOW", (0, 0), (-1, -2), 0.25, HexColor("#BAE6FD")),
                    ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#7DD3FC")),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                ]))
                story.append(t)

                # Mutuo collegato
                mu = mutui_by_prop.get(p.get("id"))
                if mu:
                    story.append(Spacer(1, 0.3 * cm))
                    story.append(Paragraph("Mutuo collegato", h3))
                    mu_rows = [
                        ["Banca", mu.get("banca", "—")],
                        ["Importo originario", _fmt_eur(mu.get("importo_originario"))],
                        ["Capitale residuo", _fmt_eur(mu.get("capitale_residuo"))],
                        ["Tasso", f"{mu.get('tasso', '—')}% {(mu.get('tipo_tasso') or '').title()}"],
                        ["Rata mensile", _fmt_eur(mu.get("rata_mensile"))],
                        ["Inizio · Fine", f"{(mu.get('data_inizio') or '—')[:10]} · {(mu.get('data_fine') or '—')[:10]}"],
                    ]
                    t = Table(mu_rows, colWidths=[7 * cm, 9 * cm])
                    t.setStyle(TableStyle([
                        ("FONTSIZE", (0, 0), (-1, -1), 9),
                        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                        ("TEXTCOLOR", (0, 0), (0, -1), HexColor("#475569")),
                        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
                        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#FFFBEB")),
                        ("LINEBELOW", (0, 0), (-1, -2), 0.25, HexColor("#FDE68A")),
                        ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#F59E0B")),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ]))
                    story.append(t)

        # ═══════════════════════════════════════════════════════════════════
        # FOOTER
        # ═══════════════════════════════════════════════════════════════════
        story.append(Spacer(1, 1 * cm))
        story.append(Paragraph(
            f"Documento riservato e confidenziale · Real Estate Control Room · Generato il "
            f"{datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M')} UTC · Simulazione ID {sim.get('id')}. "
            "Dati estratti automaticamente dal sistema gestionale societario e dai bilanci ufficiali. "
            "Le previsioni e gli scenari sono basati sui parametri configurati dall'utente e su modelli AI "
            "(Claude Sonnet 4.6) — non costituiscono raccomandazione di credito né garanzia di risultato.",
            small,
        ))

        doc.build(story)
        pdf_bytes = buf.getvalue()
        buf.close()

        filename = f"banker-pack-v2-{sim.get('id','simulation')}-{date.today().isoformat()}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return router
