#!/usr/bin/env bash
# Export prod Supabase URLs from Railway, assert we're on prod, then exec.
# Usage: ./scripts/with-prod-db.sh npx tsx src/scripts/audit-standings.ts --period 39
set -euo pipefail

PROD_REF="oaogpsshewmcazhehryl"

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <command> [args...]" >&2
  exit 64
fi

VARS="$(env -u RAILWAY_API_TOKEN railway variables --kv)"
DATABASE_URL="$(printf '%s\n' "$VARS" | grep '^DATABASE_URL=' | cut -d= -f2-)"
DIRECT_URL="$(printf '%s\n' "$VARS" | grep '^DIRECT_URL=' | cut -d= -f2-)"
# Supabase API (Storage etc.) for scripts that need it, e.g. archive/upload-source-workbooks.ts.
SUPABASE_URL="$(printf '%s\n' "$VARS" | grep '^SUPABASE_URL=' | cut -d= -f2-)"
SUPABASE_SERVICE_ROLE_KEY="$(printf '%s\n' "$VARS" | grep '^SUPABASE_SERVICE_ROLE_KEY=' | cut -d= -f2-)"
export DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY

case "$DATABASE_URL" in
  *"$PROD_REF"*) ;;
  *) echo "REFUSING: DATABASE_URL is not prod ($PROD_REF)." >&2; exit 1 ;;
esac
case "$SUPABASE_URL" in
  *"$PROD_REF"*) ;;
  *) echo "REFUSING: SUPABASE_URL is not prod ($PROD_REF)." >&2; exit 1 ;;
esac

echo "PROD confirmed ($PROD_REF)" >&2
exec "$@"
