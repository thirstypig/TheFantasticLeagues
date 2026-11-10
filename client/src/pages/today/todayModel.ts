/**
 * Pure derivation model for the Today page (rank, standings preview,
 * period header, tonight's games). No React, no I/O.
 */
import { toNum } from "../../api/base";
import type { PeriodInfo } from "../../features/periods/api";
import type { WaiverPeriod } from "../../features/wire-list/api";

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

// ─── Player news ────────────────────────────────────────────────────────

export interface PlayerNewsTx {
  id: number;
  date: string;
  playerName: string;
  mlbId: number;
  typeCode: string;
  description: string;
  fromTeamAbbr: string | null;
  toTeamAbbr: string | null;
  fromLeague: "NL" | "AL" | null;
  toLeague: "NL" | "AL" | null;
}

export type NewsKind = "il-placed" | "il-activated" | "sent-down" | "called-up" | "traded" | "dfa" | "released";

export interface NewsItem {
  key: string;
  kind: NewsKind;
  title: string;
  detail: string;
  when: string;
  leavesNl: boolean;
  tone: "warn" | "good" | "neutral";
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NEWS_CAP = 8;

const NAME_SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;

function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const final = parts[parts.length - 1] ?? fullName;
  if (parts.length >= 3 && NAME_SUFFIX.test(final)) return `${parts[parts.length - 2]} ${final}`;
  return final;
}

function newsWhen(date: string, now: Date): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const days = Math.round(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 86_400_000,
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function classifyNews(txs: PlayerNewsTx[], now: Date): NewsItem[] {
  const out: NewsItem[] = [];
  for (const t of txs) {
    const last = lastName(t.playerName);
    const leavesNl = t.typeCode === "TR" && t.fromLeague === "NL" && t.toLeague === "AL";
    const base = { key: String(t.id), when: newsWhen(t.date, now), leavesNl };
    const desc = t.description;
    switch (t.typeCode) {
      case "SC": {
        const placed = desc.match(/placed .* on the (\d+)-day injured list/i);
        if (placed) {
          const detail = desc.match(/injured list(?: retroactive to [^.]*)?\.\s*(.*)$/i)?.[1]?.trim() ?? "";
          out.push({ ...base, kind: "il-placed", title: `${last} placed on the ${placed[1]}-day IL`, detail, tone: "warn" });
        } else if (/activated .* from the (\d+)-day injured list/i.test(desc)) {
          out.push({ ...base, kind: "il-activated", title: `${last} activated from the IL`, detail: "Back on the active roster", tone: "good" });
        }
        break;
      }
      case "OPT":
      case "OUT":
        out.push({ ...base, kind: "sent-down", title: `${last} sent down to the minors`, detail: desc, tone: "neutral" });
        break;
      case "CU":
      case "SE":
        out.push({ ...base, kind: "called-up", title: `${last} called up`, detail: desc, tone: "good" });
        break;
      case "TR":
        out.push({
          ...base,
          kind: "traded",
          title: t.toTeamAbbr ? `${last} traded to ${t.toTeamAbbr}` : `${last} traded`,
          detail:
            t.fromTeamAbbr && t.toTeamAbbr
              ? `From ${t.fromTeamAbbr} to ${t.toTeamAbbr}`
              : t.fromTeamAbbr
                ? `From ${t.fromTeamAbbr}`
                : t.toTeamAbbr
                  ? `To ${t.toTeamAbbr}`
                  : "",
          tone: leavesNl ? "warn" : "neutral",
        });
        break;
      case "DES":
        out.push({ ...base, kind: "dfa", title: `${last} designated for assignment`, detail: desc, tone: "warn" });
        break;
      case "REL":
        out.push({ ...base, kind: "released", title: `${last} released`, detail: desc, tone: "warn" });
        break;
    }
  }
  return out.slice(0, NEWS_CAP);
}

export function wireReminder(wirePeriod: WaiverPeriod | null, now: Date): { text: string } | null {
  if (wirePeriod?.status !== "PENDING") return null;
  const deadline = new Date(wirePeriod.deadlineAt);
  const ms = deadline.getTime() - now.getTime();
  if (!(ms > 0 && ms <= 48 * 3_600_000)) return null;
  const h = deadline.getHours();
  const mm = String(deadline.getMinutes()).padStart(2, "0");
  const time = `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
  return { text: `Wire List locks ${WEEKDAYS[deadline.getDay()]} ${time}` };
}
