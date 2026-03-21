#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Auction Multi-User Test Script
# Run: bash scripts/auction-multi-user-test.sh
#
# Tests the full auction flow with 3 different team owners:
#   DMK (Diamond Kings) — nominates, sets proxy bid
#   DVD (Devil Dawgs)   — bids, gets outbid by proxy
#   SKD (Skunk Dogs)    — bids
#
# Prerequisites:
#   - API server running on localhost:4010
#   - League 19 (OGBA 2026) with test owners assigned
#   - Test accounts: owner.dmk@test.com, owner.dvd@test.com, owner.skd@test.com
# ═══════════════════════════════════════════════════════════════════

set -e

API="http://localhost:4010/api"
SB_URL="https://oaogpsshewmcazhehryl.supabase.co"
SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hb2dwc3NoZXdtY2F6aGVocnlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDc1MjIsImV4cCI6MjA4ODU4MzUyMn0.QKwi6n2TSuR_c6oi_cs8gHiodCGXvoQsQLVDF9xD6Vk"
LID=19  # League 19 = OGBA 2026
PASS=0
FAIL=0

# ─── Helper functions ────────────────────────────────────────────
login() {
  curl -s -X POST "${SB_URL}/auth/v1/token?grant_type=password" \
    -H "apikey: ${SB_KEY}" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"devpass123\"}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token','FAIL'))"
}

check() {
  local label="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "  ✅ $label"
    PASS=$((PASS+1))
  else
    echo "  ❌ $label (expected: $expected, got: $actual)"
    FAIL=$((FAIL+1))
  fi
}

# ─── Setup ───────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════╗"
echo "║   AUCTION MULTI-USER TEST                       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

echo "Logging in test users..."
TOK_ADMIN=$(login "jimmychang316@gmail.com")
TOK_DMK=$(login "owner.dmk@test.com")
TOK_DVD=$(login "owner.dvd@test.com")
TOK_SKD=$(login "owner.skd@test.com")

if [ "$TOK_ADMIN" = "FAIL" ] || [ "$TOK_DMK" = "FAIL" ]; then
  echo "❌ Login failed. Make sure the API server is running and test accounts exist."
  exit 1
fi
echo "  All 4 users logged in"
echo ""

# ─── Reset auction ──────────────────────────────────────────────
echo "Resetting auction for league $LID..."
curl -s -X POST "$API/auction/reset" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOK_ADMIN" -d "{\"leagueId\":$LID}" > /dev/null
curl -s -X POST "$API/auction/init" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOK_ADMIN" -d "{\"leagueId\":$LID}" > /dev/null
echo "  Auction initialized"
echo ""

# ─── Find an available player ───────────────────────────────────
echo "Finding an available player..."
PLAYER=$(curl -s "$API/player-season-stats?leagueId=$LID" -H "Authorization: Bearer $TOK_ADMIN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for s in d.get('stats',[]):
    if not s.get('ogba_team_code') and not s.get('team') and s.get('mlb_id') and s.get('dollar_value') and int(s.get('dollar_value',0)) > 10:
        is_p = 'true' if s.get('is_pitcher') else 'false'
        print(f'{s[\"mlb_id\"]}|{s[\"player_name\"]}|{s.get(\"positions\",\"UT\")}|{s.get(\"mlb_team\",\"FA\")}|{is_p}')
        break
")
PLAYER_ID=$(echo "$PLAYER" | cut -d'|' -f1)
PLAYER_NAME=$(echo "$PLAYER" | cut -d'|' -f2)
PLAYER_POS=$(echo "$PLAYER" | cut -d'|' -f3)
PLAYER_TEAM=$(echo "$PLAYER" | cut -d'|' -f4)
PLAYER_PITCHER=$(echo "$PLAYER" | cut -d'|' -f5)
echo "  Found: $PLAYER_NAME ($PLAYER_POS, $PLAYER_TEAM) MLB ID: $PLAYER_ID"
echo ""

# ─── Test 1: Nomination ────────────────────────────────────────
echo "═══ TEST: Nomination ═══"
R=$(curl -s -X POST "$API/auction/nominate" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOK_DMK" \
  -d "{\"leagueId\":$LID,\"nominatorTeamId\":133,\"playerId\":\"$PLAYER_ID\",\"playerName\":\"$PLAYER_NAME\",\"startBid\":10,\"positions\":\"$PLAYER_POS\",\"team\":\"$PLAYER_TEAM\",\"isPitcher\":$PLAYER_PITCHER}")
check "DMK nominates $PLAYER_NAME at \$10" "currentBid" "$R"

# ─── Test 2: Bidding ───────────────────────────────────────────
echo ""
echo "═══ TEST: Bidding ═══"
R=$(curl -s -X POST "$API/auction/bid" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOK_DVD" -d "{\"leagueId\":$LID,\"bidderTeamId\":135,\"amount\":20}")
check "DVD bids \$20" "currentBid" "$R"

R=$(curl -s -X POST "$API/auction/bid" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOK_SKD" -d "{\"leagueId\":$LID,\"bidderTeamId\":138,\"amount\":30}")
check "SKD bids \$30" "currentBid" "$R"

# ─── Test 3: Proxy bidding ─────────────────────────────────────
echo ""
echo "═══ TEST: Proxy Bidding ═══"
R=$(curl -s -X POST "$API/auction/proxy-bid" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOK_DMK" -d "{\"leagueId\":$LID,\"bidderTeamId\":133,\"maxBid\":50}")
check "DMK sets proxy at \$50 (auto-bids to \$31)" "success" "$R"

R=$(curl -s -X POST "$API/auction/bid" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOK_DVD" -d "{\"leagueId\":$LID,\"bidderTeamId\":135,\"amount\":45}")
BID=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('nomination',{}).get('currentBid','?'))" 2>/dev/null)
check "DVD bids \$45 → proxy counters to \$46" "46" "$BID"

HIGH=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('nomination',{}).get('highBidderTeamId','?'))" 2>/dev/null)
check "DMK (133) is high bidder after proxy" "133" "$HIGH"

# ─── Test 4: Finish lot ────────────────────────────────────────
echo ""
echo "═══ TEST: Finish Lot ═══"
R=$(curl -s -X POST "$API/auction/finish" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOK_ADMIN" -d "{\"leagueId\":$LID}")
WINNER=$(echo "$R" | python3 -c "
import sys,json; d=json.load(sys.stdin)
wins=[l for l in d.get('log',[]) if l.get('type')=='WIN']
if wins: print(f'{wins[0][\"teamName\"]}|\${wins[0][\"amount\"]}')
else: print('NONE')
" 2>/dev/null)
check "Winner is Diamond Kings at \$46" "Diamond Kings|\$46" "$WINNER"

STATUS=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
check "Status returns to nominating" "nominating" "$STATUS"

# ─── Test 5: Budget verification ───────────────────────────────
echo ""
echo "═══ TEST: Budget Verification ═══"
echo "$R" | python3 -c "
import sys,json; d=json.load(sys.stdin)
for t in d.get('teams',[]):
    print(f'  {t[\"name\"]:25s} \${t[\"budget\"]:>3} | {t.get(\"rosterCount\",0)} players | spots={t.get(\"spotsLeft\",0)} | max=\${t[\"maxBid\"]}')
"

DMK_ROSTER=$(echo "$R" | python3 -c "
import sys,json; d=json.load(sys.stdin)
for t in d.get('teams',[]):
    if t['id']==133: print(t.get('rosterCount',0))
" 2>/dev/null)
check "DMK roster increased to 5" "5" "$DMK_ROSTER"

# ─── Test 6: Security — wrong team ────────────────────────────
echo ""
echo "═══ TEST: Security ═══"
R=$(curl -s -X POST "$API/auction/bid" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOK_DVD" -d "{\"leagueId\":$LID,\"bidderTeamId\":133,\"amount\":1}")
check "DVD can't bid for DMK's team" "not own" "$R"

R=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/auction/nominate" \
  -H "Content-Type: application/json" -d "{\"leagueId\":$LID,\"nominatorTeamId\":133,\"playerId\":\"1\",\"playerName\":\"X\",\"startBid\":1,\"positions\":\"P\",\"team\":\"X\",\"isPitcher\":true}")
check "No auth → 401" "401" "$R"

# ─── Summary ──────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   RESULTS: $PASS passed, $FAIL failed              ║"
echo "╚══════════════════════════════════════════════════╝"

[ $FAIL -eq 0 ] && exit 0 || exit 1
