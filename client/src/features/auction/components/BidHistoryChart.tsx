import React, { useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import type { AuctionLogEvent } from '../hooks/useAuctionState';
import { track } from '../../../lib/posthog';
import { Glass, IridText, SectionLabel } from '../../../components/aurora/atoms';

/* Bars are labelled with the team name, so every bar is one neutral color;
   the winning bid takes the accent (Style Bible: nine colors, no team rainbow). */
const BAR = { background: 'var(--am-chip-strong)', color: 'var(--am-text)' } as const;
const WIN_BAR = { background: 'var(--am-accent)', color: 'var(--am-on-accent)' } as const;

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
}

/* ================================================================
   HELPER: group log events into per-lot bid sequences
   ================================================================ */
export function buildLotData(log: AuctionLogEvent[]): ProcessedLot[] {
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
    } else if (evt.type === 'WIN' && evt.undone) {
      // The commissioner undid this sale: it isn't a sale, drop the lot.
      currentLot = null;
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
function LotChart({ lot, maxPrice }: {
  lot: ProcessedLot;
  maxPrice: number;
}) {
  const barMax = Math.max(maxPrice, lot.finalPrice, 1);
  const startTs = lot.bids[0]?.timestamp || 0;

  return (
    <div className="space-y-3">
      {/* Summary stats row */}
      <div className="flex flex-wrap gap-x-5 gap-y-1" style={{ fontSize: 13 }}>
        <span style={{ color: "var(--am-text-muted)" }}>
          Opening: <span className="font-semibold tabular-nums" style={{ color: "var(--am-text)" }}>${lot.openingBid}</span>
        </span>
        <span style={{ color: "var(--am-text-muted)" }}>
          Final: <span className="font-semibold tabular-nums" style={{ color: "var(--am-text)" }}>${lot.finalPrice}</span>
        </span>
        <span style={{ color: "var(--am-text-muted)" }}>
          Bids: <span className="font-semibold tabular-nums" style={{ color: "var(--am-text)" }}>{lot.bidCount}</span>
        </span>
        <span style={{ color: "var(--am-text-muted)" }}>
          Bidders: <span className="font-semibold tabular-nums" style={{ color: "var(--am-text)" }}>{lot.uniqueBidders}</span>
        </span>
        <span style={{ color: "var(--am-text-muted)" }}>
          Spread: <span className="font-semibold tabular-nums" style={{ color: "var(--am-text)" }}>+${lot.bidSpread}</span>
        </span>
      </div>

      {/* Price escalation bars */}
      <div
        className="space-y-1"
        style={{
          background: "var(--am-surface-faint)",
          border: "1px solid var(--am-border)",
          borderRadius: 12,
          padding: 10,
        }}
      >
        {lot.bids.map((bid, i) => {
          const widthPct = Math.max((bid.amount / barMax) * 100, 4);
          const isWinner = i === lot.bids.length - 1;
          const elapsed = startTs > 0 ? Math.round((bid.timestamp - startTs) / 1000) : 0;

          return (
            <div key={i} className="flex items-center gap-2 group">
              {/* Bid number */}
              <span
                className="w-5 text-right tabular-nums shrink-0"
                style={{ fontSize: 13, color: "var(--am-text-faint)" }}
              >
                {i + 1}
              </span>

              {/* Bar */}
              <div className="flex-1 relative">
                <div
                  className="h-6 rounded transition-all duration-300 flex items-center relative"
                  style={{
                    ...(isWinner ? WIN_BAR : BAR),
                    width: `${widthPct}%`,
                    minWidth: '60px',
                  }}
                >
                  <span className="absolute left-2 font-semibold truncate pr-1" style={{ fontSize: 13 }}>
                    {bid.teamName}
                  </span>
                  <span className="absolute right-2 font-semibold tabular-nums" style={{ fontSize: 13 }}>
                    ${bid.amount}
                  </span>
                </div>
              </div>

              {/* Timestamp delta */}
              <span
                className="w-12 text-right tabular-nums shrink-0"
                style={{ fontSize: 13, color: "var(--am-text-faint)" }}
              >
                {bid.isNomination ? 'nom' : `+${elapsed}s`}
              </span>

              {isWinner && <span className="sr-only">won</span>}
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
export default function BidHistoryChart({ log }: BidHistoryChartProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'lot' | 'price' | 'bids'>('lot');
  const [hasTracked, setHasTracked] = useState(false);

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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Section heading */}
      <SectionLabel>Bid history</SectionLabel>

      {/* Summary row */}
      <Glass>
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums"
          style={{ fontSize: 13, color: "var(--am-text-muted)" }}
        >
          <span>
            <span className="font-semibold" style={{ color: "var(--am-text)" }}>{summary.totalLots}</span> lots
          </span>
          <span style={{ color: "var(--am-text-faint)" }}>&middot;</span>
          <span>
            avg <span className="font-semibold" style={{ color: "var(--am-text)" }}>{summary.avgBids.toFixed(1)}</span> bids/lot
          </span>
          <span style={{ color: "var(--am-text-faint)" }}>&middot;</span>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
            avg price <IridText size={16}>${summary.avgPrice.toFixed(2)}</IridText>
          </span>
          {summary.hottest && (
            <>
              <span style={{ color: "var(--am-text-faint)" }}>&middot;</span>
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
                most contested:{" "}
                <span className="font-semibold" style={{ color: "var(--am-text)" }}>
                  {summary.hottest.playerName}
                </span>{" "}
                (<IridText size={13}>{summary.hottest.bidCount}</IridText> bids)
              </span>
            </>
          )}
        </div>
      </Glass>

      {/* Search + sort controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--am-text-faint)" }}
          />
          <input
            type="text"
            placeholder="Search by player or team..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 focus:outline-none"
            style={{
              fontSize: 13,
              background: "var(--am-field)",
              border: "1px solid var(--am-field-line)",
              borderRadius: 12,
              color: "var(--am-text)",
            }}
          />
        </div>
        <div
          className="flex self-start"
          style={{
            background: "var(--am-surface-faint)",
            border: "1px solid var(--am-border)",
            borderRadius: 99,
            padding: 3,
            gap: 2,
          }}
        >
          {(['lot', 'price', 'bids'] as const).map(mode => {
            const active = sortBy === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setSortBy(mode)}
                style={{
                  padding: "5px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  borderRadius: 99,
                  background: active ? "var(--am-chip-strong)" : "transparent",
                  color: active ? "var(--am-text)" : "var(--am-text-muted)",
                  border: "1px solid " + (active ? "var(--am-border-strong)" : "transparent"),
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {mode === 'lot' ? 'Order' : mode === 'price' ? 'Price' : 'Bids'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lot list */}
      <Glass padded={false}>
        {filteredLots.length === 0 && (
          <div
            className="p-6 text-center"
            style={{ fontSize: 13, color: "var(--am-text-muted)" }}
          >
            No lots match your search.
          </div>
        )}
        {filteredLots.map((lot, idx) => {
          const isExpanded = expandedPlayerId === lot.playerId;
          const isFirst = idx === 0;

          return (
            <div
              key={`${lot.playerId}-${idx}`}
              style={{
                borderTop: isFirst ? "none" : "1px solid var(--am-border)",
              }}
            >
              {/* Lot header row */}
              <div
                className="px-4 py-3 flex items-center justify-between cursor-pointer transition-colors"
                style={{
                  background: isExpanded ? "var(--am-chip)" : "transparent",
                }}
                onClick={() => handleExpand(lot.playerId)}
                onMouseEnter={(e) => {
                  if (!isExpanded) e.currentTarget.style.background = "var(--am-chip)";
                }}
                onMouseLeave={(e) => {
                  if (!isExpanded) e.currentTarget.style.background = "transparent";
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Lot number */}
                  <span
                    className="tabular-nums w-6 text-right shrink-0"
                    style={{ fontSize: 13, color: "var(--am-text-faint)" }}
                  >
                    {idx + 1}
                  </span>

                  {/* Player info */}
                  <div className="min-w-0">
                    <div
                      className="font-semibold truncate"
                      style={{ fontSize: 13, color: "var(--am-text)" }}
                    >
                      {lot.playerName}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--am-text-muted)" }}>
                      {lot.winnerTeamName}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  {/* Price */}
                  <span
                    className="font-semibold tabular-nums"
                    style={{ fontSize: 13, color: "var(--am-text)" }}
                  >
                    ${lot.finalPrice}
                  </span>

                  {/* Bid count */}
                  <span
                    className="tabular-nums w-10 text-right"
                    style={{ fontSize: 13, color: "var(--am-text-muted)" }}
                  >
                    {lot.bidCount} bid{lot.bidCount !== 1 ? 's' : ''}
                  </span>

                  {/* Mini escalation preview */}
                  <div className="hidden sm:flex items-end gap-px h-4 w-16">
                    {lot.bids.map((bid, i) => {
                      const heightPct = Math.max((bid.amount / lot.finalPrice) * 100, 10);
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t-sm"
                          style={{ height: `${heightPct}%`, background: i === lot.bids.length - 1 ? WIN_BAR.background : BAR.background }}
                        />
                      );
                    })}
                  </div>

                  {/* Expand chevron */}
                  <div style={{ color: "var(--am-text-muted)" }}>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </div>
              </div>

              {/* Expanded chart */}
              {isExpanded && (
                <div
                  className="px-4 pb-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300"
                  style={{
                    borderTop: "1px solid var(--am-border)",
                    background: "var(--am-chip)",
                  }}
                >
                  <LotChart
                    lot={lot}
                    maxPrice={summary.maxPrice}
                  />
                </div>
              )}
            </div>
          );
        })}
      </Glass>
    </div>
  );
}
