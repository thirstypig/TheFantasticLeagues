import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Rewind, FastForward, X } from 'lucide-react';
import type { AuctionLogEvent } from '../hooks/useAuctionState';
import { track } from '../../../lib/posthog';
import { Glass, IridText, SectionLabel, Chip } from '../../../components/aurora/atoms';

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

const CTRL_BTN_BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  height: 30,
  minWidth: 30,
  padding: "0 10px",
  borderRadius: 99,
  background: "var(--am-chip)",
  color: "var(--am-text-muted)",
  border: "1px solid var(--am-border)",
  cursor: "pointer",
  transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
};

export default function AuctionReplay({ log, teams: _teams, onClose }: AuctionReplayProps) {
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

  const setSpeedTo = useCallback((next: PlaybackSpeed) => {
    setSpeed(next);
  }, []);

  // Show all bids immediately when skipping
  const handleShowAll = useCallback(() => {
    setVisibleBidCount(totalBids);
  }, [totalBids]);

  if (lots.length === 0) {
    return (
      <Glass>
        <div style={{ textAlign: "center", padding: "16px 8px" }}>
          <p style={{ fontSize: 13, color: "var(--am-text-muted)", margin: 0 }}>
            No completed lots to replay.
          </p>
        </div>
      </Glass>
    );
  }

  const progressPercent = lots.length > 1 ? (currentLotIndex / (lots.length - 1)) * 100 : 100;
  const isAtEnd = currentLotIndex >= lots.length - 1 && allBidsVisible;

  const speedOptions: PlaybackSpeed[] = [1, 2, 4];

  return (
    <Glass padded={false}>
      {/* Header */}
      <div
        style={{
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          borderBottom: "1px solid var(--am-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div>
            <SectionLabel style={{ marginBottom: 4 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Rewind size={11} />
                ✦ Replay
              </span>
            </SectionLabel>
            <div
              style={{
                fontFamily: "var(--am-display)",
                fontSize: 20,
                fontWeight: 300,
                color: "var(--am-text)",
                lineHeight: 1.1,
              }}
            >
              Auction Replay
            </div>
          </div>
          <Chip strong style={{ fontVariantNumeric: "tabular-nums" }}>
            Lot {currentLotIndex + 1} of {lots.length}
          </Chip>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close replay"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: 99,
            background: "transparent",
            color: "var(--am-text-muted)",
            border: "1px solid var(--am-border-strong)",
            cursor: "pointer",
            transition: "background 120ms ease, color 120ms ease",
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 3,
          background: "var(--am-surface-faint)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progressPercent}%`,
            background: "var(--am-irid)",
            transition: "width 300ms ease",
          }}
        />
      </div>

      {/* Lot content */}
      {currentLot && (
        <div style={{ padding: "18px 18px 16px 18px" }}>
          <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
            {/* Player card (left) */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 220, flex: "0 1 auto" }}>
              <img
                src={getHeadshotUrl(currentLot.playerId)}
                alt={currentLot.playerName}
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 14,
                  objectFit: "cover",
                  background: "var(--am-surface-faint)",
                  border: "1px solid var(--am-border)",
                  flexShrink: 0,
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/0/headshot/67/current`;
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    color: "var(--am-text-faint)",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  Lot #{currentLot.lotNumber}
                </div>
                <div
                  style={{
                    fontFamily: "var(--am-display)",
                    fontSize: 18,
                    fontWeight: 400,
                    color: "var(--am-text)",
                    lineHeight: 1.15,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 240,
                  }}
                >
                  {currentLot.playerName}
                </div>
                <div style={{ fontSize: 12, color: "var(--am-text-muted)" }}>
                  Nominated by{" "}
                  <span style={{ color: "var(--am-text)", fontWeight: 500 }}>
                    {currentLot.nominatorTeamName}
                  </span>
                </div>
                {currentLot.finalPrice != null && allBidsVisible && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <IridText size={22} weight={400}>
                      ${currentLot.finalPrice}
                    </IridText>
                    {currentLot.winnerTeamName && (
                      <Chip strong color="var(--am-text)">
                        {currentLot.winnerTeamName}
                      </Chip>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bid timeline (right) */}
            <div style={{ flex: 1, minWidth: 240 }}>
              <SectionLabel style={{ marginBottom: 8 }}>
                Bidding ({totalBids} bid{totalBids !== 1 ? 's' : ''})
              </SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", maxHeight: 200, overflowY: "auto" }}>
                {currentLot.bids.slice(0, visibleBidCount).map((bid, i) => {
                  const isWinning = allBidsVisible && i === totalBids - 1;
                  const isLatest = i === visibleBidCount - 1 && !isWinning;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 12,
                        padding: "7px 10px",
                        borderBottom: "1px solid var(--am-border)",
                        background: isWinning
                          ? "var(--am-chip-strong)"
                          : isLatest
                            ? "var(--am-chip)"
                            : "transparent",
                        transition: "background 200ms ease",
                      }}
                    >
                      <span
                        style={{
                          width: 56,
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                          flexShrink: 0,
                          color: isWinning ? "var(--am-text)" : "var(--am-accent)",
                        }}
                      >
                        ${bid.amount}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: isWinning ? "var(--am-text)" : "var(--am-text-muted)",
                          fontWeight: isWinning ? 600 : 400,
                        }}
                      >
                        {bid.teamName}
                        {isWinning && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 10,
                              letterSpacing: 1.2,
                              textTransform: "uppercase",
                              fontWeight: 600,
                              color: "var(--am-accent)",
                            }}
                          >
                            — Winner
                          </span>
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--am-text-faint)",
                          fontVariantNumeric: "tabular-nums",
                          flexShrink: 0,
                        }}
                      >
                        {formatTimestamp(bid.timestamp)}
                      </span>
                    </div>
                  );
                })}
                {visibleBidCount === 0 && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--am-text-muted)",
                      padding: "12px 4px",
                      textAlign: "center",
                    }}
                  >
                    {isPlaying ? 'Revealing bids...' : 'Press play to reveal bids'}
                  </div>
                )}
                {visibleBidCount > 0 && visibleBidCount < totalBids && !isPlaying && (
                  <button
                    type="button"
                    onClick={handleShowAll}
                    style={{
                      marginTop: 6,
                      alignSelf: "flex-start",
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--am-accent)",
                      background: "transparent",
                      border: "none",
                      padding: "4px 8px",
                      cursor: "pointer",
                    }}
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
      <div
        style={{
          padding: "12px 18px",
          borderTop: "1px solid var(--am-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {/* Lot navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentLotIndex === 0}
            aria-label="Previous lot"
            style={{
              ...CTRL_BTN_BASE,
              opacity: currentLotIndex === 0 ? 0.35 : 1,
              cursor: currentLotIndex === 0 ? "not-allowed" : "pointer",
            }}
          >
            <SkipBack size={14} />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            disabled={isAtEnd}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            style={{
              ...CTRL_BTN_BASE,
              background: isPlaying ? "var(--am-irid)" : "var(--am-chip-strong)",
              color: isPlaying ? "#fff" : "var(--am-text)",
              border: "1px solid var(--am-border-strong)",
              opacity: isAtEnd ? 0.35 : 1,
              cursor: isAtEnd ? "not-allowed" : "pointer",
              minWidth: 36,
              height: 36,
            }}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={currentLotIndex >= lots.length - 1}
            aria-label="Next lot"
            style={{
              ...CTRL_BTN_BASE,
              opacity: currentLotIndex >= lots.length - 1 ? 0.35 : 1,
              cursor: currentLotIndex >= lots.length - 1 ? "not-allowed" : "pointer",
            }}
          >
            <SkipForward size={14} />
          </button>
        </div>

        {/* Speed selector — segmented chip pill */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: 3,
            background: "var(--am-surface-faint)",
            border: "1px solid var(--am-border)",
            borderRadius: 99,
          }}
          role="group"
          aria-label="Playback speed"
        >
          <FastForward
            size={12}
            style={{ color: "var(--am-text-faint)", marginLeft: 6, marginRight: 2 }}
          />
          {speedOptions.map((opt) => {
            const active = speed === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setSpeedTo(opt)}
                aria-pressed={active}
                aria-label={`Speed ${opt}x`}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  padding: "4px 10px",
                  borderRadius: 99,
                  border: "1px solid " + (active ? "var(--am-border-strong)" : "transparent"),
                  background: active ? "var(--am-chip-strong)" : "transparent",
                  color: active ? "var(--am-text)" : "var(--am-text-muted)",
                  cursor: "pointer",
                  transition: "background 120ms ease, color 120ms ease",
                }}
              >
                {opt}x
              </button>
            );
          })}
        </div>

        {/* Lot scrubber (desktop) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            maxWidth: 320,
            minWidth: 160,
          }}
        >
          <input
            type="range"
            min={0}
            max={lots.length - 1}
            value={currentLotIndex}
            onChange={(e) => goToLot(Number(e.target.value))}
            aria-label="Lot scrubber"
            style={{
              width: "100%",
              height: 4,
              accentColor: "var(--am-accent)",
              cursor: "pointer",
            }}
          />
        </div>

        {/* Lot counter */}
        <div
          style={{
            fontSize: 11,
            color: "var(--am-text-muted)",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 500,
            letterSpacing: 0.3,
          }}
        >
          {currentLotIndex + 1} / {lots.length}
        </div>
      </div>
    </Glass>
  );
}
