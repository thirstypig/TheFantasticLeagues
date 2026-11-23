/**
 * One archived season as the archive page shows it: standings from the
 * recorded totals, each team's draft and final roster, and the moves made at
 * every meeting (the difference between consecutive period rosters). Pure.
 */
import type { ArchiveMove, ArchiveRosterEntry, ArchiveSeasonResponse, ArchiveSeasonTeam } from "../../../../shared/api/archiveSeason.js";
import { archivePlayerKey } from "./mlbNameMatcher.js";
import { diffRoster } from "./workbookParser.js";

export interface SeasonViewInput {
  year: number;
  keepersFromSheet: boolean;
  teams: { code: string; name: string; ownerName: string | null; recordedPeriodPoints: number[]; recordedTotal: number | null; note: string | null }[];
  entries: { teamCode: string; kind: "SALARIES" | "DRAFT" | "PERIOD" | "FINAL"; periodNumber: number | null; slot: string; playerName: string; salary: number | null; salaryNote: string | null; isKeeper: boolean }[];
  /** Player-check rows for the season, keyed by archivePlayerKey with the year. */
  matches: Map<string, { mlbId: number | null; mlbName: string | null }>;
}

/** Competition ranking: tied totals share a place (1, 2, 2, 4). */
function ranks(teams: SeasonViewInput["teams"]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of teams) {
    if (t.recordedTotal == null) continue;
    out.set(t.code, 1 + teams.filter((o) => o.recordedTotal != null && o.recordedTotal > t.recordedTotal!).length);
  }
  return out;
}

export function buildSeasonView(input: SeasonViewInput): ArchiveSeasonResponse {
  const { year } = input;
  const entry = (e: SeasonViewInput["entries"][number]): ArchiveRosterEntry => {
    const m = input.matches.get(`${year}|${archivePlayerKey(e.teamCode, e.playerName, e.slot)}`);
    return {
      slot: e.slot, name: e.playerName, mlbId: m?.mlbId ?? null, mlbName: m?.mlbName ?? null,
      price: e.salary, priceNote: e.salaryNote, keeper: e.isKeeper,
    };
  };

  const rank = ranks(input.teams);
  const teams: ArchiveSeasonTeam[] = input.teams
    .map((t) => ({
      code: t.code, name: t.name, owner: t.ownerName, points: t.recordedPeriodPoints, total: t.recordedTotal,
      rank: rank.get(t.code) ?? null, note: t.note,
    }))
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name));

  const byKind = (kind: SeasonViewInput["entries"][number]["kind"], period?: number) =>
    input.entries.filter((e) => e.kind === kind && (period === undefined || e.periodNumber === period));

  const rosters: ArchiveSeasonResponse["rosters"] = {};
  for (const t of input.teams) {
    rosters[t.code] = {
      draft: byKind("DRAFT").filter((e) => e.teamCode === t.code).map(entry),
      final: byKind("FINAL").filter((e) => e.teamCode === t.code).map(entry),
    };
  }

  // Period rosters: P1 is the draft roster, then one per meeting.
  const periods = [...new Set(byKind("PERIOD").map((e) => e.periodNumber!))].sort((a, b) => a - b);
  const hasMoves = byKind("DRAFT").length > 0 && periods.length > 0 && periods[0] === 2
    && periods.every((p, i) => p === i + 2);
  const moves: ArchiveMove[] = [];
  if (hasMoves) {
    let prev = byKind("DRAFT");
    for (const p of periods) {
      const cur = byKind("PERIOD", p);
      const byTeam: ArchiveMove["byTeam"] = {};
      for (const t of input.teams) {
        const before = prev.filter((e) => e.teamCode === t.code);
        const after = cur.filter((e) => e.teamCode === t.code);
        const d = diffRoster(before.map((e) => ({ slot: e.slot, name: e.playerName })), after.map((e) => ({ slot: e.slot, name: e.playerName })));
        const pick = (list: typeof before, names: { name: string }[]) =>
          names.map((n) => entry(list.find((e) => e.playerName === n.name)!));
        byTeam[t.code] = { added: pick(after, d.added), dropped: pick(before, d.dropped) };
      }
      moves.push({ period: p, byTeam });
      prev = cur;
    }
  }

  return {
    year,
    keepersFromSheet: input.keepersFromSheet,
    periodCount: Math.max(0, ...input.teams.map((t) => t.recordedPeriodPoints.length)),
    hasMoves,
    teams,
    rosters,
    moves,
  };
}
