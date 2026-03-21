import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Rewind, FastForward, X } from 'lucide-react';
import type { AuctionLogEvent } from '../hooks/useAuctionState';
import { track } from '../../../lib/posthog';

interface AuctionTeamBasic {
  id: number;
  name: string;
  code: string;
}

interface ReplayLot {
  lotNumber: number;
  playerName: string;
  playerId: string;
  nominatorTeamId: number;
  nominatorTeamName: string;
  bids: { teamId: number; teamName: string; amount: number; timestamp: number }[];
  winnerTeamId: number | null;
  winnerTeamName: string | null;
  finalPrice: number | null;
  startTime: number;
  endTime: number;
}

type PlaybackSpeed = 1 | 2 | 4;

interface AuctionReplayProps {
  log: AuctionLogEvent[];
  teams: AuctionTeamBasic[];
  onClose: () => void;
}

function buildLots(log: AuctionLogEvent[]): ReplayLot[] {
  const lots: ReplayLot[] = [];
  let current: Partial<ReplayLot> & { bids: ReplayLot['bids'] } | null = null;
  let lotNumber = 0;

  // Log is ordered newest-first in the auction state, so reverse for chronological order
  const chronological = [...log].reverse();

  for (const event of chronological) {
    if (event.type === 'NOMINATION') {
      // If there's an in-progress lot without a WIN (e.g., undone), skip it
      if (current && current.winnerTeamId == null) {
        // discard incomplete lot
      }
      lotNumber++;
      current = {
        lotNumber,
        playerName: event.playerName || 'Unknown',
        playerId: event.playerId || '',
        nominatorTeamId: event.teamId || 0,
        nominatorTeamName: event.teamName || '',
        bids: [],
        winnerTeamId: null,
        winnerTeamName: null,
        finalPrice: null,
        startTime: event.timestamp,
        endTime: event.timestamp,
      };
      // The nomination itself acts as the opening bid
      if (event.teamId && event.amount != null) {
        current.bids.push({
          teamId: event.teamId,
          teamName: event.teamName || '',
          amount: event.amount,
          timestamp: event.timestamp,
        });
      }
    } else if (event.type === 'BID' && current) {
      current.bids.push({
        teamId: event.teamId || 0,
        teamName: event.teamName || '',
        amount: event.amount || 0,
        timestamp: event.timestamp,
      });
      current.endTime = event.timestamp;
    } else if (event.type === 'WIN' && current) {
      current.winnerTeamId = event.teamId || null;
      current.winnerTeamName = event.teamName || null;
      current.finalPrice = event.amount || null;
      current.endTime = event.timestamp;
      lots.push(current as ReplayLot);
      current = null;
    } else if (event.type === 'UNDO') {
      // Undo removes the last completed lot
      if (lots.length > 0) {
        lots.pop();
        lotNumber--;
      }
      current = null;
    }
  }

  return lots;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getHeadshotUrl(playerId: string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`;
}

export default function AuctionReplay({ log, teams, onClose }: AuctionReplayProps) {
  const lots = useMemo(() => buildLots(log), [log]);
  const [currentLotIndex, setCurrentLotIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [visibleBidCount, setVisibleBidCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackedRef = useRef(false);

  // Track replay start once
  useEffect(() => {
    if (!trackedRef.current && lots.length > 0) {
      track("auction_replay_started", { total_lots: lots.length });
      trackedRef.current = true;
    }
  }, [lots.length]);

  const currentLot = lots[currentLotIndex] ?? null;
  const totalBids = currentLot?.bids.length ?? 0;
  const allBidsVisible = visibleBidCount >= totalBids;

  // Reset visible bids when lot changes
  useEffect(() => {
    setVisibleBidCount(0);
  }, [currentLotIndex]);

  // Auto-advance: reveal bids one-by-one, then move to next lot
  useEffect(() => {
    if (!isPlaying || !currentLot) return;

    const delay = 2000 / speed;

    timerRef.current = setTimeout(() => {
      if (visibleBidCount < totalBids) {
        // Reveal next bid
        setVisibleBidCount((prev) => prev + 1);
      } else if (currentLotIndex < lots.length - 1) {
        // Move to next lot
        setCurrentLotIndex((prev) => prev + 1);
      } else {
        // Reached the end
        setIsPlaying(false);
      }
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, visibleBidCount, totalBids, currentLotIndex, lots.length, speed, currentLot]);

  const goToLot = useCallback((index: number) => {
    setCurrentLotIndex(Math.max(0, Math.min(index, lots.length - 1)));
    setVisibleBidCount(0);
  }, [lots.length]);

  const handlePrevious = useCallback(() => {
    if (currentLotIndex > 0) {
      goToLot(currentLotIndex - 1);
    }
  }, [currentLotIndex, goToLot]);

  const handleNext = useCallback(() => {
    if (currentLotIndex < lots.length - 1) {
      goToLot(currentLotIndex + 1);
    }
  }, [currentLotIndex, lots.length, goToLot]);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      if (!prev && allBidsVisible && currentLotIndex < lots.length - 1) {
        // If all bids visible on current lot, advance first
        setCurrentLotIndex((i) => i + 1);
        setVisibleBidCount(0);
      }
      return !prev;
    });
  }, [allBidsVisible, currentLotIndex, lots.length]);

  const cycleSpeed = useCallback(() => {
    setSpeed((prev) => {
      if (prev === 1) return 2;
      if (prev === 2) return 4;
      return 1;
    });
  }, []);

  // Show all bids immediately when skipping
  const handleShowAll = useCallback(() => {
    setVisibleBidCount(totalBids);
  }, [totalBids]);

  if (lots.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-6 text-center">
        <p className="text-sm text-[var(--lg-text-muted)]">No completed lots to replay.</p>
      </div>
    );
  }

  const progressPercent = lots.length > 1 ? (currentLotIndex / (lots.length - 1)) * 100 : 100;
  const isAtEnd = currentLotIndex >= lots.length - 1 && allBidsVisible;

  return (
    <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-6 py-3 flex items-center justify-between border-b border-[var(--lg-border-faint)]">
        <div className="flex items-center gap-2">
          <Rewind size={16} className="text-[var(--lg-accent)]" />
          <h3 className="text-sm font-semibold text-[var(--lg-text-heading)]">Auction Replay</h3>
          <span className="text-xs text-[var(--lg-text-muted)] tabular-nums">
            Lot {currentLotIndex + 1} of {lots.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint-hover)] transition-colors"
          aria-label="Close replay"
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-[var(--lg-border-faint)]">
        <div
          className="h-full bg-[var(--lg-accent)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Lot content */}
      {currentLot && (
        <div className="px-4 md:px-6 py-4 md:py-5">
          <div className="flex flex-col md:flex-row gap-4 md:gap-6">
            {/* Player card (left) */}
            <div className="flex items-start gap-3 md:min-w-[200px]">
              <img
                src={getHeadshotUrl(currentLot.playerId)}
                alt={currentLot.playerName}
                className="w-16 h-16 md:w-20 md:h-20 rounded-lg object-cover bg-[var(--lg-border-faint)] flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/0/headshot/67/current`;
                }}
              />
              <div className="flex flex-col gap-1 min-w-0">
                <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] tabular-nums">
                  Lot #{currentLot.lotNumber}
                </div>
                <div className="text-base md:text-lg font-semibold text-[var(--lg-text-heading)] leading-tight truncate">
                  {currentLot.playerName}
                </div>
                <div className="text-xs text-[var(--lg-text-muted)]">
                  Nominated by <span className="font-medium text-[var(--lg-text-secondary)]">{currentLot.nominatorTeamName}</span>
                </div>
                {currentLot.finalPrice != null && allBidsVisible && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-lg font-semibold text-[var(--lg-accent)] tabular-nums">
                      ${currentLot.finalPrice}
                    </span>
                    <span className="text-xs text-[var(--lg-success)] font-medium">
                      {currentLot.winnerTeamName}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Bid timeline (right) */}
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-2 tracking-wide">
                Bidding ({totalBids} bid{totalBids !== 1 ? 's' : ''})
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {currentLot.bids.slice(0, visibleBidCount).map((bid, i) => {
                  const isWinning = allBidsVisible && i === totalBids - 1;
                  const isLatest = i === visibleBidCount - 1;
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-xs py-1 px-2 rounded-md transition-all duration-200 ${
                        isWinning
                          ? 'bg-[var(--lg-success)]/10 border border-[var(--lg-success)]/20'
                          : isLatest
                            ? 'bg-[var(--lg-accent)]/5 border border-[var(--lg-accent)]/10'
                            : 'border border-transparent'
                      }`}
                    >
                      <span className={`w-14 text-right tabular-nums font-semibold flex-shrink-0 ${
                        isWinning ? 'text-[var(--lg-success)]' : 'text-[var(--lg-accent)]'
                      }`}>
                        ${bid.amount}
                      </span>
                      <span className={`flex-1 truncate ${
                        isWinning ? 'font-semibold text-[var(--lg-success)]' : 'text-[var(--lg-text-secondary)]'
                      }`}>
                        {bid.teamName}
                        {isWinning && <span className="ml-1 text-[10px] uppercase font-semibold"> -- Winner</span>}
                      </span>
                      <span className="text-[10px] text-[var(--lg-text-muted)] tabular-nums flex-shrink-0">
                        {formatTimestamp(bid.timestamp)}
                      </span>
                    </div>
                  );
                })}
                {visibleBidCount === 0 && (
                  <div className="text-xs text-[var(--lg-text-muted)] py-2 text-center">
                    {isPlaying ? 'Revealing bids...' : 'Press play to reveal bids'}
                  </div>
                )}
                {visibleBidCount > 0 && visibleBidCount < totalBids && !isPlaying && (
                  <button
                    onClick={handleShowAll}
                    className="text-[10px] text-[var(--lg-accent)] hover:underline py-1 px-2"
                  >
                    Show all {totalBids - visibleBidCount} remaining bid{totalBids - visibleBidCount !== 1 ? 's' : ''}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="px-4 md:px-6 py-3 border-t border-[var(--lg-border-faint)] flex items-center justify-between gap-2">
        {/* Lot navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrevious}
            disabled={currentLotIndex === 0}
            className="p-1.5 rounded-md text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Previous lot"
          >
            <SkipBack size={16} />
          </button>

          <button
            onClick={togglePlay}
            disabled={isAtEnd}
            className={`p-2 rounded-lg transition-colors ${
              isPlaying
                ? 'bg-[var(--lg-accent)] text-white'
                : 'bg-[var(--lg-accent)]/10 text-[var(--lg-accent)] hover:bg-[var(--lg-accent)]/20'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>

          <button
            onClick={handleNext}
            disabled={currentLotIndex >= lots.length - 1}
            className="p-1.5 rounded-md text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next lot"
          >
            <SkipForward size={16} />
          </button>
        </div>

        {/* Speed control */}
        <button
          onClick={cycleSpeed}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold tabular-nums text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint-hover)] border border-[var(--lg-border-faint)] transition-colors"
          aria-label={`Speed ${speed}x`}
        >
          <FastForward size={12} />
          {speed}x
        </button>

        {/* Lot scrubber */}
        <div className="hidden md:flex items-center gap-2 flex-1 max-w-xs mx-4">
          <input
            type="range"
            min={0}
            max={lots.length - 1}
            value={currentLotIndex}
            onChange={(e) => goToLot(Number(e.target.value))}
            className="w-full h-1 accent-[var(--lg-accent)] cursor-pointer"
            aria-label="Lot scrubber"
          />
        </div>

        {/* Lot counter (mobile) */}
        <div className="md:hidden text-xs text-[var(--lg-text-muted)] tabular-nums">
          {currentLotIndex + 1}/{lots.length}
        </div>
      </div>
    </div>
  );
}
