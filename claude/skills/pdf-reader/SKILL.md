---
name: pdf-reader
description: Use this skill whenever a task in this project involves reading, extracting text/tables from, or fetching a PDF file. Covers text-based PDFs, scanned/image-only PDFs (via OCR fallback), remote PDFs referenced by URL, and large PDFs that exceed the native Read tool's page/size limits. Trigger whenever the user mentions a .pdf file, a paper, a report, an invoice, or a document that needs to be parsed, searched, or summarized as part of a coding task.
---

# PDF Reader per Claude Code

## Perché questa skill

Il tool nativo `Read` di Claude Code legge i PDF ma ha limiti concreti:
- **Nessun fetch remoto**: non può scaricare un PDF da un URL da solo.
- **PDF scansionati**: se il PDF non ha uno strato di testo (è solo un'immagine), `Read` non estrae nulla.
- **Limiti di dimensione**: ~32MB e ~100 pagine per richiesta; documenti più grandi vanno letti a pezzi.
- **Tabelle**: `Read` non ricostruisce bene tabelle complesse.

Questa skill fornisce uno script robusto (`scripts/extract_pdf.py`) che gestisce tutti questi casi con un fallback automatico, più un helper per scaricare PDF remoti.

## Setup (una tantum per il progetto)

```bash
pip install pypdf pdfplumber pytesseract pdf2image --break-system-packages
# pytesseract richiede il binario tesseract installato sul sistema:
#   Ubuntu/Debian: sudo apt-get install tesseract-ocr poppler-utils
#   macOS: brew install tesseract poppler
```

Se `tesseract` non è disponibile, lo script funziona comunque per i PDF con testo nativo; l'OCR va semplicemente in errore controllato con un messaggio chiaro.

## Workflow

### 1. PDF locale, caso normale
Prova prima il `Read` nativo di Claude Code. Se il testo estratto è vuoto, troncato, o pieno di caratteri strani → passa allo script.

### 2. PDF remoto (URL)
Claude Code non fa fetch di file remoti. Scarica prima:
```bash
bash scripts/fetch_pdf.sh "https://example.com/paper.pdf" ./downloads/paper.pdf
```
Poi tratta il file come locale.

### 3. Estrazione robusta con fallback OCR
```bash
python3 scripts/extract_pdf.py document.pdf
```
Comportamento:
1. Prova `pdfplumber` per estrarre testo + tabelle pagina per pagina.
2. Se una pagina risulta senza testo (probabile scansione), fa OCR automaticamente con `pytesseract` su quella pagina.
3. Stampa un riepilogo per pagina (numero caratteri, se OCR è stato usato) così sai subito quali pagine erano scansionate.

Opzioni utili:
```bash
# Solo un intervallo di pagine (utile per PDF grandi, > 100 pagine)
python3 scripts/extract_pdf.py document.pdf --pages 34-45

# Forza OCR su tutte le pagine (PDF scansionato al 100%)
python3 scripts/extract_pdf.py document.pdf --force-ocr

# Estrai anche le tabelle in CSV separati
python3 scripts/extract_pdf.py document.pdf --tables --outdir ./extracted

# Salva il testo estratto su file invece che stdout
python3 scripts/extract_pdf.py document.pdf --output document.txt
```

### 4. Documenti molto grandi
Non caricare tutto il testo in una volta nel contesto. Usa `--pages` per leggere a blocchi (es. 20-30 pagine alla volta), riassumi ogni blocco, poi combina i riassunti. Questo evita di saturare la finestra di contesto, soprattutto con PDF densi di grafici o tabelle.

## Diagnosi rapida: "perché non riesce a leggerlo?"

| Sintomo | Causa probabile | Soluzione |
|---|---|---|
| `Read` ritorna vuoto o solo spazi | PDF scansionato senza OCR | `extract_pdf.py --force-ocr` |
| Errore "file not found" con un URL | Claude Code non fa fetch remoto | `fetch_pdf.sh` prima |
| Timeout / troppo lento | File troppo grande o troppe pagine | `--pages` a blocchi |
| Tabelle mescolate col testo | Estrazione testo semplice non basta | `--tables` con pdfplumber |
| Caratteri strani/mojibake | Font non standard o encoding custom | Prova OCR come fallback anche se il testo non è vuoto |

## Note

- Non installare mai pacchetti in ambienti CI/produzione senza verificare le policy del progetto.
- L'OCR è più lento e meno preciso del testo nativo: usalo solo quando necessario, non come default.
