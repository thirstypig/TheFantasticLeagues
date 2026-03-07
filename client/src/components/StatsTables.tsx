import React from "react";
import { Link } from "react-router-dom";
import { getPrimaryPosition } from "../lib/baseballUtils";
import { fmtRate } from "../api/base";
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "./ui/ThemedTable";
import { Badge } from "./ui/Badge";

/**
 * SHARED TYPES
 */

export type CategoryId = string;

export interface TeamPeriodCategoryPoints {
  categoryId: CategoryId;
  points: number;
}

export interface TeamPeriodSummaryRow {
  teamId: string;
  teamName: string;
  gamesPlayed: number;
  categories: TeamPeriodCategoryPoints[];
  totalPoints: number;
  totalPointsDelta: number; // vs previous day
}

export interface PeriodSummaryTableProps {
  periodId: string;
  rows: TeamPeriodSummaryRow[];
  categories: CategoryId[];
}

export interface CategoryPeriodRow {
  teamId: string;
  teamName: string;
  periodStat: number; // raw stat (AVG/ERA already calculated)
  points: number;
  pointsDelta: number; // vs previous day for this category
}

export interface CategoryPeriodTableProps {
  periodId: string;
  categoryId: CategoryId;
  rows: CategoryPeriodRow[];
}

export interface PeriodMeta {
  periodId: string;
  label: string; // e.g. "April 20"
  meetingDate: string; // 'YYYY-MM-DD'
}

export interface TeamSeasonRow {
  teamId: string;
  teamName: string;
  periodPoints: Record<string, number>; // key = periodId
  seasonTotalPoints: number;
}

export interface SeasonTableProps {
  periods: PeriodMeta[];
  rows: TeamSeasonRow[];
}

export interface TeamSeasonSummary {
  teamId: string;
  teamName: string;
  periodPoints: { periodId: string; points: number }[];
  seasonTotalPoints: number;
}

export interface TeamSeasonSummaryProps {
  summary: TeamSeasonSummary;
  periods: PeriodMeta[];
}

/**
 * TEAM PERIOD HITTERS
 */

export interface HitterPeriodStats {
  playerId: string;
  playerName: string;
  mlbTeam: string; // 3-letter code preferred
  positions: string[]; // e.g. ['1B', 'OF']

  gDH: number;
  gC: number;
  g1B: number;
  g2B: number;
  g3B: number;
  gSS: number;
  gOF: number;

  ab: number;
  runs: number;
  hits: number;
  hr: number;
  rbi: number;
  sb: number;
  bb: number;
  gs: number; // grand slams

  avg: number; // AVG for the period
}

export interface TeamPeriodHittersProps {
  periodId: string;
  teamId: string;
  hitters: HitterPeriodStats[];
}

/**
 * TEAM PERIOD PITCHERS
 */

export interface PitcherPeriodStats {
  playerId: string;
  playerName: string;
  mlbTeam: string;
  role: "SP" | "RP" | "P";

  g: number;
  gs: number;
  soShutouts: number;

  ip: number;
  h: number;
  er: number;
  bb: number;
  k: number;
  w: number;
  l: number;
  sv: number;
  bs: number;

  era: number;
  whip: number;
}

export interface TeamPeriodPitchersProps {
  periodId: string;
  teamId: string;
  pitchers: PitcherPeriodStats[];
}

/**
 * HELPERS
 */

const formatNumber = (value: number, decimals = 2): string => {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(decimals);
};

const formatSigned = (value: number, decimals = 1): string => {
  if (!Number.isFinite(value) || value === 0) return "0.0";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}`;
};

// For category tables: ints for counting stats, decimals only for AVG/ERA
const formatStatForCategory = (categoryId: string, value: number): string => {
  if (!Number.isFinite(value)) return "-";
  const id = categoryId.toUpperCase();

  if (id === "AVG") return fmtRate(value);
  if (id === "ERA") return value.toFixed(2);

  return Math.round(value).toString();
};

/**
 * PERIOD SUMMARY TABLE
 */

export const PeriodSummaryTable: React.FC<PeriodSummaryTableProps> = ({
  periodId,
  rows,
  categories,
}) => {
  const sortedRows = [...rows].sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div className="mb-12">
      <h2 className="text-xl font-semibold tracking-tight text-[var(--lg-text-heading)] mb-4 flex items-center gap-4">
        <span className="w-1.5 h-6 bg-[var(--lg-accent)] rounded-full"></span>
        Season Totals – {periodId}
      </h2>
      <div className="lg-card p-0 overflow-hidden bg-transparent">
        <div className="overflow-x-auto">
      <ThemedTable bare>
        <ThemedThead>
          <ThemedTr>
            <ThemedTh className="px-8 py-5">Team</ThemedTh>
            <ThemedTh align="center">GP</ThemedTh>
            {categories.map((cat) => (
              <ThemedTh key={cat} align="center">{cat}</ThemedTh>
            ))}
            <ThemedTh align="center">Total</ThemedTh>
            <ThemedTh align="center" className="px-8 py-5">Delta</ThemedTh>
          </ThemedTr>
        </ThemedThead>
        <tbody className="divide-y divide-[var(--lg-divide)]">
          {sortedRows.map((row) => {
            const catMap = new Map(
              row.categories.map((c) => [c.categoryId, c.points])
            );

            return (
              <ThemedTr key={row.teamId} className="group hover:bg-[var(--lg-tint)] transition-colors">
                <ThemedTd className="px-8 py-5">
                  <Link
                    to={`/teams/${row.teamId}`}
                    className="font-bold text-[var(--lg-text-heading)] text-lg hover:text-[var(--lg-accent)] transition-all tracking-tight"
                  >
                    {row.teamName}
                  </Link>
                </ThemedTd>
                <ThemedTd align="center">
                  {row.gamesPlayed}
                </ThemedTd>
                {categories.map((cat) => (
                  <ThemedTd
                    key={cat}
                    align="center"
                  >
                    {formatNumber(catMap.get(cat) ?? 0, 1)}
                  </ThemedTd>
                ))}
                <ThemedTd align="center">
                  {formatNumber(row.totalPoints, 1)}
                </ThemedTd>
                <ThemedTd align="center" className="px-8 py-5">
                  <span className={row.totalPointsDelta >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {formatSigned(row.totalPointsDelta, 1)}
                  </span>
                </ThemedTd>
              </ThemedTr>
            );
          })}
        </tbody>
      </ThemedTable>
        </div>
      </div>
    </div>
  );
};

export const CategoryPeriodTable: React.FC<CategoryPeriodTableProps> = ({
  periodId,
  categoryId,
  rows,
}) => {
  const sortedRows = [...rows].sort((a, b) => b.points - a.points);

  return (
    <div className="mt-8">
      <h3 className="text-xs font-medium tracking-wide text-[var(--lg-text-muted)] mb-4 flex items-center gap-3 opacity-60">
        <span className="w-4 h-[1px] bg-[var(--lg-accent)] opacity-40"></span>
        {categoryId} Metric – {periodId}
      </h3>
      <div className="lg-card p-0 overflow-hidden bg-transparent">
        <div className="overflow-x-auto">
      <ThemedTable bare>
        <ThemedThead>
          <ThemedTr>
            <ThemedTh className="px-8 py-4">Team</ThemedTh>
            <ThemedTh align="center">Value</ThemedTh>
            <ThemedTh align="center">Points</ThemedTh>
            <ThemedTh align="center" className="px-8 py-4">Delta</ThemedTh>
          </ThemedTr>
        </ThemedThead>
        <tbody className="divide-y divide-[var(--lg-divide)]">
          {sortedRows.map((row) => (
            <ThemedTr key={row.teamId} className="group hover:bg-[var(--lg-tint)] transition-colors">
              <ThemedTd className="px-8 py-3">
                <Link
                  to={`/teams/${row.teamId}`}
                  className="font-bold text-[var(--lg-text-heading)] text-base hover:text-[var(--lg-accent)] transition-all tracking-tight"
                >
                  {row.teamName}
                </Link>
              </ThemedTd>
              <ThemedTd align="center">
                {formatStatForCategory(categoryId, row.periodStat)}
              </ThemedTd>
              <ThemedTd align="center">
                {formatNumber(row.points, 1)}
              </ThemedTd>
              <ThemedTd align="center" className="px-8 py-3">
                <span className={row.pointsDelta >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {formatSigned(row.pointsDelta, 1)}
                </span>
              </ThemedTd>
            </ThemedTr>
          ))}
        </tbody>
      </ThemedTable>
        </div>
      </div>
    </div>
  );
};

/**
 * SEASON TABLE
 */

export const SeasonTable: React.FC<SeasonTableProps> = ({
  periods,
  rows,
}) => {
  const sortedRows = [...rows].sort(
    (a, b) => b.seasonTotalPoints - a.seasonTotalPoints
  );

  return (
    <div className="mb-12">
      <h2 className="text-xl font-semibold tracking-tight text-[var(--lg-text-heading)] mb-4 flex items-center gap-4">
        <span className="w-1.5 h-6 bg-[var(--lg-accent)] rounded-full"></span>
        Season Stats
      </h2>
      <div className="lg-card p-0 overflow-hidden bg-transparent">
        <div className="overflow-x-auto">
          <ThemedTable bare>
            <ThemedThead>
              <ThemedTr>
                <ThemedTh className="px-8 py-5">Team</ThemedTh>
                {periods.map((p) => (
                  <ThemedTh key={p.periodId} align="center" title={p.meetingDate}>
                    {p.label}
                  </ThemedTh>
                ))}
                <ThemedTh align="center" className="px-8 py-5 whitespace-nowrap">Season Total</ThemedTh>
              </ThemedTr>
            </ThemedThead>
            <tbody className="divide-y divide-[var(--lg-divide)]">
              {sortedRows.map((row) => (
                <ThemedTr key={row.teamId} className="hover:bg-[var(--lg-tint)] transition-colors duration-150">
                  <ThemedTd className="px-8 py-5">
                    <Link
                      to={`/teams/${row.teamId}`}
                      className="font-bold text-[var(--lg-text-heading)] text-lg hover:text-[var(--lg-accent)] transition-all tracking-tight"
                    >
                      {row.teamName}
                    </Link>
                  </ThemedTd>
                  {periods.map((p) => (
                    <ThemedTd
                      key={p.periodId}
                      align="center"
                      className="px-4 py-5"
                    >
                      {formatNumber(row.periodPoints[p.periodId] ?? 0, 1)}
                    </ThemedTd>
                  ))}
                  <ThemedTd align="center" className="px-8 py-5">
                    {formatNumber(row.seasonTotalPoints, 1)}
                  </ThemedTd>
                </ThemedTr>
              ))}
            </tbody>
          </ThemedTable>
        </div>
      </div>
    </div>
  );
};

/**
 * TEAM SEASON SUMMARY TABLE
 */

export const TeamSeasonSummaryTable: React.FC<TeamSeasonSummaryProps> = ({
  summary,
  periods,
}) => {
  const periodMap = new Map(
    summary.periodPoints.map((p) => [p.periodId, p.points])
  );

  return (
    <div className="mt-8">
      <h3 className="text-xs font-medium tracking-wide text-[var(--lg-text-muted)] mb-5 opacity-60">
        Season Summary – {summary.teamName}
      </h3>
      <div className="lg-card p-0 overflow-hidden bg-transparent">
        <div className="overflow-x-auto">
          <ThemedTable bare>
            <ThemedThead>
              <ThemedTr>
                <ThemedTh className="px-6 py-4">Period</ThemedTh>
                <ThemedTh align="center" className="px-6 py-4">Score</ThemedTh>
              </ThemedTr>
            </ThemedThead>
            <tbody className="divide-y divide-[var(--lg-divide)]">
              {periods.map((p) => (
                <ThemedTr key={p.periodId} className="hover:bg-[var(--lg-tint)] transition-colors">
                  <ThemedTd className="px-6 py-3">
                    {p.label}
                  </ThemedTd>
                  <ThemedTd align="center" className="px-6 py-3">
                    {formatNumber(periodMap.get(p.periodId) ?? 0, 1)}
                  </ThemedTd>
                </ThemedTr>
              ))}
              <ThemedTr className="bg-[var(--lg-tint)]">
                <ThemedTd className="px-6 py-4">
                  Season Total
                </ThemedTd>
                <ThemedTd align="center" className="px-6 py-4">
                  {formatNumber(summary.seasonTotalPoints, 1)}
                </ThemedTd>
              </ThemedTr>
            </tbody>
          </ThemedTable>
        </div>
      </div>
    </div>
  );
};

/**
 * TEAM PERIOD HITTERS TABLE
 */

export const TeamPeriodHittersTable: React.FC<TeamPeriodHittersProps> = ({
  periodId,
  hitters,
}) => {
  const totals = hitters.reduce(
    (acc, h) => {
      acc.ab += h.ab;
      acc.runs += h.runs;
      acc.hits += h.hits;
      acc.hr += h.hr;
      acc.rbi += h.rbi;
      acc.sb += h.sb;
      acc.bb += h.bb;
      acc.gs += h.gs;
      return acc;
    },
    { ab: 0, runs: 0, hits: 0, hr: 0, rbi: 0, sb: 0, bb: 0, gs: 0 }
  );

  const teamAvg = totals.ab > 0 ? totals.hits / totals.ab : 0;

  return (
    <div className="mt-10">
      <h3 className="text-xl font-bold tracking-tight text-[var(--lg-text-heading)] mb-5">
        Hitting Corps – Period {periodId}
      </h3>
      <div className="lg-card p-0 overflow-hidden bg-transparent">
        <div className="overflow-x-auto">
          <ThemedTable bare>
            <ThemedThead>
              <ThemedTr>
                <ThemedTh className="px-4 py-4">Player</ThemedTh>
                <ThemedTh className="px-2 py-4">TM</ThemedTh>
                <ThemedTh className="px-2 py-4">POS</ThemedTh>
                <ThemedTh align="center" className="px-2 py-4">R</ThemedTh>
                <ThemedTh align="center" className="px-2 py-4">HR</ThemedTh>
                <ThemedTh align="center" className="px-2 py-4">RBI</ThemedTh>
                <ThemedTh align="center" className="px-2 py-4">SB</ThemedTh>
                <ThemedTh align="center" className="px-2 py-4">AVG</ThemedTh>
                <ThemedTh align="center" className="px-2 py-4">AB</ThemedTh>
                <ThemedTh align="center" className="px-2 py-4">GS</ThemedTh>
              </ThemedTr>
            </ThemedThead>
            <tbody className="divide-y divide-[var(--lg-divide)]">
              {hitters.map((h) => (
                <ThemedTr key={h.playerId} className="hover:bg-[var(--lg-tint)] transition-colors">
                  <ThemedTd className="px-4 py-3">{h.playerName}</ThemedTd>
                  <ThemedTd className="px-2 py-3">{h.mlbTeam}</ThemedTd>
                  <ThemedTd className="px-2 py-3">
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                      {getPrimaryPosition(h.positions.join(", "))}
                    </Badge>
                  </ThemedTd>
                  <ThemedTd align="center" className="px-2 py-3">{h.runs}</ThemedTd>
                  <ThemedTd align="center" className="px-2 py-3">{h.hr}</ThemedTd>
                  <ThemedTd align="center" className="px-2 py-3">{h.rbi}</ThemedTd>
                  <ThemedTd align="center" className="px-2 py-3">{h.sb}</ThemedTd>
                  <ThemedTd align="center" className="px-2 py-3">{fmtRate(h.avg)}</ThemedTd>
                  <ThemedTd align="center" className="px-2 py-3">{h.ab}</ThemedTd>
                  <ThemedTd align="center" className="px-2 py-3">{h.gs}</ThemedTd>
                </ThemedTr>
              ))}
              <ThemedTr className="bg-[var(--lg-tint)]">
                <ThemedTd className="px-4 py-4" colSpan={3}>Batting Totals</ThemedTd>
                <ThemedTd align="center" className="px-2 py-4">{totals.runs}</ThemedTd>
                <ThemedTd align="center" className="px-2 py-4">{totals.hr}</ThemedTd>
                <ThemedTd align="center" className="px-2 py-4">{totals.rbi}</ThemedTd>
                <ThemedTd align="center" className="px-2 py-4">{totals.sb}</ThemedTd>
                <ThemedTd align="center" className="px-2 py-4">{fmtRate(teamAvg)}</ThemedTd>
                <ThemedTd align="center" className="px-2 py-4">{totals.ab}</ThemedTd>
                <ThemedTd align="center" className="px-2 py-4">{totals.gs}</ThemedTd>
              </ThemedTr>
            </tbody>
          </ThemedTable>
        </div>
      </div>
    </div>
  );
};

/**
 * TEAM PERIOD PITCHERS TABLE
 */

export const TeamPeriodPitchersTable: React.FC<TeamPeriodPitchersProps> = ({
  periodId,
  pitchers,
}) => {
  const totals = pitchers.reduce(
    (acc, p) => {
      acc.ip += p.ip;
      acc.h += p.h;
      acc.er += p.er;
      acc.bb += p.bb;
      acc.k += p.k;
      acc.w += p.w;
      acc.sv += p.sv;
      acc.soShutouts += p.soShutouts;
      return acc;
    },
    { ip: 0, h: 0, er: 0, bb: 0, k: 0, w: 0, sv: 0, soShutouts: 0 }
  );

  const totalERA = totals.ip > 0 ? (9 * totals.er) / totals.ip : 0;
  const totalWHIP = totals.ip > 0 ? (totals.bb + totals.h) / totals.ip : 0;

  return (
    <div className="mt-10">
      <h3 className="text-xl font-bold tracking-tight text-[var(--lg-text-heading)] mb-5">
        Pitching Rotation – Period {periodId}
      </h3>
      <div className="lg-card p-0 overflow-hidden bg-transparent">
        <div className="overflow-x-auto">
          <ThemedTable bare>
            <ThemedThead>
              <ThemedTr>
                <ThemedTh className="px-4 py-4">Player</ThemedTh>
                <ThemedTh className="px-2 py-4">TM</ThemedTh>
                <ThemedTh className="px-2 py-4">ROLE</ThemedTh>
                <ThemedTh align="center" className="px-2 py-4">W</ThemedTh>
                <ThemedTh align="center" className="px-2 py-4">S</ThemedTh>
                <ThemedTh align="center" className="px-2 py-4">K</ThemedTh>
                <ThemedTh align="center" className="px-2 py-4">ERA</ThemedTh>
                <ThemedTh align="center" className="px-2 py-4">WHIP</ThemedTh>
                <ThemedTh align="center" className="px-2 py-4">IP</ThemedTh>
                <ThemedTh align="center" className="px-2 py-4">SO</ThemedTh>
              </ThemedTr>
            </ThemedThead>
            <tbody className="divide-y divide-[var(--lg-divide)]">
              {pitchers.map((p) => (
                <ThemedTr key={p.playerId} className="hover:bg-[var(--lg-tint)] transition-colors">
                  <ThemedTd className="px-4 py-3">{p.playerName}</ThemedTd>
                  <ThemedTd className="px-2 py-3">{p.mlbTeam}</ThemedTd>
                  <ThemedTd className="px-2 py-3">
                    <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20">
                      {p.role}
                    </Badge>
                  </ThemedTd>
                  <ThemedTd align="center" className="px-2 py-3">{p.w}</ThemedTd>
                  <ThemedTd align="center" className="px-2 py-3">{p.sv}</ThemedTd>
                  <ThemedTd align="center" className="px-2 py-3">{p.k}</ThemedTd>
                  <ThemedTd align="center" className="px-2 py-3">{formatNumber(p.era, 2)}</ThemedTd>
                  <ThemedTd align="center" className="px-2 py-3">{formatNumber(p.whip, 2)}</ThemedTd>
                  <ThemedTd align="center" className="px-2 py-3">{formatNumber(p.ip, 1)}</ThemedTd>
                  <ThemedTd align="center" className="px-2 py-3">{p.soShutouts}</ThemedTd>
                </ThemedTr>
              ))}
              <ThemedTr className="bg-[var(--lg-tint)]">
                <ThemedTd className="px-4 py-4" colSpan={3}>Pitching Totals</ThemedTd>
                <ThemedTd align="center" className="px-2 py-4">{totals.w}</ThemedTd>
                <ThemedTd align="center" className="px-2 py-4">{totals.sv}</ThemedTd>
                <ThemedTd align="center" className="px-2 py-4">{totals.k}</ThemedTd>
                <ThemedTd align="center" className="px-2 py-4">{formatNumber(totalERA, 2)}</ThemedTd>
                <ThemedTd align="center" className="px-2 py-4">{formatNumber(totalWHIP, 2)}</ThemedTd>
                <ThemedTd align="center" className="px-2 py-4">{formatNumber(totals.ip, 1)}</ThemedTd>
                <ThemedTd align="center" className="px-2 py-4">{totals.soShutouts}</ThemedTd>
              </ThemedTr>
            </tbody>
          </ThemedTable>
        </div>
      </div>
    </div>
  );
};
