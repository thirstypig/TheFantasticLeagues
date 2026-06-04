/**
 * Spot-check a team's PSP stats by pitcher for each period.
 * Helps identify missing/wrong PSP rows.
 */
import { prisma } from "../db/prisma.js";
import { buildIlWindows, wasOnIlAtPeriodStart } from "../lib/ilWindows.js";

const PITCHER_CODES = new Set(["P", "SP", "RP", "CL", "TWP"]);
const leagueId = 20;

async function main() {
  const teamCode = process.argv[2] ?? "SHW"; // default: The Show

  const team = await prisma.team.findFirst({
    where: { leagueId, code: teamCode },
    select: { id: true, name: true, code: true },
  });
  if (!team) { console.error("Team not found:", teamCode); process.exit(1); }

  const periods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active","completed"] } },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, startDate: true, endDate: true },
  });

  const rosters = await prisma.roster.findMany({
    where: { teamId: team.id },
    select: {
      playerId: true, acquiredAt: true, releasedAt: true, assignedPosition: true,
      player: { select: { name: true, mlbId: true, posPrimary: true } },
    },
  });

  const ilEvents = await prisma.transactionEvent.findMany({
    where: {
      playerId: { in: rosters.map(r => r.playerId) },
      transactionType: { in: ["IL_STASH","IL_ACTIVATE"] },
      effDate: { not: null },
    },
    select: { playerId: true, transactionType: true, effDate: true },
    orderBy: { effDate: "asc" },
  });
  const ilWindowsByPlayer = buildIlWindows(ilEvents);

  console.log(`\n${team.name} (${team.code}) — pitcher PSP by period\n`);

  for (const period of periods) {
    const psp = await prisma.playerStatsPeriod.findMany({
      where: { periodId: period.id, playerId: { in: rosters.map(r => r.playerId) } },
    });
    const pspMap = new Map(psp.map(p => [p.playerId, p]));

    console.log(`--- ${period.name}: ${period.startDate.toISOString().slice(0,10)} → ${period.endDate.toISOString().slice(0,10)} ---`);
    console.log(`${"Player".padEnd(24)} ${"Pos".padEnd(4)} ${"Status".padEnd(8)}  W  SV    K   IP    ERA  in PSP?`);

    let totalW = 0, totalSV = 0, totalK = 0;

    for (const r of rosters) {
      const pos = (r.assignedPosition ?? r.player.posPrimary ?? "").toUpperCase();
      if (!PITCHER_CODES.has(pos)) continue; // pitchers only

      // Was this player on the team during this period?
      const overlaps = r.acquiredAt <= period.endDate &&
        (r.releasedAt === null || r.releasedAt > period.startDate);
      if (!overlaps) continue;

      const onIl = wasOnIlAtPeriodStart(r.playerId, period.startDate, ilWindowsByPlayer);
      const ps = pspMap.get(r.playerId);

      const status = onIl ? "IL-start" : "active";
      const hasPsp = ps ? "YES" : "NO ⚠";
      const w = ps?.W ?? "-";
      const sv = ps?.SV ?? "-";
      const k = ps?.K ?? "-";
      const ip = ps ? (ps.IP).toFixed(1) : "-";
      const era = ps && ps.IP > 0 ? ((ps.ER / ps.IP) * 9).toFixed(2) : "-";

      if (ps && !onIl) { totalW += ps.W; totalSV += ps.SV; totalK += ps.K; }

      const acq = r.acquiredAt.toISOString().slice(0,10);
      const rel = r.releasedAt ? r.releasedAt.toISOString().slice(0,10) : "now";
      const tenure = `${acq}→${rel}`;

      console.log(
        `${r.player.name.padEnd(24)} ${pos.padEnd(4)} ${status.padEnd(8)} ${String(w).padStart(2)} ${String(sv).padStart(3)} ${String(k).padStart(4)} ${String(ip).padStart(5)} ${String(era).padStart(6)}  ${hasPsp}  [${tenure}]`
      );
    }
    console.log(`${"TEAM TOTAL".padEnd(24)} ${"".padEnd(4)} ${"".padEnd(8)} ${String(totalW).padStart(2)} ${String(totalSV).padStart(3)} ${String(totalK).padStart(4)}\n`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
