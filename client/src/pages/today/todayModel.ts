/**
 * Pure derivation model for the Today page (rank, standings preview,
 * period header, tonight's games). No React, no I/O.
 */
import { toNum } from "../../api/base";
import type { PeriodInfo } from "../../features/periods/api";

export interface TodayStandingsRow {
  teamId: number;
  teamName: string;
  teamCode?: string;
  totalPoints: number;
  periodPoints: number[];
}
export interface RankedRow extends TodayStandingsRow {
  rank: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

export function normalizeStandings(res: { periodIds?: number[]; rows?: unknown[] }): TodayStandingsRow[] {
  const periodIds = res.periodIds ?? [];
  const rows = (res.rows ?? []).map((raw): TodayStandingsRow => {
    const r = raw as Record<string, unknown>;
    const pp = r.periodPoints;
    const periodPoints =
      Array.isArray(pp) && pp.length
        ? periodIds.map((_pid, i) => toNum(pp[i]))
        : periodIds.map((pid) => toNum(r[`P${pid}`]));
    return {
      teamId: Number(r.teamId),
      teamName: String(r.teamName ?? ""),
      teamCode: typeof r.teamCode === "string" ? r.teamCode : undefined,
      totalPoints: sum(periodPoints),
      periodPoints,
    };
  });
  rows.sort((a, b) => b.totalPoints - a.totalPoints);
  return rows;
}

export function rankRows(
  rows: TodayStandingsRow[],
  pick: (r: TodayStandingsRow) => number = (r) => r.totalPoints,
): RankedRow[] {
  return rows.map((r) => ({ ...r, rank: 1 + rows.filter((o) => pick(o) > pick(r)).length }));
}

export interface RankSummary {
  rank: number;
  teamCount: number;
  totalPoints: number;
  trend: number | null;
  trendSince: string | null;
  gap: { kind: "behind" | "ahead" | "tied"; points: number; teamName: string } | null;
}

export function summarizeRank(
  rows: TodayStandingsRow[],
  myTeamId: number | null,
  periodNames: string[],
): RankSummary | null {
  const me = rows.find((r) => r.teamId === myTeamId);
  if (!me) return null;
  const ranked = rankRows(rows);
  const rank = ranked.find((r) => r.teamId === me.teamId)!.rank;

  let trend: number | null = null;
  let trendSince: string | null = null;
  if (me.periodPoints.length >= 2) {
    const before = (r: TodayStandingsRow) => sum(r.periodPoints.slice(0, -1));
    const prevRank = rankRows(rows, before).find((r) => r.teamId === me.teamId)!.rank;
    trend = prevRank - rank;
    trendSince = periodNames[periodNames.length - 2] ?? null;
  }

  const others = rows.filter((r) => r.teamId !== me.teamId);
  let gap: RankSummary["gap"] = null;
  const tied = others.find((o) => o.totalPoints === me.totalPoints);
  if (tied) {
    gap = { kind: "tied", points: 0, teamName: tied.teamName };
  } else if (rank > 1) {
    const above = others
      .filter((o) => o.totalPoints > me.totalPoints)
      .sort((a, b) => a.totalPoints - b.totalPoints)[0];
    gap = { kind: "behind", points: round1(above.totalPoints - me.totalPoints), teamName: above.teamName };
  } else if (others.length > 0) {
    const second = [...others].sort((a, b) => b.totalPoints - a.totalPoints)[0];
    gap = { kind: "ahead", points: round1(me.totalPoints - second.totalPoints), teamName: second.teamName };
  }

  return { rank, teamCount: rows.length, totalPoints: round1(me.totalPoints), trend, trendSince, gap };
}

export function standingsPreview(
  rows: TodayStandingsRow[],
  myTeamId: number | null,
  top = 5,
): { top: RankedRow[]; mine: RankedRow | null } {
  const ranked = rankRows(rows);
  const topRows = ranked.slice(0, top);
  const mine = ranked.find((r) => r.teamId === myTeamId) ?? null;
  return { top: topRows, mine: mine && !topRows.some((r) => r.teamId === mine.teamId) ? mine : null };
}

export function periodHeader(periods: PeriodInfo[], now: Date): { name: string; label: string } | null {
  const p = periods.find((x) => x.status === "active");
  if (!p) return null;
  const [y, m, d] = p.endDate.slice(0, 10).split("-").map(Number);
  const days = Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000,
  );
  const label = days <= 0 ? "last day" : days === 1 ? "1 day left" : `${days} days left`;
  return { name: p.name, label };
}

export interface MyPlayerToday {
  playerName: string;
  mlbId: number;
  mlbTeam: string;
  posPrimary?: string;
  gameTime: string;
  opponent: string;
  homeAway: "home" | "away";
  gameStatus?: "PRE" | "LIVE" | "FINAL";
  gameStateDesc?: string;
  line?: {
    hitting?: { AB: number; H: number; R: number; HR: number; RBI: number; SB: number; BB?: number; SO?: number };
    pitching?: { IP: number; H: number; R: number; ER: number; BB: number; K: number };
  };
}

export function orderTonight(players: MyPlayerToday[], shown = 4): { shown: MyPlayerToday[]; more: number } {
  const bucket = (p: MyPlayerToday) => (p.gameStatus === "LIVE" ? 0 : p.gameStatus === "FINAL" ? 2 : 1);
  const sorted = players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const d = bucket(a.p) - bucket(b.p);
      if (d) return d;
      if (bucket(a.p) === 1) {
        const t = Date.parse(a.p.gameTime) - Date.parse(b.p.gameTime);
        if (t) return t;
      }
      return a.i - b.i;
    })
    .map((x) => x.p);
  return { shown: sorted.slice(0, shown), more: Math.max(0, sorted.length - shown) };
}

export function formatLine(p: MyPlayerToday): string | null {
  const h = p.line?.hitting;
  if (h) {
    const parts = [`${h.H}-${h.AB}`];
    for (const [n, label] of [[h.HR, "HR"], [h.RBI, "RBI"], [h.SB, "SB"]] as const) {
      if (n > 0) parts.push(n === 1 ? label : `${n} ${label}`);
    }
    return parts.join(", ");
  }
  const pi = p.line?.pitching;
  if (pi) return `${pi.IP} IP, ${pi.ER} ER, ${pi.K} K`;
  return null;
}
