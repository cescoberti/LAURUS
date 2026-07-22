#!/usr/bin/env python3
"""
extract_pdf.py — Estrazione robusta di testo (e opzionalmente tabelle) da PDF,
con fallback automatico a OCR per le pagine senza strato di testo.

Uso:
    python3 extract_pdf.py document.pdf
    python3 extract_pdf.py document.pdf --pages 34-45
    python3 extract_pdf.py document.pdf --force-ocr
    python3 extract_pdf.py document.pdf --tables --outdir ./extracted
    python3 extract_pdf.py document.pdf --output document.txt
"""
import argparse
import sys
import os


def parse_page_range(spec, total_pages):
    if not spec:
        return list(range(total_pages))
    start, end = spec.split("-")
    start = max(1, int(start))
    end = min(total_pages, int(end))
    return list(range(start - 1, end))


def ocr_page(pdf_path, page_index):
    try:
        from pdf2image import convert_from_path
        import pytesseract
    except ImportError:
        return None, "OCR non disponibile: installa 'pytesseract' e 'pdf2image' (pip install pytesseract pdf2image --break-system-packages) e il binario tesseract."
    try:
        images = convert_from_path(
            pdf_path, first_page=page_index + 1, last_page=page_index + 1
        )
        if not images:
            return "", None
        text = pytesseract.image_to_string(images[0])
        return text, None
    except Exception as e:
        return None, f"Errore OCR sulla pagina {page_index + 1}: {e}"


def extract_tables_for_page(page):
    tables = page.extract_tables()
    return tables


def main():
    parser = argparse.ArgumentParser(description="Estrazione robusta di testo/tabelle da PDF con fallback OCR.")
    parser.add_argument("pdf_path", help="Percorso del file PDF")
    parser.add_argument("--pages", help="Intervallo di pagine, es. 34-45 (1-indexed, inclusivo)")
    parser.add_argument("--force-ocr", action="store_true", help="Forza OCR su tutte le pagine selezionate")
    parser.add_argument("--tables", action="store_true", help="Estrai anche le tabelle in CSV")
    parser.add_argument("--outdir", default=".", help="Cartella di output per le tabelle CSV (default: cartella corrente)")
    parser.add_argument("--output", help="Salva il testo estratto su file invece che stampare su stdout")
    parser.add_argument("--min-chars-per-page", type=int, default=20,
                         help="Soglia di caratteri sotto la quale una pagina è considerata 'senza testo' e si tenta l'OCR (default: 20)")
    args = parser.parse_args()

    if not os.path.isfile(args.pdf_path):
        print(f"Errore: file non trovato: {args.pdf_path}", file=sys.stderr)
        sys.exit(1)

    try:
        import pdfplumber
    except ImportError:
        print("Errore: manca 'pdfplumber'. Installa con: pip install pdfplumber --break-system-packages", file=sys.stderr)
        sys.exit(1)

    if args.tables:
        os.makedirs(args.outdir, exist_ok=True)

    output_lines = []
    summary_lines = []

    with pdfplumber.open(args.pdf_path) as pdf:
        total_pages = len(pdf.pages)
        page_indices = parse_page_range(args.pages, total_pages)

        for idx in page_indices:
            page = pdf.pages[idx]
            page_num = idx + 1
            text = page.extract_text() or ""
            used_ocr = False

            if args.force_ocr or len(text.strip()) < args.min_chars_per_page:
                ocr_text, err = ocr_page(args.pdf_path, idx)
                if err:
                    summary_lines.append(f"Pagina {page_num}: testo nativo {len(text.strip())} caratteri, OCR fallito -> {err}")
                elif ocr_text is not None:
                    if len(ocr_text.strip()) > len(text.strip()):
                        text = ocr_text
                        used_ocr = True

            output_lines.append(f"\n--- Pagina {page_num} ---\n{text}")
            summary_lines.append(f"Pagina {page_num}: {len(text.strip())} caratteri{' (OCR)' if used_ocr else ''}")

            if args.tables:
                tables = extract_tables_for_page(page)
                for t_idx, table in enumerate(tables):
                    if not table:
                        continue
                    csv_path = os.path.join(args.outdir, f"page_{page_num}_table_{t_idx + 1}.csv")
                    with open(csv_path, "w", encoding="utf-8") as f:
                        for row in table:
                            f.write(",".join([str(c) if c is not None else "" for c in row]) + "\n")
                    summary_lines.append(f"  -> tabella salvata: {csv_path}")

    full_text = "\n".join(output_lines)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(full_text)
        print(f"Testo salvato in: {args.output}", file=sys.stderr)
    else:
        print(full_text)

    print("\n=== Riepilogo per pagina ===", file=sys.stderr)
    for line in summary_lines:
        print(line, file=sys.stderr)


if __name__ == "__main__":
    main()
