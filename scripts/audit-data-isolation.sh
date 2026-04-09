#!/usr/bin/env bash
# Data Isolation Audit — checks for Prisma queries on league-scoped models
# that may be missing leagueId scoping. Run before multi-league launch.
#
# Usage: bash scripts/audit-data-isolation.sh

set -euo pipefail

echo "=== Data Isolation Audit ==="
echo ""

# Models that MUST be scoped by leagueId (directly or via team relation)
SCOPED_MODELS="team\.findMany|team\.findFirst|roster\.findMany|roster\.findFirst|trade\.findMany|trade\.findFirst|waiverClaim\.findMany|waiverClaim\.findFirst|auctionSession\.find|period\.findMany|period\.findFirst|teamStatsPeriod\.find|boardCard\.find|aiInsight\.find|matchup\.find|leagueRule\.find|transactionEvent\.find|tradingBlock\.find|watchlist\.find"

echo "Checking route files for potentially unscoped queries..."
echo ""

ISSUES=0

for f in server/src/features/*/routes.ts server/src/features/*/routes/*.ts; do
  [ -f "$f" ] || continue

  # Find lines with league-scoped model queries
  MATCHES=$(grep -n "prisma\.\($SCOPED_MODELS\)" "$f" 2>/dev/null || true)

  if [ -n "$MATCHES" ]; then
    while IFS= read -r line; do
      LINENUM=$(echo "$line" | cut -d: -f1)

      # Check if the line or nearby lines include leagueId
      CONTEXT=$(sed -n "$((LINENUM > 3 ? LINENUM - 3 : 1)),${LINENUM}p" "$f")

      if ! echo "$CONTEXT" | grep -q "leagueId\|requireLeagueMember\|requireCommissionerOrAdmin"; then
        echo "  ⚠️  $f:$LINENUM — may be missing leagueId scope"
        echo "      $(echo "$line" | cut -d: -f2-)"
        ISSUES=$((ISSUES + 1))
      fi
    done <<< "$MATCHES"
  fi
done

echo ""

# Check middleware coverage
echo "Checking middleware coverage on GET endpoints..."
echo ""

for f in server/src/features/*/routes.ts; do
  [ -f "$f" ] || continue

  # Find GET routes that take leagueId but don't have requireLeagueMember
  GETS=$(grep -n 'router\.get.*requireAuth' "$f" | grep -v 'requireLeagueMember\|requireCommissionerOrAdmin\|requireAdmin' || true)

  if [ -n "$GETS" ]; then
    while IFS= read -r line; do
      LINENUM=$(echo "$line" | cut -d: -f1)
      # Check if the handler references leagueId
      HANDLER=$(sed -n "${LINENUM},$((LINENUM + 5))p" "$f")
      if echo "$HANDLER" | grep -q "leagueId\|req\.query\.leagueId"; then
        echo "  ⚠️  $f:$LINENUM — GET with leagueId but no requireLeagueMember middleware"
        ISSUES=$((ISSUES + 1))
      fi
    done <<< "$GETS"
  fi
done

echo ""
echo "=== Audit Complete ==="
echo "Issues found: $ISSUES"
if [ $ISSUES -eq 0 ]; then
  echo "✅ All league-scoped queries appear to be properly scoped."
else
  echo "⚠️  Review the above findings for potential cross-league data leaks."
fi
