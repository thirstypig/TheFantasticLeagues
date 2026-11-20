/**
 * Compare FBST roster stints with OnRoto's transaction log, move by move.
 *
 * Why: every real 2026 standings error traced to roster dates, not stat data —
 * drops recorded a period late, a drop/add never recorded, moves dated a day
 * off (DOC-026, DOC-040). Points can match OnRoto by coincidence while a
 * roster date is wrong, so this checks the dates themselves.
 *
 * Date convention (lib/rosterWindow.ts): `acquiredAt` is the first day owned,
 * `releasedAt` the first day NOT owned, compared at UTC calendar-date
 * granularity. OnRoto's "Eff. Date" means the same thing, so equal dates agree.
 */
import { normalizeName } from "./nameMatch.js";
import type { OnrotoMove, OnrotoTransaction } from "./onrotoTransParser.js";

export interface FbstStint {
  rosterId: number;
  team: string;
  playerName: string;
  acquiredAt: Date;
  releasedAt: Date | null;
}

export interface MoveEvent {
  team: string;
  /** Display name: FBST's full name when known, else OnRoto's alias. */
  player: string;
  move: OnrotoMove;
  date: string;
}

export interface RosterDateReport {
  matched: number;
  /** Same team, player and kind of move on both sides, but different dates. */
  dateDiffs: Array<MoveEvent & { onrotoDate: string; fbstDate: string }>;
  /** In OnRoto's log, absent from FBST's roster records. */
  missingInFbst: MoveEvent[];
  /** In FBST's roster records, absent from OnRoto's log. */
  missingInOnroto: MoveEvent[];
  /** OnRoto teams with no FBST team of the same name — nothing for them was compared. */
  unmappedTeams: string[];
  /**
   * Mid-period stints whose date carries a time of day. The comparison reads
   * the UTC date, but mid-period players are scored from the daily table, which
   * compares the timestamp itself (`d < releasedAt`): a 19:00 release keeps that
   * day's stats with the dropper. On a period's first day the time is ignored
   * (standingsService routeStatsSource, todo #285), so those are not listed.
   */
  timeOfDay: Array<{ rosterId: number; team: string; player: string; field: "acquiredAt" | "releasedAt"; value: string }>;
  /**
   * Moves effective on opening day, either side. Not compared: they record the
   * draft-day roster (keepers re-entered, OnRoto fixing a draft entry), and a
   * player owned from day one scores the same whichever way it was recorded.
   * Opening-day rosters are checked by Period 1's standings matching OnRoto.
   */
  openingDay: Array<MoveEvent & { source: "OnRoto" | "FBST" }>;
  /** Same team, move and date, paired on last name only because OnRoto's alias didn't resolve ("PPfaadt"). Listed so a human can glance at each. */
  matchedByLastName: Array<MoveEvent & { onrotoAlias: string }>;
  /** Identical OnRoto rows (same team, player, move, date) merged into one — OnRoto sometimes logs a move twice. */
  duplicatesMerged: number;
  /** True only when nothing needs a human: zero differences, every team mapped, no mid-period time-of-day stamps. */
  pass: boolean;
}

const utcDate = (d: Date) => d.toISOString().slice(0, 10);
const atMidnight = (d: Date) => d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds() + d.getUTCMilliseconds() === 0;

/** Team names differ only in punctuation between the two systems ("Demolition Lumber Co" / "Co. "). */
export const teamKey = (name: string) => normalizeName(name).replace(/[^a-z0-9 ]/g, "").trim();

const SUFFIX = /\s+(jr|sr|ii|iii|iv|v)$/;
const letters = (s: string) => s.replace(/[^a-z]/g, "");

function nameParts(fullName: string): { first: string; last: string; suffix: string } {
  const n = normalizeName(fullName.replace(/\(.*?\)/g, ""));
  const suffix = n.match(SUFFIX)?.[1] ?? "";
  const bare = n.replace(SUFFIX, "");
  const space = bare.indexOf(" ");
  if (space < 0) return { first: "", last: letters(bare), suffix };
  return { first: letters(bare.slice(0, space)), last: letters(bare.slice(space + 1)), suffix };
}

/** OnRoto's usual alias for a full name: first initial + last name ("Dalton Rushing" → "drushing"). */
export function aliasOf(fullName: string): string {
  const { first, last } = nameParts(fullName);
  return (first[0] ?? "") + last;
}

/**
 * Does an OnRoto alias denote this player? OnRoto writes first initial + last
 * name, and lengthens the first-name part or appends the suffix when two
 * players collide: "DRushing", "DomSmith", "TanScott", "LGarciaJr".
 */
export function aliasMatches(alias: string, fullName: string): boolean {
  const a = letters(normalizeName(alias));
  const { first, last, suffix } = nameParts(fullName);
  if (!first || !last) return a === last;
  for (const tail of suffix ? [last + suffix, last] : [last]) {
    if (!a.endsWith(tail)) continue;
    const head = a.slice(0, a.length - tail.length);
    if (head.length >= 1 && first.startsWith(head)) return true;
  }
  return false;
}

interface Ev { team: string; key: string; player: string; move: OnrotoMove; date: string; alias?: string; submitted?: string; last: string }

/**
 * Replay each player's OnRoto moves on a team in the order they were entered,
 * tracking whether the team owns him, and emit one ADD or DROP per day only
 * when ownership actually changed that day.
 *
 * - An ADD while owned, or a DROP while not owned, is a duplicate entry
 *   (2026: OnRoto logged the McCann add and Steer release twice on 08-02).
 * - A DROP and an ADD entered in the same minute are applied DROP first: a swap
 *   (2026: Zac Thornton's placeholder "FA" record released and his NYM record
 *   added at 21:05, after the placeholder was added at 12:23 — net one ADD).
 * - Before a player's first entry, the team owns him iff that entry is a DROP.
 */
export function netOnrotoMoves(events: Ev[]): { events: Ev[]; duplicates: number } {
  const stamp = (e: Ev) => (e.submitted ?? "").replace(/^(\d\d)\.(\d\d) @ /, "$1-$2 ");
  const byPlayer = new Map<string, Ev[]>();
  for (const e of events) {
    const k = `${e.team}|${e.key}`;
    if (!byPlayer.has(k)) byPlayer.set(k, []);
    byPlayer.get(k)!.push(e);
  }
  const out: Ev[] = [];
  let duplicates = 0;
  for (const list of byPlayer.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date) || stamp(a).localeCompare(stamp(b)) || (a.move === b.move ? 0 : a.move === "DROP" ? -1 : 1));
    let owned = list[0]!.move === "DROP";
    let i = 0;
    while (i < list.length) {
      const date = list[i]!.date;
      const before = owned;
      let last: Ev | null = null;
      for (; i < list.length && list[i]!.date === date; i++) {
        const e = list[i]!;
        const effective = e.move === "ADD" ? !owned : owned;
        if (!effective) { duplicates++; continue; }
        owned = e.move === "ADD";
        last = e;
      }
      if (owned !== before && last) out.push(last);
    }
  }
  return { events: out, duplicates };
}

/** Drop same-day DROP+ADD pairs for one player on one team — a net-zero record. */
function cancelNetZero(events: Ev[]): Ev[] {
  const out: Ev[] = [];
  const pool = [...events];
  while (pool.length) {
    const e = pool.shift()!;
    const twin = pool.findIndex((o) => o.team === e.team && o.key === e.key && o.date === e.date && o.move !== e.move);
    if (twin >= 0) pool.splice(twin, 1);
    else out.push(e);
  }
  return out;
}

const groupKey = (e: Ev) => `${e.team}|${e.key}|${e.move}`;

/**
 * @param opts.start / opts.end  inclusive season window (YYYY-MM-DD). FBST
 *   stints opened before it (auction/keepers) and closed after it (offseason)
 *   are not in-season transactions and are not compared.
 * @param opts.periodStarts  first day of each scoring period (YYYY-MM-DD).
 */
export function compareRosterDates(
  onroto: OnrotoTransaction[],
  stints: FbstStint[],
  opts: { start: string; end: string; periodStarts?: string[] },
): RosterDateReport {
  const fbstTeams = new Set(stints.map((s) => teamKey(s.team)));
  const unmappedTeams = [...new Set(onroto.map((t) => t.team))].filter((t) => !fbstTeams.has(teamKey(t)));
  const unmapped = new Set(unmappedTeams.map(teamKey));
  const inWindow = (d: string) => d >= opts.start && d <= opts.end;
  const boundary = new Set([opts.start, ...(opts.periodStarts ?? [])]);

  const teamNames = new Map(stints.map((s) => [teamKey(s.team), s.team])); // key -> FBST team name, for display
  const namesByTeam = new Map<string, Set<string>>(); // team -> FBST full names seen on it
  const fb: Ev[] = [];
  const timeOfDay: RosterDateReport["timeOfDay"] = [];
  for (const s of stints) {
    const team = teamKey(s.team);
    if (!namesByTeam.has(team)) namesByTeam.set(team, new Set());
    namesByTeam.get(team)!.add(s.playerName);
    const base = { team, key: normalizeName(s.playerName), player: s.playerName, last: nameParts(s.playerName).last };
    for (const [field, at, move] of [["acquiredAt", s.acquiredAt, "ADD"], ["releasedAt", s.releasedAt, "DROP"]] as const) {
      if (!at) continue;
      const date = utcDate(at);
      if (!inWindow(date)) continue;
      fb.push({ ...base, move, date });
      if (!atMidnight(at) && !boundary.has(date)) timeOfDay.push({ rosterId: s.rosterId, team: s.team, player: s.playerName, field, value: at.toISOString() });
    }
  }

  // OnRoto events, alias resolved to the one FBST player on that team it can denote.
  const or: Ev[] = [];
  for (const t of onroto) {
    if (!t.move || !inWindow(t.effDate) || unmapped.has(teamKey(t.team))) continue;
    const team = teamKey(t.team);
    let hits = [...(namesByTeam.get(team) ?? [])].filter((n) => aliasMatches(t.alias, n));
    // Two players on one team can share an alias (2026 Los Doyers: Jacob Young 05-17,
    // Jared Young 08-30, both "JYoung"). Prefer the one with this exact move that day.
    if (hits.length > 1) {
      const sameDay = hits.filter((n) => fb.some((e) => e.team === team && e.player === n && e.move === t.move && e.date === t.effDate));
      if (sameDay.length === 1) hits = sameDay;
    }
    const name = hits.length === 1 ? hits[0]! : null;
    or.push({
      team, move: t.move, date: t.effDate, alias: t.alias, submitted: t.submitted,
      key: name ? normalizeName(name) : `alias:${letters(normalizeName(t.alias))}`,
      player: name ?? t.alias,
      last: letters(normalizeName(t.alias)).slice(1),
    });
  }
  const { events: orNet, duplicates: duplicatesMerged } = netOnrotoMoves(or);

  const show = (e: Ev): MoveEvent => ({ team: teamNames.get(e.team) ?? e.team, player: e.player, move: e.move, date: e.date });

  const openingDay: RosterDateReport["openingDay"] = [];
  const split = (events: Ev[], source: "OnRoto" | "FBST") =>
    cancelNetZero(events).filter((e) => {
      if (e.date !== opts.start) return true;
      openingDay.push({ ...show(e), source });
      return false;
    });
  const left = split(orNet, "OnRoto");
  const rightPool = split(fb, "FBST");

  // 1) exact matches
  let matched = 0;
  const leftRest: Ev[] = [];
  for (const e of left) {
    const i = rightPool.findIndex((o) => groupKey(o) === groupKey(e) && o.date === e.date);
    if (i >= 0) { rightPool.splice(i, 1); matched++; } else leftRest.push(e);
  }

  // 2) same team/player/move, different date: pair each with the nearest remaining date
  const dateDiffs: RosterDateReport["dateDiffs"] = [];
  const unpaired: Ev[] = [];
  const dist = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b));
  for (const e of leftRest) {
    const cands = rightPool.filter((o) => groupKey(o) === groupKey(e));
    if (!cands.length) { unpaired.push(e); continue; }
    const best = cands.reduce((a, b) => (dist(b.date, e.date) < dist(a.date, e.date) ? b : a));
    rightPool.splice(rightPool.indexOf(best), 1);
    dateDiffs.push({ ...show(e), player: best.player, onrotoDate: e.date, fbstDate: best.date });
  }

  // 3) last resort for an alias that resolved to nobody: same team, move and date, and
  //    the alias ends in the FBST player's last name. Listed, not silently matched.
  const matchedByLastName: RosterDateReport["matchedByLastName"] = [];
  const missingInFbst: MoveEvent[] = [];
  for (const e of unpaired) {
    const i = e.alias && e.player === e.alias
      ? rightPool.findIndex((o) => o.team === e.team && o.move === e.move && o.date === e.date && o.last.length > 2 && e.last.endsWith(o.last))
      : -1;
    if (i < 0) { missingInFbst.push(show(e)); continue; }
    const [o] = rightPool.splice(i, 1);
    matchedByLastName.push({ ...show(o!), onrotoAlias: e.alias! });
    matched++;
  }
  const missingInOnroto: MoveEvent[] = rightPool.map(show);

  const byDate = <T extends { date: string; team: string }>(a: T, b: T) => a.date.localeCompare(b.date) || a.team.localeCompare(b.team);
  for (const list of [dateDiffs, missingInFbst, missingInOnroto, openingDay, matchedByLastName]) list.sort(byDate);

  return {
    matched,
    dateDiffs,
    missingInFbst,
    missingInOnroto,
    unmappedTeams,
    timeOfDay,
    openingDay,
    matchedByLastName,
    duplicatesMerged,
    pass: !dateDiffs.length && !missingInFbst.length && !missingInOnroto.length && !unmappedTeams.length && !timeOfDay.length,
  };
}
