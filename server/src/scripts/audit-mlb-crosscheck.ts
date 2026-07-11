/**
 * MLB ground-truth cross-check — the automated leg of the OnRoto audit's
 * four-way tie-break (see docs/solutions/integration-issues/onroto-fangraphs-
 * audit-runbook.md, Step 5).
 *
 * Purpose: every audit, verify FBST's stored per-player raw stats against the
 * authoritative MLB.com statsapi game log — automatically — so a real data
 * bug (a missed game, a dropped stat) can't hide behind "the standings look
 * close." This encodes the 2026-07-10 lesson: don't state a verdict on a
 * residual until FBST is checked against ground truth.
 *
 * Scope (deliberately conservative to avoid false positives):
 *   - Only players FULLY OWNED for the whole season window with no IL gaps are
 *     compared. For those, FBST's ownership-window total == their full MLB
 *     total, so a clean equality must hold.
 *   - Partial-ownership / traded / IL players are SKIPPED with a note — those
 *     are where attribution legitimately diverges (ADR-013); they need the
 *     manual four-way (statsapi + Baseball Reference + FanGraphs per-player).
 *
 * As-of-date alignment (the E-Rodriguez trap): the statsapi game log is capped
 * at FBST's own data frontier (max synced game date). statsapi being more
 * real-time then cannot manufacture a phantom "FBST undercount."
 *
 * Run:  cd server && npx tsx src/scripts/audit-mlb-crosscheck.ts [leagueId]
 * (point at prod first — export DATABASE_URL/DIRECT_URL from Railway.)
 */

import { fileURLToPath } from "node:url";
import { prisma } from "../db/prisma.js";
import { TWO_WAY_PLAYERS } from "../lib/sportConfig.js";
import { playerStatRoles } from "../lib/sports/baseball.js";
import { buildIlWindows } from "../lib/ilWindows.js";

/* ── Pure core (unit-tested in __tests__/audit-mlb-crosscheck.test.ts) ── */

export interface StatLine {
  R: number; HR: number; RBI: number; SB: number; H: number; AB: number;
  W: number; SV: number; K: number; ER: number; outs: number; BB_H: number;
}
export const zeroLine = (): StatLine => ({
  R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0, W: 0, SV: 0, K: 0, ER: 0, outs: 0, BB_H: 0,
});

/**
 * Innings → outs. statsapi uses thirds notation ("100.1" = 100⅓ = 301 outs);
 * FBST stores a true decimal (100.333). Comparing in integer outs sidesteps
 * both the notation gap and float noise.
 */
export function ipToOuts(ip: string | number): number {
  if (typeof ip === "number") return Math.round(ip * 3);
  const [whole, frac = "0"] = ip.split(".");
  return parseInt(whole, 10) * 3 + parseInt(frac, 10);
}

export interface GameLogSplit {
  date?: string; // YYYY-MM-DD
  stat: Record<string, unknown>;
}

export const HIT_KEYS = ["R", "HR", "RBI", "SB", "H", "AB"] as const;
export const PIT_KEYS = ["W", "SV", "K", "ER", "outs", "BB_H"] as const;

const num = (v: unknown) => (typeof v === "number" ? v : parseInt(String(v ?? 0), 10) || 0);

/**
 * FBST pre-splits Shohei Ohtani into two roster rows: the real mlbId (660271)
 * carries batting, and a SYNTHETIC row (real + 1,000,000 = 1660271) carries
 * pitching. statsapi has no player 1660271, so map synthetic ids back to the
 * real one before fetching the game log.
 */
export const SYNTHETIC_OFFSET = 1_000_000;
export const realMlbId = (mlbId: number): number =>
  mlbId >= SYNTHETIC_OFFSET ? mlbId - SYNTHETIC_OFFSET : mlbId;

/** Add one game-log split's stats into `line` (mutating). */
export function addSplit(line: StatLine, sp: GameLogSplit, group: "hitting" | "pitching"): void {
  const s = sp.stat;
  if (group === "hitting") {
    line.R += num(s.runs); line.HR += num(s.homeRuns); line.RBI += num(s.rbi);
    line.SB += num(s.stolenBases); line.H += num(s.hits); line.AB += num(s.atBats);
  } else {
    line.W += num(s.wins); line.SV += num(s.saves); line.K += num(s.strikeOuts);
    line.ER += num(s.earnedRuns); line.outs += ipToOuts(String(s.inningsPitched ?? "0.0"));
    line.BB_H += num(s.baseOnBalls) + num(s.hits);
  }
}

/** Sum one statsapi game-log group, including only games on/before `cutoff`. */
export function sumGameLog(
  splits: GameLogSplit[],
  cutoff: string,
  group: "hitting" | "pitching",
): { line: StatLine; games: number } {
  const line = zeroLine();
  let games = 0;
  for (const sp of splits) {
    if (sp.date && sp.date > cutoff) continue; // as-of-date cap
    games++;
    addSplit(line, sp, group);
  }
  return { line, games };
}

export interface Diff { stat: string; fbst: number; mlb: number; }

export type ReconcileStatus = "consistent" | "in-progress" | "inconsistent";

/**
 * Self-aligning reconciliation: a fully-owned player's FBST total should equal
 * the MLB cumulative through SOME game boundary. Instead of guessing an as-of
 * cutoff date (PSD and PSP have different frontiers — the bug this replaces),
 * walk the game log and classify:
 *
 *   consistent   — FBST exactly equals a cumulative prefix (an as-of snapshot
 *                  at a clean game boundary; `matchedGames` < total = as-of lag)
 *   in-progress  — FBST is component-wise sandwiched WITHIN a single game
 *                  (prefix[g] ≤ FBST ≤ prefix[g+1]) → a mid-game/mid-sync
 *                  snapshot, transient, NOT a bug (re-run once games are final)
 *   inconsistent — FBST fits at no coherent point in time (e.g. exceeds the
 *                  season total, or mixes stats from different games) → a REAL
 *                  discrepancy to investigate
 *
 * Handles as-of differences in both directions; flags only genuine bugs.
 */
export function reconcile(
  fbst: StatLine,
  splits: GameLogSplit[],
  group: "hitting" | "pitching",
): { status: ReconcileStatus; matchedGames: number | null; totalGames: number; diffVsFinal: Diff[] } {
  const keys = group === "hitting" ? HIT_KEYS : PIT_KEYS;
  const sorted = [...splits].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  // Cumulative snapshot after each game; prefixes[0] = before any game.
  const prefixes: StatLine[] = [zeroLine()];
  const cum = zeroLine();
  for (const sp of sorted) { addSplit(cum, sp, group); prefixes.push({ ...cum }); }
  const final = prefixes[prefixes.length - 1]!;

  const eq = (p: StatLine) => keys.every((k) => p[k] === fbst[k]);
  const le = (a: StatLine, b: StatLine) => keys.every((k) => a[k] <= b[k]);
  const diffVsFinal: Diff[] = [];
  for (const k of keys) if (fbst[k] !== final[k]) diffVsFinal.push({ stat: k, fbst: fbst[k], mlb: final[k] });

  for (let g = 0; g < prefixes.length; g++) {
    if (eq(prefixes[g]!)) return { status: "consistent", matchedGames: g, totalGames: sorted.length, diffVsFinal };
  }
  for (let g = 0; g < prefixes.length - 1; g++) {
    if (le(prefixes[g]!, fbst) && le(fbst, prefixes[g + 1]!)) {
      return { status: "in-progress", matchedGames: g, totalGames: sorted.length, diffVsFinal };
    }
  }
  return { status: "inconsistent", matchedGames: null, totalGames: sorted.length, diffVsFinal };
}

/* ── Orchestration ─────────────────────────────────────────────────── */

async function fetchGameLog(mlbId: number, group: "hitting" | "pitching"): Promise<GameLogSplit[]> {
  const url = `https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=gameLog&group=${group}&season=2026`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { stats?: { splits?: GameLogSplit[] }[] };
  return data.stats?.[0]?.splits ?? [];
}

async function main() {
  const leagueId = Number(process.argv[2] ?? 20);
  const teamFilter = process.argv[3]; // optional team name substring

  const periods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active", "completed"] } },
    select: { id: true, startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
  });
  if (!periods.length) { console.error("No periods."); process.exit(1); }
  const seasonStart = periods[0]!.startDate;

  const rosters = await prisma.roster.findMany({
    where: { team: { leagueId, ...(teamFilter ? { name: { contains: teamFilter } } : {}) } },
    select: {
      teamId: true, playerId: true, acquiredAt: true, releasedAt: true, assignedPosition: true,
      team: { select: { name: true } },
      player: { select: { mlbId: true, posPrimary: true, name: true } },
    },
  });
  const ilEvents = await prisma.transactionEvent.findMany({
    where: { playerId: { in: rosters.map((r) => r.playerId) }, transactionType: { in: ["IL_STASH", "IL_ACTIVATE"] }, effDate: { not: null } },
    select: { playerId: true, transactionType: true, effDate: true },
    orderBy: { effDate: "asc" },
  });
  const ilWindows = buildIlWindows(ilEvents);

  console.log(`\nMLB ground-truth cross-check — league ${leagueId} (self-aligning per player; no fixed as-of cutoff)\n`);

  let checked = 0, consistent = 0, skipped = 0, lagCount = 0, inProgressCount = 0;
  const flagged: string[] = [];

  for (const r of rosters) {
    // Fully-owned, no IL gaps → FBST total must equal an MLB cumulative prefix.
    const fullyOwned = r.acquiredAt <= seasonStart && r.releasedAt === null && !(ilWindows.get(r.playerId)?.length);
    if (!fullyOwned || !r.player.mlbId) { skipped++; continue; }

    const isTwoWay = TWO_WAY_PLAYERS.has(r.player.mlbId);
    const roles = playerStatRoles({ posPrimary: r.player.posPrimary, assignedPosition: r.assignedPosition, isTwoWay });
    if (!roles.countHitting && !roles.countPitching) { skipped++; continue; }

    // FBST side: sum this player's PSP across all periods.
    const psp = await prisma.playerStatsPeriod.findMany({ where: { playerId: r.playerId, periodId: { in: periods.map((p) => p.id) } } });
    const fbst = zeroLine();
    for (const p of psp) {
      fbst.R += p.R; fbst.HR += p.HR; fbst.RBI += p.RBI; fbst.SB += p.SB; fbst.H += p.H; fbst.AB += p.AB;
      fbst.W += p.W; fbst.SV += p.SV; fbst.K += p.K; fbst.ER += p.ER; fbst.outs += ipToOuts(p.IP); fbst.BB_H += p.BB_H;
    }

    // Reconcile each counted group against the MLB game log (self-aligning).
    const groups: ("hitting" | "pitching")[] = [];
    if (roles.countHitting) groups.push("hitting");
    if (roles.countPitching) groups.push("pitching");

    checked++;
    const mlbId = realMlbId(r.player.mlbId); // map synthetic Ohtani-pitcher id → real
    let bad = false, inProgress = false, lag = 0;
    const badParts: string[] = [];
    for (const g of groups) {
      const rec = reconcile(fbst, await fetchGameLog(mlbId, g), g);
      if (rec.status === "inconsistent") {
        bad = true;
        badParts.push(rec.diffVsFinal
          .map((d) => `${d.stat}: FBST ${d.stat === "outs" ? (d.fbst / 3).toFixed(1) : d.fbst} vs MLB(full) ${d.stat === "outs" ? (d.mlb / 3).toFixed(1) : d.mlb}`)
          .join(", "));
      } else if (rec.status === "in-progress") {
        inProgress = true;
      } else if (rec.matchedGames !== null) {
        lag = Math.max(lag, rec.totalGames - rec.matchedGames);
      }
    }
    if (bad) flagged.push(`  ⚠ ${r.team.name} — ${r.player.name} (mlbId ${r.player.mlbId}): ${badParts.join("; ")}`);
    else { consistent++; if (inProgress) inProgressCount++; else if (lag > 0) lagCount++; }
  }

  console.log(`Checked ${checked} fully-owned players → ${consistent} consistent, ${flagged.length} flagged, ${skipped} skipped (partial ownership / IL → manual four-way).`);
  if (lagCount) console.log(`(${lagCount} are simply an as-of-date behind the live MLB log — expected.)`);
  if (inProgressCount) console.log(`(${inProgressCount} have a live/just-finished game mid-sync — transient; re-run once games are final.)`);
  console.log("");
  if (flagged.length) {
    console.log("FLAGGED — FBST fits the MLB game log at NO coherent point in time (investigate before any verdict):");
    flagged.forEach((f) => console.log(f));
  } else {
    console.log("✓ Every fully-owned player reconciles to the MLB game log (allowing for as-of lag / in-progress games).");
  }
  console.log("");
  await prisma.$disconnect();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
