#!/usr/bin/env bash
# fetch_pdf.sh — scarica un PDF remoto in locale.
# Claude Code non può fare il fetch di file remoti da solo: usa questo script
# prima di passare il file a extract_pdf.py o al tool Read nativo.
#
# Uso:
#   bash fetch_pdf.sh "https://example.com/paper.pdf" ./downloads/paper.pdf

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Uso: $0 <url> <percorso_output.pdf>" >&2
  exit 1
fi

URL="$1"
OUT="$2"

mkdir -p "$(dirname "$OUT")"

echo "Scaricando $URL -> $OUT" >&2
curl -L --fail --silent --show-error -o "$OUT" "$URL"

if [ ! -s "$OUT" ]; then
  echo "Errore: il file scaricato è vuoto." >&2
  exit 1
fi

FILETYPE=$(file -b --mime-type "$OUT" 2>/dev/null || echo "sconosciuto")
if [ "$FILETYPE" != "application/pdf" ]; then
  echo "Attenzione: il file scaricato non sembra un PDF (mime-type: $FILETYPE). Controlla l'URL." >&2
fi

echo "Fatto: $OUT" >&2
