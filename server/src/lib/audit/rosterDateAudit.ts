/**
 * Roster-date leg, shared by `audit-roster-dates.ts` and `audit-period-close.ts`.
 * Loads FBST's roster stints for the season and compares them with OnRoto's
 * saved transaction log. READ-ONLY.
 */
import { prisma } from "../../db/prisma.js";
import { parseOnrotoTransactions } from "./onrotoTransParser.js";
import { compareRosterDates, type FbstStint } from "./rosterDateCompare.js";

const day = (d: Date) => d.toISOString().slice(0, 10);

export interface SeasonPeriod { id: number; name: string; startDate: Date; endDate: Date; status: string }

export interface RosterDateLegResult {
  pass: boolean;
  /** Printable report: summary lines, then one section per kind of finding. */
  lines: string[];
}

export async function runRosterDateLeg(leagueId: number, season: number, periods: SeasonPeriod[], onrotoHtml: string): Promise<RosterDateLegResult> {
  const first = periods[0]!;
  const last = periods[periods.length - 1]!;
  const window = { start: day(first.startDate), end: day(last.endDate) };

  const rows = await prisma.roster.findMany({
    where: {
      team: { leagueId },
      acquiredAt: { lte: last.endDate },
      OR: [{ releasedAt: null }, { releasedAt: { gte: first.startDate } }],
    },
    select: { id: true, acquiredAt: true, releasedAt: true, team: { select: { name: true } }, player: { select: { name: true } } },
  });
  const stints: FbstStint[] = rows.map((r) => ({
    rosterId: r.id, team: r.team.name, playerName: r.player.name, acquiredAt: r.acquiredAt, releasedAt: r.releasedAt,
  }));

  const { transactions, unknown } = parseOnrotoTransactions(onrotoHtml, season);
  const r = compareRosterDates(transactions, stints, { ...window, periodStarts: periods.map((p) => day(p.startDate)) });

  const lines: string[] = [
    `Window ${window.start}..${window.end}`,
    `OnRoto: ${transactions.filter((t) => t.move).length} moves parsed; FBST: ${stints.length} stints`,
    `Matched by date: ${r.matched}${r.duplicatesMerged ? ` (${r.duplicatesMerged} duplicate OnRoto row(s) merged)` : ""}`,
  ];
  const section = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push("", `${title} (${items.length})`, ...items.map((l) => `  ${l}`));
  };
  section("UNRECOGNISED OnRoto wording — comparison incomplete", unknown);
  section("OnRoto teams with no FBST team", r.unmappedTeams);
  section("Dated differently", r.dateDiffs.map((e) => `${e.team}: ${e.player} ${e.move} — OnRoto ${e.onrotoDate}, FBST ${e.fbstDate}`));
  section("In OnRoto, missing from FBST", r.missingInFbst.map((e) => `${e.date} ${e.team}: ${e.player} ${e.move}`));
  section("In FBST, missing from OnRoto", r.missingInOnroto.map((e) => `${e.date} ${e.team}: ${e.player} ${e.move}`));
  section("Stamped with a time of day — confirm the day", r.timeOfDay.map((t) => `roster ${t.rosterId} ${t.team}: ${t.player} ${t.field} ${t.value}`));
  section("Paired on last name only — glance at each (not a failure)", r.matchedByLastName.map((e) => `${e.date} ${e.team}: OnRoto "${e.onrotoAlias}" = ${e.player} ${e.move}`));
  section("Opening-day moves — draft-day roster, not compared (not a failure)", r.openingDay.map((e) => `${e.source}: ${e.team}: ${e.player} ${e.move}`));

  return { pass: r.pass && !unknown.length, lines };
}

/** The season's periods for a league, oldest first. Throws when there are none. */
export async function loadSeasonPeriods(leagueId: number, season: number): Promise<SeasonPeriod[]> {
  const periods = await prisma.period.findMany({
    where: { leagueId, startDate: { gte: new Date(`${season}-01-01`), lt: new Date(`${season + 1}-01-01`) } },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, startDate: true, endDate: true, status: true },
  });
  if (!periods.length) throw new Error(`League ${leagueId} has no ${season} periods`);
  return periods;
}
