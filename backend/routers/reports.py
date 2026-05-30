"""Reports router — Comprehensive PDFs with branded chrome (shared module)."""
import io
import httpx
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.platypus import Paragraph, Spacer, PageBreak, Image as RLImage, KeepTogether
from reportlab.lib.units import cm
from reportlab.lib import colors

from routers._shared import enrich_property
from routers.settings import get_user_settings
from routers._pdf_chrome import setup_doc, make_table, eur, pct


async def _fetch_property_images(props: list) -> dict:
    """Async-fetch images for all properties. Returns {prop_id: BytesIO or None}."""
    out = {}
    urls = [(p.get("id"), p.get("img")) for p in props if p.get("img")]
    if not urls:
        return out
    async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as cli:
        for pid, url in urls:
            try:
                if url.startswith("data:image/"):
                    import base64 as b64m
                    head, _, b64data = url.partition(",")
                    if "base64" in head:
                        out[pid] = io.BytesIO(b64m.b64decode(b64data))
                        continue
                r = await cli.get(url)
                ct = r.headers.get("content-type", "")
                if r.status_code == 200 and ct.startswith("image/"):
                    out[pid] = io.BytesIO(r.content)
            except Exception:
                logging.debug(f"Image fetch failed for {pid} ({url})")
    return out


def make_reports_router(db, current_user):
    router = APIRouter(prefix="/api/report")

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
        buf, doc, h1, sub, h2, body, cb = setup_doc("Stato di salute · Società", brand, settings.get("logo_base64"))
        story = [Paragraph("Stato di Salute della Società", h1)]
        period_str = latest_bil.get("periodo", "—") if latest_bil else "Nessun bilancio importato"
        story.append(Paragraph(f"Snapshot al {datetime.now().strftime('%d/%m/%Y')} · Bilancio di riferimento: <b>{period_str}</b>", sub))

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

        story.append(make_table([
            ["Indicatore", "Valore"],
            ["Numero immobili", str(n_props)],
            ["Di cui a reddito", f"{len(a_reddito)} ({len(a_reddito)*100//max(1,n_props)}%)"],
            ["Sfitti", str(len(sfitti))],
            ["In vendita / In ristrutturazione", f"{len(in_vendita)} / {len(in_lavori)}"],
            ["Valore patrimonio stimato", eur(sp.get("valore_immobili") or tot_valore)],
            ["Costo totale investito", eur(tot_costo)],
            ["Canone mensile complessivo", eur(tot_canone_mese)],
            ["Canone annuo complessivo", eur(tot_canone_mese * 12)],
            ["Rendimento netto medio (a reddito)", pct(rend_medio)],
            ["Debito residuo totale", eur(sp.get("debito_mutui") or tot_debito)],
            ["Rata mutui mensile", eur(tot_rata)],
            ["Loan-to-Value (LTV)", pct(ltv)],
            ["Patrimonio netto", eur(sp.get("patrimonio_netto") or (tot_valore - tot_debito))],
        ], [9 * cm, 4.5 * cm]))

        if latest_bil:
            story.append(Paragraph(f"2 · Conto Economico ({period_str})", h2))
            story.append(make_table([
                ["Voce", "Importo"],
                ["Ricavi affitti", eur(ce.get("ricavi_affitti"))],
                ["Ricavi vendite", eur(ce.get("ricavi_vendite"))],
                ["Totale ricavi", eur(ce.get("totale_ricavi"))],
                ["Costi di gestione", eur(ce.get("costi_gestione"))],
                ["Manutenzione", eur(ce.get("costi_manutenzione"))],
                ["IMU", eur(ce.get("imu"))],
                ["Interessi mutui", eur(ce.get("interessi_mutui"))],
                ["Ammortamenti", eur(ce.get("ammortamenti"))],
                ["Totale costi", eur(ce.get("totale_costi"))],
                ["UTILE NETTO", eur(ce.get("utile_netto"))],
            ], [9 * cm, 4.5 * cm], highlight_last=True))

        story.append(PageBreak())
        story.append(Paragraph("3 · Migliori e peggiori per rendimento netto", h2))
        ranked = sorted(a_reddito, key=lambda p: -(p.get("rendimento_netto", 0) or 0))
        top = ranked[:5]
        worst = ranked[-5:] if len(ranked) > 5 else []
        if top:
            story.append(Paragraph("<b>Top 5</b>", body))
            rows = [["Nome", "Città", "Canone", "Rend.netto", "Score"]]
            for p in top:
                rows.append([p.get("nome", "")[:28], p.get("citta", ""), eur(p.get("canone_mensile")), pct(p.get("rendimento_netto")), str(int(p.get("portfolio_score", 0) or 0))])
            story.append(make_table(rows, [5 * cm, 3 * cm, 2.5 * cm, 2.5 * cm, 1.5 * cm], header_color="#059669"))
        if worst:
            story.append(Spacer(1, 0.3 * cm))
            story.append(Paragraph("<b>Da monitorare</b>", body))
            rows = [["Nome", "Città", "Canone", "Rend.netto", "Score"]]
            for p in worst:
                rows.append([p.get("nome", "")[:28], p.get("citta", ""), eur(p.get("canone_mensile")), pct(p.get("rendimento_netto")), str(int(p.get("portfolio_score", 0) or 0))])
            story.append(make_table(rows, [5 * cm, 3 * cm, 2.5 * cm, 2.5 * cm, 1.5 * cm], header_color="#DC2626"))

        story.append(Paragraph("4 · Punti di attenzione", h2))
        alerts = []
        if rend_medio < 4 and a_reddito:
            alerts.append(f"Rendimento medio netto {pct(rend_medio)} sotto soglia 4%.")
        if ltv > 70:
            alerts.append(f"LTV portafoglio {pct(ltv)} elevato (sopra 70%).")
        if sfitti:
            alerts.append(f"{len(sfitti)} immobili sfitti: opportunità di riposizionamento o vendita.")
        for p in props:
            r = (p.get("mutuo") or {}).get("rata", 0)
            c = p.get("canone_mensile", 0)
            if c > 0 and r > c:
                alerts.append(f"{p.get('nome','')}: rata mutuo {eur(r)} > canone {eur(c)}.")
        if not alerts:
            alerts.append("Nessuna anomalia rilevante. Il portafoglio è in equilibrio.")
        for a in alerts[:10]:
            story.append(Paragraph(f"• {a}", body))

        if len(bilanci_all) > 1:
            story.append(Paragraph("5 · Storico bilanci recenti", h2))
            rows = [["Periodo", "Tipo", "Ricavi", "Costi", "Utile netto", "Patrimonio netto"]]
            for b in bilanci_all[:6]:
                bc = b.get("conto_economico", {}) or {}
                bs = b.get("stato_patrimoniale", {}) or {}
                rows.append([b.get("periodo", ""), b.get("tipo", ""),
                             eur(bc.get("totale_ricavi")), eur(bc.get("totale_costi")),
                             eur(bc.get("utile_netto")), eur(bs.get("patrimonio_netto"))])
            story.append(make_table(rows, [3 * cm, 2 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm, 3 * cm]))

        doc.build(story, onFirstPage=cb, onLaterPages=cb)
        buf.seek(0)
        return buf.read()

    # ============================================================
    # REPORT 2: BUSINESS PLAN (per le banche)
    # ============================================================
    def build_business_plan(props, latest_bil, bilanci_all, settings):
        brand = settings.get("nome_societa") or "Real Estate Control Room"
        buf, doc, h1, sub, h2, body, cb = setup_doc("Business Plan · Per Istituti di Credito", brand, settings.get("logo_base64"))
        story = [Paragraph("Business Plan Immobiliare", h1)]
        story.append(Paragraph(f"Documento destinato a istituti di credito · Snapshot al {datetime.now().strftime('%d/%m/%Y')}", sub))

        story.append(Paragraph("1 · Profilo della società", h2))
        story.append(Paragraph(
            f"<b>{brand}</b> è una società immobiliare orientata alla gestione di un portafoglio "
            "diversificato di immobili a reddito e operazioni di compravendita. Il presente Business Plan "
            "fornisce una rappresentazione patrimoniale, economica e finanziaria a supporto di valutazioni "
            "di affidamento e/o linee di credito.", body))

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

        story.append(make_table([
            ["Indicatore patrimoniale", "Valore"],
            ["Numero immobili", str(len(props))],
            ["Valore di mercato stimato", eur(valore_patrimonio)],
            ["Debito finanziario in essere", eur(debito)],
            ["Patrimonio netto", eur(pn)],
            ["Loan-to-Value (LTV)", pct(ltv)],
            ["Canone annuo a regime", eur(tot_canone_anno)],
            ["Immobili a reddito", f"{len(a_reddito)} su {len(props)}"],
        ], [9 * cm, 4.5 * cm]))

        if latest_bil:
            story.append(Paragraph(f"3 · Dati economici ({latest_bil.get('periodo','')})", h2))
            ebitda = (ce.get("totale_ricavi", 0) or 0) - (ce.get("costi_gestione", 0) or 0) - (ce.get("costi_manutenzione", 0) or 0) - (ce.get("imu", 0) or 0)
            story.append(make_table([
                ["Voce", "Importo"],
                ["Ricavi totali", eur(ce.get("totale_ricavi"))],
                ["Costi totali", eur(ce.get("totale_costi"))],
                ["Oneri finanziari", eur(ce.get("interessi_mutui"))],
                ["Utile netto", eur(ce.get("utile_netto"))],
                ["EBITDA stimato", eur(ebitda)],
            ], [9 * cm, 4.5 * cm], highlight_last=True))

        story.append(PageBreak())
        story.append(Paragraph("4 · Struttura del debito in essere", h2))
        with_mutuo = [p for p in props if p.get("mutuo")]
        if with_mutuo:
            tot_rata = sum(float((p.get("mutuo") or {}).get("rata", 0) or 0) for p in with_mutuo)
            story.append(Paragraph(f"Rata complessiva mensile: <b>{eur(tot_rata)}</b> · {len(with_mutuo)} finanziamenti attivi", body))
            rows = [["Immobile", "Banca", "Tasso", "Capitale residuo", "Rata mensile"]]
            for p in with_mutuo:
                m = p.get("mutuo") or {}
                rows.append([p.get("nome", "")[:28], (m.get("banca", "") or "")[:18], pct(m.get("tasso")), eur(m.get("residuo")), eur(m.get("rata"))])
            story.append(make_table(rows, [4.5 * cm, 3 * cm, 1.8 * cm, 3.2 * cm, 3 * cm]))
        else:
            story.append(Paragraph("Nessun finanziamento bancario attualmente in essere.", body))

        story.append(Paragraph("5 · Piano di sviluppo · scenari", h2))
        canone_medio = (tot_canone_anno / 12 / max(1, len(a_reddito))) if a_reddito else 1100
        costo_medio = (sum(float(p.get("costo_totale", 0) or 0) for p in a_reddito) / max(1, len(a_reddito))) if a_reddito else 200000
        for n in [2, 5, 10]:
            cap_richiesto = n * costo_medio * 0.3
            mutuo_necessario = n * costo_medio * 0.7
            ricavo_aggiuntivo = n * canone_medio * 12
            story.append(Paragraph(
                f"<b>Scenario +{n} immobili/anno</b>: capitale proprio richiesto <b>{eur(cap_richiesto)}</b>, "
                f"linea mutui necessaria <b>{eur(mutuo_necessario)}</b>, ricavo annuo aggiuntivo atteso <b>{eur(ricavo_aggiuntivo)}</b>.",
                body))
            story.append(Spacer(1, 0.15 * cm))

        story.append(Paragraph("6 · Indici di solidità e affidabilità", h2))
        copertura = (ce.get("utile_netto", 0) or 0) / max(1, ce.get("interessi_mutui", 1) or 1)
        rend_medio = sum((p.get('rendimento_netto', 0) or 0) for p in a_reddito) / max(1, len(a_reddito))
        story.append(make_table([
            ["Indice", "Valore", "Soglia attesa"],
            ["LTV (Loan-to-Value)", pct(ltv), "< 70%"],
            ["Copertura interessi (utile / oneri fin.)", f"{copertura:.2f}x", "> 1,5x"],
            ["Patrimonio netto / Debito", f"{(pn/debito):.2f}x" if debito > 0 else "n/a", "> 1,0x"],
            ["Rendimento netto medio portafoglio", pct(rend_medio), "> 4,5%"],
        ], [7.5 * cm, 3.5 * cm, 2.5 * cm]))

        story.append(Paragraph("Allegato A · Elenco immobili", h2))
        rows = [["Codice", "Nome", "Città", "m²", "Valore", "Canone"]]
        for p in props[:60]:
            rows.append([p.get("id", "")[:14], p.get("nome", "")[:26], p.get("citta", ""),
                         str(int(p.get("metratura", 0) or 0)),
                         eur(p.get("valore_stimato", p.get("prezzo_acquisto", 0))),
                         eur(p.get("canone_mensile", 0))])
        story.append(make_table(rows, [2.4 * cm, 4.5 * cm, 2.5 * cm, 1.2 * cm, 2.7 * cm, 2.5 * cm]))

        doc.build(story, onFirstPage=cb, onLaterPages=cb)
        buf.seek(0)
        return buf.read()

    # ============================================================
    # REPORT 3: INVESTOR BOOK — visual portfolio book for investors
    # ============================================================
    def build_investor_book(props, settings, images_map):
        brand = settings.get("nome_societa") or "Real Estate Control Room"
        buf, doc, h1, sub, h2, body, cb = setup_doc("Investor Book", brand, settings.get("logo_base64"))
        story = []

        # ===== COVER =====
        story.append(Paragraph("Investor Book", h1))
        story.append(Paragraph(
            f"Portafoglio immobiliare di <b>{brand}</b> · Snapshot al {datetime.now().strftime('%d/%m/%Y')} · "
            f"{len(props)} immobili in portafoglio",
            sub,
        ))

        # KPI portafoglio
        n_props = len(props)
        a_reddito = [p for p in props if (p.get("canone_mensile", 0) or 0) > 0]
        affittati = [p for p in props if p.get("stato") == "affittato"]
        sfitti = [p for p in props if p.get("stato") == "sfitto"]
        tot_costo = sum(float(p.get("costo_totale", p.get("prezzo_acquisto", 0)) or 0) for p in props)
        tot_valore = sum(float(p.get("valore_stimato", p.get("prezzo_acquisto", 0)) or 0) for p in props)
        tot_canone_mese = sum(float(p.get("canone_mensile", 0) or 0) for p in props)
        tot_debito = sum(float((p.get("mutuo") or {}).get("residuo", 0) or 0) for p in props)
        plusvalenza = tot_valore - tot_costo
        rend_medio_l = sum((p.get("rendimento_lordo", 0) or 0) for p in a_reddito) / max(1, len(a_reddito))
        rend_medio_n = sum((p.get("rendimento_netto", 0) or 0) for p in a_reddito) / max(1, len(a_reddito))
        occupazione = (len(affittati) / max(1, n_props)) * 100

        story.append(Paragraph("KPI del portafoglio", h2))
        story.append(make_table([
            ["Indicatore", "Valore"],
            ["Numero immobili", str(n_props)],
            ["Immobili a reddito", f"{len(a_reddito)} ({len(a_reddito)*100//max(1,n_props)}%)"],
            ["Tasso di occupazione", pct(occupazione)],
            ["Sfitti", str(len(sfitti))],
            ["Valore di mercato totale stimato", eur(tot_valore)],
            ["Costo totale di acquisto", eur(tot_costo)],
            ["Plusvalenza latente", eur(plusvalenza)],
            ["Canone mensile complessivo", eur(tot_canone_mese)],
            ["Canone annuo complessivo", eur(tot_canone_mese * 12)],
            ["Rendimento medio lordo", pct(rend_medio_l)],
            ["Rendimento medio netto", pct(rend_medio_n)],
            ["Debito residuo totale", eur(tot_debito)],
            ["Patrimonio netto stimato", eur(tot_valore - tot_debito)],
        ], [9 * cm, 4.5 * cm], highlight_last=True))

        story.append(Spacer(1, 0.5 * cm))
        story.append(Paragraph(
            "<i>Documento riservato. Per uso interno o per condivisione con investitori e advisor finanziari. "
            "I valori di mercato sono stime gestionali e non costituiscono perizia immobiliare ufficiale.</i>",
            body,
        ))

        # ===== UNA SCHEDA PER IMMOBILE =====
        for idx, p in enumerate(props):
            story.append(PageBreak())
            story.append(Paragraph(f"{idx + 1:02d} · {p.get('nome', 'Immobile')}", h1))
            indirizzo = ", ".join([x for x in [p.get("indirizzo"), p.get("citta")] if x])
            story.append(Paragraph(
                f"{indirizzo or '—'} · {p.get('tipologia', '—')} · {int(p.get('metratura', 0) or 0)} m²",
                sub,
            ))

            # ----- Foto (se disponibile) -----
            img_buf = images_map.get(p.get("id"))
            if img_buf:
                try:
                    img_buf.seek(0)
                    img = RLImage(img_buf, width=12 * cm, height=7 * cm, kind="proportional")
                    story.append(img)
                    story.append(Spacer(1, 0.3 * cm))
                except Exception:
                    pass
            else:
                story.append(Paragraph("<font color='#94A3B8'>Foto non disponibile</font>", body))
                story.append(Spacer(1, 0.2 * cm))

            # ----- Tabella anagrafica + dati economici -----
            prezzo_acq = float(p.get("prezzo_acquisto", 0) or 0)
            costo_tot = float(p.get("costo_totale", prezzo_acq) or 0)
            valore = float(p.get("valore_stimato", prezzo_acq) or 0)
            canone = float(p.get("canone_mensile", 0) or 0)
            plusv = valore - costo_tot

            anagrafica_rows = [
                ["Voce", "Valore"],
                ["Codice immobile", p.get("id", "—")],
                ["Indirizzo", p.get("indirizzo", "—") or "—"],
                ["Comune / Provincia", f"{p.get('citta', '—') or '—'} · {p.get('provincia', '—') or '—'}"],
                ["Tipologia", p.get("tipologia", "—") or "—"],
                ["Superficie", f"{int(p.get('metratura', 0) or 0)} m²"],
                ["Anno di costruzione", str(p.get("anno_costruzione") or "—")],
                ["Classe energetica", p.get("classe_energetica", "—") or "—"],
                ["Stato attuale", (p.get("stato", "—") or "—").replace("_", " ").capitalize()],
                ["Data acquisto", p.get("data_acquisto", "—") or "—"],
            ]
            story.append(make_table(anagrafica_rows, [6 * cm, 7.5 * cm]))

            story.append(Spacer(1, 0.3 * cm))
            story.append(Paragraph("Dati economici", h2))

            economici_rows = [
                ["Voce", "Importo"],
                ["Prezzo di acquisto", eur(prezzo_acq)],
                ["Costo totale (con accessori, notaio, lavori)", eur(costo_tot)],
                ["Valore di mercato stimato", eur(valore)],
                ["Plusvalenza latente", eur(plusv)],
                ["Canone mensile", eur(canone)],
                ["Canone annuo", eur(canone * 12)],
                ["Rendimento lordo", pct(p.get("rendimento_lordo", 0))],
                ["Rendimento netto", pct(p.get("rendimento_netto", 0))],
                ["Cash flow mensile (al netto rata)", eur(p.get("cash_flow_mensile", 0))],
                ["Portfolio Score", str(int(p.get("portfolio_score", 0) or 0)) + " / 100"],
            ]
            story.append(make_table(economici_rows, [9 * cm, 4.5 * cm], highlight_last=False))

            # ----- Mutuo se presente -----
            m = p.get("mutuo") or {}
            if m and (m.get("residuo") or 0) > 0:
                story.append(Spacer(1, 0.3 * cm))
                story.append(Paragraph("Finanziamento", h2))
                story.append(make_table([
                    ["Voce", "Valore"],
                    ["Banca", m.get("banca", "—") or "—"],
                    ["Capitale residuo", eur(m.get("residuo"))],
                    ["Rata mensile", eur(m.get("rata"))],
                    ["Tasso", pct(m.get("tasso"))],
                ], [6 * cm, 7.5 * cm]))

            # ----- Locazione / inquilino -----
            inq = p.get("inquilino") or p.get("conduttore")
            scad = p.get("scadenza_contratto") or p.get("data_fine_contratto")
            data_inizio = p.get("data_inizio_contratto") or p.get("data_inizio")
            if inq or scad or canone > 0:
                story.append(Spacer(1, 0.3 * cm))
                story.append(Paragraph("Locazione in corso", h2))
                loc_rows = [
                    ["Voce", "Valore"],
                    ["Inquilino", inq or "—"],
                    ["Data inizio contratto", data_inizio or "—"],
                    ["Scadenza contratto", scad or "—"],
                    ["Canone mensile", eur(canone) if canone > 0 else "—"],
                    ["Deposito cauzionale", eur(p.get("deposito_cauzionale", 0)) if p.get("deposito_cauzionale") else "—"],
                ]
                story.append(make_table(loc_rows, [6 * cm, 7.5 * cm]))

            if p.get("note"):
                story.append(Spacer(1, 0.3 * cm))
                story.append(Paragraph("Note", h2))
                story.append(Paragraph(str(p["note"])[:500], body))

        # ===== Recap finale =====
        if props:
            story.append(PageBreak())
            story.append(Paragraph("Recap portafoglio", h1))
            story.append(Paragraph("Vista sinottica di tutti gli immobili", sub))
            rows = [["#", "Nome", "Città", "Acquisto", "Valore attuale", "Canone", "Rend. netto", "Inquilino"]]
            for i, p in enumerate(props, 1):
                inq = p.get("inquilino") or p.get("conduttore") or "—"
                rows.append([
                    str(i),
                    (p.get("nome", "") or "")[:24],
                    (p.get("citta", "") or "")[:14],
                    eur(p.get("prezzo_acquisto", 0)),
                    eur(p.get("valore_stimato", p.get("prezzo_acquisto", 0))),
                    eur(p.get("canone_mensile", 0)),
                    pct(p.get("rendimento_netto", 0)),
                    str(inq)[:18],
                ])
            story.append(make_table(rows, [0.6 * cm, 3.5 * cm, 2 * cm, 2.2 * cm, 2.5 * cm, 2 * cm, 2 * cm, 3.2 * cm]))

        doc.build(story, onFirstPage=cb, onLaterPages=cb)
        buf.seek(0)
        return buf.read()

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
            elif report_id == "investor-book":
                images_map = await _fetch_property_images(props)
                blob = build_investor_book(props, settings, images_map)
                fname = "investor_book.pdf"
            else:
                raise HTTPException(status_code=404, detail=f"Report '{report_id}' non disponibile")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Errore generazione: {str(e)}")
        return StreamingResponse(io.BytesIO(blob), media_type="application/pdf",
                                 headers={"Content-Disposition": f'attachment; filename="{fname}"'})

    return router
