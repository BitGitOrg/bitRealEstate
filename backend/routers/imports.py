"""Centro Import router — Immobili Excel, Bilanci AI, Estratto conto bancario."""
import io
import re
import json
import uuid
import hashlib
import logging
from datetime import datetime, timezone, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import openpyxl
import pdfplumber
import pandas as pd

from routers._shared import enrich_property as _enrich_property, coerce_float, coerce_int, coerce_str

IMMOBILI_COLUMNS = [
    # ANAGRAFICA (8)
    "Nome immobile", "Indirizzo", "Città", "Provincia", "CAP", "Tipologia", "Metratura (m²)", "Piano",
    # DATI TECNICI (4)
    "Anno costruzione", "Classe energetica", "Rendita catastale (€)", "Valore catastale (€)",
    # STATO (2)
    "Stato", "Operazione",
    # ACQUISTO (7)
    "Data rogito (YYYY-MM-DD)", "Prezzo acquisto (€)", "Notaio (€)", "Agenzia acquisto (€)",
    "Imposte registro/IVA (€)", "Spese tecniche/perizie (€)", "Lavori sostenuti (€)",
    # VALORE ATTUALE (1)
    "Valore stimato attuale (€)",
    # LOCAZIONE (8)
    "Canone mensile (€)", "Inquilino — Nome", "Inquilino — Email", "Inquilino — Telefono",
    "Contratto — Data inizio (YYYY-MM-DD)", "Contratto — Data fine (YYYY-MM-DD)",
    "Deposito cauzionale (€)", "Spese condominiali mensili (€)",
    # MUTUO (7)
    "Mutuo — Banca", "Mutuo — Importo originario (€)", "Mutuo — Capitale residuo (€)",
    "Mutuo — Rata mensile (€)", "Mutuo — Tasso (%)", "Mutuo — Tipo tasso",
    "Mutuo — Data fine (YYYY-MM-DD)",
    # NOTE (1)
    "Note",
]

IMMOBILI_EXAMPLE_ROW = [
    # ANAGRAFICA
    "Bilocale Navigli", "Via Vigevano 12", "Milano", "MI", "20144", "Bilocale", 58, "2",
    # TECNICI
    1972, "D", 580.50, 75000,
    # STATO
    "affittato", "reddito",
    # ACQUISTO
    "2022-03-15", 215000, 4200, 6500, 18500, 1200, 18000,
    # VALORE
    285000,
    # LOCAZIONE
    1450, "Mario Bianchi", "mario.bianchi@example.com", "+393331234567",
    "2023-09-01", "2027-08-31", 4350, 95,
    # MUTUO
    "Intesa Sanpaolo", 130000, 95000, 540, 2.8, "fisso", "2042-03-15",
    # NOTE
    "Esempio — cancella questa riga e inserisci i tuoi dati",
]

# Gruppi colore per header (indice di partenza, n. colonne, colore HEX)
IMMOBILI_HEADER_GROUPS = [
    (1, 8, "1E40AF", "ANAGRAFICA"),          # blu scuro
    (9, 4, "0E7490", "DATI TECNICI"),        # ciano
    (13, 2, "7C3AED", "STATO"),              # viola
    (15, 7, "059669", "ACQUISTO"),           # verde
    (22, 1, "0D9488", "VALORE ATTUALE"),     # teal
    (23, 8, "DC2626", "LOCAZIONE"),          # rosso
    (31, 7, "B45309", "MUTUO"),              # arancio
    (38, 1, "475569", "NOTE"),               # grigio
]

BILANCIO_EXTRACT_PROMPT = (
    "Sei un sistema di estrazione dati da bilanci di società immobiliari italiane (Conto Economico + Stato Patrimoniale, "
    "tipicamente esportati da gestionali tipo Arca, Zucchetti, TeamSystem). "
    "Rispondi SOLO con JSON valido, niente prefissi, niente markdown. Schema:\n"
    '{\n'
    '  "periodo": "string es: Gennaio 2026 oppure Q1 2026 oppure 2025",\n'
    '  "tipo": "provvisorio|definitivo",\n'
    '  "conto_economico": {\n'
    '    "ricavi_affitti": numero,\n'
    '    "ricavi_vendite": numero,\n'
    '    "altri_ricavi": numero,\n'
    '    "totale_ricavi": numero,\n'
    '    "costi_gestione": numero,\n'
    '    "costi_manutenzione": numero,\n'
    '    "imu": numero,\n'
    '    "interessi_mutui": numero,\n'
    '    "ammortamenti": numero,\n'
    '    "altri_costi": numero,\n'
    '    "totale_costi": numero,\n'
    '    "utile_netto": numero\n'
    '  },\n'
    '  "stato_patrimoniale": {\n'
    '    "valore_immobili": numero,\n'
    '    "liquidita": numero,\n'
    '    "crediti": numero,\n'
    '    "totale_attivo": numero,\n'
    '    "debito_mutui": numero,\n'
    '    "altri_debiti": numero,\n'
    '    "totale_passivo": numero,\n'
    '    "patrimonio_netto": numero\n'
    '  },\n'
    '  "note_estrazione": "stringa breve con eventuali avvertenze"\n'
    "}\n"
    "Se un valore non è presente, metti 0. Gli importi sono in EUR. Se vedi importi in migliaia (k€), convertili in euro."
)


class ImportImmobiliCommit(BaseModel):
    rows: List[dict]


class BilancioCommit(BaseModel):
    periodo: str
    tipo: Optional[str] = "provvisorio"
    conto_economico: dict
    stato_patrimoniale: dict
    note_estrazione: Optional[str] = ""
    filename: Optional[str] = ""


class BancaCommit(BaseModel):
    movimenti: List[dict]


def _extract_text_from_upload(content: bytes, filename: str) -> str:
    fl = filename.lower()
    if fl.endswith(".pdf"):
        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                text = "\n".join((p.extract_text() or "") for p in pdf.pages[:20])
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"PDF non leggibile: {str(e)}")
        return text[:30000]
    if fl.endswith((".xlsx", ".xls")):
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Excel non leggibile: {str(e)}")
        parts = []
        for sn in wb.sheetnames[:5]:
            ws = wb[sn]
            parts.append(f"## Foglio: {sn}")
            for row in ws.iter_rows(values_only=True, max_row=200):
                line = " | ".join(str(c) if c is not None else "" for c in row)
                if line.strip(" |"):
                    parts.append(line)
        return "\n".join(parts)[:30000]
    if fl.endswith(".csv"):
        try:
            text = content.decode("utf-8", errors="ignore")
        except Exception:
            text = content.decode("latin-1", errors="ignore")
        return text[:30000]
    return content.decode("utf-8", errors="ignore")[:30000]


def _read_tabular_robust(content: bytes, filename: str):
    """Legge CSV (auto-detect separator + encoding) o Excel multi-sheet con skip header smart."""
    import pandas as pd  # local rebind
    fl = filename.lower()
    if fl.endswith(".csv"):
        for enc in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
            for sep in (None, ";", ",", "\t", "|"):
                try:
                    df = pd.read_csv(io.BytesIO(content), sep=sep, engine="python", encoding=enc)
                    if df is not None and len(df.columns) >= 2:
                        return df
                except Exception:
                    continue
        return None
    if fl.endswith((".xlsx", ".xls")):
        # Multi-sheet: scegli il foglio con più righe
        try:
            xls = pd.ExcelFile(io.BytesIO(content))
        except Exception:
            return None
        best_df = None
        best_score = -1
        for sn in xls.sheet_names:
            for skip in (0, 1, 2, 3, 4, 5):
                try:
                    df = pd.read_excel(xls, sheet_name=sn, skiprows=skip)
                except Exception:
                    continue
                if df is None or df.empty:
                    continue
                # Cerca un header "decente": almeno 2 colonne, header non Unnamed
                unnamed = sum(1 for c in df.columns if str(c).startswith("Unnamed"))
                useful = len(df.columns) - unnamed
                if useful < 2:
                    continue
                score = useful * 10 + min(len(df), 500)
                if score > best_score:
                    best_score = score
                    best_df = df
        return best_df
    return None


def _parse_amount(v) -> Optional[float]:
    """Parse robusto di importi: gestisce 1.234,56  vs  1,234.56  vs  €1.234,56  vs  parentesi negativi."""
    if v is None:
        return None
    try:
        if hasattr(v, "isna") and v.isna():
            return None
    except Exception:
        pass
    s = str(v).strip()
    if not s or s.lower() in ("nan", "none", "-"):
        return None
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg = True
        s = s[1:-1]
    s = s.replace("€", "").replace("EUR", "").replace(" ", "").replace("'", "")
    # Decide separator: se ho sia . che , l'ultimo è il decimale
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    else:
        s = s.replace(",", ".")
    try:
        val = float(s)
        return -val if neg else val
    except Exception:
        return None


def _parse_date(v) -> Optional[str]:
    """Parse data flessibile → ISO YYYY-MM-DD. Gestisce stringhe, Timestamp pandas, datetime."""
    if v is None:
        return None
    try:
        if hasattr(v, "isna") and v.isna():
            return None
    except Exception:
        pass
    # pandas Timestamp ha .date()
    if hasattr(v, "date") and callable(v.date):
        try:
            return v.date().isoformat()
        except Exception:
            pass
    s = str(v).strip()
    if not s or s.lower() in ("nan", "nat"):
        return None
    # già ISO?
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    try:
        from dateutil import parser as dateparser
        dt = dateparser.parse(s, dayfirst=True, fuzzy=True)
        return dt.date().isoformat()
    except Exception:
        return None


async def _ai_detect_columns(llm_key: str, csv_sample: str) -> Optional[dict]:
    """Chiama Claude per identificare le colonne in un estratto conto sconosciuto."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    sys_msg = (
        "Sei un esperto di estratti conto bancari italiani. Analizza il sample CSV e identifica le colonne. "
        "Restituisci SOLO JSON valido (no markdown) nel formato: "
        "{\"data\":\"NomeColonna|null\",\"importo\":\"NomeColonna|null\",\"dare\":\"NomeColonna|null\",\"avere\":\"NomeColonna|null\",\"descrizione\":\"NomeColonna|null\"}. "
        "Regole: usa i nomi ESATTI delle colonne come appaiono nel CSV. Se non sei sicuro, usa null. "
        "Se la banca usa colonne separate dare/avere (addebito/accredito), riempi entrambe; altrimenti usa solo 'importo'.\n\nCSV SAMPLE:\n" + csv_sample
    )
    chat = LlmChat(api_key=llm_key, session_id="bank-col-detect", system_message=sys_msg).with_model("anthropic", "claude-sonnet-4-6")
    reply = await chat.send_message(UserMessage(text="Identifica le colonne."))
    text = reply.strip()
    if "```" in text:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if m:
            text = m.group(1).strip()
    s = text.find("{")
    e = text.rfind("}")
    if s == -1 or e <= s:
        return None
    try:
        return json.loads(text[s:e+1])
    except Exception:
        return None


def _movimento_signature(user_id: str, m: dict) -> str:
    s = f"{user_id}|{m.get('data','')}|{round(float(m.get('importo',0) or 0), 2)}|{(m.get('descrizione','') or '')[:80].strip().lower()}"
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def make_imports_router(db, current_user, llm_key: str):
    router = APIRouter(prefix="/api/import")

    # ============= TEMPLATE & IMMOBILI =============
    @router.get("/template/immobili")
    async def download_immobili_template(user: dict = Depends(current_user)):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Immobili"

        # Riga 1: super-header colorato per gruppo logico
        for start_col, n_cols, color, label in IMMOBILI_HEADER_GROUPS:
            ws.merge_cells(
                start_row=1, start_column=start_col,
                end_row=1, end_column=start_col + n_cols - 1,
            )
            c = ws.cell(row=1, column=start_col, value=label)
            c.font = openpyxl.styles.Font(bold=True, color="FFFFFF", size=11)
            c.fill = openpyxl.styles.PatternFill("solid", fgColor=color)
            c.alignment = openpyxl.styles.Alignment(horizontal="center", vertical="center")
            ws.row_dimensions[1].height = 24

        # Riga 2: header colonne con colore di sezione (più chiaro)
        col_to_group_color = {}
        for start_col, n_cols, color, _ in IMMOBILI_HEADER_GROUPS:
            for col in range(start_col, start_col + n_cols):
                col_to_group_color[col] = color

        for i, col_name in enumerate(IMMOBILI_COLUMNS, 1):
            c = ws.cell(row=2, column=i, value=col_name)
            c.font = openpyxl.styles.Font(bold=True, color="FFFFFF", size=10)
            c.fill = openpyxl.styles.PatternFill("solid", fgColor=col_to_group_color[i])
            c.alignment = openpyxl.styles.Alignment(
                horizontal="center", vertical="center", wrap_text=True
            )
            ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = max(
                18, min(28, len(col_name) + 2)
            )
        ws.row_dimensions[2].height = 42

        # Riga 3: esempio in italico grigio
        for i, v in enumerate(IMMOBILI_EXAMPLE_ROW, 1):
            cell = ws.cell(row=3, column=i, value=v)
            cell.font = openpyxl.styles.Font(italic=True, color="64748B", size=10)
            cell.alignment = openpyxl.styles.Alignment(horizontal="left", vertical="center")

        ws.freeze_panes = "A3"

        # Validazione dropdown su colonne enum
        # Stato (colonna 13)
        stati = "in_valutazione,in_trattativa,acquistato,in_ristrutturazione,disponibile,affittato,sfitto,in_vendita,venduto"
        dv_stato = openpyxl.worksheet.datavalidation.DataValidation(
            type="list", formula1=f'"{stati}"', allow_blank=True
        )
        dv_stato.add("M3:M1000")
        ws.add_data_validation(dv_stato)

        # Operazione (colonna 14)
        operazioni = "reddito,compra_vendi,compra_ristruttura_vendi"
        dv_op = openpyxl.worksheet.datavalidation.DataValidation(
            type="list", formula1=f'"{operazioni}"', allow_blank=True
        )
        dv_op.add("N3:N1000")
        ws.add_data_validation(dv_op)

        # Tipologia (colonna 6)
        tipologie = "Bilocale,Trilocale,Quadrilocale,Monolocale,Villa,Loft,Attico,Negozio,Ufficio,Box,Altro"
        dv_tip = openpyxl.worksheet.datavalidation.DataValidation(
            type="list", formula1=f'"{tipologie}"', allow_blank=True
        )
        dv_tip.add("F3:F1000")
        ws.add_data_validation(dv_tip)

        # Classe energetica (colonna 10)
        classi = "A4,A3,A2,A1,A,B,C,D,E,F,G"
        dv_cl = openpyxl.worksheet.datavalidation.DataValidation(
            type="list", formula1=f'"{classi}"', allow_blank=True
        )
        dv_cl.add("J3:J1000")
        ws.add_data_validation(dv_cl)

        # Tipo tasso mutuo (colonna 36)
        tipi_tasso = "fisso,variabile,misto"
        dv_tt = openpyxl.worksheet.datavalidation.DataValidation(
            type="list", formula1=f'"{tipi_tasso}"', allow_blank=True
        )
        dv_tt.add("AJ3:AJ1000")
        ws.add_data_validation(dv_tt)

        # === Sheet 2: Guida compilazione ===
        ws2 = wb.create_sheet("Guida compilazione")
        ws2.column_dimensions["A"].width = 4
        ws2.column_dimensions["B"].width = 38
        ws2.column_dimensions["C"].width = 80

        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        thin = Side(border_style="thin", color="E2E8F0")
        box_border = Border(left=thin, right=thin, top=thin, bottom=thin)

        # ===== HERO HEADER =====
        ws2.merge_cells("B1:C1")
        c = ws2["B1"]
        c.value = "📘 Guida alla compilazione del template immobili"
        c.font = Font(bold=True, size=18, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="0066FF")
        c.alignment = Alignment(horizontal="center", vertical="center")
        ws2.row_dimensions[1].height = 38

        ws2.merge_cells("B2:C2")
        c = ws2["B2"]
        c.value = "Control Room — Real Estate Portfolio · 38 campi · 8 sezioni · import in massa via Excel"
        c.font = Font(italic=True, size=10, color="475569")
        c.alignment = Alignment(horizontal="center", vertical="center")
        ws2.row_dimensions[2].height = 22

        row = 4

        def section_header(text, color="0066FF"):
            nonlocal row
            ws2.merge_cells(start_row=row, start_column=2, end_row=row, end_column=3)
            c = ws2.cell(row=row, column=2, value=text)
            c.font = Font(bold=True, size=13, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor=color)
            c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
            ws2.row_dimensions[row].height = 26
            row += 1

        def subhead(text):
            nonlocal row
            ws2.merge_cells(start_row=row, start_column=2, end_row=row, end_column=3)
            c = ws2.cell(row=row, column=2, value=text)
            c.font = Font(bold=True, size=11, color="0F172A")
            c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
            ws2.row_dimensions[row].height = 22
            row += 1

        def kv(key, val, bold=False):
            nonlocal row
            c1 = ws2.cell(row=row, column=2, value=key)
            c1.font = Font(bold=True, size=10, color="0F172A")
            c1.alignment = Alignment(vertical="top", wrap_text=True, indent=1)
            c1.border = box_border
            c1.fill = PatternFill("solid", fgColor="F8FAFC")
            c2 = ws2.cell(row=row, column=3, value=val)
            c2.font = Font(size=10, bold=bold, color="0F172A")
            c2.alignment = Alignment(vertical="top", wrap_text=True, indent=1)
            c2.border = box_border
            row += 1

        def bullet(text, indent_lvl=1):
            nonlocal row
            ws2.merge_cells(start_row=row, start_column=2, end_row=row, end_column=3)
            c = ws2.cell(row=row, column=2, value=f"  • {text}")
            c.font = Font(size=10, color="0F172A")
            c.alignment = Alignment(vertical="top", wrap_text=True, indent=indent_lvl)
            ws2.row_dimensions[row].height = max(18, (len(text) // 95 + 1) * 15)
            row += 1

        def callout(label, text, fg="92400E", bg="FFFBEB"):
            nonlocal row
            ws2.merge_cells(start_row=row, start_column=2, end_row=row, end_column=3)
            c = ws2.cell(row=row, column=2, value=f"  {label}  {text}")
            c.font = Font(size=10, color=fg, italic=True)
            c.fill = PatternFill("solid", fgColor=bg)
            c.alignment = Alignment(vertical="center", wrap_text=True, indent=1)
            ws2.row_dimensions[row].height = max(22, (len(text) // 90 + 1) * 18)
            row += 1

        def spacer():
            nonlocal row
            row += 1

        def field_row(col_letter, name, desc, example, mandatory=False):
            """Riga descrizione campo: colonna | nome | descrizione + esempio"""
            nonlocal row
            ws2.cell(row=row, column=2, value=f"{col_letter} — {name}{'  ⚠️' if mandatory else ''}").font = Font(bold=True, size=10, color="0066FF" if mandatory else "0F172A")
            ws2.cell(row=row, column=2).alignment = Alignment(vertical="top", wrap_text=True, indent=1)
            ws2.cell(row=row, column=2).border = box_border
            full_text = desc
            if example:
                full_text += f"\n  📝 Esempio: {example}"
            c = ws2.cell(row=row, column=3, value=full_text)
            c.font = Font(size=9, color="475569")
            c.alignment = Alignment(vertical="top", wrap_text=True, indent=1)
            c.border = box_border
            ws2.row_dimensions[row].height = max(34, (len(full_text) // 80 + 1) * 14)
            row += 1

        # ============= INTRO =============
        section_header("🚀 Come iniziare in 4 step", "059669")
        bullet("STEP 1 — Cancella la riga di esempio (riga 3) o sovrascrivila con il tuo primo immobile.")
        bullet("STEP 2 — Compila una riga per ogni immobile del tuo portafoglio. Puoi inserire fino a 500 immobili.")
        bullet("STEP 3 — Salva il file in formato .xlsx (Excel 2007+). Non usare .xls o .csv.")
        bullet("STEP 4 — In Control Room: vai in Centro Import → tab Immobili → trascina il file → controlla l'anteprima → conferma.")
        spacer()
        callout("💡", "Suggerimento: importa prima 1-2 immobili come test, verifica che tutto sia ok, poi carica il resto.", fg="065F46", bg="D1FAE5")
        spacer()

        # ============= REGOLE GENERALI =============
        section_header("⚙️ Regole generali", "1E40AF")
        subhead("Struttura del foglio Immobili")
        bullet("Riga 1: super-header colorato a gruppi (ANAGRAFICA, ACQUISTO, MUTUO…). NON modificare.")
        bullet("Riga 2: intestazione colonne. NON modificare né cancellare.")
        bullet("Riga 3 in poi: i tuoi dati. Una riga = un immobile.")
        bullet("Non lasciare righe vuote in mezzo: se serve, ordina per indirizzo o per data acquisto.")
        spacer()

        subhead("Formato date")
        kv("Formato richiesto", "YYYY-MM-DD (anno-mese-giorno con trattini)")
        kv("Esempio corretto", "2024-03-15  oppure  2022-11-08")
        kv("❌ Da evitare", "15/03/2024 · 15-mar-24 · 03-15-2024 · 2024.03.15")
        kv("Data sconosciuta?", "Lascia la cella vuota. Non scrivere 'NA', 'sconosciuta', '?'.")
        spacer()

        subhead("Formato importi (€)")
        kv("Formato richiesto", "Numero puro, senza € e senza separatore migliaia")
        kv("Esempi corretti", "1450 · 215000 · 1450.50 · 95000")
        kv("Decimali", "Usa il PUNTO come separatore (non la virgola): 1450.50, NON 1450,50")
        kv("❌ Da evitare", "€ 1.450,00 · 1.450€ · 1450,00 · 1450 EUR")
        kv("Importo zero?", "Lascia vuoto, non scrivere 0. Esempio: notaio non sostenuto → vuoto.")
        spacer()

        subhead("Campi obbligatori (segnati con ⚠️ nel resto della guida)")
        bullet("Nome immobile (colonna A) — identificatore univoco usato in tutta la piattaforma.")
        bullet("Prezzo acquisto (colonna P) — il sistema rifiuta righe senza prezzo o con prezzo ≤ 0.")
        callout("ℹ️", "Tutti gli altri 36 campi sono opzionali. Più ne compili, più accurate saranno le analisi (rendimento netto, AI Deal Score, alert automatici).", fg="1E40AF", bg="EEF4FF")
        spacer()

        # ============= DETTAGLIO CAMPI =============
        section_header("📋 Dettaglio dei 38 campi (sezione per sezione)", "7C3AED")

        # --- ANAGRAFICA ---
        subhead("🔵 ANAGRAFICA (colonne A-H)")
        field_row("A", "Nome immobile ⚠️", "Etichetta identificativa univoca. Lo userai in tutta l'app.", "Bilocale Navigli · Trilo Crocetta · Villetta Asti", mandatory=True)
        field_row("B", "Indirizzo", "Indirizzo completo con numero civico. Usato per geocoding e mappa.", "Via Vigevano 12 · Corso Vercelli 45/A")
        field_row("C", "Città", "Comune dell'immobile.", "Milano · Torino · Roma")
        field_row("D", "Provincia", "Sigla provincia (2 lettere maiuscole).", "MI · TO · RM · NA")
        field_row("E", "CAP", "5 cifre. Lascialo come testo per preservare gli zeri iniziali.", "20144 · 10121 · 00184")
        field_row("F", "Tipologia", "DROPDOWN: Bilocale, Trilocale, Quadrilocale, Monolocale, Villa, Loft, Attico, Negozio, Ufficio, Box, Altro.", "Bilocale")
        field_row("G", "Metratura (m²)", "Superficie commerciale in metri quadrati. Numero intero o decimale.", "58 · 92.5")
        field_row("H", "Piano", "Piano dell'immobile come stringa.", "T (terra) · 1 · 2 · S (seminterrato) · ATT (attico)")
        spacer()

        # --- DATI TECNICI ---
        subhead("🩵 DATI TECNICI (colonne I-L)")
        field_row("I", "Anno costruzione", "Anno di costruzione del fabbricato (4 cifre).", "1972 · 2018")
        field_row("J", "Classe energetica", "DROPDOWN: A4, A3, A2, A1, A, B, C, D, E, F, G.", "D · B · A2")
        field_row("K", "Rendita catastale (€)", "Valore presente sulla visura catastale.", "580.50 · 1240")
        field_row("L", "Valore catastale (€)", "Rendita × 168 (residenziale) o × 126 (prima casa). Usato per IMU e scadenzario fiscale.", "75000")
        spacer()

        # --- STATO ---
        subhead("🟣 STATO (colonne M-N)")
        field_row("M", "Stato", "DROPDOWN: in_valutazione, in_trattativa, acquistato, in_ristrutturazione, disponibile, affittato, sfitto, in_vendita, venduto.", "affittato (se locato) · in_vendita (se in vendita)")
        field_row("N", "Operazione", "DROPDOWN: reddito · compra_vendi · compra_ristruttura_vendi.", "reddito (immobile da affittare) · compra_vendi (rivendita)")
        spacer()

        # --- ACQUISTO ---
        subhead("🟢 ACQUISTO (colonne O-U)")
        field_row("O", "Data rogito", "Data del rogito notarile.", "2022-03-15")
        field_row("P", "Prezzo acquisto (€) ⚠️", "Prezzo finale al rogito (esclusi notaio/agenzia/imposte). OBBLIGATORIO.", "215000", mandatory=True)
        field_row("Q", "Notaio (€)", "Costo totale del notaio.", "4200")
        field_row("R", "Agenzia acquisto (€)", "Provvigione agenzia (lato acquirente).", "6500")
        field_row("S", "Imposte registro/IVA (€)", "Imposta di registro (2% o 9%) o IVA (10% o 22%) a seconda del regime.", "18500")
        field_row("T", "Spese tecniche/perizie (€)", "Perizie, visure, geometra, APE alla compravendita.", "1200")
        field_row("U", "Lavori sostenuti (€)", "Costi totali di ristrutturazione/manutenzione sostenuti.", "18000")
        spacer()

        # --- VALORE ---
        subhead("🩵 VALORE ATTUALE (colonna V)")
        field_row("V", "Valore stimato attuale (€)", "Tuo valore di mercato stimato OGGI. Aggiornalo periodicamente. Se vuoto, il sistema usa il prezzo di acquisto.", "285000")
        spacer()

        # --- LOCAZIONE ---
        subhead("🔴 LOCAZIONE (colonne W-AD)")
        callout("⚠️ IMPORTANTE", "Se l'immobile è SFITTO o NON locato, lascia vuote tutte le colonne W-AD. Se è AFFITTATO, compila almeno: canone, inquilino, email/telefono e date contratto.")
        field_row("W", "Canone mensile (€)", "Canone netto incassato ogni mese.", "1450 · 850.50")
        field_row("X", "Inquilino — Nome", "Nome completo dell'inquilino.", "Mario Bianchi · Studio Legale Rossi SRL")
        field_row("Y", "Inquilino — Email", "🔥 FONDAMENTALE per i solleciti automatici Email a T+5/15/30 giorni dalla scadenza canone.", "mario.bianchi@example.com")
        field_row("Z", "Inquilino — Telefono", "🔥 FONDAMENTALE per i solleciti automatici WhatsApp. Formato internazionale con prefisso.", "+393331234567 (NO spazi, NO trattini, sì il +)")
        field_row("AA", "Contratto — Data inizio", "Data inizio contratto di locazione.", "2023-09-01")
        field_row("AB", "Contratto — Data fine", "Data fine contratto.", "2027-08-31")
        field_row("AC", "Deposito cauzionale (€)", "Importo del deposito versato (di solito 3 mensilità).", "4350")
        field_row("AD", "Spese condominiali mensili (€)", "Quota mensile spese condominiali a carico tuo (proprietario).", "95")
        spacer()

        # --- MUTUO ---
        subhead("🟠 MUTUO (colonne AE-AK)")
        callout("ℹ️", "Compila SOLO se l'immobile è gravato da mutuo. Lascia tutto vuoto altrimenti. Il sistema crea automaticamente un record in /mutui con piano di ammortamento.", fg="1E40AF", bg="EEF4FF")
        field_row("AE", "Mutuo — Banca", "Banca erogatrice.", "Intesa Sanpaolo · UniCredit · BPER · Crédit Agricole")
        field_row("AF", "Mutuo — Importo originario (€)", "Capitale inizialmente erogato dalla banca.", "130000")
        field_row("AG", "Mutuo — Capitale residuo (€)", "Quanto manca da restituire OGGI. AGGIORNALO periodicamente per LTV accurato.", "95000")
        field_row("AH", "Mutuo — Rata mensile (€)", "Rata totale (quota capitale + quota interessi).", "540")
        field_row("AI", "Mutuo — Tasso (%)", "Tasso di interesse attuale, come numero (no simbolo %).", "2.8 · 4.15")
        field_row("AJ", "Mutuo — Tipo tasso", "DROPDOWN: fisso · variabile · misto.", "fisso")
        field_row("AK", "Mutuo — Data fine", "Data prevista di estinzione del mutuo.", "2042-03-15")
        spacer()

        # --- NOTE ---
        subhead("⚪ NOTE (colonna AL)")
        field_row("AL", "Note", "Annotazioni libere: caratteristiche peculiari, vincoli, problematiche, opportunità.", "Vista parco · Da rifare bagno · Inquilino in scadenza · Box auto incluso")
        spacer()

        # ============= ESEMPI =============
        section_header("📚 Esempi pratici di compilazione", "B45309")

        subhead("Esempio 1 — Bilocale a reddito con mutuo")
        kv("Scenario", "Immobile acquistato per metterlo a reddito. Affittato a un privato. Mutuo in essere.")
        kv("Campi chiave da compilare", "Tutti i campi di ANAGRAFICA, ACQUISTO, LOCAZIONE (W-AD), MUTUO (AE-AK)")
        kv("Stato", "affittato")
        kv("Operazione", "reddito")
        spacer()

        subhead("Esempio 2 — Immobile compra-ristruttura-vendi")
        kv("Scenario", "Immobile appena acquistato, in ristrutturazione, da rivendere a fine lavori.")
        kv("Campi chiave da compilare", "ANAGRAFICA, ACQUISTO (data, prezzo, costi accessori, lavori), VALORE atteso")
        kv("Campi da lasciare vuoti", "Tutta LOCAZIONE (non sarà affittato), MUTUO (se non finanziato).")
        kv("Stato", "in_ristrutturazione")
        kv("Operazione", "compra_ristruttura_vendi")
        spacer()

        subhead("Esempio 3 — Immobile a uso personale (no reddito)")
        kv("Scenario", "Immobile della società ma non messo a reddito (es. ufficio uso interno).")
        kv("Stato", "disponibile")
        kv("Operazione", "reddito (lascia, anche se canone=0)")
        kv("Locazione", "Lascia tutto vuoto (W-AD)")
        spacer()

        # ============= FAQ =============
        section_header("❓ FAQ — Domande frequenti", "DC2626")
        kv("Q: Posso aggiungere altre colonne al template?",
           "No. Il parser legge SOLO le 38 colonne previste nell'ordine esatto. Colonne aggiuntive vengono ignorate e righe spostate causano errori.")
        kv("Q: Posso riordinare le colonne?",
           "No. L'ordine è fisso. Modifica solo i VALORI dalla riga 3 in poi.")
        kv("Q: Cosa succede se sbaglio una data?",
           "Il parser mostra un warning sulla riga e il sistema importa con data vuota. Puoi correggere dopo l'import nella scheda immobile.")
        kv("Q: Cosa succede se carico un immobile già esistente?",
           "Il sistema crea sempre un NUOVO record (nessun update automatico). Verifica prima di confermare l'import.")
        kv("Q: I dropdown sono obbligatori?",
           "No, ma usando i valori del dropdown eviti errori di battitura. Se scrivi un valore custom, viene accettato ma il filtraggio per Stato/Operazione potrebbe non funzionare.")
        kv("Q: Posso lasciare vuoti i campi mutuo se ho il mutuo?",
           "Sì ma è SCONSIGLIATO. Senza dati mutuo: il cash flow non considera la rata, il debito totale è sottostimato, i KPI di sostenibilità sono sbagliati.")
        kv("Q: Excel mi sta cambiando il CAP 00184 in 184?",
           "Imposta il formato cella della colonna E (CAP) come 'Testo' prima di scrivere. Oppure prefissa con un apostrofo: '00184.")
        kv("Q: Errore «Template obsoleto rilevato»?",
           "Hai un vecchio file da 24 colonne. Scarica il nuovo template, ricompila i dati e ricarica.")
        kv("Q: L'AI estrae automaticamente i dati dal rogito PDF?",
           "Sì, ma solo dopo l'import: vai in Documenti → carica rogito.pdf → click su «AI» → estrazione automatica e aggiornamento della scheda.")
        spacer()

        # ============= EFFETTI POST IMPORT =============
        section_header("✨ Cosa succede automaticamente dopo l'import", "059669")
        bullet("📅 SCADENZARIO: se hai compilato la rendita catastale, vengono generate automaticamente le scadenze IMU (16 giugno acconto, 16 dicembre saldo).")
        bullet("📨 SOLLECITI: se hai compilato email e telefono dell'inquilino, partono i solleciti automatici T+5/15/30 giorni dalla scadenza canone (WhatsApp + Email pre-compilati).")
        bullet("🏦 MUTUI: se hai compilato banca/residuo/rata, viene creato un record in /mutui con piano di ammortamento e tutti gli alert finanziari (LTV, sostenibilità).")
        bullet("📊 KPI: tutti i KPI di portafoglio (rendimento medio netto, debito totale, cash flow) si aggiornano in tempo reale considerando le tue impostazioni fiscali (SRL/Privato).")
        bullet("🗺️ MAPPA: l'indirizzo viene geocodificato via Nominatim e l'immobile compare sulla mappa colorato in base al rendimento.")
        bullet("🎯 SCORE: ogni immobile riceve un Portfolio Score 0-100 basato su rendimento, cash flow, rischio, debito.")
        bullet("📑 BANKER PACK: gli immobili nuovi entrano automaticamente nel Banker Pack PDF, pronto da presentare in banca.")
        spacer()

        # ============= SUPPORTO =============
        section_header("🆘 Hai bisogno di aiuto?", "475569")
        bullet("Consulta il manuale completo nell'app: Sidebar → Manuale → sezione «13. Centro Import».")
        bullet("Per inserimenti complessi (multi-mutuo per immobile, contratti storici, lavori dettagliati) usa l'interfaccia diretta: Patrimonio → Nuovo immobile.")
        bullet("Per assistenza all'import in massa di portafogli con 50+ immobili, contatta il supporto.")
        spacer()

        # Footer
        ws2.merge_cells(start_row=row, start_column=2, end_row=row, end_column=3)
        c = ws2.cell(row=row, column=2, value="Real Estate Control Room · Documento generato automaticamente · v2.0 — Template a 38 campi")
        c.font = Font(italic=True, size=9, color="94A3B8")
        c.alignment = Alignment(horizontal="center", vertical="center")
        ws2.row_dimensions[row].height = 20


        # === Sheet 3: Valori ammessi ===
        ws3 = wb.create_sheet("Valori ammessi")
        ws3["A1"] = "📋 Valori ammessi per campi a dropdown"
        ws3["A1"].font = openpyxl.styles.Font(bold=True, size=14, color="0F172A")
        enums = [
            ("Tipologia", ["Bilocale", "Trilocale", "Quadrilocale", "Monolocale", "Villa", "Loft", "Attico", "Negozio", "Ufficio", "Box", "Altro"]),
            ("Classe energetica", ["A4", "A3", "A2", "A1", "A", "B", "C", "D", "E", "F", "G"]),
            ("Stato", ["in_valutazione", "in_trattativa", "acquistato", "in_ristrutturazione", "disponibile", "affittato", "sfitto", "in_vendita", "venduto"]),
            ("Operazione", ["reddito", "compra_vendi", "compra_ristruttura_vendi"]),
            ("Mutuo — Tipo tasso", ["fisso", "variabile", "misto"]),
        ]
        col = 1
        for label, values in enums:
            c = ws3.cell(row=3, column=col, value=label)
            c.font = openpyxl.styles.Font(bold=True, color="FFFFFF")
            c.fill = openpyxl.styles.PatternFill("solid", fgColor="0066FF")
            c.alignment = openpyxl.styles.Alignment(horizontal="center")
            for i, v in enumerate(values, 4):
                ws3.cell(row=i, column=col, value=v).font = openpyxl.styles.Font(color="0F172A")
            ws3.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 26
            col += 1

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="template_immobili_control_room.xlsx"'},
        )

    @router.post("/immobili/parse")
    async def parse_immobili(file: UploadFile = File(...), user: dict = Depends(current_user)):
        content = await file.read()
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
            ws = wb["Immobili"] if "Immobili" in wb.sheetnames else wb.active
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"File Excel non valido: {str(e)}")

        rows = []
        errors_total = 0
        n_cols = len(IMMOBILI_COLUMNS)

        # Detect formato template:
        # - Nuovo (3 righe header): riga 1 = super-header "ANAGRAFICA" ecc., riga 2 = colonne, dati da riga 3
        # - Vecchio (24 colonne, header riga 1, dati da riga 2): non più supportato
        row1_first = ws.cell(row=1, column=1).value or ""
        row1_first_str = str(row1_first).strip().upper()
        is_new_format = row1_first_str == "ANAGRAFICA"

        if not is_new_format:
            # Verifica se è un vecchio template (riga 1 = "Nome immobile")
            if row1_first_str.startswith("NOME"):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Template obsoleto rilevato (24 colonne). "
                        "Scarica il nuovo template da Centro Import → Scarica template, "
                        "ricompila i dati e ricarica. Il nuovo formato include inquilino email/telefono per i solleciti automatici, "
                        "dati catastali e mutuo completo."
                    ),
                )
            raise HTTPException(
                status_code=400,
                detail="Formato file non riconosciuto. Usa il template scaricabile da Centro Import.",
            )

        start_row = 3

        for row_idx in range(start_row, ws.max_row + 1):
            cells = [ws.cell(row=row_idx, column=i).value for i in range(1, n_cols + 1)]
            if not any(cells):
                continue
            nome = coerce_str(cells[0])
            if not nome:
                continue
            prezzo = coerce_float(cells[15])  # Prezzo acquisto è ora colonna 16 (idx 15)
            warnings = []
            if prezzo <= 0:
                warnings.append("Prezzo acquisto mancante o non valido")

            # Validazione email/telefono inquilino se presenti
            inq_email = coerce_str(cells[24])
            if inq_email and "@" not in inq_email:
                warnings.append("Email inquilino non valida")
            inq_tel = coerce_str(cells[25])
            if inq_tel and not (inq_tel.startswith("+") or inq_tel.isdigit()):
                warnings.append("Telefono inquilino senza prefisso internazionale (es. +39…)")

            item = {
                "_row": row_idx,
                # Anagrafica
                "nome": nome,
                "indirizzo": coerce_str(cells[1]),
                "citta": coerce_str(cells[2]),
                "provincia": coerce_str(cells[3]),
                "cap": coerce_str(cells[4]),
                "tipologia": coerce_str(cells[5]) or "Altro",
                "metratura": coerce_float(cells[6]),
                "piano": coerce_str(cells[7]),
                # Dati tecnici
                "anno_costruzione": coerce_int(cells[8]),
                "classe_energetica": coerce_str(cells[9]),
                "rendita_catastale": coerce_float(cells[10]),
                "valore_catastale": coerce_float(cells[11]),
                # Stato
                "stato": coerce_str(cells[12]) or "acquistato",
                "operazione": coerce_str(cells[13]) or "reddito",
                # Acquisto
                "data_acquisto": coerce_str(cells[14]),
                "prezzo_acquisto": prezzo,
                "notaio": coerce_float(cells[16]),
                "agenzia": coerce_float(cells[17]),
                "imposte": coerce_float(cells[18]),
                "spese_tecniche": coerce_float(cells[19]),
                "lavori": coerce_float(cells[20]),
                # Valore
                "valore_stimato": coerce_float(cells[21]) or prezzo,
                # Locazione
                "canone_mensile": coerce_float(cells[22]),
                "inquilino": coerce_str(cells[23]),
                "inquilino_email": inq_email,
                "inquilino_telefono": inq_tel,
                "contratto_data_inizio": coerce_str(cells[26]),
                "contratto_data_fine": coerce_str(cells[27]),
                "deposito": coerce_float(cells[28]),
                "spese_condominiali": coerce_float(cells[29]),
                # Mutuo
                "mutuo_banca": coerce_str(cells[30]),
                "mutuo_importo_originario": coerce_float(cells[31]),
                "mutuo_residuo": coerce_float(cells[32]),
                "mutuo_rata": coerce_float(cells[33]),
                "mutuo_tasso": coerce_float(cells[34]),
                "mutuo_tipo_tasso": coerce_str(cells[35]),
                "mutuo_data_fine": coerce_str(cells[36]),
                # Note
                "note": coerce_str(cells[37]),
                "warnings": warnings,
                "valid": len(warnings) == 0,
            }
            if warnings:
                errors_total += 1
            rows.append(item)
        return {
            "filename": file.filename, "total_rows": len(rows),
            "valid_rows": sum(1 for r in rows if r["valid"]),
            "rows_with_warnings": errors_total, "rows": rows,
        }

    @router.post("/immobili/commit")
    async def commit_immobili(payload: ImportImmobiliCommit, user: dict = Depends(current_user)):
        created = []
        for r in payload.rows:
            if not r.get("valid", True):
                continue
            mutuo = None
            if r.get("mutuo_banca") and (r.get("mutuo_residuo") or r.get("mutuo_importo_originario")):
                mutuo = {
                    "banca": r["mutuo_banca"],
                    "importo_originario": float(r.get("mutuo_importo_originario", 0) or 0),
                    "residuo": float(r.get("mutuo_residuo", 0) or 0),
                    "rata": float(r.get("mutuo_rata", 0) or 0),
                    "tasso": float(r.get("mutuo_tasso", 0) or 0),
                    "tipo_tasso": r.get("mutuo_tipo_tasso") or "fisso",
                    "data_fine": r.get("mutuo_data_fine") or "",
                }
            prop_id = f"IMM-{uuid.uuid4().hex[:6].upper()}"
            item = {
                "id": prop_id, "user_id": user["id"],
                "nome": r["nome"], "indirizzo": r.get("indirizzo", ""), "citta": r.get("citta", ""),
                "provincia": r.get("provincia", ""), "cap": r.get("cap", ""),
                "tipologia": r.get("tipologia", "Altro"),
                "metratura": float(r.get("metratura", 0) or 0), "piano": r.get("piano", ""),
                "anno_costruzione": int(r.get("anno_costruzione", 0) or 0),
                "classe_energetica": r.get("classe_energetica", ""),
                "rendita_catastale": float(r.get("rendita_catastale", 0) or 0),
                "valore_catastale": float(r.get("valore_catastale", 0) or 0),
                "stato": r.get("stato", "acquistato"),
                "operazione": r.get("operazione") or ("reddito" if r.get("canone_mensile", 0) > 0 else "compra_vendi"),
                "data_acquisto": r.get("data_acquisto", ""),
                "prezzo_acquisto": float(r.get("prezzo_acquisto", 0) or 0),
                "notaio": float(r.get("notaio", 0) or 0),
                "agenzia": float(r.get("agenzia", 0) or 0),
                "imposte": float(r.get("imposte", 0) or 0),
                "spese_tecniche": float(r.get("spese_tecniche", 0) or 0),
                "lavori": float(r.get("lavori", 0) or 0),
                "valore_stimato": float(r.get("valore_stimato", 0) or 0) or float(r.get("prezzo_acquisto", 0) or 0),
                "canone_mensile": float(r.get("canone_mensile", 0) or 0),
                # Locazione: inquilino + contatti (per solleciti automatici)
                "inquilino": r.get("inquilino", ""),
                "inquilino_email": r.get("inquilino_email", ""),
                "inquilino_telefono": r.get("inquilino_telefono", ""),
                "contratto_data_inizio": r.get("contratto_data_inizio", ""),
                "contratto_data_fine": r.get("contratto_data_fine", ""),
                "deposito": float(r.get("deposito", 0) or 0),
                "spese_condominiali": float(r.get("spese_condominiali", 0) or 0),
                "mutuo": mutuo,
                "note": r.get("note", ""),
                "img": "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?crop=entropy&cs=srgb&fm=jpg&w=800",
                "fromDeal": False, "deal_id": None, "source": "import_excel",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.properties.insert_one(item.copy())
            item.pop("_id", None)

            # Se il mutuo è ben definito, crea anche record in /mutui per il tracking centralizzato
            if mutuo and mutuo.get("residuo", 0) > 0 and mutuo.get("rata", 0) > 0:
                await db.mutui.insert_one({
                    "id": f"MUT-{uuid.uuid4().hex[:6].upper()}",
                    "user_id": user["id"],
                    "immobile_id": prop_id,
                    "banca": mutuo["banca"],
                    "importo_originario": mutuo.get("importo_originario", 0) or mutuo.get("residuo", 0),
                    "capitale_residuo": mutuo["residuo"],
                    "rata": mutuo["rata"],
                    "tasso": mutuo.get("tasso", 0),
                    "tipo_tasso": mutuo.get("tipo_tasso", "fisso"),
                    "data_fine": mutuo.get("data_fine", ""),
                    "source": "import_excel",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })

            created.append(_enrich_property(item))
        return {"created": len(created), "items": created}

    # ============= BILANCI =============
    @router.post("/bilancio/parse")
    async def parse_bilancio(file: UploadFile = File(...), user: dict = Depends(current_user)):
        if not llm_key:
            raise HTTPException(status_code=500, detail="LLM key non configurata")
        content = await file.read()
        text = _extract_text_from_upload(content, file.filename or "")
        if not text.strip():
            raise HTTPException(status_code=400, detail="Impossibile estrarre testo dal file.")
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=llm_key, session_id=f"bilancio-{uuid.uuid4()}",
                system_message=BILANCIO_EXTRACT_PROMPT,
            ).with_model("anthropic", "claude-sonnet-4-6")
            reply = await chat.send_message(UserMessage(text=text))
        except Exception as e:
            logging.exception("AI bilancio error")
            raise HTTPException(status_code=500, detail=f"Errore AI: {str(e)}")
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
        if not parsed:
            raise HTTPException(status_code=500, detail="L'AI non ha restituito JSON valido.")
        parsed["_filename"] = file.filename
        return parsed

    @router.post("/bilancio/commit")
    async def commit_bilancio(b: BilancioCommit, user: dict = Depends(current_user)):
        item = {
            "id": str(uuid.uuid4()), "user_id": user["id"], **b.model_dump(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.bilanci.insert_one(item.copy())
        item.pop("_id", None)
        return item

    @router.get("/bilanci")
    async def list_bilanci(user: dict = Depends(current_user)):
        items = await db.bilanci.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
        return items

    @router.get("/bilanci/storico")
    async def storico_bilanci(user: dict = Depends(current_user)):
        items = await db.bilanci.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
        if not items:
            return {"bilanci": [], "evoluzione": []}

        MESI_IT = {"gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
                   "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12}

        def periodo_key(b):
            p = (b.get("periodo") or "").lower().strip()
            for name, num in MESI_IT.items():
                if name in p:
                    m = re.search(r"(20\d{2})", p)
                    year = int(m.group(1)) if m else 0
                    return (year, num)
            m = re.search(r"q(\d)\s*(20\d{2})", p)
            if m:
                return (int(m.group(2)), int(m.group(1)) * 3)
            m = re.search(r"(20\d{2})", p)
            if m:
                return (int(m.group(1)), 0)
            return (0, 0)

        items_sorted_old_to_new = sorted(items, key=periodo_key)
        METRICS_CE = ["totale_ricavi", "ricavi_affitti", "totale_costi", "utile_netto"]
        METRICS_SP = ["valore_immobili", "debito_mutui", "liquidita", "patrimonio_netto"]

        def delta(curr, prev):
            if prev is None or prev == 0:
                return {"abs": curr, "pct": None}
            return {"abs": round(curr - prev, 2), "pct": round((curr - prev) / prev * 100, 2)}

        enriched = []
        for i, b in enumerate(items_sorted_old_to_new):
            prev = items_sorted_old_to_new[i - 1] if i > 0 else None
            ce = b.get("conto_economico", {}) or {}
            sp = b.get("stato_patrimoniale", {}) or {}
            diff_ce, diff_sp = {}, {}
            if prev:
                prev_ce = prev.get("conto_economico", {}) or {}
                prev_sp = prev.get("stato_patrimoniale", {}) or {}
                for k in METRICS_CE:
                    diff_ce[k] = delta(float(ce.get(k, 0) or 0), float(prev_ce.get(k, 0) or 0))
                for k in METRICS_SP:
                    diff_sp[k] = delta(float(sp.get(k, 0) or 0), float(prev_sp.get(k, 0) or 0))
            enriched.append({
                "id": b["id"], "periodo": b.get("periodo"), "tipo": b.get("tipo"),
                "created_at": b.get("created_at"),
                "conto_economico": ce, "stato_patrimoniale": sp,
                "diff_ce": diff_ce, "diff_sp": diff_sp,
            })

        evoluzione = [
            {
                "periodo": b["periodo"],
                "totale_ricavi": float((b["conto_economico"] or {}).get("totale_ricavi", 0) or 0),
                "totale_costi": float((b["conto_economico"] or {}).get("totale_costi", 0) or 0),
                "utile_netto": float((b["conto_economico"] or {}).get("utile_netto", 0) or 0),
                "patrimonio_netto": float((b["stato_patrimoniale"] or {}).get("patrimonio_netto", 0) or 0),
                "valore_immobili": float((b["stato_patrimoniale"] or {}).get("valore_immobili", 0) or 0),
                "debito_mutui": float((b["stato_patrimoniale"] or {}).get("debito_mutui", 0) or 0),
            }
            for b in items_sorted_old_to_new
        ]

        return {"bilanci": list(reversed(enriched)), "evoluzione": evoluzione}

    @router.get("/bilanci/latest")
    async def latest_bilancio(user: dict = Depends(current_user)):
        item = await db.bilanci.find_one({"user_id": user["id"]}, {"_id": 0}, sort=[("created_at", -1)])
        return item or {}

    @router.delete("/bilanci/{bid}")
    async def delete_bilancio(bid: str, user: dict = Depends(current_user)):
        await db.bilanci.delete_one({"id": bid, "user_id": user["id"]})
        return {"ok": True}

    # ============= BANCA =============
    @router.post("/banca/parse")
    async def parse_banca(
        file: UploadFile = File(...),
        mapping_json: Optional[str] = Form(None),  # override esplicito {"data":"Col1","importo":"Col2",...}
        user: dict = Depends(current_user),
    ):
        content = await file.read()
        fl = (file.filename or "").lower()
        df = _read_tabular_robust(content, fl)
        if df is None or df.empty:
            raise HTTPException(400, "File vuoto o non leggibile come tabella")

        # ===== Mapping colonne: 4-step ladder =====
        # 0) Preset salvato (matching signature delle colonne)
        cols_signature = "|".join(sorted([str(c).strip().lower() for c in df.columns]))
        preset_applied = None
        if not mapping_json:
            preset = await db.bank_mapping_presets.find_one({"user_id": user["id"], "columns_signature": cols_signature}, {"_id": 0})
            if preset:
                preset_applied = preset.get("nome")
        # 1) Override manuale dal frontend (priorità massima)
        mapping: dict = {}
        if mapping_json:
            try:
                mapping = json.loads(mapping_json)
            except Exception:
                mapping = {}
        elif preset_applied:
            mapping = preset.get("mapping") or {}

        cols_norm = {c: str(c).lower().strip() for c in df.columns}
        def find_keyword_col(keys: list[str]) -> Optional[str]:
            for k in keys:
                for orig, cl in cols_norm.items():
                    if k in cl:
                        return orig
            return None

        # 2) Heuristics
        col_data = mapping.get("data") or find_keyword_col(["data valuta", "data operazione", "data contabile", "data movimento", "data", "date"])
        col_imp = mapping.get("importo") or find_keyword_col(["importo", "amount", "valore"])
        col_dare = mapping.get("dare") or find_keyword_col(["dare", "addebito", "uscita", "debit"])
        col_avere = mapping.get("avere") or find_keyword_col(["avere", "accredito", "entrata", "credit"])
        col_desc = mapping.get("descrizione") or find_keyword_col(["descrizione", "causale", "operazione", "dettaglio", "movimento", "narrative"])

        # 3) AI fallback se mancano data/importo
        ai_used = False
        if (not col_data or (not col_imp and not (col_dare or col_avere))) and llm_key:
            try:
                ai_mapping = await _ai_detect_columns(llm_key, df.head(8).to_csv(index=False))
                if ai_mapping:
                    ai_used = True
                    col_data = col_data or ai_mapping.get("data")
                    col_imp = col_imp or ai_mapping.get("importo")
                    col_dare = col_dare or ai_mapping.get("dare")
                    col_avere = col_avere or ai_mapping.get("avere")
                    col_desc = col_desc or ai_mapping.get("descrizione")
            except Exception as ex:
                logging.warning(f"AI column detection fallita: {ex}")

        missing = []
        if not col_data:
            missing.append("data")
        if not col_imp and not (col_dare and col_avere) and not (col_dare or col_avere):
            missing.append("importo (o coppia dare/avere)")

        if missing:
            # NON sollevo eccezione: rispondo con preview parziale + chiedo mapping
            return {
                "status": "needs_mapping",
                "filename": file.filename,
                "available_columns": [str(c) for c in df.columns],
                "sample_rows": df.head(5).fillna("").astype(str).values.tolist(),
                "detected": {"data": col_data, "importo": col_imp, "dare": col_dare, "avere": col_avere, "descrizione": col_desc},
                "missing": missing,
                "ai_used": ai_used,
                "message": f"Non sono riuscito a identificare automaticamente: {', '.join(missing)}. Mappa le colonne manualmente.",
            }

        # ===== Parsing righe con errori dettagliati =====
        movs = []
        errors = []
        for idx, r in df.iterrows():
            row_num = int(idx) + 2  # +2 per riga umana (header + 1-based)
            try:
                # Importo: 3 vie
                if col_imp:
                    val = r.get(col_imp)
                    if pd.isna(val) or str(val).strip() in ("", "nan"):
                        continue
                    importo = _parse_amount(val)
                else:
                    dare = _parse_amount(r.get(col_dare)) if col_dare else 0
                    avere = _parse_amount(r.get(col_avere)) if col_avere else 0
                    dare = dare or 0
                    avere = avere or 0
                    if (dare == 0 and avere == 0):
                        continue
                    importo = avere - dare
                if importo is None:
                    errors.append({"row": row_num, "error": "importo non riconosciuto"})
                    continue
                data_iso = _parse_date(r.get(col_data))
                if not data_iso:
                    errors.append({"row": row_num, "error": "data non riconosciuta"})
                    continue
                desc = str(r.get(col_desc, "") or "")[:200] if col_desc else ""
                movs.append({
                    "data": data_iso, "descrizione": desc, "importo": importo,
                    "tipo": "entrata" if importo > 0 else "uscita", "match_canone": None,
                    "_row": row_num,
                })
            except Exception as ex:
                errors.append({"row": row_num, "error": str(ex)[:120]})

        # Match canoni
        properties_user = await db.properties.find({"user_id": user["id"], "canone_mensile": {"$gt": 0}}, {"_id": 0}).to_list(200)
        for m in movs:
            if m["tipo"] != "entrata":
                continue
            for p in properties_user:
                canone = float(p.get("canone_mensile", 0) or 0)
                if canone <= 0:
                    continue
                if abs(m["importo"] - canone) < 5:
                    m["match_canone"] = {"property_id": p["id"], "property_nome": p["nome"], "canone_atteso": canone}
                    break

        # Conteggio duplicati attesi (signature già esistente) + fuzzy variants
        existing_sigs = set()
        existing_amount_date = []  # (importo, data ISO) per fuzzy match
        if movs:
            existing = await db.movimenti_bancari.find({"user_id": user["id"]}, {"signature": 1, "importo": 1, "data": 1, "descrizione": 1, "id": 1}).to_list(2000)
            existing_sigs = {e["signature"] for e in existing if e.get("signature")}
            existing_amount_date = [(float(e.get("importo", 0)), str(e.get("data", ""))[:10], e.get("descrizione", ""), e.get("id")) for e in existing]
        for m in movs:
            m["duplicate"] = _movimento_signature(user["id"], m) in existing_sigs
            m["variant_of"] = None
            if m["duplicate"]:
                continue
            # Fuzzy variant: stesso importo, data entro ±2gg, descrizione DIVERSA
            try:
                m_date = date.fromisoformat(m["data"])
            except Exception:
                continue
            for ex_imp, ex_data_iso, ex_desc, ex_id in existing_amount_date:
                if abs(ex_imp - m["importo"]) > 0.01:
                    continue
                try:
                    ex_date = date.fromisoformat(ex_data_iso)
                except Exception:
                    continue
                if abs((m_date - ex_date).days) > 2:
                    continue
                if (m.get("descrizione") or "").strip().lower() == (ex_desc or "").strip().lower():
                    continue  # se desc identica → è duplicato già marcato
                m["variant_of"] = {"existing_id": ex_id, "existing_descrizione": ex_desc[:80], "existing_data": ex_data_iso}
                break

        return {
            "status": "ok",
            "filename": file.filename,
            "total": len(movs),
            "entrate": sum(1 for m in movs if m["tipo"] == "entrata"),
            "uscite": sum(1 for m in movs if m["tipo"] == "uscita"),
            "matched": sum(1 for m in movs if m["match_canone"]),
            "duplicates": sum(1 for m in movs if m["duplicate"]),
            "variants": sum(1 for m in movs if m.get("variant_of")),
            "errors": errors[:50],
            "errors_count": len(errors),
            "mapping_used": {"data": col_data, "importo": col_imp, "dare": col_dare, "avere": col_avere, "descrizione": col_desc},
            "available_columns": [str(c) for c in df.columns],
            "ai_used": ai_used,
            "preset_applied": preset_applied,
            "columns_signature": cols_signature,
            "movimenti": movs[:300],
        }

    # ===== Mapping presets per banca (rievoca per file dello stesso template) =====
    @router.get("/banca/mapping-presets")
    async def list_mapping_presets(user: dict = Depends(current_user)):
        items = await db.bank_mapping_presets.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
        return items

    @router.post("/banca/mapping-presets")
    async def save_mapping_preset(payload: dict, user: dict = Depends(current_user)):
        nome = (payload.get("nome") or "").strip()
        mapping = payload.get("mapping") or {}
        columns = payload.get("columns") or []
        if not nome:
            raise HTTPException(400, "Nome preset obbligatorio")
        if not mapping.get("data"):
            raise HTTPException(400, "Mapping incompleto: serve almeno la colonna 'data'")
        # Compute a column signature so that the preset auto-applica quando rivedi un file con quelle colonne
        sig = "|".join(sorted([str(c).strip().lower() for c in columns]))
        doc = {
            "id": f"BNK-{uuid.uuid4().hex[:8].upper()}",
            "user_id": user["id"],
            "nome": nome,
            "mapping": mapping,
            "columns": columns,
            "columns_signature": sig,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        # upsert per signature (no duplicati)
        await db.bank_mapping_presets.update_one(
            {"user_id": user["id"], "columns_signature": sig},
            {"$set": doc}, upsert=True,
        )
        return doc

    @router.delete("/banca/mapping-presets/{pid}")
    async def delete_mapping_preset(pid: str, user: dict = Depends(current_user)):
        r = await db.bank_mapping_presets.delete_one({"id": pid, "user_id": user["id"]})
        if r.deleted_count == 0:
            raise HTTPException(404, "Preset non trovato")
        return {"deleted": pid}

    @router.post("/banca/commit")
    async def commit_banca(payload: BancaCommit, user: dict = Depends(current_user)):
        created = 0
        skipped = 0
        for m in payload.movimenti:
            sig = _movimento_signature(user["id"], m)
            existing = await db.movimenti_bancari.find_one({"user_id": user["id"], "signature": sig})
            if existing:
                skipped += 1
                continue
            item = {
                "id": str(uuid.uuid4()), "user_id": user["id"],
                "data": m.get("data", ""), "descrizione": m.get("descrizione", ""),
                "importo": float(m.get("importo", 0) or 0), "tipo": m.get("tipo", "uscita"),
                "match_canone": m.get("match_canone"), "signature": sig,
                "imported_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.movimenti_bancari.insert_one(item)
            created += 1
        return {"created": created, "skipped_duplicates": skipped}

    @router.get("/banca")
    async def list_movimenti_bancari(
        user: dict = Depends(current_user),
        skip: int = 0, limit: int = 100,
        q: Optional[str] = None, tipo: Optional[str] = None, matched: Optional[bool] = None,
    ):
        query = {"user_id": user["id"]}
        if tipo in ("entrata", "uscita"):
            query["tipo"] = tipo
        if matched is True:
            query["match_canone"] = {"$ne": None}
        if matched is False:
            query["match_canone"] = None
        if q:
            query["descrizione"] = {"$regex": re.escape(q), "$options": "i"}
        total = await db.movimenti_bancari.count_documents(query)
        limit = max(1, min(500, limit))
        items = await db.movimenti_bancari.find(query, {"_id": 0}).sort("data", -1).skip(max(0, skip)).limit(limit).to_list(limit)
        return {"total": total, "skip": skip, "limit": limit, "items": items, "has_more": skip + len(items) < total}

    @router.get("/banca/cashflow-mensile")
    async def banca_cashflow_mensile(months: int = 12, user: dict = Depends(current_user)):
        cur = db.movimenti_bancari.aggregate([
            {"$match": {"user_id": user["id"], "data": {"$ne": ""}}},
            {"$addFields": {"ym": {"$substr": ["$data", 0, 7]}}},
            {"$group": {
                "_id": "$ym",
                "incassi": {"$sum": {"$cond": [{"$gt": ["$importo", 0]}, "$importo", 0]}},
                "uscite":  {"$sum": {"$cond": [{"$lt": ["$importo", 0]}, {"$abs": "$importo"}, 0]}},
            }},
            {"$sort": {"_id": -1}},
            {"$limit": max(1, min(36, months))},
        ])
        rows = await cur.to_list(36)
        rows = list(reversed(rows))
        MESI = {1: "Gen", 2: "Feb", 3: "Mar", 4: "Apr", 5: "Mag", 6: "Giu", 7: "Lug", 8: "Ago", 9: "Set", 10: "Ott", 11: "Nov", 12: "Dic"}
        out = []
        for r in rows:
            ym = r["_id"]
            try:
                y, m = ym.split("-")
                label = f"{MESI.get(int(m), '?')} '{y[-2:]}"
            except Exception:
                label = ym
            inc = round(r["incassi"], 2)
            usc = round(r["uscite"], 2)
            out.append({"mese": label, "ym": ym, "incassi": inc, "uscite": usc, "saldo": round(inc - usc, 2)})
        return {"count": len(out), "rows": out}

    @router.delete("/banca/{mid}")
    async def delete_movimento_bancario(mid: str, user: dict = Depends(current_user)):
        await db.movimenti_bancari.delete_one({"id": mid, "user_id": user["id"]})
        return {"ok": True}

    return router
