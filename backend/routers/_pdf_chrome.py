"""Reusable PDF chrome (header + footer + logo + tables) shared by reports.py and forecast.py."""
import io
import base64
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle


def decode_logo(b64: str):
    if not b64:
        return None
    try:
        data = base64.b64decode(b64)
        return ImageReader(io.BytesIO(data))
    except Exception:
        return None


def chrome_factory(title: str, brand_name: str, logo_reader):
    def _chrome(canvas, doc):
        canvas.saveState()
        band_h = 1.4 * cm
        y0 = A4[1] - band_h
        canvas.setFillColor(colors.HexColor("#0066FF"))
        canvas.rect(0, y0, A4[0], band_h, fill=1, stroke=0)
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
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 11)
        canvas.drawString(x_text, y0 + band_h / 2 - 1, brand_name.upper()[:60])
        canvas.setFont("Helvetica", 9)
        canvas.drawRightString(A4[0] - 1.5 * cm, y0 + band_h / 2 - 1, title)

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


def setup_doc(title: str, brand_name: str, logo_b64: str):
    logo_reader = decode_logo(logo_b64)
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
    cb = chrome_factory(title, brand_name, logo_reader)
    return buf, doc, h1, sub, h2, body, cb


def make_table(rows, col_widths, header_color="#0066FF", highlight_last=False):
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


def eur(n):
    try:
        n = float(n or 0)
    except Exception:
        n = 0.0
    return f"€ {n:,.0f}".replace(",", ".")


def pct(n):
    try:
        return f"{float(n or 0):.2f}%"
    except Exception:
        return "—"
