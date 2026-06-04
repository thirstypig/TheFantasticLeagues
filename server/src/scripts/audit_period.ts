/**
 * Per-period audit: prints each period's stats separately for OnRoto comparison.
 * Run: cd server && npx tsx src/scripts/audit_period.ts [leagueId]
 */
import { prisma } from "../db/prisma.js";
import { buildIlWindows, wasOnIlAtPeriodStart } from "../lib/ilWindows.js";

const PITCHER_CODES = new Set(["P", "SP", "RP", "CL", "TWP"]);

async function main() {
  const leagueId = Number(process.argv[2] ?? 20);

  const periods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active", "completed"] } },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, startDate: true, endDate: true },
  });

  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, code: true },
    orderBy: { id: "asc" },
  });

  const rosters = await prisma.roster.findMany({
    where: { team: { leagueId } },
    select: {
      teamId: true, playerId: true, acquiredAt: true, releasedAt: true,
      assignedPosition: true,
      player: { select: { mlbId: true, posPrimary: true, name: true } },
    },
  });

  const rosterPlayerIds = [...new Set(rosters.map(r => r.playerId))];
  const ilEvents = await prisma.transactionEvent.findMany({
    where: { playerId: { in: rosterPlayerIds }, transactionType: { in: ["IL_STASH", "IL_ACTIVATE"] }, effDate: { not: null } },
    select: { playerId: true, transactionType: true, effDate: true },
    orderBy: { effDate: "asc" },
  });
  const ilWindowsByPlayer = buildIlWindows(ilEvents);

  type Acc = { R: number; HR: number; RBI: number; SB: number; H: number; AB: number; W: number; S: number; K: number; ER: number; IP: number; BB_H: number };
  const zero = (): Acc => ({ R:0,HR:0,RBI:0,SB:0,H:0,AB:0,W:0,S:0,K:0,ER:0,IP:0,BB_H:0 });

  for (const period of periods) {
    console.log(`\n${"=".repeat(75)}`);
    console.log(`${period.name} (id=${period.id})`);
    console.log(`Dates: ${period.startDate.toISOString().slice(0,10)} -> ${period.endDate.toISOString().slice(0,10)}`);
    console.log(`${"=".repeat(75)}`);

    const psp = await prisma.playerStatsPeriod.findMany({ where: { periodId: period.id } });
    const pspByPlayer = new Map(psp.map(p => [p.playerId, p]));

    const acc = new Map(teams.map(t => [t.id, zero()]));

    for (const r of rosters) {
      if (r.acquiredAt > period.endDate) continue;
      if (r.releasedAt && r.releasedAt <= period.startDate) continue;
      if (wasOnIlAtPeriodStart(r.playerId, period.startDate, ilWindowsByPlayer)) continue;
      const ps = pspByPlayer.get(r.playerId);
      if (!ps) continue;
      const pos = (r.assignedPosition ?? r.player.posPrimary ?? "").toUpperCase();
      const isP = PITCHER_CODES.has(pos);
      const a = acc.get(r.teamId);
      if (!a) continue;
      if (!isP) { a.R+=ps.R; a.HR+=ps.HR; a.RBI+=ps.RBI; a.SB+=ps.SB; a.H+=ps.H; a.AB+=ps.AB; }
      if (isP) { a.W+=ps.W; a.S+=ps.SV; a.K+=ps.K; a.ER+=ps.ER; a.IP+=ps.IP; a.BB_H+=ps.BB_H; }
    }

    console.log("Team".padEnd(30) + "   R   HR  RBI   SB     AVG    W   SV    K    ERA   WHIP");
    console.log("-".repeat(86));
    for (const t of teams) {
      const a = acc.get(t.id);
      if (!a) continue;
      const avg = a.AB > 0 ? (a.H/a.AB).toFixed(4) : ".0000";
      const era = a.IP > 0 ? ((a.ER/a.IP)*9).toFixed(2) : "0.00";
      const whip = a.IP > 0 ? (a.BB_H/a.IP).toFixed(3) : "0.000";
      console.log(
        t.name.padEnd(30) +
        String(a.R).padStart(4) + String(a.HR).padStart(5) + String(a.RBI).padStart(5) + String(a.SB).padStart(5) +
        "  " + avg + String(a.W).padStart(5) + String(a.S).padStart(5) + String(a.K).padStart(5) +
        "   " + era + "  " + whip
      );
    }

    console.log(`\n--- Rosters at period start (${period.startDate.toISOString().slice(0,10)}) ---`);
    for (const t of teams) {
      const active = rosters.filter(r =>
        r.teamId === t.id &&
        r.acquiredAt <= period.startDate &&
        (r.releasedAt === null || r.releasedAt > period.startDate) &&
        !wasOnIlAtPeriodStart(r.playerId, period.startDate, ilWindowsByPlayer)
      );
      const il = rosters.filter(r =>
        r.teamId === t.id &&
        r.acquiredAt <= period.startDate &&
        (r.releasedAt === null || r.releasedAt > period.startDate) &&
        wasOnIlAtPeriodStart(r.playerId, period.startDate, ilWindowsByPlayer)
      );
      const names = active.map(r => r.player.name).join(", ");
      const ilNames = il.map(r => r.player.name).join(", ");
      console.log(`  ${t.name} (${active.length} active${il.length ? ", " + il.length + " IL" : ""})`);
      console.log(`    Active: ${names}`);
      if (ilNames) console.log(`    IL: ${ilNames}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
