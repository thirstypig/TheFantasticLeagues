/**
 * Data Integrity Audit for League 20
 * Run: node scripts/audit-league.cjs
 */
const path = require("path");
const { PrismaClient } = require(path.resolve(__dirname, "../server/node_modules/.prisma/client"));
const prisma = new PrismaClient();

const LEAGUE_ID = 20;
const OHTANI_PLAYER_ID_HINT = "Ohtani"; // We'll detect by name

async function main() {
  console.log(`\n========================================`);
  console.log(`  DATA INTEGRITY AUDIT — League ${LEAGUE_ID}`);
  console.log(`  ${new Date().toISOString()}`);
  console.log(`========================================\n`);

  let issues = 0;

  // ─── 1. MULTI-TEAM PLAYERS ───────────────────────
  console.log(`\n── 1. Multi-Team Players ──────────────────`);
  const multiTeam = await prisma.$queryRaw`
    SELECT r."playerId", p."name", p."posPrimary",
           array_agg(DISTINCT t."name") AS teams,
           count(DISTINCT r."teamId")::int AS team_count
    FROM "Roster" r
    JOIN "Player" p ON p.id = r."playerId"
    JOIN "Team" t ON t.id = r."teamId"
    WHERE t."leagueId" = ${LEAGUE_ID}
      AND r."releasedAt" IS NULL
    GROUP BY r."playerId", p."name", p."posPrimary"
    HAVING count(DISTINCT r."teamId") > 1
  `;

  if (multiTeam.length === 0) {
    console.log("  ✓ No players on multiple teams");
  } else {
    for (const row of multiTeam) {
      const isOhtani = row.name.toLowerCase().includes("ohtani");
      if (isOhtani) {
        console.log(`  ℹ Ohtani two-way exception: ${row.name} on ${row.teams.join(", ")} (${row.team_count} entries) — OK`);
      } else {
        issues++;
        console.log(`  ✗ ISSUE: ${row.name} (id=${row.playerId}) on ${row.team_count} teams: ${row.teams.join(", ")}`);
        console.log(`    FIX: Release duplicate roster entries, keep the correct one`);
      }
    }
  }

  // ─── 2. GHOST ROSTER ENTRIES ─────────────────────
  console.log(`\n── 2. Ghost Roster Entries (unreleased TRADE_IN) ──`);
  const ghosts = await prisma.$queryRaw`
    SELECT r.id AS roster_id, r."playerId", p."name", r."teamId", t."name" AS team_name,
           r."source", r."acquiredAt"
    FROM "Roster" r
    JOIN "Player" p ON p.id = r."playerId"
    JOIN "Team" t ON t.id = r."teamId"
    WHERE t."leagueId" = ${LEAGUE_ID}
      AND r."releasedAt" IS NULL
      AND r."source" LIKE '%TRADE_IN%'
      AND r."playerId" IN (
        SELECT r2."playerId"
        FROM "Roster" r2
        JOIN "Team" t2 ON t2.id = r2."teamId"
        WHERE t2."leagueId" = ${LEAGUE_ID}
          AND r2."releasedAt" IS NULL
        GROUP BY r2."playerId"
        HAVING count(*) > 1
      )
    ORDER BY r."playerId"
  `;

  // Also check for TRADE_IN entries where the player was later traded/dropped
  const tradeInReleased = await prisma.$queryRaw`
    SELECT r.id AS roster_id, r."playerId", p."name", r."teamId", t."name" AS team_name,
           r."source", r."acquiredAt",
           (SELECT count(*) FROM "Roster" r3
            WHERE r3."playerId" = r."playerId"
              AND r3."teamId" != r."teamId"
              AND r3."releasedAt" IS NULL
              AND r3."teamId" IN (SELECT id FROM "Team" WHERE "leagueId" = ${LEAGUE_ID})
           )::int AS other_active_count
    FROM "Roster" r
    JOIN "Player" p ON p.id = r."playerId"
    JOIN "Team" t ON t.id = r."teamId"
    WHERE t."leagueId" = ${LEAGUE_ID}
      AND r."releasedAt" IS NULL
      AND r."source" LIKE '%TRADE_IN%'
    ORDER BY r."playerId"
  `;

  if (ghosts.length === 0 && tradeInReleased.filter(r => r.other_active_count > 0).length === 0) {
    console.log("  ✓ No ghost TRADE_IN entries");
  } else {
    for (const row of ghosts) {
      issues++;
      console.log(`  ✗ GHOST: ${row.name} (roster=${row.roster_id}) on ${row.team_name} via ${row.source}`);
      console.log(`    FIX: Set releasedAt on the stale entry`);
    }
  }

  console.log(`  Total active TRADE_IN entries: ${tradeInReleased.length}`);

  // ─── 3. TRADE ANOMALIES ─────────────────────────
  console.log(`\n── 3. Trade Anomalies ─────────────────────`);
  const tradeAnomalies = await prisma.$queryRaw`
    SELECT id, status, "createdAt", "processedAt",
           EXTRACT(EPOCH FROM ("processedAt" - "createdAt"))::int AS diff_secs
    FROM "Trade"
    WHERE "leagueId" = ${LEAGUE_ID}
      AND "processedAt" IS NOT NULL
      AND "processedAt" < "createdAt"
  `;

  if (tradeAnomalies.length === 0) {
    console.log("  ✓ No trade timestamp anomalies");
  } else {
    for (const t of tradeAnomalies) {
      issues++;
      console.log(`  ✗ Trade #${t.id}: processedAt (${t.processedAt}) before createdAt (${t.createdAt}) — diff=${t.diff_secs}s`);
      console.log(`    FIX: Investigate and correct timestamps`);
    }
  }

  // Also check for reversed trades
  const reversed = await prisma.$queryRaw`
    SELECT id, status, "createdAt", "processedAt"
    FROM "Trade"
    WHERE "leagueId" = ${LEAGUE_ID}
      AND status = 'REVERSED'
  `;
  console.log(`  Reversed trades: ${reversed.length}`);
  for (const t of reversed) {
    console.log(`    Trade #${t.id} — reversed at ${t.processedAt || 'N/A'}`);
  }

  // ─── 4. ROSTER COUNTS ───────────────────────────
  console.log(`\n── 4. Roster Counts (expect 23 per team) ──`);
  const rosterCounts = await prisma.$queryRaw`
    SELECT t.id AS team_id, t."name" AS team_name,
           count(r.id)::int AS active_players,
           count(CASE WHEN p."posPrimary" IN ('SP','RP','P','CL') THEN 1 END)::int AS pitchers,
           count(CASE WHEN p."posPrimary" NOT IN ('SP','RP','P','CL') THEN 1 END)::int AS hitters
    FROM "Team" t
    LEFT JOIN "Roster" r ON r."teamId" = t.id AND r."releasedAt" IS NULL
    LEFT JOIN "Player" p ON p.id = r."playerId"
    WHERE t."leagueId" = ${LEAGUE_ID}
    GROUP BY t.id, t."name"
    ORDER BY t."name"
  `;

  for (const row of rosterCounts) {
    const ok = row.active_players === 23;
    const marker = ok ? "✓" : "✗";
    if (!ok) issues++;
    console.log(`  ${marker} ${row.team_name}: ${row.active_players} players (${row.hitters}H + ${row.pitchers}P)${ok ? '' : ' ← WRONG'}`);
  }

  // ─── 5. STATS CONSISTENCY ───────────────────────
  console.log(`\n── 5. Stats Consistency (PlayerStatsPeriod vs TeamStatsPeriod) ──`);

  // Get active periods for league 20
  const periods = await prisma.$queryRaw`
    SELECT p.id, p."name", p."status"
    FROM "Period" p
    WHERE p."leagueId" = ${LEAGUE_ID}
    ORDER BY p.id
  `;

  if (periods.length === 0) {
    console.log("  ℹ No periods found for league 20");
  }

  let statsIssues = 0;
  for (const period of periods) {
    // Sum player stats per team for this period
    const playerSums = await prisma.$queryRaw`
      SELECT r."teamId",
             COALESCE(SUM(ps."R"), 0)::int AS "pR",
             COALESCE(SUM(ps."HR"), 0)::int AS "pHR",
             COALESCE(SUM(ps."RBI"), 0)::int AS "pRBI",
             COALESCE(SUM(ps."SB"), 0)::int AS "pSB",
             COALESCE(SUM(ps."W"), 0)::int AS "pW",
             COALESCE(SUM(ps."SV"), 0)::int AS "pSV",
             COALESCE(SUM(ps."K"), 0)::int AS "pK"
      FROM "PlayerStatsPeriod" ps
      JOIN "Roster" r ON r."playerId" = ps."playerId"
                      AND r."teamId" IN (SELECT id FROM "Team" WHERE "leagueId" = ${LEAGUE_ID})
                      AND r."releasedAt" IS NULL
      WHERE ps."periodId" = ${period.id}
      GROUP BY r."teamId"
    `;

    const teamStats = await prisma.$queryRaw`
      SELECT ts."teamId", ts."R", ts."HR", ts."RBI", ts."SB", ts."W", ts."S", ts."K"
      FROM "TeamStatsPeriod" ts
      WHERE ts."periodId" = ${period.id}
    `;

    const teamStatsMap = {};
    for (const ts of teamStats) {
      teamStatsMap[ts.teamId] = ts;
    }

    for (const ps of playerSums) {
      const ts = teamStatsMap[ps.teamId];
      if (!ts) continue;

      const diffs = [];
      if (ps.pR !== ts.R) diffs.push(`R: player=${ps.pR} team=${ts.R}`);
      if (ps.pHR !== ts.HR) diffs.push(`HR: player=${ps.pHR} team=${ts.HR}`);
      if (ps.pRBI !== ts.RBI) diffs.push(`RBI: player=${ps.pRBI} team=${ts.RBI}`);
      if (ps.pSB !== ts.SB) diffs.push(`SB: player=${ps.pSB} team=${ts.SB}`);
      if (ps.pW !== ts.W) diffs.push(`W: player=${ps.pW} team=${ts.W}`);
      if (ps.pSV !== ts.S) diffs.push(`SV: player=${ps.pSV} team=${ts.S}`);
      if (ps.pK !== ts.K) diffs.push(`K: player=${ps.pK} team=${ts.K}`);

      if (diffs.length > 0) {
        statsIssues++;
        if (statsIssues <= 10) {
          console.log(`  ✗ Period "${period.name}" (id=${period.id}), team=${ps.teamId}: ${diffs.join(", ")}`);
        }
      }
    }
  }

  if (statsIssues === 0) {
    console.log("  ✓ All team stat snapshots match player stat sums");
  } else {
    issues += statsIssues;
    if (statsIssues > 10) console.log(`  ... and ${statsIssues - 10} more mismatches`);
    console.log(`  FIX: Re-run stats sync or recalculate team stats from player stats`);
  }

  // ─── 6. BUDGET SANITY ───────────────────────────
  console.log(`\n── 6. Budget Sanity ───────────────────────`);

  // Get league starting budget and FAAB budget from rules
  const budgetRule = await prisma.leagueRule.findFirst({
    where: { leagueId: LEAGUE_ID, category: "draft", key: "budget" },
  });
  const startingBudget = budgetRule ? parseInt(budgetRule.value) : 400;

  const league = await prisma.league.findUnique({
    where: { id: LEAGUE_ID },
    select: { faabBudget: true },
  });
  const faabBudget = league?.faabBudget ?? 200;
  console.log(`  Auction budget: $${startingBudget} | FAAB budget: $${faabBudget}`);

  // Use Prisma queries (no raw alias issues)
  const teams = await prisma.team.findMany({
    where: { leagueId: LEAGUE_ID },
    select: { id: true, name: true, budget: true },
    orderBy: { name: "asc" },
  });

  for (const team of teams) {
    // Get all active roster entries grouped by source
    const rosterEntries = await prisma.roster.findMany({
      where: { teamId: team.id, releasedAt: null },
      select: { source: true, price: true },
    });

    // Source breakdown
    const bySource = {};
    for (const r of rosterEntries) {
      const src = r.source || "unknown";
      bySource[src] = (bySource[src] || 0) + r.price;
    }

    const activeSpend = rosterEntries.reduce((s, r) => s + r.price, 0);

    // Waiver FAAB spent (including on released players)
    const waiverAgg = await prisma.roster.aggregate({
      where: { teamId: team.id, source: { startsWith: "waiver" } },
      _sum: { price: true },
    });
    const waiverSpend = waiverAgg._sum.price ?? 0;

    // Budget trade assets received/sent
    const budgetIn = await prisma.tradeItem.aggregate({
      where: {
        recipientId: team.id,
        assetType: "BUDGET",
        trade: { leagueId: LEAGUE_ID, status: "PROCESSED" },
      },
      _sum: { amount: true },
    });
    const budgetOut = await prisma.tradeItem.aggregate({
      where: {
        senderId: team.id,
        assetType: "BUDGET",
        trade: { leagueId: LEAGUE_ID, status: "PROCESSED" },
      },
      _sum: { amount: true },
    });
    const netBudgetTrades = (budgetIn._sum.amount ?? 0) - (budgetOut._sum.amount ?? 0);

    // Finance ledger adjustments
    const ledgerAgg = await prisma.financeLedger.aggregate({
      where: { teamId: team.id },
      _sum: { amount: true },
    });
    const ledgerNet = ledgerAgg._sum.amount ?? 0;

    const remaining = team.budget;
    const negativeBudget = remaining < 0;

    const marker = negativeBudget ? "✗" : "✓";
    if (negativeBudget) issues++;

    const srcParts = Object.entries(bySource)
      .sort(([,a], [,b]) => b - a)
      .map(([src, total]) => `${src}=$${total}`)
      .join(", ");

    let detail = `budget=$${remaining}, roster_total=$${activeSpend}`;
    if (srcParts) detail += ` [${srcParts}]`;
    if (waiverSpend > 0) detail += `, waiver_faab=$${waiverSpend}`;
    if (netBudgetTrades !== 0) detail += `, trade_budget_net=$${netBudgetTrades}`;
    if (ledgerNet !== 0) detail += `, ledger_net=$${ledgerNet}`;
    if (negativeBudget) detail += " ← NEGATIVE BUDGET!";

    console.log(`  ${marker} ${team.name}: ${detail}`);
  }

  // ─── 7. ERA/WHIP MATH VALIDATION ─────────────────
  console.log(`\n── 7. ERA/WHIP Math Validation ─────────────`);

  // parseIP: convert baseball notation (.1=⅓, .2=⅔) to real decimal
  function parseIP(v) {
    const n = parseFloat(String(v ?? "0"));
    if (!Number.isFinite(n)) return 0;
    const whole = Math.floor(n);
    const frac = Math.round((n - whole) * 10);
    return whole + frac / 3;
  }

  let eraWhipIssues = 0;
  for (const period of periods) {
    const teamStatsList = await prisma.teamStatsPeriod.findMany({
      where: { periodId: period.id },
      include: { team: { select: { name: true } } },
    });
    for (const ts of teamStatsList) {
      const ip = parseIP(ts.ERA !== 0 || ts.WHIP !== 0 ? ts.gamesPlayed : 0); // Use actual IP from player stats
      // Get actual IP from player stats sum for this team/period
      const ipAgg = await prisma.$queryRaw`
        SELECT COALESCE(SUM(ps."IP"), 0) AS total_ip, COALESCE(SUM(ps."ER"), 0) AS total_er, COALESCE(SUM(ps."BB_H"), 0) AS total_bbh
        FROM "PlayerStatsPeriod" ps
        JOIN "Roster" r ON r."playerId" = ps."playerId" AND r."releasedAt" IS NULL
        WHERE ps."periodId" = ${period.id} AND r."teamId" = ${ts.teamId}
      `;
      if (ipAgg.length > 0 && ipAgg[0].total_ip > 0) {
        const realIP = parseFloat(String(ipAgg[0].total_ip));
        const realER = parseInt(String(ipAgg[0].total_er));
        const realBBH = parseInt(String(ipAgg[0].total_bbh));
        const expectedERA = (realER * 9) / realIP;
        const expectedWHIP = realBBH / realIP;
        const eraDiff = Math.abs(ts.ERA - expectedERA);
        const whipDiff = Math.abs(ts.WHIP - expectedWHIP);
        if (eraDiff > 0.20) {
          eraWhipIssues++;
          if (eraWhipIssues <= 5)
            console.log(`  ✗ ${ts.team.name} (period ${period.name}): ERA=${ts.ERA.toFixed(3)} expected=${expectedERA.toFixed(3)} diff=${eraDiff.toFixed(3)}`);
        }
        if (whipDiff > 0.20) {
          eraWhipIssues++;
          if (eraWhipIssues <= 5)
            console.log(`  ✗ ${ts.team.name} (period ${period.name}): WHIP=${ts.WHIP.toFixed(3)} expected=${expectedWHIP.toFixed(3)} diff=${whipDiff.toFixed(3)}`);
        }
      }
    }
  }
  if (eraWhipIssues === 0) {
    console.log("  ✓ ERA/WHIP math consistent with player stats");
  } else {
    issues += eraWhipIssues;
    if (eraWhipIssues > 5) console.log(`  ... and ${eraWhipIssues - 5} more`);
  }

  // ─── 8. IP FORMAT VALIDATION ────────────────────
  console.log(`\n── 8. IP Format Validation ────────────────`);

  const badIPs = await prisma.$queryRaw`
    SELECT ps.id, ps."playerId", p."name", ps."IP", ps."periodId"
    FROM "PlayerStatsPeriod" ps
    JOIN "Player" p ON p.id = ps."playerId"
    WHERE ps."IP" > 0
      AND ps."periodId" IN (SELECT id FROM "Period" WHERE "leagueId" = ${LEAGUE_ID})
      AND ABS(ps."IP" - ROUND(CAST(ps."IP" AS numeric))) > 0.01
      AND ABS(CAST(ps."IP" AS numeric) - FLOOR(CAST(ps."IP" AS numeric)) - 0.333) > 0.05
      AND ABS(CAST(ps."IP" AS numeric) - FLOOR(CAST(ps."IP" AS numeric)) - 0.667) > 0.05
      AND ABS(CAST(ps."IP" AS numeric) - FLOOR(CAST(ps."IP" AS numeric))) > 0.01
    LIMIT 10
  `;

  if (badIPs.length === 0) {
    console.log("  ✓ All IP values are valid (integer, .33, or .67 fractions)");
  } else {
    issues += badIPs.length;
    for (const row of badIPs) {
      console.log(`  ✗ ${row.name} (period ${row.periodId}): IP=${row.IP} — invalid fractional value`);
    }
  }

  // ─── 9. POSITION DISPLAY (TWP CHECK) ────────────
  console.log(`\n── 9. Position Display (TWP) ──────────────`);

  const twpEntries = await prisma.$queryRaw`
    SELECT r.id, p."name", p."posPrimary", r."assignedPosition", t."name" AS team_name
    FROM "Roster" r
    JOIN "Player" p ON p.id = r."playerId"
    JOIN "Team" t ON t.id = r."teamId"
    WHERE t."leagueId" = ${LEAGUE_ID}
      AND r."releasedAt" IS NULL
      AND p."posPrimary" = 'TWP'
      AND (r."assignedPosition" IS NULL OR r."assignedPosition" = '')
  `;

  if (twpEntries.length === 0) {
    console.log("  ✓ No TWP entries without assignedPosition");
  } else {
    issues += twpEntries.length;
    for (const row of twpEntries) {
      console.log(`  ✗ ${row.name} on ${row.team_name}: posPrimary=TWP, no assignedPosition set`);
    }
  }

  // ─── 10. PERIOD COVERAGE ────────────────────────
  console.log(`\n── 10. Period Coverage (active periods only) ──`);

  const activePeriods = periods.filter(p => p.status === "active");
  for (const period of activePeriods) {
    const teamIds = await prisma.team.findMany({
      where: { leagueId: LEAGUE_ID },
      select: { id: true, name: true },
    });
    for (const team of teamIds) {
      const rosterCount = await prisma.roster.count({
        where: { teamId: team.id, releasedAt: null },
      });
      const statsCount = await prisma.$queryRaw`
        SELECT count(*)::int AS cnt
        FROM "PlayerStatsPeriod" ps
        JOIN "Roster" r ON r."playerId" = ps."playerId" AND r."teamId" = ${team.id} AND r."releasedAt" IS NULL
        WHERE ps."periodId" = ${period.id}
      `;
      const cnt = statsCount[0]?.cnt ?? 0;
      if (cnt === 0 && rosterCount > 0) {
        issues++;
        console.log(`  ✗ ${team.name} has ${rosterCount} rostered players but 0 stats in period "${period.name}"`);
      }
    }
  }
  let periodCoverageIssues = false;
  // (issues already incremented above if any team missing stats)
  if (activePeriods.length === 0) {
    console.log("  ℹ No active periods to check");
  }

  // ─── SUMMARY ────────────────────────────────────
  console.log(`\n========================================`);
  console.log(`  AUDIT COMPLETE: ${issues} issue(s) found`);
  console.log(`========================================\n`);

  await prisma.$disconnect();
  process.exit(issues > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Audit failed:", e);
  prisma.$disconnect();
  process.exit(2);
});
