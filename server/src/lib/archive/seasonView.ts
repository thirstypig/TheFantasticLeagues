/**
 * One archived season as the archive page shows it: standings from the
 * recorded totals, each team's draft and final roster, and the moves made at
 * every meeting (the difference between consecutive period rosters). Pure.
 *
 * PERIOD k is the roster that played period k (the dated sheet; the date is
 * periodEnds[k-1], the day that period ended and the next meeting was held).
 * The FINAL roster played the period after the last sheet.
 */
import type { ArchiveMove, ArchiveRosterEntry, ArchiveSeasonResponse, ArchiveSeasonTeam } from "../../../../shared/api/archiveSeason.js";
import { archivePlayerKey } from "./mlbNameMatcher.js";
import { diffRoster } from "./workbookParser.js";

export interface SeasonViewInput {
  year: number;
  keepersFromSheet: boolean;
  /** HistoricalSeason.periodEnds: the day each period ended, P1 first ("" = unknown). */
  periodEnds: string[];
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

  // The chain: draft → P1 … Pn (dated sheets) → final (the last period).
  const periods = [...new Set(byKind("PERIOD").map((e) => e.periodNumber!))].sort((a, b) => a - b);
  const hasMoves = byKind("DRAFT").length > 0 && periods.length > 0 && periods.every((p, i) => p === i + 1);
  const moves: ArchiveMove[] = [];
  if (hasMoves) {
    const chain = periods.map((p) => ({ period: p, rows: byKind("PERIOD", p) }));
    const final = byKind("FINAL");
    if (final.length > 0) chain.push({ period: periods.length + 1, rows: final });
    let prev = byKind("DRAFT");
    for (const { period, rows: cur } of chain) {
      const byTeam: ArchiveMove["byTeam"] = {};
      for (const t of input.teams) {
        const before = prev.filter((e) => e.teamCode === t.code);
        const after = cur.filter((e) => e.teamCode === t.code);
        const d = diffRoster(before.map((e) => ({ slot: e.slot, name: e.playerName })), after.map((e) => ({ slot: e.slot, name: e.playerName })));
        const pick = (list: typeof before, names: { name: string }[]) =>
          names.map((n) => entry(list.find((e) => e.playerName === n.name)!));
        byTeam[t.code] = { added: pick(after, d.added), dropped: pick(before, d.dropped) };
      }
      // Period 1's changes come between the draft and the first sheet, at no meeting.
      moves.push({ period, meetingDate: period > 1 ? input.periodEnds[period - 2] || null : null, byTeam });
      prev = cur;
    }
  }

  return {
    year,
    keepersFromSheet: input.keepersFromSheet,
    periodEnds: input.periodEnds.map((d) => d || null),
    periodCount: Math.max(0, ...input.teams.map((t) => t.recordedPeriodPoints.length)),
    hasMoves,
    teams,
    rosters,
    moves,
  };
}
