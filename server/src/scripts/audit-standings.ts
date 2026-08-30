/**
 * Per-player standings audit. See docs/superpowers/specs/2026-08-03-standings-audit-skill-design.md
 * Run: ./scripts/with-prod-db.sh npx tsx src/scripts/audit-standings.ts 20
 *
 * Two independent legs, because FanGraphs and MLB statsapi can each only
 * answer one question:
 *   - Correctness leg (this period only): FBST PlayerStatsPeriod vs a fresh
 *     re-fetch from MLB statsapi (reconcilePeriodStats). This is the leg
 *     that matters most and is independent of FanGraphs entirely.
 *   - Reconciliation leg (season to date): FBST season totals (summed
 *     per-period via the one true accumulator) vs FanGraphs' season-to-date
 *     team totals, after subtracting every IL-exclusion divergence FBST's
 *     own data can explain. FanGraphs' display_stand.pl reports season
 *     cumulative values with no period slice (confirmed empirically
 *     2026-08-03: comparing them directly against period-only FBST totals
 *     produced a uniform ~500-run "residual" on every team that was pure
 *     scope mismatch, not a real finding). Comparing season-to-date against
 *     season-to-date is the correct apples-to-apples shape.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { prisma } from "../db/prisma.js";
import { reconcilePeriodStats } from "../features/players/services/mlbStatsSyncService.js";
import { buildIlWindows, wasOnIlAtPeriodStart } from "../lib/ilWindows.js";
import { parseFgStandings } from "../lib/audit/fgStandingsParser.js";
import { classifyTeamDelta } from "../lib/audit/classifier.js";
import { computeTeamPeriodTotals, findCoverageGaps, type RosterStint } from "../lib/audit/fbstTotals.js";
import { FG_COUNTING_KEYS, normalizeTeamName, toFgComparableStatLine } from "../lib/audit/fgCompare.js";
import { decideVerdict, renderReport, type Coverage, type Verdict } from "../lib/audit/report.js";
import { emptyStatLine, type StatLine, type ClassifyResult } from "../lib/audit/types.js";

const PROD_REF = "oaogpsshewmcazhehryl";
const STAT_KEYS = Object.keys(emptyStatLine()) as (keyof StatLine)[];

function assertProd(): void {
  if (!(process.env.DATABASE_URL ?? "").includes(PROD_REF)) {
    throw new Error(`Refusing to run: DATABASE_URL is not prod (${PROD_REF}). Use ./scripts/with-prod-db.sh`);
  }
}

interface PspRow {
  playerId: number;
  AB: number; H: number; R: number; HR: number; RBI: number; SB: number;
  W: number; SV: number; K: number; IP: number; ER: number; BB_H: number;
}

function buildPspMap(rows: PspRow[]): Map<number, StatLine> {
  return new Map(
    rows.map((p) => [
      p.playerId,
      { AB: p.AB, H: p.H, R: p.R, HR: p.HR, RBI: p.RBI, SB: p.SB, W: p.W, SV: p.SV, K: p.K, IP: p.IP, ER: p.ER, BB_H: p.BB_H },
    ]),
  );
}

function renderCorrectnessLegSection(args: {
  period: { name: string; id: number; startDate: Date; endDate: Date };
  recon: {
    playersChecked: number;
    fetchErrors: number;
    mismatches: { playerId: number; mlbId: number | null; field: string; stored: number; fresh: number }[];
  };
  coverage: { playersSkipped: number; skipReasons: string[] };
  verdict: Verdict;
}): string {
  const { period, recon, coverage, verdict } = args;
  const lines: string[] = [];
  lines.push(`## ${period.name} — FBST vs MLB statsapi`, "");
  lines.push(`**Verdict: ${verdict}**`, "");
  lines.push(
    `Players checked: ${recon.playersChecked} · fetch errors: ${recon.fetchErrors} · mismatches: ${recon.mismatches.length} · ` +
      `PSP coverage gaps: ${coverage.playersSkipped}` +
      (coverage.skipReasons.length ? ` (${coverage.skipReasons.join("; ")})` : ""),
  );
  lines.push("");
  if (recon.mismatches.length) {
    lines.push("| playerId | mlbId | field | stored | fresh (MLB) |", "|---|---|---|---|---|");
    for (const m of recon.mismatches) {
      lines.push(`| ${m.playerId} | ${m.mlbId ?? "—"} | ${m.field} | ${m.stored} | ${m.fresh} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  assertProd();
  console.log("PROD confirmed — proceeding with audit");

  const leagueId = Number(process.argv[2] ?? 20);
  const periodArgIdx = process.argv.indexOf("--period");
  const explicitPeriod = periodArgIdx > -1 ? Number(process.argv[periodArgIdx + 1]) : null;
  if (process.argv.includes("--season")) {
    throw new Error(
      "--season is not a mode. Every run emits BOTH legs: the period leg " +
        "(FBST vs MLB, correctness) and the season leg (FBST vs FanGraphs, " +
        "reconciliation). --period selects which period the first leg audits; " +
        "the season leg is always season-to-date because FanGraphs cannot " +
        "express a per-period slice. Omit the flag.",
    );
  }

  const period = explicitPeriod
    ? await prisma.period.findUniqueOrThrow({ where: { id: explicitPeriod } })
    : await prisma.period.findFirstOrThrow({
        where: { leagueId, status: "completed" },
        orderBy: { startDate: "desc" },
      });

  console.log(
    `Auditing ${period.name} (id=${period.id}) — ${period.startDate.toISOString().slice(0, 10)} -> ${period.endDate.toISOString().slice(0, 10)}`,
  );

  // --- Shared FBST scaffolding: teams, rosters, IL windows (period-independent) ---
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });

  const rosterRows = await prisma.roster.findMany({
    where: { team: { leagueId } },
    select: {
      teamId: true,
      playerId: true,
      acquiredAt: true,
      releasedAt: true,
      assignedPosition: true,
      player: { select: { posPrimary: true, name: true } },
    },
  });
  const rosters: RosterStint[] = rosterRows.map((r) => ({
    teamId: r.teamId,
    playerId: r.playerId,
    acquiredAt: r.acquiredAt,
    releasedAt: r.releasedAt,
    assignedPosition: r.assignedPosition,
    posPrimary: r.player.posPrimary,
  }));
  const playerNameById = new Map<number, string>(rosterRows.map((r) => [r.playerId, r.player.name]));
  const rosterPlayerIds = [...new Set(rosterRows.map((r) => r.playerId))];

  const ilEvents = await prisma.transactionEvent.findMany({
    where: { playerId: { in: rosterPlayerIds }, transactionType: { in: ["IL_STASH", "IL_ACTIVATE"] }, effDate: { not: null } },
    select: { playerId: true, transactionType: true, effDate: true },
    orderBy: { effDate: "asc" },
  });
  const ilWindowsByPlayer = buildIlWindows(ilEvents);

  // ===================== CORRECTNESS LEG: target period only =====================
  const recon = await reconcilePeriodStats(period.id);
  console.log(
    `MLB reconcile: ${recon.playersChecked} checked, ${recon.mismatches.length} mismatches, ${recon.fetchErrors} fetch errors`,
  );

  const pspTarget = await prisma.playerStatsPeriod.findMany({
    where: { periodId: period.id, playerId: { in: rosterPlayerIds } },
  });
  const pspByPlayerTarget = buildPspMap(pspTarget);
  const periodCoverage = findCoverageGaps({
    rosters,
    period,
    pspByPlayer: pspByPlayerTarget,
    isOnIlAtPeriodStart: (playerId) => wasOnIlAtPeriodStart(playerId, period.startDate, ilWindowsByPlayer),
    playerNameById,
  });

  const periodVerdict: Verdict =
    periodCoverage.playersSkipped > 0
      ? "INCOMPLETE"
      : recon.mismatches.length > 0 || recon.fetchErrors > 0
        ? "FINDINGS"
        : "PASS";

  // ===================== RECONCILIATION LEG: season to date =====================
  let fgTeams: Record<string, Record<string, string>> = {};
  let fgReached = false;
  let fgThrough: string | null = null;
  try {
    const res = await fetch(
      "https://onroto.fangraphs.com/baseball/webnew/display_stand.pl?OGBA+6&session_id=guest",
      { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" } },
    );
    const parsed = parseFgStandings(await res.text());
    fgTeams = parsed.teams;
    fgThrough = parsed.through;
    fgReached = true;
    console.log(`FanGraphs coverage: ${fgThrough}`);
  } catch (err) {
    console.error(`FanGraphs leg FAILED: ${String(err)} — run will be INCOMPLETE`);
  }
  const fgTeamsByNormName = new Map<string, Record<string, string>>();
  for (const [name, stats] of Object.entries(fgTeams)) {
    fgTeamsByNormName.set(normalizeTeamName(name), stats);
  }

  // Completed periods only. Including the ACTIVE period made the season leg
  // unusable on the first day of a new one: the period opens with zero
  // PlayerStatsPeriod rows, so every rostered player is reported as a coverage
  // gap and the verdict is forced to INCOMPLETE — 188 spurious skips on
  // 2026-08-30, the day Period 7 opened. It also cannot change any total,
  // because FanGraphs is season-to-date through the last completed day.
  const seasonPeriods = await prisma.period.findMany({
    where: { leagueId, status: "completed" },
    orderBy: { startDate: "asc" },
  });

  const seasonTotalsByTeam = new Map<number, StatLine>(teams.map((t) => [t.id, emptyStatLine()]));
  let seasonPlayersSkipped = 0;
  const seasonSkipReasons: string[] = [];

  for (const q of seasonPeriods) {
    const pspQ = await prisma.playerStatsPeriod.findMany({
      where: { periodId: q.id, playerId: { in: rosterPlayerIds } },
    });
    const pspByPlayerQ = buildPspMap(pspQ);
    const isOnIlAtQStart = (playerId: number): boolean => wasOnIlAtPeriodStart(playerId, q.startDate, ilWindowsByPlayer);

    const gaps = findCoverageGaps({ rosters, period: q, pspByPlayer: pspByPlayerQ, isOnIlAtPeriodStart: isOnIlAtQStart, playerNameById });
    seasonPlayersSkipped += gaps.playersSkipped;
    seasonSkipReasons.push(...gaps.skipReasons);

    // The ONE accumulator (Task 8.5), called once per period and summed —
    // not a second accumulator, just repeated calls to the same pure fn.
    const totalsQ = computeTeamPeriodTotals({ teams, rosters, pspByPlayer: pspByPlayerQ, period: q, isOnIlAtPeriodStart: isOnIlAtQStart });

    for (const t of teams) {
      const acc = seasonTotalsByTeam.get(t.id)!;
      const add = totalsQ.get(t.id)!;
      for (const k of STAT_KEYS) acc[k] += add[k];
    }
  }

  const seasonResults: ClassifyResult[] = teams.map((t) => {
    const fgRaw = fgTeamsByNormName.get(normalizeTeamName(t.name)) ?? {};
    const fgTotals: StatLine = { ...emptyStatLine() };
    for (const k of FG_COUNTING_KEYS) {
      fgTotals[k] = Number(fgRaw[k] ?? 0);
    }
    return classifyTeamDelta({
      teamName: t.name,
      fbstTotals: toFgComparableStatLine(seasonTotalsByTeam.get(t.id)!),
      fgTotals,
      // No validated divergence mechanism exists — residual is the raw
      // FBST-minus-FG diff. See the header comment in lib/audit/classifier.ts
      // for why the one producer that existed was deleted, and the bar a
      // replacement has to clear.
      candidates: [],
    });
  });

  const seasonCoverage: Coverage = {
    playersChecked: rosterPlayerIds.length,
    playersSkipped: seasonPlayersSkipped,
    skipReasons: seasonSkipReasons,
    // mlb/bbref aren't participants in this leg (mlb backs the correctness
    // leg above; bbref is the still-unwired four-way tie-break) — vacuously
    // true here rather than a false signal of "source failed".
    sourcesReached: { fbst: true, mlb: true, fg: fgReached, bbref: true },
    fgLegLevel: "team-level", // FG has no per-player slice at all (spike 2026-08-03)
  };
  const seasonVerdict = decideVerdict({ results: seasonResults, coverage: seasonCoverage });

  // ===================== COMBINE =====================
  // INCOMPLETE outranks FINDINGS on either leg; PASS requires both legs clean.
  const overallVerdict: Verdict =
    periodVerdict === "INCOMPLETE" || seasonVerdict === "INCOMPLETE"
      ? "INCOMPLETE"
      : periodVerdict === "FINDINGS" || seasonVerdict === "FINDINGS"
        ? "FINDINGS"
        : "PASS";

  const periodSection = renderCorrectnessLegSection({ period, recon, coverage: periodCoverage, verdict: periodVerdict });
  const seasonSection =
    `## Season to date — FBST vs FanGraphs\n\n` +
    `FanGraphs values are season-to-date (${fgThrough ?? "coverage unknown — fetch failed"}), matched against FBST ` +
    `season-to-date totals summed across every active/completed period (${seasonPeriods.map((p) => p.name).join(", ")}). ` +
    `Residuals are the raw FBST-minus-FG difference: no divergence-explanation layer is applied, because no ` +
    `proposed mechanism has survived testing against the teams that reconcile exactly.\n\n` +
    renderReport({ periodName: "Season to date — FBST vs FanGraphs", results: seasonResults, coverage: seasonCoverage });

  const md = [
    `# Standings audit — ${period.name}`,
    "",
    `**Overall verdict: ${overallVerdict}** (period leg: ${periodVerdict} · season leg: ${seasonVerdict})`,
    "",
    periodSection,
    "",
    seasonSection,
  ].join("\n");

  console.log(`\n${md}\n`);

  mkdirSync("../docs/reports", { recursive: true });
  const out = `../docs/reports/standings-audit-${period.name.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(out, md);
  console.log(`Written to ${out}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
