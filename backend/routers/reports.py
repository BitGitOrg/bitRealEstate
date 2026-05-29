"""
Reports router — 2 comprehensive PDFs with branded chrome (header + logo + page footer).
The header uses the company logo + name from Impostazioni when present.
"""
import io
import base64
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

from routers._shared import enrich_property
from routers.settings import get_user_settings


def make_reports_router(db, current_user):
    router = APIRouter(prefix="/api/report")

    def _eur(n):
        try:
            n = float(n or 0)
        except Exception:
            n = 0.0
        return f"€ {n:,.0f}".replace(",", ".")

    def _pct(n):
        try:
            return f"{float(n or 0):.2f}%"
        except Exception:
            return "—"

    def _decode_logo(b64: str):
        if not b64:
            return None
        try:
            data = base64.b64decode(b64)
            return ImageReader(io.BytesIO(data))
        except Exception:
            return None

    def _chrome_factory(title: str, brand_name: str, logo_reader):
        """Returns the onPage callback that draws header + footer."""
        def _chrome(canvas, doc):
            canvas.saveState()
            # Header band
            band_h = 1.4 * cm
            y0 = A4[1] - band_h
            canvas.setFillColor(colors.HexColor("#0066FF"))
            canvas.rect(0, y0, A4[0], band_h, fill=1, stroke=0)
            # Logo (left), if present — drawn inside the band, height ~1cm
            x_text = 1.5 * cm
            if logo_reader is not None:
                try:
                    iw, ih = logo_reader.getSize()
                    target_h = 0.95 * cm
                    target_w = target_h * (iw / max(1, ih))
                    target_w = min(target_w, 5 * cm)
                    canvas.drawImage(
                        logo_reader,
                        1.0 * cm, y0 + (band_h - target_h) / 2,
                        width=target_w, height=target_h,
                        mask='auto', preserveAspectRatio=True,
                    )
                    x_text = 1.0 * cm + target_w + 0.4 * cm
                except Exception:
                    pass
            # Brand text
            canvas.setFillColor(colors.white)
            canvas.setFont("Helvetica-Bold", 11)
            canvas.drawString(x_text, y0 + band_h / 2 - 1, brand_name.upper()[:60])
            canvas.setFont("Helvetica", 9)
            canvas.drawRightString(A4[0] - 1.5 * cm, y0 + band_h / 2 - 1, title)

            # Footer
            canvas.setFillColor(colors.HexColor("#64748B"))
            canvas.setFont("Helvetica", 8)
            canvas.drawString(1.5 * cm, 0.8 * cm, f"Generato il {datetime.now().strftime('%d/%m/%Y %H:%M')}")
            canvas.drawCentredString(A4[0] / 2, 0.8 * cm, brand_name)
            canvas.drawRightString(A4[0] - 1.5 * cm, 0.8 * cm, f"Pagina {doc.page}")
            canvas.setStrokeColor(colors.HexColor("#E2E8F0"))
            canvas.setLineWidth(0.4)
            canvas.line(1.5 * cm, 1.1 * cm, A4[0] - 1.5 * cm, 1.1 * cm)
            canvas.restoreState()

        return _chrome

    def _setup(title: str, brand_name: str, logo_reader):
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=A4,
            leftMargin=1.5 * cm, rightMargin=1.5 * cm,
            topMargin=2.3 * cm, bottomMargin=1.8 * cm,
        )
        styles = getSampleStyleSheet()
        h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=20, textColor=colors.HexColor("#0F172A"), spaceAfter=4)
        sub = ParagraphStyle("sub", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#64748B"), spaceAfter=14)
        h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=13, textColor=colors.HexColor("#0066FF"), spaceBefore=14, spaceAfter=8)
        body = ParagraphStyle("body", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#0F172A"), leading=13)
        cb = _chrome_factory(title, brand_name, logo_reader)
        return buf, doc, [], h1, h2, sub, body, cb

    def _table(rows, col_widths, header_color="#0066FF", highlight_last=False):
        t = Table(rows, colWidths=col_widths)
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(header_color)),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]
        if highlight_last:
            style.append(("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F1F5F9")))
            style.append(("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"))
        t.setStyle(TableStyle(style))
        return t

    async def _gather(user):
        props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        props = [enrich_property(p) for p in props]
        latest_bil = await db.bilanci.find_one({"user_id": user["id"]}, {"_id": 0}, sort=[("created_at", -1)])
        bilanci_all = await db.bilanci.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(12)
        settings = await get_user_settings(db, user["id"])
        return props, latest_bil, bilanci_all, settings

    # ============================================================
    # REPORT 1: STATO DI SALUTE DELLA SOCIETÀ
    # ============================================================
    def build_stato_salute(props, latest_bil, bilanci_all, settings):
        brand = settings.get("nome_societa") or "Real Estate Control Room"
        logo_reader = _decode_logo(settings.get("logo_base64"))
        buf, doc, story, h1, h2, sub, body, cb = _setup("Stato di salute · Società", brand, logo_reader)
        story.append(Paragraph("Stato di Salute della Società", h1))
        period_str = latest_bil.get("periodo", "—") if latest_bil else "Nessun bilancio importato"
        story.append(Paragraph(f"Snapshot al {datetime.now().strftime('%d/%m/%Y')} · Bilancio di riferimento: <b>{period_str}</b>", sub))

        # 1. Sintesi KPI principali
        story.append(Paragraph("1 · Sintesi KPI", h2))
        n_props = len(props)
        a_reddito = [p for p in props if (p.get("canone_mensile", 0) or 0) > 0]
        sfitti = [p for p in props if p.get("stato") == "sfitto"]
        in_vendita = [p for p in props if p.get("stato") == "in_vendita"]
        in_lavori = [p for p in props if p.get("stato") == "in_ristrutturazione"]
        tot_canone_mese = sum(float(p.get("canone_mensile", 0) or 0) for p in props)
        tot_costo = sum(float(p.get("costo_totale", p.get("prezzo_acquisto", 0)) or 0) for p in props)
        tot_valore = sum(float(p.get("valore_stimato", p.get("prezzo_acquisto", 0)) or 0) for p in props)
        tot_debito = sum(float((p.get("mutuo") or {}).get("residuo", 0) or 0) for p in props)
        tot_rata = sum(float((p.get("mutuo") or {}).get("rata", 0) or 0) for p in props)
        rend_medio = sum((p.get("rendimento_netto", 0) or 0) for p in a_reddito) / max(1, len(a_reddito))
        ltv = (tot_debito / tot_valore * 100) if tot_valore > 0 else 0

        ce = (latest_bil or {}).get("conto_economico", {}) or {}
        sp = (latest_bil or {}).get("stato_patrimoniale", {}) or {}

        story.append(_table([
            ["Indicatore", "Valore"],
            ["Numero immobili", str(n_props)],
            ["Di cui a reddito", f"{len(a_reddito)} ({len(a_reddito)*100//max(1,n_props)}%)"],
            ["Sfitti", str(len(sfitti))],
            ["In vendita / In ristrutturazione", f"{len(in_vendita)} / {len(in_lavori)}"],
            ["Valore patrimonio stimato", _eur(sp.get("valore_immobili") or tot_valore)],
            ["Costo totale investito", _eur(tot_costo)],
            ["Canone mensile complessivo", _eur(tot_canone_mese)],
            ["Canone annuo complessivo", _eur(tot_canone_mese * 12)],
            ["Rendimento netto medio (a reddito)", _pct(rend_medio)],
            ["Debito residuo totale", _eur(sp.get("debito_mutui") or tot_debito)],
            ["Rata mutui mensile", _eur(tot_rata)],
            ["Loan-to-Value (LTV)", _pct(ltv)],
            ["Patrimonio netto", _eur(sp.get("patrimonio_netto") or (tot_valore - tot_debito))],
        ], [9 * cm, 4.5 * cm]))

        # 2. Conto economico
        if latest_bil:
            story.append(Paragraph(f"2 · Conto Economico ({period_str})", h2))
            story.append(_table([
                ["Voce", "Importo"],
                ["Ricavi affitti", _eur(ce.get("ricavi_affitti"))],
                ["Ricavi vendite", _eur(ce.get("ricavi_vendite"))],
                ["Totale ricavi", _eur(ce.get("totale_ricavi"))],
                ["Costi di gestione", _eur(ce.get("costi_gestione"))],
                ["Manutenzione", _eur(ce.get("costi_manutenzione"))],
                ["IMU", _eur(ce.get("imu"))],
                ["Interessi mutui", _eur(ce.get("interessi_mutui"))],
                ["Ammortamenti", _eur(ce.get("ammortamenti"))],
                ["Totale costi", _eur(ce.get("totale_costi"))],
                ["UTILE NETTO", _eur(ce.get("utile_netto"))],
            ], [9 * cm, 4.5 * cm], highlight_last=True))

        # 3. Top / Worst
        story.append(PageBreak())
        story.append(Paragraph("3 · Migliori e peggiori per rendimento netto", h2))
        ranked = sorted(a_reddito, key=lambda p: -(p.get("rendimento_netto", 0) or 0))
        top = ranked[:5]
        worst = ranked[-5:] if len(ranked) > 5 else []
        if top:
            story.append(Paragraph("<b>Top 5</b>", body))
            rows = [["Nome", "Città", "Canone", "Rend.netto", "Score"]]
            for p in top:
                rows.append([p.get("nome", "")[:28], p.get("citta", ""), _eur(p.get("canone_mensile")), _pct(p.get("rendimento_netto")), str(int(p.get("portfolio_score", 0) or 0))])
            story.append(_table(rows, [5 * cm, 3 * cm, 2.5 * cm, 2.5 * cm, 1.5 * cm], header_color="#059669"))
        if worst:
            story.append(Spacer(1, 0.3 * cm))
            story.append(Paragraph("<b>Da monitorare</b>", body))
            rows = [["Nome", "Città", "Canone", "Rend.netto", "Score"]]
            for p in worst:
                rows.append([p.get("nome", "")[:28], p.get("citta", ""), _eur(p.get("canone_mensile")), _pct(p.get("rendimento_netto")), str(int(p.get("portfolio_score", 0) or 0))])
            story.append(_table(rows, [5 * cm, 3 * cm, 2.5 * cm, 2.5 * cm, 1.5 * cm], header_color="#DC2626"))

        # 4. Anomalie & Alert
        story.append(Paragraph("4 · Punti di attenzione", h2))
        alerts = []
        if rend_medio < 4 and a_reddito:
            alerts.append(f"Rendimento medio netto {_pct(rend_medio)} sotto soglia 4%.")
        if ltv > 70:
            alerts.append(f"LTV portafoglio {_pct(ltv)} elevato (sopra 70%).")
        if sfitti:
            alerts.append(f"{len(sfitti)} immobili sfitti: opportunità di riposizionamento o vendita.")
        for p in props:
            r = (p.get("mutuo") or {}).get("rata", 0)
            c = p.get("canone_mensile", 0)
            if c > 0 and r > c:
                alerts.append(f"{p.get('nome','')}: rata mutuo {_eur(r)} > canone {_eur(c)}.")
        if not alerts:
            alerts.append("Nessuna anomalia rilevante. Il portafoglio è in equilibrio.")
        for a in alerts[:10]:
            story.append(Paragraph(f"• {a}", body))

        # 5. Storico bilanci sintetico
        if len(bilanci_all) > 1:
            story.append(Paragraph("5 · Storico bilanci recenti", h2))
            rows = [["Periodo", "Tipo", "Ricavi", "Costi", "Utile netto", "Patrimonio netto"]]
            for b in bilanci_all[:6]:
                bc = b.get("conto_economico", {}) or {}
                bs = b.get("stato_patrimoniale", {}) or {}
                rows.append([b.get("periodo", ""), b.get("tipo", ""),
                             _eur(bc.get("totale_ricavi")), _eur(bc.get("totale_costi")),
                             _eur(bc.get("utile_netto")), _eur(bs.get("patrimonio_netto"))])
            story.append(_table(rows, [3 * cm, 2 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm, 3 * cm]))

        doc.build(story, onFirstPage=cb, onLaterPages=cb)
        buf.seek(0)
        return buf.read()

    # ============================================================
    # REPORT 2: BUSINESS PLAN (per le banche)
    # ============================================================
    def build_business_plan(props, latest_bil, bilanci_all, settings):
        brand = settings.get("nome_societa") or "Real Estate Control Room"
        logo_reader = _decode_logo(settings.get("logo_base64"))
        buf, doc, story, h1, h2, sub, body, cb = _setup("Business Plan · Per Istituti di Credito", brand, logo_reader)
        story.append(Paragraph("Business Plan Immobiliare", h1))
        story.append(Paragraph(f"Documento destinato a istituti di credito · Snapshot al {datetime.now().strftime('%d/%m/%Y')}", sub))

        # 1. Profilo società
        story.append(Paragraph("1 · Profilo della società", h2))
        story.append(Paragraph(
            f"<b>{brand}</b> è una società immobiliare orientata alla gestione di un portafoglio "
            "diversificato di immobili a reddito e operazioni di compravendita. Il presente Business Plan "
            "fornisce una rappresentazione patrimoniale, economica e finanziaria a supporto di valutazioni "
            "di affidamento e/o linee di credito.", body))

        # 2. Patrimonio attuale
        story.append(Paragraph("2 · Patrimonio attuale", h2))
        a_reddito = [p for p in props if (p.get("canone_mensile", 0) or 0) > 0]
        tot_valore = sum(float(p.get("valore_stimato", p.get("prezzo_acquisto", 0)) or 0) for p in props)
        tot_debito = sum(float((p.get("mutuo") or {}).get("residuo", 0) or 0) for p in props)
        tot_canone_anno = sum(float(p.get("canone_mensile", 0) or 0) for p in props) * 12
        sp = (latest_bil or {}).get("stato_patrimoniale", {}) or {}
        ce = (latest_bil or {}).get("conto_economico", {}) or {}
        valore_patrimonio = sp.get("valore_immobili") or tot_valore
        debito = sp.get("debito_mutui") or tot_debito
        pn = sp.get("patrimonio_netto") or (valore_patrimonio - debito)
        ltv = (debito / valore_patrimonio * 100) if valore_patrimonio > 0 else 0

        story.append(_table([
            ["Indicatore patrimoniale", "Valore"],
            ["Numero immobili", str(len(props))],
            ["Valore di mercato stimato", _eur(valore_patrimonio)],
            ["Debito finanziario in essere", _eur(debito)],
            ["Patrimonio netto", _eur(pn)],
            ["Loan-to-Value (LTV)", _pct(ltv)],
            ["Canone annuo a regime", _eur(tot_canone_anno)],
            ["Immobili a reddito", f"{len(a_reddito)} su {len(props)}"],
        ], [9 * cm, 4.5 * cm], highlight_last=False))

        # 3. Dati economici
        if latest_bil:
            story.append(Paragraph(f"3 · Dati economici ({latest_bil.get('periodo','')})", h2))
            ebitda = (ce.get("totale_ricavi", 0) or 0) - (ce.get("costi_gestione", 0) or 0) - (ce.get("costi_manutenzione", 0) or 0) - (ce.get("imu", 0) or 0)
            story.append(_table([
                ["Voce", "Importo"],
                ["Ricavi totali", _eur(ce.get("totale_ricavi"))],
                ["Costi totali", _eur(ce.get("totale_costi"))],
                ["Oneri finanziari", _eur(ce.get("interessi_mutui"))],
                ["Utile netto", _eur(ce.get("utile_netto"))],
                ["EBITDA stimato", _eur(ebitda)],
            ], [9 * cm, 4.5 * cm], highlight_last=True))

        # 4. Struttura del debito
        story.append(PageBreak())
        story.append(Paragraph("4 · Struttura del debito in essere", h2))
        with_mutuo = [p for p in props if p.get("mutuo")]
        if with_mutuo:
            tot_rata = sum(float((p.get("mutuo") or {}).get("rata", 0) or 0) for p in with_mutuo)
            story.append(Paragraph(f"Rata complessiva mensile: <b>{_eur(tot_rata)}</b> · {len(with_mutuo)} finanziamenti attivi", body))
            rows = [["Immobile", "Banca", "Tasso", "Capitale residuo", "Rata mensile"]]
            for p in with_mutuo:
                m = p.get("mutuo") or {}
                rows.append([p.get("nome", "")[:28], (m.get("banca", "") or "")[:18], _pct(m.get("tasso")), _eur(m.get("residuo")), _eur(m.get("rata"))])
            story.append(_table(rows, [4.5 * cm, 3 * cm, 1.8 * cm, 3.2 * cm, 3 * cm]))
        else:
            story.append(Paragraph("Nessun finanziamento bancario attualmente in essere.", body))

        # 5. Piano di crescita / Fabbisogno finanziario
        story.append(Paragraph("5 · Piano di sviluppo · scenari", h2))
        canone_medio = (tot_canone_anno / 12 / max(1, len(a_reddito))) if a_reddito else 1100
        costo_medio = (sum(float(p.get("costo_totale", 0) or 0) for p in a_reddito) / max(1, len(a_reddito))) if a_reddito else 200000
        for n in [2, 5, 10]:
            cap_richiesto = n * costo_medio * 0.3
            mutuo_necessario = n * costo_medio * 0.7
            ricavo_aggiuntivo = n * canone_medio * 12
            story.append(Paragraph(
                f"<b>Scenario +{n} immobili/anno</b>: capitale proprio richiesto <b>{_eur(cap_richiesto)}</b>, "
                f"linea mutui necessaria <b>{_eur(mutuo_necessario)}</b>, ricavo annuo aggiuntivo atteso <b>{_eur(ricavo_aggiuntivo)}</b>.",
                body))
            story.append(Spacer(1, 0.15 * cm))

        # 6. Indici di solidità
        story.append(Paragraph("6 · Indici di solidità e affidabilità", h2))
        copertura = (ce.get("utile_netto", 0) or 0) / max(1, ce.get("interessi_mutui", 1) or 1)
        rend_medio = sum((p.get('rendimento_netto', 0) or 0) for p in a_reddito) / max(1, len(a_reddito))
        story.append(_table([
            ["Indice", "Valore", "Soglia attesa"],
            ["LTV (Loan-to-Value)", _pct(ltv), "< 70%"],
            ["Copertura interessi (utile / oneri fin.)", f"{copertura:.2f}x", "> 1,5x"],
            ["Patrimonio netto / Debito", f"{(pn/debito):.2f}x" if debito > 0 else "n/a", "> 1,0x"],
            ["Rendimento netto medio portafoglio", _pct(rend_medio), "> 4,5%"],
        ], [7.5 * cm, 3.5 * cm, 2.5 * cm]))

        # 7. Allegato: elenco immobili
        story.append(Paragraph("Allegato A · Elenco immobili", h2))
        rows = [["Codice", "Nome", "Città", "m²", "Valore", "Canone"]]
        for p in props[:60]:
            rows.append([p.get("id", "")[:14], p.get("nome", "")[:26], p.get("citta", ""),
                         str(int(p.get("metratura", 0) or 0)),
                         _eur(p.get("valore_stimato", p.get("prezzo_acquisto", 0))),
                         _eur(p.get("canone_mensile", 0))])
        story.append(_table(rows, [2.4 * cm, 4.5 * cm, 2.5 * cm, 1.2 * cm, 2.7 * cm, 2.5 * cm]))

        doc.build(story, onFirstPage=cb, onLaterPages=cb)
        buf.seek(0)
        return buf.read()

    # ===== Endpoint =====
    @router.get("/{report_id}.{fmt}")
    async def download_report(report_id: str, fmt: str, user: dict = Depends(current_user)):
        if fmt != "pdf":
            raise HTTPException(status_code=400, detail="Solo formato PDF disponibile per questi report")
        props, latest_bil, bilanci_all, settings = await _gather(user)
        try:
            if report_id == "stato-salute":
                blob = build_stato_salute(props, latest_bil, bilanci_all, settings)
                fname = "stato_salute_societa.pdf"
            elif report_id == "business-plan":
                blob = build_business_plan(props, latest_bil, bilanci_all, settings)
                fname = "business_plan.pdf"
            else:
                raise HTTPException(status_code=404, detail=f"Report '{report_id}' non disponibile")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Errore generazione: {str(e)}")
        return StreamingResponse(io.BytesIO(blob), media_type="application/pdf",
                                 headers={"Content-Disposition": f'attachment; filename="{fname}"'})

    return router
