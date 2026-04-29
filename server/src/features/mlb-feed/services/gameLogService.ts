/**
 * Per-player MLB game-log lookup service.
 *
 * Powers the real boxscore stat lines on `GET /api/mlb/my-players-today`.
 * Fetches today's game log for an individual player and extracts the
 * split row for the requested date — either a hitting line, a pitching
 * line, or both (in the case of two-way players or position players who
 * pitched).
 *
 * Caching strategy:
 *   - Uses the existing shared SQLite cache at
 *     `mcp-servers/mlb-data/cache/mlb-data.db` via `lib/mlbCache.ts`.
 *   - TTL is keyed on the cached payload's effective game state:
 *       * 60s while any games are still in progress (`gameStatus !== "FINAL"`)
 *       * 24h once we know today's data is final
 *   - The cache key is the gameLog URL, but we vary the TTL via a
 *     thin wrapper: a cheap re-fetch every minute during live windows
 *     is acceptable; a slow drip once games end is required so the
 *     "what did my guy do last night" page stays warm without spamming
 *     statsapi.
 *
 * Rate limiting:
 *   - Reuses the token-bucket pattern established in the MCP server
 *     (`mcp-servers/mlb-data/src/rateLimiter.ts`). One in-process
 *     limiter is shared across all my-players-today requests.
 *
 * Failure modes:
 *   - Network/HTTP failures bubble up to the caller, which wraps every
 *     per-player call in `Promise.allSettled` and logs warnings rather
 *     than failing the whole panel.
 */
import { mlbGetJson } from "../../../lib/mlbApi.js";
import { cacheGet, cacheSet } from "../../../lib/mlbCache.js";
import { logger } from "../../../lib/logger.js";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

/** TTL (seconds) used while any games today are still live or scheduled. */
export const LIVE_GAME_TTL_SECONDS = 60;

/** TTL (seconds) used once today's game(s) have reached FINAL. */
export const FINAL_GAME_TTL_SECONDS = 24 * 60 * 60;

// ─── Types ──────────────────────────────────────────────────────────────

export interface HittingStatLine {
  AB: number;
  H: number;
  R: number;
  HR: number;
  RBI: number;
  SB: number;
  BB?: number;
  SO?: number;
}

export interface PitchingStatLine {
  /** MLB API returns innings pitched as a string like "6.2" — we keep it as
   *  number for the wire format; clients display whichever form they prefer. */
  IP: number;
  H: number;
  R: number;
  ER: number;
  BB: number;
  K: number;
  W?: 0 | 1;
  L?: 0 | 1;
  SV?: 0 | 1;
  HLD?: 0 | 1;
}

export interface PlayerStatLine {
  hitting?: HittingStatLine;
  pitching?: PitchingStatLine;
}

/** Game status as the client component expects it. The client (MyTeamTodayPanel)
 *  switches on these uppercase values to render LIVE / FINAL / PRE chips. */
export type GameStatus = "PRE" | "LIVE" | "FINAL";

export interface PlayerTodayLine {
  /** Stat line for today, if the player participated. */
  line?: PlayerStatLine;
  /** PRE/LIVE/FINAL — derived from caller-supplied schedule. */
  gameStatus: GameStatus;
  /** Short human-readable game state, e.g. "TOP 5", "FINAL", "7:30 PM ET". */
  gameStateDesc?: string;
}

// ─── Token bucket rate limiter ──────────────────────────────────────────
//
// Mirrors mcp-servers/mlb-data/src/rateLimiter.ts. One module-scoped
// instance is shared across all calls so concurrent requests across
// users / leagues converge on a single budget against statsapi.

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private queue: Array<() => void> = [];
  private drainTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private capacity: number,
    private refillRate: number,
    private maxQueueSize: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error("MLB gameLog rate limiter queue full");
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.startDrain();
    });
  }

  private startDrain(): void {
    if (this.drainTimer) return;
    this.drainTimer = setInterval(() => {
      this.refill();
      while (this.tokens >= 1 && this.queue.length > 0) {
        this.tokens--;
        const next = this.queue.shift()!;
        next();
      }
      if (this.queue.length === 0 && this.drainTimer) {
        clearInterval(this.drainTimer);
        this.drainTimer = null;
      }
    }, 50);
  }
}

const limiter = new TokenBucket(20, 10, 100);

/** Test-only — reset rate limiter state. */
export function _resetRateLimiterForTests(): void {
  // Leak the old, create a fresh one. Tests don't share state across files.
  (limiter as any).tokens = 20;
  (limiter as any).queue = [];
  if ((limiter as any).drainTimer) {
    clearInterval((limiter as any).drainTimer);
    (limiter as any).drainTimer = null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Fetch today's stat line for a single MLB player.
 *
 * @param mlbId       — MLB person ID
 * @param season      — 4-digit year (e.g. 2026)
 * @param dateStr     — YYYY-MM-DD; pass `mlbGameDayDate()` from the route
 * @param gameStatus  — derived from the schedule for this player's MLB team
 * @param gameStateDesc — optional human-readable state ("TOP 5", "F", "7:30 PM ET")
 *
 * Returns `{ line, gameStatus, gameStateDesc }`. `line` is `undefined` if:
 *   - the player has no gameLog split for today (DNP), OR
 *   - the game hasn't started (gameStatus === "PRE"), OR
 *   - the lookup failed (caller logs and degrades).
 */
export async function getPlayerTodayLine(opts: {
  mlbId: number;
  season: number;
  dateStr: string;
  gameStatus: GameStatus;
  gameStateDesc?: string;
}): Promise<PlayerTodayLine> {
  const { mlbId, season, dateStr, gameStatus, gameStateDesc } = opts;

  // Don't hit the gameLog API for games that haven't started — the API
  // would return an empty splits array and we'd just incur a request.
  if (gameStatus === "PRE") {
    return { gameStatus, gameStateDesc };
  }

  const url = `${MLB_BASE}/people/${mlbId}/stats?stats=gameLog&group=hitting,pitching&season=${season}`;

  // TTL: short while live, long once final. We re-check the cache wrapper
  // ourselves rather than calling mlbGetJson with a fixed TTL because the
  // appropriate TTL depends on per-player game state.
  const ttl = gameStatus === "FINAL" ? FINAL_GAME_TTL_SECONDS : LIVE_GAME_TTL_SECONDS;

  let payload: GameLogResponse | null = null;
  const cached = cacheGet(url) as GameLogResponse | null;
  if (cached) {
    payload = cached;
  } else {
    await limiter.acquire();
    try {
      payload = await mlbGetJson<GameLogResponse>(url, ttl);
    } catch (err) {
      // mlbGetJson never persists to cache on error; just rethrow so the
      // caller's Promise.allSettled records the rejection.
      throw err;
    }
    // mlbGetJson set the cache with a default TTL inside its own implementation.
    // Override with our state-aware TTL by writing again.
    if (payload) {
      cacheSet(url, payload, ttl);
    }
  }

  if (!payload) {
    return { gameStatus, gameStateDesc };
  }

  const line = extractTodayLine(payload, dateStr);
  return { line, gameStatus, gameStateDesc };
}

// ─── Internals ──────────────────────────────────────────────────────────

interface GameLogSplit {
  date?: string;
  /** MLB API may surface an "official" date that differs from gameDate
   *  (suspended/doubleheader cases). We accept either. */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  game?: { gameDate?: string; officialDate?: string };
  stat?: Record<string, unknown>;
}

interface GameLogStatsBlock {
  group?: { displayName?: string };
  splits?: GameLogSplit[];
}

interface GameLogResponse {
  stats?: GameLogStatsBlock[];
}

/** Extract today's stat line from a gameLog payload. Returns undefined if
 *  the player has no entry for today (DNP) or only entries on other dates. */
export function extractTodayLine(
  payload: GameLogResponse,
  dateStr: string,
): PlayerStatLine | undefined {
  const result: PlayerStatLine = {};

  for (const block of payload.stats || []) {
    const groupName = String(block.group?.displayName || "").toLowerCase();
    const splits = block.splits || [];
    const todaySplit = splits.find((s) => splitMatchesDate(s, dateStr));
    if (!todaySplit?.stat) continue;

    if (groupName === "hitting") {
      const hit = parseHitting(todaySplit.stat);
      if (hit) result.hitting = hit;
    } else if (groupName === "pitching") {
      const pit = parsePitching(todaySplit.stat);
      if (pit) result.pitching = pit;
    }
  }

  if (!result.hitting && !result.pitching) return undefined;
  return result;
}

function splitMatchesDate(split: GameLogSplit, dateStr: string): boolean {
  if (split.date === dateStr) return true;
  if (split.game?.gameDate?.startsWith(dateStr)) return true;
  if (split.game?.officialDate === dateStr) return true;
  return false;
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseHitting(stat: Record<string, unknown>): HittingStatLine | undefined {
  const ab = num(stat.atBats);
  const pa = num(stat.plateAppearances);
  // A hitter who came to the plate (AB or BB or HBP) counted as participating.
  if (ab === 0 && pa === 0) return undefined;
  return {
    AB: ab,
    H: num(stat.hits),
    R: num(stat.runs),
    HR: num(stat.homeRuns),
    RBI: num(stat.rbi),
    SB: num(stat.stolenBases),
    BB: num(stat.baseOnBalls),
    SO: num(stat.strikeOuts),
  };
}

function parsePitching(stat: Record<string, unknown>): PitchingStatLine | undefined {
  // MLB API returns inningsPitched as a string like "6.2" (6.2 = 6 and 2/3).
  // We pass it through as a number — callers can format. Treat 0 as DNP.
  const ipRaw = stat.inningsPitched;
  const ip = typeof ipRaw === "number" ? ipRaw : Number(ipRaw);
  if (!Number.isFinite(ip) || ip <= 0) return undefined;

  const line: PitchingStatLine = {
    IP: ip,
    H: num(stat.hits),
    R: num(stat.runs),
    ER: num(stat.earnedRuns),
    BB: num(stat.baseOnBalls),
    K: num(stat.strikeOuts),
  };
  if (num(stat.wins) > 0) line.W = 1;
  if (num(stat.losses) > 0) line.L = 1;
  if (num(stat.saves) > 0) line.SV = 1;
  if (num(stat.holds) > 0) line.HLD = 1;
  return line;
}

/**
 * Translate an MLB schedule game's `abstractGameState` to our GameStatus enum.
 * MLB returns "Preview" / "Live" / "Final" — we normalize to PRE/LIVE/FINAL.
 */
export function deriveGameStatus(abstractGameState: string | undefined): GameStatus {
  switch ((abstractGameState || "").toLowerCase()) {
    case "live":
      return "LIVE";
    case "final":
      return "FINAL";
    default:
      return "PRE";
  }
}

/**
 * Build a short human-readable game-state description for the panel.
 *
 *  - LIVE  → "TOP 5" / "BOT 9" (from linescore)
 *  - FINAL → "FINAL" or "F/10" if extra innings
 *  - PRE   → game time formatted as the caller provides (we just echo)
 */
export function buildGameStateDesc(opts: {
  gameStatus: GameStatus;
  detailedState?: string;
  inningHalf?: string;
  inning?: number;
  scheduledTimeShort?: string;
}): string {
  const { gameStatus, detailedState, inningHalf, inning, scheduledTimeShort } = opts;
  if (gameStatus === "LIVE") {
    if (inningHalf && inning) {
      const half = inningHalf.toLowerCase().startsWith("t") ? "TOP" : "BOT";
      return `${half} ${inning}`;
    }
    return detailedState || "LIVE";
  }
  if (gameStatus === "FINAL") {
    if (detailedState && /\bextra\b/i.test(detailedState)) return "F/EXT";
    if (inning && inning > 9) return `F/${inning}`;
    return "FINAL";
  }
  return scheduledTimeShort || "";
}

// Surface the logger so tests can assert warn calls without re-importing.
export { logger as _gameLogLogger };
