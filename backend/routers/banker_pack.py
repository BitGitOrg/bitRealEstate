"""Banker Pack PDF generator.

Crea un PDF pronto per andare in banca con:
- Cover anagrafica società
- KPI snapshot (patrimonio, ricavi, cash flow, debito)
- Portafoglio immobili (tabella con foto, valore, canone, mutuo)
- Mutui in essere
- Cash flow ultimi 12 mesi (grafico)
- Proposta nuovo investimento (opzionale, da Simulatore)
"""
import io
import logging
from datetime import datetime, timezone, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel


class BankerPackRequest(BaseModel):
    nuova_operazione: Optional[dict] = None
    note: Optional[str] = ""


def _fmt_eur(v):
    try:
        return f"€ {float(v):,.0f}".replace(",", ".")
    except Exception:
        return "€ —"


def make_banker_pack_router(db, current_user):
    router = APIRouter(prefix="/api/banker-pack")

    @router.post("/generate")
    async def generate(payload: BankerPackRequest, user: dict = Depends(current_user)):
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import cm
            from reportlab.lib.colors import HexColor
            from reportlab.platypus import (
                SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
            )
            from reportlab.lib import colors
        except ImportError as e:
            raise HTTPException(500, f"reportlab non installato: {e}")

        # Carica TUTTI i dati necessari
        settings = await db.settings.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
        props = await db.properties.find({"user_id": user["id"], "stato": {"$ne": "venduto"}}, {"_id": 0}).to_list(500)
        mutui = await db.mutui.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
        # Aggrega manualmente per il PDF
        tot_valore = sum(float(p.get("valore_stimato", 0) or 0) for p in props)
        tot_costo = sum(float(p.get("costo_totale", 0) or 0) for p in props)
        canone_mensile_totale = sum(float(p.get("canone_mensile", 0) or 0) for p in props)
        debito_totale = sum(float(m.get("capitale_residuo", m.get("importo_originario", 0)) or 0) for m in mutui)
        rata_mensile_totale = sum(float(m.get("rata_mensile", 0) or 0) for m in mutui)
        patrimonio_netto = tot_valore - debito_totale
        ltv = (debito_totale / tot_valore * 100) if tot_valore > 0 else 0
        incidenza = (rata_mensile_totale / canone_mensile_totale * 100) if canone_mensile_totale > 0 else 0

        # Generazione PDF
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=1.8*cm, leftMargin=1.8*cm, topMargin=1.5*cm, bottomMargin=1.5*cm)
        styles = getSampleStyleSheet()
        # Stili custom
        h1 = ParagraphStyle("h1", parent=styles["Title"], fontSize=22, leading=26, textColor=HexColor("#0F172A"), spaceAfter=8)
        h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=14, leading=18, textColor=HexColor("#0066FF"), spaceBefore=14, spaceAfter=6)
        sub = ParagraphStyle("sub", parent=styles["Normal"], fontSize=10, textColor=HexColor("#475569"))
        body = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, leading=13, textColor=HexColor("#0F172A"))
        small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=HexColor("#64748B"))

        story = []
        nome_soc = settings.get("nome_societa", "Real Estate Holding")
        today = date.today().strftime("%d %B %Y")

        # === COVER ===
        story.append(Paragraph("BANKER PACK", h1))
        story.append(Paragraph(nome_soc, ParagraphStyle("soc", parent=h1, fontSize=14, textColor=HexColor("#2563EB"))))
        story.append(Paragraph(f"Documento per istituto di credito · Generato il {today}", sub))
        story.append(Spacer(1, 0.6*cm))

        # === EXECUTIVE SUMMARY ===
        story.append(Paragraph("Sintesi Esecutiva", h2))
        kpi_data = [
            ["Patrimonio immobiliare valore", _fmt_eur(tot_valore)],
            ["Capitale investito totale", _fmt_eur(tot_costo)],
            ["Patrimonio netto stimato", _fmt_eur(patrimonio_netto)],
            ["Ricavi mensili da locazione", _fmt_eur(canone_mensile_totale)],
            ["Debito residuo mutui", _fmt_eur(debito_totale)],
            ["Rata mensile totale", _fmt_eur(rata_mensile_totale)],
            ["Loan-to-Value (LTV)", f"{ltv:.1f}%"],
            ["Incidenza rata su affitti", f"{incidenza:.1f}%"],
            ["Numero immobili in portafoglio", f"{len(props)}"],
            ["Numero mutui attivi", f"{len(mutui)}"],
        ]
        t = Table(kpi_data, colWidths=[10*cm, 6*cm])
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("TEXTCOLOR", (0, 0), (0, -1), HexColor("#475569")),
            ("TEXTCOLOR", (1, 0), (1, -1), HexColor("#0F172A")),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, 0), (-1, -1), HexColor("#F8FAFC")),
            ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E2E8F0")),
            ("LINEBELOW", (0, 0), (-1, -2), 0.25, HexColor("#E2E8F0")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(t)
        story.append(Spacer(1, 0.4*cm))

        # === PORTAFOGLIO ===
        story.append(Paragraph("Portafoglio Immobiliare", h2))
        props_data = [["Immobile", "Città", "Stato", "Valore", "Canone/m", "Mutuo"]]
        for p in props[:20]:
            mutuo = p.get("mutuo") or {}
            props_data.append([
                Paragraph(f"<b>{p.get('nome', '—')}</b><br/><font size=8 color='#64748B'>{(p.get('indirizzo') or '')[:40]}</font>", body),
                p.get("citta", "—"),
                (p.get("stato", "") or "—").replace("_", " ").title(),
                _fmt_eur(p.get("valore_stimato", 0)),
                _fmt_eur(p.get("canone_mensile", 0)) if p.get("canone_mensile") else "—",
                f"{mutuo.get('banca', 'Si') if mutuo else '—'}<br/><font size=8>{_fmt_eur(mutuo.get('residuo', 0))}</font>" if mutuo else "—",
            ])
        # Trasforma stringhe HTML in Paragraph
        props_data[1:] = [[Paragraph(str(c), body) if isinstance(c, str) and "<" in c else c for c in row] for row in props_data[1:]]
        t = Table(props_data, colWidths=[5*cm, 2.4*cm, 2.4*cm, 2.4*cm, 2*cm, 2.5*cm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), HexColor("#0F172A")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, HexColor("#F8FAFC")]),
            ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E2E8F0")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor("#E2E8F0")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(t)
        story.append(Spacer(1, 0.4*cm))

        # === MUTUI ESISTENTI ===
        if mutui:
            story.append(PageBreak())
            story.append(Paragraph("Mutui in essere", h2))
            mut_data = [["Banca", "Tipo", "Originario", "Residuo", "Tasso", "Rata", "Fine"]]
            for m in mutui:
                mut_data.append([
                    m.get("banca", "—"),
                    (m.get("tipo_tasso") or "—").title(),
                    _fmt_eur(m.get("importo_originario", 0)),
                    _fmt_eur(m.get("capitale_residuo", 0)),
                    f"{m.get('tasso', 0)}%",
                    _fmt_eur(m.get("rata_mensile", 0)),
                    (m.get("data_fine") or "—")[:7],
                ])
            t = Table(mut_data, colWidths=[3*cm, 2*cm, 2.4*cm, 2.4*cm, 1.6*cm, 2.2*cm, 2*cm], repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), HexColor("#0F172A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, HexColor("#F8FAFC")]),
                ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E2E8F0")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor("#E2E8F0")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
            ]))
            story.append(t)
            story.append(Spacer(1, 0.4*cm))

        # === NUOVA OPERAZIONE PROPOSTA ===
        no = payload.nuova_operazione or {}
        if no.get("prezzo_acquisto"):
            story.append(Paragraph("Operazione di investimento proposta", h2))
            new_data = [
                ["Prezzo richiesto", _fmt_eur(no.get("prezzo_acquisto", 0))],
                ["Spese accessorie (notaio + agenzia)", _fmt_eur((no.get("notaio", 0) or 0) + (no.get("agenzia", 0) or 0))],
                ["Lavori previsti", _fmt_eur(no.get("lavori", 0))],
                ["Canone atteso", f"{_fmt_eur(no.get('canone', 0))}/mese"],
                ["Mutuo richiesto", f"{_fmt_eur(no.get('mutuo_richiesto', 0))} ({no.get('mutuo_pct', 60)}%)"],
                ["Capitale proprio", _fmt_eur(no.get("capitale_proprio", 0))],
                ["Rendimento netto stimato", f"{no.get('rendimento_netto', 0)}%"],
                ["Cash flow netto previsto", f"{_fmt_eur(no.get('cash_flow', 0))}/mese"],
            ]
            t = Table(new_data, colWidths=[10*cm, 6*cm])
            t.setStyle(TableStyle([
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("TEXTCOLOR", (0, 0), (0, -1), HexColor("#475569")),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
                ("BACKGROUND", (0, 0), (-1, -1), HexColor("#F0F9FF")),
                ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#0066FF")),
                ("LINEBELOW", (0, 0), (-1, -2), 0.25, HexColor("#BAE6FD")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(t)
            story.append(Spacer(1, 0.3*cm))

        # === NOTE ===
        if payload.note:
            story.append(Paragraph("Note dell'amministratore", h2))
            story.append(Paragraph(payload.note.replace("\n", "<br/>"), body))

        # === FOOTER ===
        story.append(Spacer(1, 1*cm))
        story.append(Paragraph(
            f"Documento riservato e confidenziale — generato da Real Estate Control Room il {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M')} UTC. "
            "Dati estratti automaticamente dal sistema gestionale societario. Le previsioni e gli scenari sono basati su parametri configurati dall'utente e non costituiscono garanzia di risultato.",
            small,
        ))

        doc.build(story)
        pdf_bytes = buf.getvalue()
        buf.close()

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="banker-pack-{date.today().isoformat()}.pdf"'},
        )

    return router
