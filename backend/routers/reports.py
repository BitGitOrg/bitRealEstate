"""
Reports router — generates PDF/XLSX/CSV for the Control Room.
Split from server.py to keep the main file lean.
"""
import io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


def make_reports_router(db, current_user, enrich_property):
    router = APIRouter(prefix="/api/report")

    def _eur(n):
        try: n = float(n or 0)
        except Exception: n = 0.0
        return f"€ {n:,.0f}".replace(",", ".")

    def _doc_setup(title: str, subtitle: str = ""):
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.5*cm, rightMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm)
        styles = getSampleStyleSheet()
        h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=18, textColor=colors.HexColor("#0F172A"), spaceAfter=4)
        sub = ParagraphStyle("sub", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#64748B"), spaceAfter=14)
        h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=12, textColor=colors.HexColor("#0066FF"), spaceBefore=12, spaceAfter=6)
        body = ParagraphStyle("body", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#0F172A"))
        story = [Paragraph(title, h1), Paragraph(subtitle or f"Generato il {datetime.now().strftime('%d/%m/%Y %H:%M')}", sub)]
        return buf, doc, story, h2, body

    def _table(rows, col_widths, header_color="#0066FF"):
        t = Table(rows, colWidths=col_widths)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor(header_color)),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE", (0,0), (-1,-1), 8),
            ("GRID", (0,0), (-1,-1), 0.3, colors.HexColor("#E2E8F0")),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ]))
        return t

    async def _props(user):
        items = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
        return [enrich_property(p) for p in items]

    # ===== Builder per ogni report =====

    def build_patrimonio(props, bilancio):
        buf, doc, story, h2, body = _doc_setup("Report Patrimonio", f"Real Estate Control Room · Generato il {datetime.now().strftime('%d/%m/%Y')}")
        if bilancio:
            ce = bilancio.get("conto_economico", {}) or {}
            sp = bilancio.get("stato_patrimoniale", {}) or {}
            story.append(Paragraph(f"Snapshot da bilancio: {bilancio.get('periodo','')} ({bilancio.get('tipo','')})", h2))
            story.append(_table([
                ["Valore immobili", _eur(sp.get("valore_immobili"))],
                ["Debito mutui", _eur(sp.get("debito_mutui"))],
                ["Patrimonio netto", _eur(sp.get("patrimonio_netto"))],
                ["Utile netto", _eur(ce.get("utile_netto"))],
            ], [7*cm, 5*cm]))
        story.append(Paragraph(f"Elenco immobili ({len(props)})", h2))
        rows = [["Codice", "Nome", "Città", "Tipo", "m²", "Costo tot.", "Canone", "Stato"]]
        for p in props[:60]:
            rows.append([p.get("id","")[:14], p.get("nome","")[:30], p.get("citta",""), p.get("tipologia",""),
                str(int(p.get("metratura",0) or 0)), _eur(p.get("costo_totale", p.get("prezzo_acquisto",0))),
                _eur(p.get("canone_mensile",0)), p.get("stato","")])
        story.append(_table(rows, [2.4*cm, 4.5*cm, 2.5*cm, 2*cm, 1.2*cm, 2.5*cm, 2.2*cm, 2.3*cm]))
        doc.build(story); buf.seek(0); return buf.read()

    def build_bilancio(b):
        buf, doc, story, h2, body = _doc_setup("Bilancio", f"{b.get('periodo','')} · {b.get('tipo','')}")
        ce = b.get("conto_economico", {}) or {}
        sp = b.get("stato_patrimoniale", {}) or {}
        story.append(Paragraph("Conto Economico", h2))
        story.append(_table([
            ["Voce", "Importo"],
            ["Ricavi affitti", _eur(ce.get("ricavi_affitti"))],
            ["Ricavi vendite", _eur(ce.get("ricavi_vendite"))],
            ["Totale ricavi", _eur(ce.get("totale_ricavi"))],
            ["Costi gestione", _eur(ce.get("costi_gestione"))],
            ["IMU", _eur(ce.get("imu"))],
            ["Interessi mutui", _eur(ce.get("interessi_mutui"))],
            ["Totale costi", _eur(ce.get("totale_costi"))],
            ["Utile netto", _eur(ce.get("utile_netto"))],
        ], [8*cm, 4*cm]))
        story.append(Paragraph("Stato Patrimoniale", h2))
        story.append(_table([
            ["Voce", "Importo"],
            ["Valore immobili", _eur(sp.get("valore_immobili"))],
            ["Liquidità", _eur(sp.get("liquidita"))],
            ["Totale attivo", _eur(sp.get("totale_attivo"))],
            ["Debito mutui", _eur(sp.get("debito_mutui"))],
            ["Totale passivo", _eur(sp.get("totale_passivo"))],
            ["Patrimonio netto", _eur(sp.get("patrimonio_netto"))],
        ], [8*cm, 4*cm]))
        doc.build(story); buf.seek(0); return buf.read()

    def build_rendimento(props):
        buf, doc, story, h2, body = _doc_setup("Report Rendimento per Immobile", f"Ranking per rendimento netto · {datetime.now().strftime('%d/%m/%Y')}")
        ranked = sorted(props, key=lambda p: -(p.get("rendimento_netto", 0) or 0))
        media_netto = sum((p.get("rendimento_netto", 0) or 0) for p in props) / max(1, len(props))
        story.append(Paragraph(f"Media netta portafoglio: <b>{media_netto:.2f}%</b> · {len(props)} immobili", h2))
        rows = [["#", "Nome", "Città", "Costo tot.", "Canone", "Lordo %", "Netto %", "Score"]]
        for i, p in enumerate(ranked[:80], 1):
            rows.append([str(i), p.get("nome","")[:28], p.get("citta",""),
                _eur(p.get("costo_totale", p.get("prezzo_acquisto",0))), _eur(p.get("canone_mensile",0)),
                f"{p.get('rendimento_lordo',0):.2f}", f"{p.get('rendimento_netto',0):.2f}",
                str(int(p.get("portfolio_score",0) or 0))])
        story.append(_table(rows, [0.8*cm, 4.5*cm, 2.5*cm, 2.5*cm, 2*cm, 1.8*cm, 1.8*cm, 1.5*cm]))
        doc.build(story); buf.seek(0); return buf.read()

    def build_affitti(props):
        buf, doc, story, h2, body = _doc_setup("Report Affitti & Locazioni", f"Immobili a reddito · {datetime.now().strftime('%d/%m/%Y')}")
        with_canone = [p for p in props if (p.get("canone_mensile", 0) or 0) > 0]
        tot_mensile = sum(float(p.get("canone_mensile", 0) or 0) for p in with_canone)
        story.append(Paragraph(f"{len(with_canone)} immobili a reddito · Canone mensile totale: <b>{_eur(tot_mensile)}</b> · Annuo: <b>{_eur(tot_mensile*12)}</b>", h2))
        rows = [["Immobile", "Città", "m²", "Canone mese", "Canone anno", "Rend. netto", "Stato"]]
        for p in with_canone:
            canone = float(p.get("canone_mensile", 0) or 0)
            rows.append([p.get("nome","")[:30], p.get("citta",""), str(int(p.get("metratura",0) or 0)),
                _eur(canone), _eur(canone * 12), f"{p.get('rendimento_netto',0):.2f}%", p.get("stato","")])
        story.append(_table(rows, [4.5*cm, 2.5*cm, 1.2*cm, 2.3*cm, 2.3*cm, 2.2*cm, 2.5*cm]))
        doc.build(story); buf.seek(0); return buf.read()

    def build_vendite(props):
        buf, doc, story, h2, body = _doc_setup("Report Vendite & Rivendite", f"Operazioni di vendita · {datetime.now().strftime('%d/%m/%Y')}")
        in_vendita = [p for p in props if p.get("stato") == "in_vendita"]
        venduti = [p for p in props if p.get("stato") == "venduto"]
        story.append(Paragraph(f"<b>{len(in_vendita)}</b> in vendita · <b>{len(venduti)}</b> venduti", h2))
        if in_vendita:
            story.append(Paragraph("Attualmente in vendita", h2))
            rows = [["Immobile", "Città", "Costo tot.", "Valore stim.", "Margine atteso"]]
            for p in in_vendita:
                costo = float(p.get("costo_totale", p.get("prezzo_acquisto", 0)) or 0)
                val = float(p.get("valore_stimato", costo) or costo)
                rows.append([p.get("nome","")[:30], p.get("citta",""), _eur(costo), _eur(val), _eur(val - costo)])
            story.append(_table(rows, [5*cm, 3*cm, 3*cm, 3*cm, 3*cm]))
        if venduti:
            story.append(Paragraph("Operazioni concluse", h2))
            rows = [["Immobile", "Costo tot.", "Prezzo vendita", "Utile netto", "Stato"]]
            for p in venduti:
                costo = float(p.get("costo_totale", 0) or 0)
                pv = float(p.get("prezzo_vendita", p.get("valore_stimato", 0)) or 0)
                utile = pv - costo
                rows.append([p.get("nome","")[:30], _eur(costo), _eur(pv), _eur(utile), p.get("stato","")])
            story.append(_table(rows, [5*cm, 2.8*cm, 2.8*cm, 2.8*cm, 2.5*cm]))
        doc.build(story); buf.seek(0); return buf.read()

    def build_lavori(props):
        buf, doc, story, h2, body = _doc_setup("Report Lavori & Ristrutturazioni", f"Cantieri attivi · {datetime.now().strftime('%d/%m/%Y')}")
        in_lavori = [p for p in props if p.get("stato") == "in_ristrutturazione" or (p.get("lavori", 0) or 0) > 0]
        tot_budget = sum(float(p.get("lavori", 0) or 0) for p in in_lavori)
        story.append(Paragraph(f"{len(in_lavori)} immobili con lavori · Budget totale: <b>{_eur(tot_budget)}</b>", h2))
        rows = [["Immobile", "Città", "Stato", "Budget lavori", "Prezzo acq.", "% lavori/prezzo"]]
        for p in in_lavori:
            prezzo = float(p.get("prezzo_acquisto", 0) or 0)
            lavori = float(p.get("lavori", 0) or 0)
            pct = (lavori / prezzo * 100) if prezzo > 0 else 0
            rows.append([p.get("nome","")[:30], p.get("citta",""), p.get("stato",""),
                _eur(lavori), _eur(prezzo), f"{pct:.1f}%"])
        story.append(_table(rows, [4.5*cm, 2.5*cm, 3*cm, 2.5*cm, 2.5*cm, 2*cm]))
        doc.build(story); buf.seek(0); return buf.read()

    def build_mutui(props):
        buf, doc, story, h2, body = _doc_setup("Report Mutui & Finanziamenti", f"Esposizione debitoria · {datetime.now().strftime('%d/%m/%Y')}")
        with_mutuo = [p for p in props if p.get("mutuo")]
        tot_residuo = sum(float((p.get("mutuo") or {}).get("residuo", 0) or 0) for p in with_mutuo)
        tot_rata = sum(float((p.get("mutuo") or {}).get("rata", 0) or 0) for p in with_mutuo)
        tot_valore = sum(float(p.get("valore_stimato", p.get("prezzo_acquisto",0)) or 0) for p in props)
        ltv = (tot_residuo / tot_valore * 100) if tot_valore > 0 else 0
        story.append(Paragraph(f"Debito totale: <b>{_eur(tot_residuo)}</b> · Rata mensile: <b>{_eur(tot_rata)}</b> · LTV portafoglio: <b>{ltv:.1f}%</b>", h2))
        rows = [["Immobile", "Banca", "Tasso", "Capitale residuo", "Rata mensile"]]
        for p in with_mutuo:
            m = p.get("mutuo") or {}
            rows.append([p.get("nome","")[:30], m.get("banca","")[:20],
                f"{float(m.get('tasso',0) or 0):.2f}%", _eur(m.get("residuo")), _eur(m.get("rata"))])
        story.append(_table(rows, [4.5*cm, 3.5*cm, 1.8*cm, 3.5*cm, 3*cm]))
        doc.build(story); buf.seek(0); return buf.read()

    async def build_cashflow(user):
        cur = db.movimenti_bancari.aggregate([
            {"$match": {"user_id": user["id"], "data": {"$ne": ""}}},
            {"$addFields": {"ym": {"$substr": ["$data", 0, 7]}}},
            {"$group": {
                "_id": "$ym",
                "incassi": {"$sum": {"$cond": [{"$gt": ["$importo", 0]}, "$importo", 0]}},
                "uscite":  {"$sum": {"$cond": [{"$lt": ["$importo", 0]}, {"$abs": "$importo"}, 0]}},
            }},
            {"$sort": {"_id": 1}},
            {"$limit": 24},
        ])
        rows_agg = await cur.to_list(24)
        buf, doc, story, h2, body = _doc_setup("Report Cash Flow", f"Andamento mensile · {datetime.now().strftime('%d/%m/%Y')}")
        if not rows_agg:
            story.append(Paragraph("Nessun movimento bancario importato. Carica un estratto conto dal Centro Import.", h2))
        else:
            tot_in = sum(r["incassi"] for r in rows_agg)
            tot_out = sum(r["uscite"] for r in rows_agg)
            story.append(Paragraph(f"{len(rows_agg)} mesi · Incassi: <b>{_eur(tot_in)}</b> · Uscite: <b>{_eur(tot_out)}</b> · Saldo: <b>{_eur(tot_in - tot_out)}</b>", h2))
            table_rows = [["Mese", "Incassi", "Uscite", "Saldo netto"]]
            for r in rows_agg:
                saldo = r["incassi"] - r["uscite"]
                table_rows.append([r["_id"], _eur(r["incassi"]), _eur(r["uscite"]), _eur(saldo)])
            story.append(_table(table_rows, [3*cm, 3.5*cm, 3.5*cm, 3.5*cm]))
        doc.build(story); buf.seek(0); return buf.read()

    # ===== Endpoint =====
    @router.get("/{report_id}.{fmt}")
    async def download_report(report_id: str, fmt: str, user: dict = Depends(current_user)):
        if fmt not in ("pdf", "csv", "xlsx"):
            raise HTTPException(status_code=400, detail="Formato non supportato")
        props = await _props(user)
        latest_bil = await db.bilanci.find_one({"user_id": user["id"]}, {"_id": 0}, sort=[("created_at", -1)])

        # PDF reports
        if fmt == "pdf":
            try:
                if report_id == "patrimonio":   blob = build_patrimonio(props, latest_bil)
                elif report_id == "bilancio":
                    if not latest_bil: raise HTTPException(status_code=404, detail="Nessun bilancio caricato. Importalo dal Centro Import.")
                    blob = build_bilancio(latest_bil)
                elif report_id == "rendimento": blob = build_rendimento(props)
                elif report_id == "affitti":    blob = build_affitti(props)
                elif report_id == "vendite":    blob = build_vendite(props)
                elif report_id == "lavori":     blob = build_lavori(props)
                elif report_id == "mutui":      blob = build_mutui(props)
                elif report_id == "cashflow":   blob = await build_cashflow(user)
                else: raise HTTPException(status_code=404, detail=f"Report '{report_id}' non disponibile")
            except HTTPException: raise
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Errore generazione PDF: {str(e)}")
            return StreamingResponse(io.BytesIO(blob), media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{report_id}.pdf"'})

        # XLSX / CSV (basic for patrimonio + rendimento)
        if report_id in ("patrimonio", "rendimento"):
            if fmt == "csv":
                import csv
                out = io.StringIO()
                w = csv.writer(out)
                w.writerow(["Codice","Nome","Citta","Tipo","Prezzo","Canone","Rend.lordo","Rend.netto","Stato"])
                for p in props:
                    w.writerow([p.get("id",""), p.get("nome",""), p.get("citta",""), p.get("tipologia",""),
                        p.get("prezzo_acquisto",0), p.get("canone_mensile",0),
                        p.get("rendimento_lordo",0), p.get("rendimento_netto",0), p.get("stato","")])
                return StreamingResponse(io.BytesIO(out.getvalue().encode("utf-8")), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{report_id}.csv"'})
            if fmt == "xlsx":
                import xlsxwriter
                buf = io.BytesIO()
                wb = xlsxwriter.Workbook(buf, {"in_memory": True})
                ws = wb.add_worksheet(report_id.title())
                h = wb.add_format({"bold": True, "bg_color": "#0066FF", "font_color": "white", "border": 1, "align": "center"})
                money = wb.add_format({"num_format": '#,##0 "€"'})
                cols = ["Codice","Nome","Indirizzo","Città","Tipo","m²","Prezzo","Costo totale","Canone","Rend. netto","Stato"]
                for i, c in enumerate(cols):
                    ws.write(0, i, c, h)
                    ws.set_column(i, i, max(12, len(c) + 2))
                for r, p in enumerate(props, 1):
                    ws.write(r, 0, p.get("id",""))
                    ws.write(r, 1, p.get("nome",""))
                    ws.write(r, 2, p.get("indirizzo",""))
                    ws.write(r, 3, p.get("citta",""))
                    ws.write(r, 4, p.get("tipologia",""))
                    ws.write(r, 5, float(p.get("metratura",0) or 0))
                    ws.write(r, 6, float(p.get("prezzo_acquisto",0) or 0), money)
                    ws.write(r, 7, float(p.get("costo_totale", p.get("prezzo_acquisto",0)) or 0), money)
                    ws.write(r, 8, float(p.get("canone_mensile",0) or 0), money)
                    ws.write(r, 9, float(p.get("rendimento_netto",0) or 0))
                    ws.write(r, 10, p.get("stato",""))
                ws.freeze_panes(1, 0)
                wb.close(); buf.seek(0)
                return StreamingResponse(io.BytesIO(buf.read()),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{report_id}.xlsx"'})

        raise HTTPException(status_code=400, detail=f"Formato {fmt} non disponibile per il report '{report_id}' (PDF disponibile)")

    return router
