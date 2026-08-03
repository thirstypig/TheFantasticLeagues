/**
 * Per-player standings audit. See docs/superpowers/specs/2026-08-03-standings-audit-skill-design.md
 * Run: ./scripts/with-prod-db.sh npx tsx src/scripts/audit-standings.ts 20
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { prisma } from "../db/prisma.js";
import { reconcilePeriodStats } from "../features/players/services/mlbStatsSyncService.js";
import { buildIlWindows, wasOnIlAtPeriodStart } from "../lib/ilWindows.js";
import { parseFgStandings } from "../lib/audit/fgStandingsParser.js";
import { classifyTeamDelta, buildIlCandidates } from "../lib/audit/classifier.js";
import { computeTeamPeriodTotals, type RosterStint } from "../lib/audit/fbstTotals.js";
import { renderReport, type Coverage } from "../lib/audit/report.js";
import { emptyStatLine, type StatLine, type ClassifyResult } from "../lib/audit/types.js";

const PROD_REF = "oaogpsshewmcazhehryl";
const FG_COUNTING_KEYS = ["R", "HR", "RBI", "SB", "W", "SV", "K"] as const;

function assertProd(): void {
  if (!(process.env.DATABASE_URL ?? "").includes(PROD_REF)) {
    throw new Error(`Refusing to run: DATABASE_URL is not prod (${PROD_REF}). Use ./scripts/with-prod-db.sh`);
  }
}

/**
 * FanGraphs team names drop the trailing period FBST keeps ("Demolition
 * Lumber Co." in the app vs. "Demolition Lumber Co" on OnRoto), and the app
 * copy also carries a stray trailing space. Strip trailing whitespace and a
 * trailing "." before comparing either side so the join isn't silently
 * empty for the one team that happens to end in punctuation.
 */
function normalizeTeamName(name: string): string {
  return name.trim().replace(/\.+$/, "").trim();
}

async function main(): Promise<void> {
  assertProd();
  console.log("PROD confirmed — proceeding with audit");

  const leagueId = Number(process.argv[2] ?? 20);
  const periodArgIdx = process.argv.indexOf("--period");
  const explicitPeriod = periodArgIdx > -1 ? Number(process.argv[periodArgIdx + 1]) : null;
  if (process.argv.includes("--season")) {
    throw new Error(
      "--season is not implemented by this CLI yet (Task 9 scope is period mode only, " +
        "per docs/superpowers/plans/2026-08-03-standings-audit-skill.md Task 9). Omit the flag.",
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

  // --- MLB ground truth (independent of FanGraphs) ---
  const recon = await reconcilePeriodStats(period.id);
  console.log(
    `MLB reconcile: ${recon.playersChecked} checked, ${recon.mismatches.length} mismatches, ${recon.fetchErrors} fetch errors`,
  );

  // --- FanGraphs team-level tripwire (period mode: team-level only — Branch B, see design doc) ---
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

  // --- FBST layer: teams, rosters, IL windows, PSP — one query set for the whole league ---
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });

  // Roster window mirrors reconcilePeriodStats / audit_period.ts: everyone ever
  // rostered during the period, unfiltered here — computeTeamPeriodTotals applies
  // the acquired/released/IL-at-start window filters itself.
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
  const isOnIlAtPeriodStart = (playerId: number): boolean =>
    wasOnIlAtPeriodStart(playerId, period.startDate, ilWindowsByPlayer);

  // FINDING 1: pspByPlayer must cover EVERY player who could be counted by
  // computeTeamPeriodTotals / buildIlCandidates — both silently `continue` on
  // a missing row, and a missing row is indistinguishable from "genuinely
  // zero" inside those pure functions. Query PSP for the full rostered
  // population (not just the IL-windowed subset), then verify coverage below.
  const psp = await prisma.playerStatsPeriod.findMany({
    where: { periodId: period.id, playerId: { in: rosterPlayerIds } },
  });
  const pspByPlayer = new Map<number, StatLine>(
    psp.map((p) => [
      p.playerId,
      { AB: p.AB, H: p.H, R: p.R, HR: p.HR, RBI: p.RBI, SB: p.SB, W: p.W, SV: p.SV, K: p.K, IP: p.IP, ER: p.ER, BB_H: p.BB_H },
    ]),
  );

  // Coverage check: for every roster row that WOULD be counted by
  // computeTeamPeriodTotals's window filters, confirm a PSP row exists. A
  // miss here means "our query missed him", not "he had zero stats" — surface
  // it into Coverage so the verdict downgrades to INCOMPLETE instead of the
  // report silently under-counting a team.
  let playersSkipped = 0;
  const skipReasons: string[] = [];
  for (const r of rosters) {
    if (r.acquiredAt > period.endDate) continue;
    if (r.releasedAt && r.releasedAt <= period.startDate) continue;
    if (isOnIlAtPeriodStart(r.playerId)) continue;
    if (!pspByPlayer.has(r.playerId)) {
      playersSkipped++;
      const name = playerNameById.get(r.playerId) ?? `playerId ${r.playerId}`;
      skipReasons.push(`${name} (teamId=${r.teamId}): no PlayerStatsPeriod row for period ${period.id}`);
    }
  }

  // --- FBST per-team totals: the ONE accumulator (Task 8.5), not reimplemented here ---
  const fbstTotalsByTeam = computeTeamPeriodTotals({ teams, rosters, pspByPlayer, period, isOnIlAtPeriodStart });

  const results: ClassifyResult[] = [];
  for (const t of teams) {
    const fbstTotals = fbstTotalsByTeam.get(t.id) ?? emptyStatLine();

    const fgRaw = fgTeamsByNormName.get(normalizeTeamName(t.name)) ?? {};
    const fgTotals: StatLine = { ...emptyStatLine() };
    for (const k of FG_COUNTING_KEYS) {
      fgTotals[k] = Number(fgRaw[k] ?? 0);
    }

    // IL candidates for this team: every IL window belonging to a player
    // currently on this team's roster. buildIlWindows is player-scoped (not
    // team-scoped), so team attribution comes from the roster join here.
    const teamPlayerIds = new Set(rosterRows.filter((r) => r.teamId === t.id).map((r) => r.playerId));
    const windows: { playerId: number; playerName: string; start: Date; end: Date | null }[] = [];
    for (const playerId of teamPlayerIds) {
      const stints = ilWindowsByPlayer.get(playerId) ?? [];
      for (const w of stints) {
        windows.push({
          playerId,
          playerName: playerNameById.get(playerId) ?? `playerId ${playerId}`,
          start: w.startDate,
          end: w.endDate,
        });
      }
    }

    const candidates = buildIlCandidates({ teamName: t.name, ilWindows: windows, period, pspByPlayer });
    results.push(classifyTeamDelta({ teamName: t.name, fbstTotals, fgTotals, candidates }));
  }

  const coverage: Coverage = {
    playersChecked: recon.playersChecked,
    playersSkipped,
    skipReasons,
    sourcesReached: { fbst: true, mlb: recon.fetchErrors === 0, fg: fgReached, bbref: true },
    fgLegLevel: "team-level", // FG has no per-player period slice (spike 2026-08-03)
  };

  // KNOWN LIMITATION (discovered empirically 2026-08-03, not one of the three
  // carried-forward findings): FanGraphs' team-level breakdown rows are
  // season-cumulative-to-date, not period-scoped — confirmed by fetching the
  // live page and comparing e.g. Skunk Dogs R=713 (FG season) vs R=143 (FBST
  // Period 5 only, exact match to the known-good baseline). Every period-mode
  // run will therefore show a large, uniform-looking residual against every
  // team, driven by scale mismatch rather than a real per-period discrepancy.
  // The FG leg's practical value in period mode is limited to "did FanGraphs
  // move roughly the way we'd expect" — it is not a clean pass/fail signal
  // until a season-cumulative (or true snapshot-diffed) FBST comparator
  // exists. Do not read a FINDINGS verdict here as "money is wrong."
  console.warn(
    "\nNOTE: FanGraphs team-level totals are season-to-date, not period-scoped. " +
      "The residual table below reflects that scale mismatch, not a verified " +
      "per-period discrepancy — treat it as directional only until a " +
      "season-cumulative FBST comparator lands.",
  );

  const md = renderReport({ periodName: period.name, results, coverage });
  mkdirSync("../docs/reports", { recursive: true });
  const out = `../docs/reports/standings-audit-${period.name.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(out, md);
  console.log(`\n${md}\n\nWritten to ${out}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
