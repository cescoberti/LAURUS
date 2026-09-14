#!/usr/bin/env bash
# Run SQL against the live LAURUS database (Supabase Management API).
#
#   scripts/supa-sql.sh "select count(*) from laurus.items"
#   scripts/supa-sql.sh -f supabase/migrations/0013_voting_lists.sql
#
# The access token is the Supabase CLI login stored in the macOS keychain
# (`supabase login`), so nothing secret lives in the repo. Output is the
# query result as JSON (rows) or the API's error message.
set -euo pipefail

PROJECT_REF="cwpzmmbckggncioybhip"

if [ "${1:-}" = "-f" ]; then
  SQL=$(cat "$2")
else
  SQL="${1:?usage: supa-sql.sh <sql> | -f <file>}"
fi

TOKEN=$(security find-generic-password -l "Supabase CLI" -w)
BODY=$(printf '%s' "$SQL" | python3 -c 'import sys,json; print(json.dumps({"query": sys.stdin.read()}))')

curl -sS -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${BODY}" \
  | python3 -c '
import sys, json
data = json.load(sys.stdin)
if isinstance(data, list):
    for row in data:
        print(" | ".join(str(v) for v in row.values()))
    print(f"({len(data)} rows)", file=sys.stderr)
else:
    print(json.dumps(data, ensure_ascii=False))
'
