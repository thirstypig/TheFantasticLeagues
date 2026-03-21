import React, { useMemo, useState } from 'react';
import { BarChart3, Search, ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import type { AuctionLogEvent } from '../hooks/useAuctionState';
import { track } from '../../../lib/posthog';

/* ================================================================
   TEAM COLOR PALETTE
   Assigned by team index position in the auction state.
   ================================================================ */
const TEAM_COLORS = [
  { bg: 'bg-blue-500',    text: 'text-blue-500',    bar: 'bg-blue-500/80',    border: 'border-blue-500/30',   dot: 'bg-blue-400'    },
  { bg: 'bg-emerald-500', text: 'text-emerald-500',  bar: 'bg-emerald-500/80', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  { bg: 'bg-amber-500',   text: 'text-amber-500',    bar: 'bg-amber-500/80',   border: 'border-amber-500/30',  dot: 'bg-amber-400'   },
  { bg: 'bg-purple-500',  text: 'text-purple-500',   bar: 'bg-purple-500/80',  border: 'border-purple-500/30', dot: 'bg-purple-400'  },
  { bg: 'bg-rose-500',    text: 'text-rose-500',     bar: 'bg-rose-500/80',    border: 'border-rose-500/30',   dot: 'bg-rose-400'    },
  { bg: 'bg-cyan-500',    text: 'text-cyan-500',     bar: 'bg-cyan-500/80',    border: 'border-cyan-500/30',   dot: 'bg-cyan-400'    },
  { bg: 'bg-orange-500',  text: 'text-orange-500',   bar: 'bg-orange-500/80',  border: 'border-orange-500/30', dot: 'bg-orange-400'  },
  { bg: 'bg-pink-500',    text: 'text-pink-500',     bar: 'bg-pink-500/80',    border: 'border-pink-500/30',   dot: 'bg-pink-400'    },
  { bg: 'bg-teal-500',    text: 'text-teal-500',     bar: 'bg-teal-500/80',    border: 'border-teal-500/30',   dot: 'bg-teal-400'    },
  { bg: 'bg-indigo-500',  text: 'text-indigo-500',   bar: 'bg-indigo-500/80',  border: 'border-indigo-500/30', dot: 'bg-indigo-400'  },
];

/* ================================================================
   TYPES — derived from the auction log
   ================================================================ */
interface BidStep {
  teamId: number;
  teamName: string;
  amount: number;
  timestamp: number;
  isNomination: boolean;
}

interface ProcessedLot {
  playerId: string;
  playerName: string;
  bids: BidStep[];
  openingBid: number;
  finalPrice: number;
  winnerTeamId: number;
  winnerTeamName: string;
  bidCount: number;
  bidSpread: number; // finalPrice - openingBid
  uniqueBidders: number;
}

interface BidHistoryChartProps {
  log: AuctionLogEvent[];
  teams: { id: number; name: string; code: string }[];
}

/* ================================================================
   HELPER: group log events into per-lot bid sequences
   ================================================================ */
function buildLotData(log: AuctionLogEvent[]): ProcessedLot[] {
  const lots: ProcessedLot[] = [];
  let currentLot: { playerId: string; playerName: string; bids: BidStep[] } | null = null;

  // Walk from oldest to newest. Log is stored newest-first, so reverse.
  const chronological = [...log].reverse();

  for (const evt of chronological) {
    if (evt.type === 'NOMINATION' && evt.playerId) {
      // Start a new lot
      currentLot = {
        playerId: evt.playerId,
        playerName: evt.playerName || 'Unknown',
        bids: [{
          teamId: evt.teamId || 0,
          teamName: evt.teamName || '',
          amount: evt.amount || 1,
          timestamp: evt.timestamp,
          isNomination: true,
        }],
      };
    } else if (evt.type === 'BID' && currentLot) {
      currentLot.bids.push({
        teamId: evt.teamId || 0,
        teamName: evt.teamName || '',
        amount: evt.amount || 0,
        timestamp: evt.timestamp,
        isNomination: false,
      });
    } else if (evt.type === 'WIN' && currentLot) {
      const bids = currentLot.bids;
      const openingBid = bids[0]?.amount || 1;
      const finalPrice = evt.amount || bids[bids.length - 1]?.amount || 0;
      const uniqueTeams = new Set(bids.map(b => b.teamId));

      lots.push({
        playerId: currentLot.playerId,
        playerName: currentLot.playerName,
        bids,
        openingBid,
        finalPrice,
        winnerTeamId: evt.teamId || 0,
        winnerTeamName: evt.teamName || '',
        bidCount: bids.length,
        bidSpread: finalPrice - openingBid,
        uniqueBidders: uniqueTeams.size,
      });
      currentLot = null;
    }
  }

  return lots;
}

/* ================================================================
   SINGLE LOT CHART — shows price escalation bars + bid timeline
   ================================================================ */
function LotChart({ lot, teamColorMap, maxPrice }: {
  lot: ProcessedLot;
  teamColorMap: Map<number, number>;
  maxPrice: number;
}) {
  const barMax = Math.max(maxPrice, lot.finalPrice, 1);
  const startTs = lot.bids[0]?.timestamp || 0;

  return (
    <div className="space-y-3">
      {/* Summary stats row */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span className="text-[var(--lg-text-muted)]">
          Opening: <span className="font-semibold text-[var(--lg-text-primary)] tabular-nums">${lot.openingBid}</span>
        </span>
        <span className="text-[var(--lg-text-muted)]">
          Final: <span className="font-semibold text-[var(--lg-accent)] tabular-nums">${lot.finalPrice}</span>
        </span>
        <span className="text-[var(--lg-text-muted)]">
          Bids: <span className="font-semibold text-[var(--lg-text-primary)] tabular-nums">{lot.bidCount}</span>
        </span>
        <span className="text-[var(--lg-text-muted)]">
          Bidders: <span className="font-semibold text-[var(--lg-text-primary)] tabular-nums">{lot.uniqueBidders}</span>
        </span>
        <span className="text-[var(--lg-text-muted)]">
          Spread: <span className="font-semibold text-[var(--lg-text-primary)] tabular-nums">+${lot.bidSpread}</span>
        </span>
      </div>

      {/* Price escalation bars */}
      <div className="space-y-1">
        {lot.bids.map((bid, i) => {
          const widthPct = Math.max((bid.amount / barMax) * 100, 4);
          const colorIdx = teamColorMap.get(bid.teamId) ?? 0;
          const color = TEAM_COLORS[colorIdx % TEAM_COLORS.length];
          const isWinner = i === lot.bids.length - 1;
          const elapsed = startTs > 0 ? Math.round((bid.timestamp - startTs) / 1000) : 0;

          return (
            <div key={i} className="flex items-center gap-2 group">
              {/* Bid number */}
              <span className="w-5 text-right text-[10px] text-[var(--lg-text-muted)] tabular-nums shrink-0">
                {i + 1}
              </span>

              {/* Bar */}
              <div className="flex-1 relative">
                <div
                  className={`h-6 rounded ${color.bar} transition-all duration-300 flex items-center relative ${isWinner ? 'ring-1 ring-[var(--lg-success)]/50' : ''}`}
                  style={{ width: `${widthPct}%`, minWidth: '60px' }}
                >
                  <span className="absolute left-2 text-[11px] font-semibold text-white truncate pr-1">
                    {bid.teamName}
                  </span>
                  <span className="absolute right-2 text-[11px] font-semibold text-white tabular-nums">
                    ${bid.amount}
                  </span>
                </div>
              </div>

              {/* Timestamp delta */}
              <span className="w-12 text-right text-[10px] text-[var(--lg-text-muted)] tabular-nums shrink-0">
                {bid.isNomination ? 'nom' : `+${elapsed}s`}
              </span>

              {/* Winner badge */}
              {isWinner && (
                <Trophy size={12} className="text-[var(--lg-success)] shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function BidHistoryChart({ log, teams }: BidHistoryChartProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'lot' | 'price' | 'bids'>('lot');
  const [hasTracked, setHasTracked] = useState(false);

  // Build team color index map
  const teamColorMap = useMemo(() => {
    const map = new Map<number, number>();
    teams.forEach((t, i) => map.set(t.id, i));
    return map;
  }, [teams]);

  // Process log into lots
  const allLots = useMemo(() => buildLotData(log), [log]);

  // Summary stats across all lots
  const summary = useMemo(() => {
    if (allLots.length === 0) return { totalLots: 0, avgBids: 0, avgPrice: 0, maxPrice: 0, hottest: null as ProcessedLot | null };
    const totalBids = allLots.reduce((sum, l) => sum + l.bidCount, 0);
    const totalSpent = allLots.reduce((sum, l) => sum + l.finalPrice, 0);
    const maxPrice = Math.max(...allLots.map(l => l.finalPrice));
    const hottest = [...allLots].sort((a, b) => b.bidCount - a.bidCount)[0] || null;
    return {
      totalLots: allLots.length,
      avgBids: totalBids / allLots.length,
      avgPrice: totalSpent / allLots.length,
      maxPrice,
      hottest,
    };
  }, [allLots]);

  // Filter and sort
  const filteredLots = useMemo(() => {
    let lots = allLots;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      lots = lots.filter(l =>
        l.playerName.toLowerCase().includes(q) ||
        l.winnerTeamName.toLowerCase().includes(q)
      );
    }
    switch (sortBy) {
      case 'price':
        return [...lots].sort((a, b) => b.finalPrice - a.finalPrice);
      case 'bids':
        return [...lots].sort((a, b) => b.bidCount - a.bidCount);
      default:
        return lots; // already in lot order
    }
  }, [allLots, searchQuery, sortBy]);

  const handleExpand = (playerId: string) => {
    const next = expandedPlayerId === playerId ? null : playerId;
    setExpandedPlayerId(next);
    if (next && !hasTracked) {
      track('bid_history_viewed');
      setHasTracked(true);
    }
  };

  if (allLots.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Section heading */}
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-[var(--lg-accent)]" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--lg-text-muted)]">Bid History</h2>
      </div>

      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--lg-text-secondary)] px-1">
        <span className="tabular-nums">
          <span className="font-semibold text-[var(--lg-text-primary)]">{summary.totalLots}</span> lots
        </span>
        <span className="text-[var(--lg-text-muted)]">&middot;</span>
        <span className="tabular-nums">
          avg <span className="font-semibold text-[var(--lg-text-primary)]">{summary.avgBids.toFixed(1)}</span> bids/lot
        </span>
        <span className="text-[var(--lg-text-muted)]">&middot;</span>
        <span className="tabular-nums">
          avg price <span className="font-semibold text-[var(--lg-accent)]">${summary.avgPrice.toFixed(2)}</span>
        </span>
        {summary.hottest && (
          <>
            <span className="text-[var(--lg-text-muted)]">&middot;</span>
            <span className="tabular-nums">
              most contested: <span className="font-semibold text-[var(--lg-text-primary)]">{summary.hottest.playerName}</span> ({summary.hottest.bidCount} bids)
            </span>
          </>
        )}
      </div>

      {/* Search + sort controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lg-text-muted)]" />
          <input
            type="text"
            placeholder="Search by player or team..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-input-bg)] text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--lg-accent)]"
          />
        </div>
        <div className="flex bg-[var(--lg-tint)] rounded-lg p-0.5 border border-[var(--lg-border-subtle)] self-start">
          {(['lot', 'price', 'bids'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setSortBy(mode)}
              className={`px-3 py-1.5 text-[10px] font-semibold uppercase rounded-md transition-all ${
                sortBy === mode
                  ? 'bg-[var(--lg-accent)] text-white'
                  : 'text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]'
              }`}
            >
              {mode === 'lot' ? 'Order' : mode === 'price' ? 'Price' : 'Bids'}
            </button>
          ))}
        </div>
      </div>

      {/* Team color legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
        {teams.map((team, i) => {
          const color = TEAM_COLORS[i % TEAM_COLORS.length];
          return (
            <span key={team.id} className="inline-flex items-center gap-1 text-[10px] text-[var(--lg-text-muted)]">
              <span className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
              {team.code}
            </span>
          );
        })}
      </div>

      {/* Lot list */}
      <div className="rounded-xl border border-[var(--lg-border-subtle)] overflow-hidden divide-y divide-[var(--lg-divide)]">
        {filteredLots.length === 0 && (
          <div className="p-6 text-center text-sm text-[var(--lg-text-muted)]">
            No lots match your search.
          </div>
        )}
        {filteredLots.map((lot, idx) => {
          const isExpanded = expandedPlayerId === lot.playerId;
          const colorIdx = teamColorMap.get(lot.winnerTeamId) ?? 0;
          const winnerColor = TEAM_COLORS[colorIdx % TEAM_COLORS.length];

          return (
            <div key={`${lot.playerId}-${idx}`}>
              {/* Lot header row */}
              <div
                className={`px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[var(--lg-tint)] transition-colors ${isExpanded ? 'bg-[var(--lg-tint)]' : ''}`}
                onClick={() => handleExpand(lot.playerId)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Lot number */}
                  <span className="text-xs text-[var(--lg-text-muted)] tabular-nums w-6 text-right shrink-0">
                    {idx + 1}
                  </span>

                  {/* Player info */}
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-[var(--lg-text-primary)] truncate">
                      {lot.playerName}
                    </div>
                    <div className="text-[10px] text-[var(--lg-text-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${winnerColor.dot} shrink-0`} />
                        {lot.winnerTeamName}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  {/* Price */}
                  <span className="font-semibold text-[var(--lg-accent)] tabular-nums text-sm">
                    ${lot.finalPrice}
                  </span>

                  {/* Bid count */}
                  <span className="text-xs text-[var(--lg-text-muted)] tabular-nums w-10 text-right">
                    {lot.bidCount} bid{lot.bidCount !== 1 ? 's' : ''}
                  </span>

                  {/* Mini escalation preview */}
                  <div className="hidden sm:flex items-end gap-px h-4 w-16">
                    {lot.bids.map((bid, i) => {
                      const heightPct = Math.max((bid.amount / lot.finalPrice) * 100, 10);
                      const cIdx = teamColorMap.get(bid.teamId) ?? 0;
                      const c = TEAM_COLORS[cIdx % TEAM_COLORS.length];
                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-t-sm ${c.bar}`}
                          style={{ height: `${heightPct}%` }}
                        />
                      );
                    })}
                  </div>

                  {/* Expand chevron */}
                  <div className="text-[var(--lg-text-muted)]">
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </div>
              </div>

              {/* Expanded chart */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-[var(--lg-border-faint)] bg-[var(--lg-tint)]/30 animate-in fade-in slide-in-from-top-2 duration-300">
                  <LotChart
                    lot={lot}
                    teamColorMap={teamColorMap}
                    maxPrice={summary.maxPrice}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
