/**
 * Awards service — Fantasy MVP & Cy Young computation via z-score composite.
 *
 * Extracted from digestService.ts (todo #115) so the structured rankings can
 * be queried independently of digest generation. Z-scores normalize stats to
 * a common scale (standard deviations from the league mean), then each stat
 * is weighted by its historical correlation with award voting.
 *
 * Why extract: previously the rankings were computed inline, formatted as
 * strings for the AI prompt, and discarded. The AI's free-text interpretation
 * was the only persisted artifact, which means agents and downstream UIs had
 * to re-parse prose to recover the underlying numbers. By exposing a typed
 * structure here we make the data agent-native — `GET /api/leagues/:id/awards`
 * returns this shape verbatim.
 */
import { prisma } from "../../../db/prisma.js";
// Wire-format types live in the shared Zod schema (todo #118). Both client
// and server import from there so a drift between server response and
// consumer expectation is a TypeScript compile error, not a runtime bug.
// The persisted blob in `AiInsight.data.awards` conforms to the same shape.
import {
  AwardsRankingsSchema,
  type AwardsAvailableWeek,
  type AwardsRankings,
  type AwardsResponse,
  type CyYoungCandidate,
  type MvpCandidate,
} from "../../../../../shared/api/awards.js";
import { getWeekKey, weekKeyLabel } from "../../../lib/utils.js";

// Re-export inferred types for back-compat with consumers that still import
// these from the service module (digestService, route handlers, tests).
export type { AwardsRankings, CyYoungCandidate, MvpCandidate };

// ─── Constants ───

/** Minimum AB to qualify for the MVP pool — early-season floor. */
export const MIN_AB_FOR_MVP = 50;
/** Minimum IP for any pitcher to qualify for the Cy Young pool. */
export const MIN_IP_FOR_CY_YOUNG = 20;
/** Minimum GS to be considered a "starter" for Cy Young role classification. */
export const MIN_GS_FOR_STARTER = 3;

/** Multiplier applied to the reliever composite to keep starters dominant. */
export const RELIEVER_DISCOUNT = 0.7;

/**
 * Per-stat MVP weights, keyed by the same labels used in `MvpCandidate.zScores`.
 * The composite score is `Σ weight[k] * zScore[k]`. Negative weight = stat
 * where higher is worse (only `SO` here — strikeouts at the plate).
 *
 * Lifting these out of the call site (todo #146) makes the formula auditable
 * without scrolling through the aggregation code, and sets up an obvious next
 * step for tuning per-league: drive `MVP_WEIGHTS` from `LeagueRule` once we
 * support custom scoring categories.
 */
export const MVP_WEIGHTS: Readonly<Record<keyof MvpCandidate["zScores"], number>> = Object.freeze({
  OPS: 3.0,
  HR: 2.5,
  OBP: 2.0,
  RBI: 1.5,
  R: 1.5,
  SB: 1.5,
  TB: 1.0,
  BB: 0.5,
  SO: -0.3, // strikeouts at the plate are bad
});
const MVP_STAT_KEYS = [
  "OPS",
  "HR",
  "OBP",
  "RBI",
  "R",
  "SB",
  "TB",
  "BB",
  "SO",
] as const satisfies readonly (keyof MvpCandidate["zScores"])[];

/**
 * Per-stat starter weights for Cy Young. Note that `ERA`, `WHIP`, and `BB9`
 * z-scores are already sign-flipped at compute time (lower-is-better → higher
 * z is "better"), so the weight here is the post-flip multiplier.
 */
export const CY_YOUNG_STARTER_WEIGHTS: Readonly<Record<keyof CyYoungCandidate["zScores"], number>> = Object.freeze({
  ERA: 3.5,
  WHIP: 2.5,
  K: 2.0,
  K9: 1.5,
  IP: 1.5,
  W: 1.0,
  L: -0.5, // more losses = worse
  HR_A: -0.5,
  BB9: 0.5,
  SV: 0.0, // saves don't drive the starter score
});

/**
 * Per-stat reliever weights for Cy Young. Same sign-flip convention as the
 * starter weights. Relievers don't get credit for IP / W and get a flat
 * `RELIEVER_DISCOUNT` multiplier on the final composite.
 */
export const CY_YOUNG_RELIEVER_WEIGHTS: Readonly<Record<keyof CyYoungCandidate["zScores"], number>> = Object.freeze({
  SV: 3.0,
  ERA: 3.0,
  WHIP: 2.0,
  K9: 1.5,
  K: 1.0,
  BB9: 0.5,
  HR_A: -0.5,
  IP: 0.0,
  W: 0.0,
  L: 0.0,
});
const CY_YOUNG_STAT_KEYS = [
  "ERA",
  "WHIP",
  "K",
  "K9",
  "IP",
  "W",
  "L",
  "HR_A",
  "BB9",
  "SV",
] as const satisfies readonly (keyof CyYoungCandidate["zScores"])[];

// ─── Helpers ───

/**
 * Z-score: (value - mean) / stddev. SD floor at 1 to avoid divide-by-zero.
 * Non-finite inputs (NaN / ±Infinity) coerce to 0 so a single bad row from
 * Prisma `_sum` (which is `number | null` upstream and `?? 0`'d at the call
 * site) cannot poison the entire ranking with NaNs.
 */
function zScores(vals: number[]): number[] {
  if (vals.length === 0) return [];
  const safe = vals.map(v => (Number.isFinite(v) ? v : 0));
  const mean = safe.reduce((a, b) => a + b, 0) / safe.length;
  const sd = Math.sqrt(safe.reduce((s, v) => s + (v - mean) ** 2, 0) / safe.length) || 1;
  return safe.map(v => (v - mean) / sd);
}

// ─── Main computation ───

/**
 * Throw `signal.reason` (or a fresh AbortError) if the signal has been
 * aborted. Mirrors the standard `signal.throwIfAborted()` for runtimes that
 * don't yet expose it; calling it between aggregation stages lets us bail out
 * promptly when the caller cancels (todo #138).
 */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Aborted", "AbortError");
  }
}

/**
 * Compute MVP / Cy Young rankings for a league, summing stats across all
 * active+completed periods at the time of the call.
 *
 * `weekKey` is included in the output for caching/snapshotting; it does NOT
 * filter the period set (which is always "season-to-date").
 *
 * Pass `signal` to allow the caller to cancel the compute mid-flight (e.g.
 * when an HTTP client disconnects). The signal is checked between aggregation
 * stages so we don't keep burning DB time after a cancellation.
 */
export async function computeAwardsRankings(
  leagueId: number,
  weekKey: string,
  signal?: AbortSignal,
): Promise<AwardsRankings> {
  const computedAt = new Date().toISOString();

  throwIfAborted(signal);

  // Gather active/completed periods + rostered players for this league
  const [activePeriods, teams] = await Promise.all([
    prisma.period.findMany({
      where: { leagueId, status: { in: ["active", "completed"] } },
      select: { id: true },
    }),
    prisma.team.findMany({
      where: { leagueId },
      select: {
        name: true,
        rosters: {
          where: { releasedAt: null },
          select: { player: { select: { id: true, name: true } } },
        },
      },
    }),
  ]);

  if (activePeriods.length === 0) {
    return { leagueId, weekKey, computedAt, hitterPool: 0, starterPool: 0, mvp: [], cyYoung: [] };
  }

  const periodIds = activePeriods.map(p => p.id);
  const rosteredPlayerIds = [...new Set(teams.flatMap(t => t.rosters.map(r => r.player.id)))];
  if (rosteredPlayerIds.length === 0) {
    return { leagueId, weekKey, computedAt, hitterPool: 0, starterPool: 0, mvp: [], cyYoung: [] };
  }

  const playerNames = new Map<number, { name: string; team: string }>(
    teams.flatMap(t => t.rosters.map(r => [r.player.id, { name: r.player.name, team: t.name }])),
  );

  throwIfAborted(signal);

  // Aggregate stats across all periods in a single groupBy. Previously this
  // issued two parallel groupBys with identical where clauses (one for the
  // counting-stat sums, one for IP / BB_H) and merged the IP map post-hoc;
  // under `connection_limit=1` the two queries serialized on the wire, which
  // doubled the DB cost of every uncached awards request (todo #138).
  const playerStats = await prisma.playerStatsPeriod.groupBy({
    by: ["playerId"],
    where: { playerId: { in: rosteredPlayerIds }, periodId: { in: periodIds } },
    _sum: {
      AB: true, H: true, R: true, HR: true, RBI: true, SB: true,
      BB: true, TB: true, SO: true,
      W: true, SV: true, K: true, ER: true, L: true, GS: true, HR_A: true,
      IP: true, BB_H: true,
    },
  });

  throwIfAborted(signal);

  // ── MVP: hitters with AB >= MIN_AB_FOR_MVP ──
  const hitterRows = playerStats
    .filter(p => (p._sum.AB ?? 0) >= MIN_AB_FOR_MVP)
    .map(p => {
      const ab = p._sum.AB ?? 0, h = p._sum.H ?? 0, hr = p._sum.HR ?? 0;
      const rbi = p._sum.RBI ?? 0, r = p._sum.R ?? 0, sb = p._sum.SB ?? 0;
      const bb = p._sum.BB ?? 0, tb = p._sum.TB ?? 0, so = p._sum.SO ?? 0;
      const obp = (ab + bb) > 0 ? (h + bb) / (ab + bb) : 0;
      const slg = ab > 0 ? tb / ab : 0;
      const ops = obp + slg;
      const avg = ab > 0 ? h / ab : 0;
      const info = playerNames.get(p.playerId);
      return {
        playerId: p.playerId,
        name: info?.name ?? "?",
        team: info?.team ?? "?",
        ab, h, hr, rbi, r, sb, bb, tb, so, avg, obp, slg, ops,
      };
    });

  let mvp: MvpCandidate[] = [];
  if (hitterRows.length >= 3) {
    // Per-stat z-score arrays, keyed by the same labels as `MvpCandidate.zScores`.
    const mvpZ: Record<keyof MvpCandidate["zScores"], number[]> = {
      OPS: zScores(hitterRows.map(h => h.ops)),
      HR: zScores(hitterRows.map(h => h.hr)),
      OBP: zScores(hitterRows.map(h => h.obp)),
      RBI: zScores(hitterRows.map(h => h.rbi)),
      R: zScores(hitterRows.map(h => h.r)),
      SB: zScores(hitterRows.map(h => h.sb)),
      TB: zScores(hitterRows.map(h => h.tb)),
      BB: zScores(hitterRows.map(h => h.bb)),
      SO: zScores(hitterRows.map(h => h.so)),
    };
    const mvpStatKeys = MVP_STAT_KEYS;

    mvp = hitterRows
      .map((h, i) => ({
        h,
        i,
        // Composite = Σ weight[k] * zScore[k] over MVP_WEIGHTS.
        mvpScore: mvpStatKeys.reduce((acc, k) => acc + MVP_WEIGHTS[k] * mvpZ[k][i], 0),
      }))
      .sort((a, b) => b.mvpScore - a.mvpScore)
      .slice(0, 3)
      .map((row, idx): MvpCandidate => ({
        rank: idx + 1,
        playerId: row.h.playerId,
        name: row.h.name,
        team: row.h.team,
        mvpScore: row.mvpScore,
        stats: {
          AB: row.h.ab, H: row.h.h, HR: row.h.hr, RBI: row.h.rbi, R: row.h.r,
          SB: row.h.sb, BB: row.h.bb, TB: row.h.tb, SO: row.h.so,
          AVG: row.h.avg, OBP: row.h.obp, SLG: row.h.slg, OPS: row.h.ops,
        },
        zScores: {
          OPS: mvpZ.OPS[row.i], HR: mvpZ.HR[row.i], OBP: mvpZ.OBP[row.i],
          RBI: mvpZ.RBI[row.i], R: mvpZ.R[row.i], SB: mvpZ.SB[row.i],
          TB: mvpZ.TB[row.i], BB: mvpZ.BB[row.i], SO: mvpZ.SO[row.i],
        },
      }));
  }

  throwIfAborted(signal);

  // ── Cy Young: pitchers with IP >= MIN_IP and GS >= MIN_GS ──
  const starterRows = playerStats
    .filter(p => {
      const ip = p._sum.IP ?? 0;
      return ip >= MIN_IP_FOR_CY_YOUNG && (p._sum.GS ?? 0) >= MIN_GS_FOR_STARTER;
    })
    .map(p => {
      const ip = p._sum.IP ?? 0, bbh = p._sum.BB_H ?? 0;
      const w = p._sum.W ?? 0, l = p._sum.L ?? 0, k = p._sum.K ?? 0;
      const er = p._sum.ER ?? 0, sv = p._sum.SV ?? 0, hra = p._sum.HR_A ?? 0;
      const era = ip > 0 ? (er * 9) / ip : 99;
      const whip = ip > 0 ? bbh / ip : 99;
      const k9 = ip > 0 ? (k * 9) / ip : 0;
      const bb9 = ip > 0 ? ((bbh - (p._sum.H ?? 0)) * 9) / ip : 99; // approx BB from BB_H - H
      const info = playerNames.get(p.playerId);
      return {
        playerId: p.playerId,
        name: info?.name ?? "?",
        team: info?.team ?? "?",
        w, l, k, sv, ip, era, whip, k9, bb9, hra,
        isStarter: (p._sum.GS ?? 0) >= MIN_GS_FOR_STARTER,
      };
    });

  let cyYoung: CyYoungCandidate[] = [];
  if (starterRows.length >= 3) {
    // Per-stat z-score arrays, keyed by the same labels as
    // `CyYoungCandidate.zScores`. ERA / WHIP / BB9 are sign-flipped here
    // (lower is better → negate so higher is "better"); the weight table
    // assumes that flip has already been applied.
    const cyZ: Record<keyof CyYoungCandidate["zScores"], number[]> = {
      ERA: zScores(starterRows.map(p => p.era)).map(v => -v),
      WHIP: zScores(starterRows.map(p => p.whip)).map(v => -v),
      BB9: zScores(starterRows.map(p => p.bb9)).map(v => -v),
      K: zScores(starterRows.map(p => p.k)),
      K9: zScores(starterRows.map(p => p.k9)),
      IP: zScores(starterRows.map(p => p.ip)),
      W: zScores(starterRows.map(p => p.w)),
      L: zScores(starterRows.map(p => p.l)),
      HR_A: zScores(starterRows.map(p => p.hra)),
      SV: zScores(starterRows.map(p => p.sv)),
    };
    const cyStatKeys = CY_YOUNG_STAT_KEYS;

    cyYoung = starterRows
      .map((p, i) => {
        // Composite = Σ weight[k] * zScore[k]; pick weight set by role.
        const starterScore = cyStatKeys.reduce(
          (acc, k) => acc + CY_YOUNG_STARTER_WEIGHTS[k] * cyZ[k][i],
          0,
        );
        const relieverScore = cyStatKeys.reduce(
          (acc, k) => acc + CY_YOUNG_RELIEVER_WEIGHTS[k] * cyZ[k][i],
          0,
        );
        const isRelief = p.sv > 0 && !p.isStarter;
        const cyScore = isRelief ? relieverScore * RELIEVER_DISCOUNT : starterScore;
        return { p, i, cyScore, role: isRelief ? ("RP" as const) : ("SP" as const) };
      })
      .sort((a, b) => b.cyScore - a.cyScore)
      .slice(0, 3)
      .map((row, idx): CyYoungCandidate => ({
        rank: idx + 1,
        playerId: row.p.playerId,
        name: row.p.name,
        team: row.p.team,
        role: row.role,
        cyScore: row.cyScore,
        stats: {
          W: row.p.w, L: row.p.l, K: row.p.k, SV: row.p.sv,
          IP: row.p.ip, ERA: row.p.era, WHIP: row.p.whip,
          K9: row.p.k9, BB9: row.p.bb9, HR_A: row.p.hra,
        },
        zScores: {
          ERA: cyZ.ERA[row.i], WHIP: cyZ.WHIP[row.i], K: cyZ.K[row.i], K9: cyZ.K9[row.i],
          IP: cyZ.IP[row.i], W: cyZ.W[row.i], L: cyZ.L[row.i],
          HR_A: cyZ.HR_A[row.i], BB9: cyZ.BB9[row.i], SV: cyZ.SV[row.i],
        },
      }));
  }

  return {
    leagueId,
    weekKey,
    computedAt,
    hitterPool: hitterRows.length,
    starterPool: starterRows.length,
    mvp,
    cyYoung,
  };
}

// ─── String formatting (back-compat with digest prompts) ───

/** Format MVP rankings as the multi-line string the AI digest prompt expects. */
export function formatMvpForPrompt(rankings: AwardsRankings): string {
  if (!rankings.mvp.length) return "";
  return rankings.mvp
    .map((c: MvpCandidate) =>
      `${c.rank}. ${c.name} (${c.team}) — Score: ${c.mvpScore.toFixed(1)} | ` +
      `.${Math.round(c.stats.AVG * 1000)} AVG, .${Math.round(c.stats.OPS * 1000)} OPS, ` +
      `${c.stats.HR} HR, ${c.stats.RBI} RBI, ${c.stats.R} R, ${c.stats.SB} SB (${c.stats.AB} AB)`,
    )
    .join("\n");
}

/** Format Cy Young rankings as the multi-line string the AI digest prompt expects. */
export function formatCyYoungForPrompt(rankings: AwardsRankings): string {
  if (!rankings.cyYoung.length) return "";
  return rankings.cyYoung
    .map((c: CyYoungCandidate) =>
      `${c.rank}. ${c.name} (${c.team}, ${c.role}) — Score: ${c.cyScore.toFixed(1)} | ` +
      `${c.stats.ERA.toFixed(2)} ERA, ${c.stats.WHIP.toFixed(2)} WHIP, ${c.stats.K} K, ` +
      `${c.stats.W}-${c.stats.L} W-L, ${c.stats.K9.toFixed(1)} K/9, ${c.stats.SV} SV (${c.stats.IP.toFixed(1)} IP)`,
    )
    .join("\n");
}

// ─── Available-weeks enumeration (todo #179) ─────────────────────────────
//
// Build the same shape `mlb-feed/digestRoutes.ts:23-43` returns from
// `/league-digest/weeks`: one entry per persisted league_digest row, plus
// a synthetic entry for the current week if it isn't already in the list.
// Awards rankings are round-tripped from the same digest rows, so this is
// the exact set of weeks an agent can ask `?weekKey=…` for and expect a
// `source: "persisted"` response.

function buildAvailableWeeks(
  rows: { weekKey: string; createdAt: Date }[],
): AwardsAvailableWeek[] {
  const weeks: AwardsAvailableWeek[] = rows.map(r => ({
    weekKey: r.weekKey,
    label: weekKeyLabel(r.weekKey),
    generatedAt: r.createdAt.toISOString(),
  }));
  const currentWeekKey = getWeekKey();
  if (!weeks.some(w => w.weekKey === currentWeekKey)) {
    weeks.push({
      weekKey: currentWeekKey,
      label: weekKeyLabel(currentWeekKey),
      generatedAt: null,
    });
  }
  return weeks;
}

// ─── Cache layer (todo #119) ───────────────────────────────────────────────
//
// Awards rankings change only when player stats change — and stats change
// only on the daily 13:00 UTC sync. A 5-min TTL is generous: it covers the
// home-page polling pattern (multiple owners refreshing the leaderboard
// within a window) without ever serving genuinely stale data.
//
// `pending` provides stampede protection: if N requests arrive for the same
// (leagueId, weekKey) while the first compute is in flight, all N share the
// single Promise instead of firing N parallel `computeAwardsRankings` calls.
// Mirrors `standingsService.ts:608+` (PR #179).
//
// The cached value is the full `AwardsResponse` envelope including the
// `source` discriminator, so consumers see consistent values whether the
// underlying read came from the persisted digest blob or a fresh compute.

interface AwardsCacheEntry {
  data?: AwardsResponse;
  expiry: number;
  pending?: Promise<AwardsResponse>;
}

const awardsCache = new Map<string, AwardsCacheEntry>();
const AWARDS_CACHE_TTL = 300_000; // 5 minutes

function awardsCacheKey(leagueId: number, weekKey: string): string {
  return `${leagueId}:${weekKey}`;
}

/**
 * Invalidate the awards cache. Called from the leaguewide cache-invalidation
 * helper (`invalidateLeagueCaches` in transactions/routes.ts) on any roster
 * mutation, and may be called from the daily stats sync once that lands in
 * a separate refactor.
 *
 * `leagueId` clears every weekKey for that league; `undefined` clears all.
 */
export function clearAwardsCache(leagueId?: number): void {
  if (leagueId === undefined) {
    awardsCache.clear();
    return;
  }
  const prefix = `${leagueId}:`;
  for (const key of awardsCache.keys()) {
    if (key.startsWith(prefix)) awardsCache.delete(key);
  }
}

/**
 * Read awards for a (league, week), preferring the persisted digest snapshot
 * and falling through to on-demand compute. Result is cached for 5 minutes
 * with stampede coalescing — this is the canonical entry point for the
 * route handler and any future digest consumer that needs the structured
 * rankings.
 *
 * Failure of the persisted-blob shape validation (todo #118) silently falls
 * through to compute, same as before; the cache stores whatever we end up
 * returning so a malformed-blob league doesn't pay the validation cost on
 * every request.
 */
export async function getAwardsForWeek(
  leagueId: number,
  weekKey: string,
): Promise<AwardsResponse> {
  const key = awardsCacheKey(leagueId, weekKey);
  const cached = awardsCache.get(key);
  if (cached?.data && cached.expiry > Date.now()) return cached.data;
  if (cached?.pending) return cached.pending;

  const pending = (async (): Promise<AwardsResponse> => {
    // Fan out the persisted-week lookup with the targeted findFirst so the
    // `availableWeeks` enumeration (todo #179) doesn't add a second
    // serialized round-trip under `connection_limit=1`. Mirrors the
    // canonical pattern in `mlb-feed/digestRoutes.ts:23-43`.
    const [persisted, weekRows] = await Promise.all([
      // 1. Persisted snapshot — digest write path stores the full rankings
      //    envelope under data.awards (pre-#115 rows lack the field).
      prisma.aiInsight.findFirst({
        where: { type: "league_digest", leagueId, weekKey },
        select: { data: true, createdAt: true },
      }),
      // 2. All persisted digest weeks for this league (todo #179) — the
      //    same shape `/league-digest/weeks` returns. Awards is round-
      //    tripped from the same `AiInsight(type=league_digest)` rows, so
      //    the enumeration is identical.
      prisma.aiInsight.findMany({
        where: { type: "league_digest", leagueId },
        select: { weekKey: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const availableWeeks = buildAvailableWeeks(weekRows);

    if (persisted?.data && typeof persisted.data === "object") {
      const parsed = AwardsRankingsSchema.safeParse(
        (persisted.data as Record<string, unknown>).awards,
      );
      if (parsed.success) {
        return {
          ...parsed.data,
          source: "persisted",
          digestGeneratedAt: persisted.createdAt.toISOString(),
          availableWeeks,
        };
      }
    }
    // Compute fallback — covers pre-#115 digests, malformed blobs, and
    // ad-hoc queries for weeks that never had a digest run.
    const rankings = await computeAwardsRankings(leagueId, weekKey);
    return { ...rankings, source: "computed", availableWeeks };
  })();

  awardsCache.set(key, { data: cached?.data, expiry: 0, pending });
  try {
    const result = await pending;
    awardsCache.set(key, { data: result, expiry: Date.now() + AWARDS_CACHE_TTL });
    return result;
  } catch (err) {
    awardsCache.delete(key);
    throw err;
  }
}
