/**
 * Pure selectors over the auction client state (UX step F).
 *
 * No React, no I/O. Every function takes the state it needs and returns plain
 * data, so the four auction screens share one definition of "needs", "board",
 * "bids on this player", "who's up" and "is this bid legal".
 */
import type { AuctionLogEvent, AuctionRosterEntry, AuctionTeam, ClientAuctionState } from '../hooks/useAuctionState';

type Config = ClientAuctionState['config'];

// ─── Slot model ──────────────────────────────────────────────────────────────
//
// Real data facts (server/src/lib/sports/baseball.ts, auctionStateManager.ts):
//  - `config.positionLimits` is the league's `roster.roster_positions` rule,
//    e.g. { C:2, 1B:1, 2B:1, 3B:1, SS:1, MI:1, CM:1, OF:5, DH:1 }. It has NO
//    pitcher key; the pitcher count is `config.pitcherCount`.
//  - A won player's `assignedPosition` is the player's primary MLB position
//    (e.g. "LF", "SP"), NOT a lineup slot, and `team.positionCounts` counts
//    that raw value for hitters. So neither says which slot a player fills.
//    We infer the slot from the player's position with the same eligibility
//    map the server uses (checkPositionLimit), filling primary slots first.

const PITCHER_CODES = new Set(['P', 'SP', 'RP', 'CL', 'TWP']);

/** Mirrors server `mlbPositionToSlots` (lib/sports/baseball.ts). */
function eligibleSlots(pos: string): string[] {
  const p = pos.trim().toUpperCase();
  if (p === 'C') return ['C'];
  if (p === '1B') return ['1B', 'CM'];
  if (p === '2B') return ['2B', 'MI'];
  if (p === '3B') return ['3B', 'CM'];
  if (p === 'SS') return ['SS', 'MI'];
  if (p === 'LF' || p === 'CF' || p === 'RF' || p === 'OF') return ['OF'];
  if (p === 'DH') return ['DH'];
  if (PITCHER_CODES.has(p)) return ['P'];
  return [];
}

const SLOT_ORDER = ['C', '1B', '2B', '3B', 'SS', 'MI', 'CM', 'OF', 'DH', 'P'];

const rankSlot = (slot: string) => {
  const i = SLOT_ORDER.indexOf(slot);
  return i === -1 ? SLOT_ORDER.indexOf('P') - 0.5 : i; // unknown slots (and H) sort just before P
};

/** Slot -> capacity for a league. Null limits degrade to hitters ("H") + pitchers. */
function slotLimits(config: Config): Record<string, number> {
  const pitchers = config.pitcherCount ?? 0;
  const limits = config.positionLimits;
  if (!limits) return { H: config.batterCount ?? 0, P: pitchers };
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(limits)) if (v > 0) out[k] = v;
  if (out.P === undefined && pitchers > 0) out.P = pitchers;
  return out;
}

function sortedSlots(limits: Record<string, number>): string[] {
  return Object.keys(limits).sort((a, b) => rankSlot(a) - rankSlot(b));
}

function playerPos(r: AuctionRosterEntry): string {
  return (r.posPrimary ?? r.assignedPosition ?? '').toUpperCase();
}

/** Which slot each roster entry fills (null = no open slot; bench/overflow). Index-aligned with team.roster. */
function assignSlots(team: AuctionTeam, limits: Record<string, number>): (string | null)[] {
  const remaining = { ...limits };
  const hasH = 'H' in limits;
  const candidates = team.roster.map(r => {
    const pos = playerPos(r);
    if (PITCHER_CODES.has(pos)) return ['P'];
    if (hasH) return ['H'];
    const slots = eligibleSlots(pos).filter(s => s in limits);
    // A hitter with no open natural slot may still DH (display-only inference, not the owner's lineup).
    if ('DH' in limits && !slots.includes('DH')) slots.push('DH');
    return slots;
  });
  // Most-constrained players first so flexible ones don't steal a sole slot.
  const order = candidates.map((_, i) => i).sort((a, b) => candidates[a].length - candidates[b].length || a - b);
  const result: (string | null)[] = team.roster.map(() => null);
  for (const i of order) {
    const slot = candidates[i].find(s => (remaining[s] ?? 0) > 0);
    if (slot) { remaining[slot]--; result[i] = slot; }
  }
  return result;
}

// ─── Needs and board ─────────────────────────────────────────────────────────

/**
 * Open slots as one line, e.g. `C, SS, OF ×2, P ×5` (× is U+00D7; ` ×N` only
 * when N > 1). Empty string when every slot is filled.
 */
export function teamNeeds(team: AuctionTeam, config: Config): string {
  const limits = slotLimits(config);
  const assigned = assignSlots(team, limits);
  return sortedSlots(limits)
    .map(slot => {
      const filled = assigned.filter(s => s === slot).length;
      const open = limits[slot] - filled;
      if (open <= 0) return '';
      return open > 1 ? `${slot} ×${open}` : slot;
    })
    .filter(Boolean)
    .join(', ');
}

export interface BoardPlayer { name: string; price: number; mlbId: number | null }
export interface BoardGroup {
  /** e.g. `C ×2`, `1B · 2B · 3B`, `SS · MI · CM`, `OF ×5`, `P ×9` */
  label: string;
  /** League slot keys in this group */
  slots: string[];
  capacity: number;
  filled: BoardPlayer[];
  open: number;
}

const KNOWN_GROUPS: string[][] = [['C'], ['1B', '2B', '3B'], ['SS', 'MI', 'CM'], ['OF']];

/**
 * A team's roster grouped for the Board: C, 1B · 2B · 3B, SS · MI · CM, OF ×N,
 * then any other league slots as their own groups (DH, ...), then P ×N.
 * Slots outside the known groups fall back to raw slot groups; nothing is
 * hardcoded to one league's limits. Players with no open slot (bench) are not listed.
 */
export function boardGroups(team: AuctionTeam, config: Config): BoardGroup[] {
  const limits = slotLimits(config);
  const assigned = assignSlots(team, limits);
  const claimed = new Set<string>();
  const defs: string[][] = [];
  for (const g of KNOWN_GROUPS) {
    const present = g.filter(s => s in limits);
    if (present.length) { defs.push(present); present.forEach(s => claimed.add(s)); }
  }
  const raw = sortedSlots(limits).filter(s => !claimed.has(s) && s !== 'P').map(s => [s]);
  defs.push(...raw);
  if ('P' in limits) defs.push(['P']);

  return defs.map(slots => {
    const capacity = slots.reduce((n, s) => n + limits[s], 0);
    const filled: BoardPlayer[] = [];
    team.roster.forEach((r, i) => {
      const slot = assigned[i];
      if (slot && slots.includes(slot)) filled.push({ name: r.playerName ?? 'Unknown', price: r.price, mlbId: r.mlbId ?? null });
    });
    const names = slots.join(' · ');
    const label = slots.length === 1 && capacity > 1 ? `${names} ×${capacity}` : names;
    return { label, slots, capacity, filled, open: Math.max(0, capacity - filled.length) };
  });
}

// ─── Log selectors ───────────────────────────────────────────────────────────

export interface LotBid { teamId?: number; teamName?: string; amount?: number; timestamp: number; auto: boolean }

/**
 * Bids on the player currently up: BID log entries after the latest NOMINATION,
 * newest first (the server unshifts, so the log is already newest first).
 * `auto` is true for proxy/auto bids ("X auto-bid $N" in the log message).
 */
export function lotBids(state: Pick<ClientAuctionState, 'log'>): LotBid[] {
  const out: LotBid[] = [];
  for (const e of state.log) {
    if (e.type === 'NOMINATION') break;
    if (e.type === 'BID') {
      out.push({ teamId: e.teamId, teamName: e.teamName, amount: e.amount, timestamp: e.timestamp, auto: /auto-bid/i.test(e.message) });
    }
  }
  return out;
}

export interface LastSale { playerId?: string; playerName?: string; teamId?: number; teamName?: string; amount?: number; timestamp: number; rosterId?: number }

/** Most recent sales (WIN log entries not undone), newest first. Default top 5. */
export function lastSales(state: Pick<ClientAuctionState, 'log'>, limit = 5): LastSale[] {
  return state.log
    .filter((e: AuctionLogEvent) => e.type === 'WIN' && !e.undone)
    .slice(0, limit)
    .map(e => ({ playerId: e.playerId, playerName: e.playerName, teamId: e.teamId, teamName: e.teamName, amount: e.amount, timestamp: e.timestamp, rosterId: e.rosterId }));
}

// ─── Turn order ──────────────────────────────────────────────────────────────

export interface OrderEntry { team: AuctionTeam; isMe: boolean }
export interface OrderStrip { now: OrderEntry | null; next: OrderEntry | null; rest: OrderEntry[] }

/**
 * Who is up, who is next, and the rest in turn order. Teams with no open spots
 * are skipped the way server `advanceQueue` skips them. `next` is null when
 * the team on the clock is the only one with spots left (the server would hand
 * the turn straight back to it).
 */
export function orderStrip(state: Pick<ClientAuctionState, 'queue' | 'queueIndex' | 'teams'>, myTeamId: number | null | undefined): OrderStrip {
  const { queue, queueIndex, teams } = state;
  if (!queue.length) return { now: null, next: null, rest: [] };
  const entry = (id: number): OrderEntry | null => {
    const team = teams.find(t => t.id === id);
    return team ? { team, isMe: team.id === myTeamId } : null;
  };
  const now = entry(queue[queueIndex % queue.length]);
  const after: OrderEntry[] = [];
  for (let step = 1; step < queue.length; step++) {
    const e = entry(queue[(queueIndex + step) % queue.length]);
    if (e && e.team.spotsLeft > 0) after.push(e);
  }
  const [next = null, ...rest] = after;
  return { now, next, rest };
}

// ─── Bid validation ──────────────────────────────────────────────────────────

export type BidValidation = { ok: true } | { ok: false; message: string };

/**
 * Client-side check for a typed bid: whole number, above the current bid, at
 * most your max bid. The server stays the authority; show its error inline too.
 */
export function bidValidation(
  amount: number | string,
  state: Pick<ClientAuctionState, 'nomination'>,
  myTeam: Pick<AuctionTeam, 'maxBid'> | null | undefined,
): BidValidation {
  if (!state.nomination) return { ok: false, message: 'No player is up for bid' };
  if (!myTeam) return { ok: false, message: "You don't have a team in this league" };
  const n = typeof amount === 'string' ? (amount.trim() === '' ? NaN : Number(amount)) : amount;
  if (!Number.isInteger(n)) return { ok: false, message: 'Enter a whole number' };
  const current = state.nomination.currentBid;
  if (n <= current) return { ok: false, message: `Bid must be more than $${current}` };
  if (n > myTeam.maxBid) return { ok: false, message: `Your max bid is $${myTeam.maxBid}` };
  return { ok: true };
}

/**
 * Client-side check for the opening bid when putting a player up: a whole
 * number from $1 to your max bid. The server stays the authority.
 */
export function openingBidValidation(
  amount: number | string,
  myTeam: Pick<AuctionTeam, 'maxBid'> | null | undefined,
): BidValidation {
  if (!myTeam) return { ok: false, message: "You don't have a team in this league" };
  const n = typeof amount === 'string' ? (amount.trim() === '' ? NaN : Number(amount)) : amount;
  if (!Number.isInteger(n)) return { ok: false, message: 'Enter a whole number' };
  if (n < 1) return { ok: false, message: 'Opening bid must be at least $1' };
  if (n > myTeam.maxBid) return { ok: false, message: `Your max bid is $${myTeam.maxBid}` };
  return { ok: true };
}

// ─── Misc ────────────────────────────────────────────────────────────────────

/** Players still to be bought: open roster spots summed over every team. */
export function playersLeft(state: Pick<ClientAuctionState, 'teams'>): number {
  return state.teams.reduce((n, t) => n + Math.max(0, t.spotsLeft), 0);
}
