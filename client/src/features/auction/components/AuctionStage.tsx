/*
 * AuctionStage — Aurora port (PR-3, deep port of the live floor).
 *
 * The bid panel itself: 200ms-tick timer, bid buttons, decline/pass,
 * proxy bid, AI advice, server-driven WS state. This is the most
 * frame-rate sensitive surface in the entire app — the rollout plan
 * explicitly flagged Glass `backdrop-filter: blur(28px)` perf during
 * the final-10-second countdown.
 *
 * Port strategy: SURGICAL. Wrap visible cards in Aurora `<Glass>` for
 * the iridescent border + chip-toned background, swap dollar values
 * to `<IridText>`, keep ALL state/effects/callbacks/business logic
 * 100% intact. NO new effects. NO new state. Token redirects from
 * PR #153 already give every `--lg-*` reference Aurora colors so most
 * of the existing chrome already reads correctly.
 *
 * Critical preservation:
 *   - 200ms `setInterval` for `timeLeft` countdown
 *   - 1000ms `setInterval` for `nomTimeLeft`
 *   - decline state reset on nomination change
 *   - bid advice fetch
 *   - position-full memo
 *   - proxy bid sub-component
 *
 * Legacy preserved at /auction-classic via AuctionStageLegacy.tsx.
 */
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Pause, Play, RotateCcw, Undo2, Target, X, HandMetal, Clock, Sparkles, Loader2, Check, XCircle } from 'lucide-react';
import { ClientAuctionState } from '../hooks/useAuctionState';
import NominationQueue from './NominationQueue';
import { Button } from '../../../components/ui/button';
import { useToast } from "../../../contexts/ToastContext";
import { fetchJsonApi, API_BASE } from '../../../api/base';
import { track } from '../../../lib/posthog';
import { positionToSlots } from '../../../lib/sportConfig';
import { Glass, IridText, Chip, SectionLabel } from '../../../components/aurora/atoms';

// AI Bid Advice types
interface BidAdvice {
  shouldBid: boolean;
  maxRecommendedBid: number;
  reasoning: string;
  confidence: string;
  categoryImpact?: string;
}

interface Team {
  id: number;
  name: string;
  code: string;
  budget: number;
  maxBid: number;
  rosterCount: number;
  pitcherCount?: number;
  hitterCount?: number;
  positionCounts?: Record<string, number>;
  isMe?: boolean;
}

interface AuctionStageProps {
    serverState: ClientAuctionState | null;
    myTeamId?: number;
    onBid: (amount: number) => void;
    onFinish: () => void;
    onPause?: () => void;
    onResume?: () => void;
    onReset?: () => void;
    onUndoFinish?: () => void;
    onSetProxyBid?: (maxBid: number) => void;
    myProxyBid?: number | null;
    onCancelProxyBid?: () => void;
}

export default function AuctionStage({ serverState, myTeamId, onBid, onFinish, onPause, onResume, onReset, onUndoFinish, onSetProxyBid, myProxyBid, onCancelProxyBid }: AuctionStageProps) {
  const { confirm } = useToast();

  // Suppress unused — onFinish is part of the props contract but the visible
  // button got folded into the SOLD! pulse + auto-finish flow on the server.
  void onFinish;

  const nomination = serverState?.nomination;
  const teams = serverState?.teams as Team[] || [];

  const [timeLeft, setTimeLeft] = useState(0);

  // Timer Sync (display only — server is authoritative for auto-finish).
  // 200ms cadence preserved verbatim from legacy. Do NOT slow this down
  // — the perceived smoothness of the countdown depends on it.
  useEffect(() => {
    if (!nomination || nomination.status !== 'running') {
        setTimeLeft(0);
        return;
    }
    const checkTime = () => {
        const end = new Date(nomination.endTime).getTime();
        const now = Date.now();
        setTimeLeft(Math.max(0, Math.ceil((end - now)/1000)));
    };
    checkTime();
    const interval = setInterval(checkTime, 200);
    return () => clearInterval(interval);
  }, [nomination]);

  // Decline/Pass state — resets when nomination changes (new player)
  const [isDeclined, setIsDeclined] = useState(false);
  const nominationPlayerId = serverState?.nomination?.playerId;
  useEffect(() => {
    setIsDeclined(false);
  }, [nominationPlayerId]);

  // AI Bid Advice state — resets when nomination changes
  const [bidAdvice, setBidAdvice] = useState<BidAdvice | null>(null);
  const [bidAdviceLoading, setBidAdviceLoading] = useState(false);
  const [bidAdviceError, setBidAdviceError] = useState<string | null>(null);
  useEffect(() => {
    setBidAdvice(null);
    setBidAdviceError(null);
  }, [nominationPlayerId]);

  // Nomination timer countdown (AUC-08) — must come before any early return
  // so React's hook-order invariant holds when serverState is null/loading.
  const nomTimerDuration = serverState?.config?.nominationTimer || 30;
  const [nomTimeLeft, setNomTimeLeft] = useState(nomTimerDuration);

  // Reset nom timer when queueIndex changes (new nominator's turn)
  useEffect(() => {
    if (nomination || serverState?.status !== 'nominating') return;
    setNomTimeLeft(nomTimerDuration);
    const interval = setInterval(() => {
      setNomTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [serverState?.queueIndex, nomination, serverState?.status, nomTimerDuration]);

  // Position-full memo — kept above all early returns for hook-order safety.
  const myTeamMemo = useMemo(() => teams.find(t => t.id === myTeamId), [teams, myTeamId]);
  const isPositionFull = useMemo(() => {
    if (!nomination || !myTeamMemo || !serverState) return false;
    const config = serverState.config;
    if (nomination.isPitcher) return (myTeamMemo.pitcherCount ?? 0) >= (config.pitcherCount ?? 9);
    if ((myTeamMemo.hitterCount ?? 0) >= (config.batterCount ?? 14)) return true;
    if (!config.positionLimits) return false;
    const primaryPos = (nomination.positions || '').split(/[,\/]/)[0].trim().toUpperCase();
    const slots = positionToSlots(primaryPos);
    if (slots.length === 0) return false;
    return slots.every(slot => {
      const limit = config.positionLimits?.[slot];
      if (limit === undefined) return false;
      return (myTeamMemo.positionCounts?.[slot] ?? 0) >= limit;
    });
  }, [nomination, myTeamMemo, serverState]);

  // Skeleton
  if (!serverState) {
      return (
          <Glass>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ height: 96, borderRadius: 12, background: "var(--am-surface-faint)", animation: "pulse 1.5s ease-in-out infinite" }} />
                  <div style={{ height: 64, borderRadius: 12, background: "var(--am-surface-faint)", animation: "pulse 1.5s ease-in-out infinite" }} />
              </div>
          </Glass>
      );
  }

  const queueIds = serverState?.queue || [];
  const queueIndex = serverState?.queueIndex || 0;

  // --- Waiting for Nomination ---
  if (!nomination) {
      const isMyTurn = myTeamId != null && queueIds[queueIndex] === myTeamId;
      const nomCritical = nomTimeLeft <= 10;

      return (
          <Glass>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Status + countdown */}
                  <div style={{ textAlign: "center", padding: "14px 0" }}>
                      <SectionLabel>✦ Awaiting Nomination</SectionLabel>
                      <p style={{ fontSize: 12, color: "var(--am-text-muted)", marginBottom: 10, marginTop: 2 }}>
                         {isMyTurn
                            ? <span style={{ color: "var(--am-accent)", fontWeight: 600 }}>Your turn — select a player</span>
                            : "Stand by for the next nominee"}
                      </p>
                      {/* Nomination countdown */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <Clock size={14} style={{ color: nomCritical ? "var(--am-negative)" : "var(--am-text-muted)", opacity: nomCritical ? 1 : 0.5 }} className={nomCritical ? "animate-pulse" : ""} />
                        <span
                          className={nomCritical ? "animate-pulse" : ""}
                          style={{
                            fontSize: 28,
                            fontWeight: 700,
                            fontVariantNumeric: "tabular-nums",
                            fontFamily: "var(--am-display)",
                            color: nomCritical ? "var(--am-negative)" : "var(--am-text-muted)",
                          }}
                        >
                          {nomTimeLeft}s
                        </span>
                      </div>
                  </div>

                  {/* Queue */}
                  <NominationQueue teams={teams} queue={queueIds} queueIndex={queueIndex} myTeamId={myTeamId} />

                  {/* Admin actions */}
                  {onUndoFinish && (
                      <div style={{ display: "flex", justifyContent: "center", paddingTop: 4 }}>
                          <Button
                              variant="amber"
                              size="sm"
                              onClick={async () => {
                                  if (await confirm('Undo last auction result?')) onUndoFinish();
                              }}
                          >
                              <Undo2 size={12} /> Undo Last
                          </Button>
                      </div>
                  )}
              </div>
          </Glass>
      );
  }

  // --- Active Bidding ---
  const isCriticalTime = timeLeft <= 5 && nomination.status === 'running';
  const currentBid = nomination.currentBid;
  const highBidderTeam = teams.find(t => t.id === nomination.highBidderTeamId);
  const myTeam = myTeamMemo;
  const minRaise = currentBid + 1;
  const jumpRaise = currentBid + 5;
  const canAffordMin = myTeam ? myTeam.maxBid >= minRaise : false;
  const canAffordJump = myTeam ? myTeam.maxBid >= jumpRaise : false;
  const isHighBidder = nomination.highBidderTeamId === myTeamId;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Nominee: photo + info + timer in one compact row.
            Wrapped in Glass for iridescent border + ambient blur. */}
        <Glass
          padded={false}
          style={{
            border: isCriticalTime ? "1px solid var(--am-negative)" : undefined,
            boxShadow: isCriticalTime ? "0 0 24px rgba(255, 109, 181, 0.25)" : undefined,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
            {/* Player headshot */}
            <div style={{ width: 80, flexShrink: 0, position: "relative", background: "var(--am-surface-faint)" }}>
                <img
                    src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${nomination.playerId}/headshot/67/current`}
                    alt={nomination.playerName}
                    style={{ objectFit: "cover", height: "100%", width: "100%" }}
                    onError={(e) => (e.currentTarget.src = 'https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/generic/headshot/67/current')}
                />
                <div style={{ position: "absolute", bottom: 4, left: 4 }}>
                  <Chip strong>{nomination.positions || (nomination.isPitcher ? 'P' : 'UT')}</Chip>
                </div>
            </div>

            {/* Player info */}
            <div style={{ flex: 1, paddingTop: 8, paddingBottom: 8, paddingRight: 8, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--am-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomination.playerName}</div>
                <div style={{ fontSize: 10, color: "var(--am-text-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{nomination.playerTeam}</div>
            </div>

            {/* Timer + Going Once visual (AUC-09) */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingRight: 14, minWidth: 60 }}>
                {isCriticalTime ? (
                  <span
                    className="animate-pulse"
                    style={{
                      fontSize: 36,
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      fontFamily: "var(--am-display)",
                      color: "var(--am-negative)",
                      lineHeight: 1,
                    }}
                  >
                    {timeLeft}
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: 36,
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      fontFamily: "var(--am-display)",
                      color: "var(--am-text)",
                      lineHeight: 1,
                    }}
                  >
                    {timeLeft}
                  </span>
                )}
                {nomination.status === 'running' && timeLeft <= 5 && timeLeft > 3 && (
                  <div className="animate-pulse" style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "rgb(251, 191, 36)" }}>Going once...</div>
                )}
                {nomination.status === 'running' && timeLeft <= 3 && timeLeft > 1 && (
                  <div className="animate-pulse" style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--am-negative)" }}>Going twice...</div>
                )}
                {nomination.status === 'running' && timeLeft <= 1 && timeLeft > 0 && (
                  <div className="animate-bounce" style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, background: "var(--am-irid)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" as const }}>SOLD!</div>
                )}
            </div>
          </div>
        </Glass>

        {nomination.status === 'paused' && (
            <Chip strong style={{ alignSelf: "center", color: "rgb(251, 191, 36)", textTransform: "uppercase", letterSpacing: 1.2 }}><Pause size={10} /> Paused</Chip>
        )}

        {/* Current bid + high bidder */}
        <Glass strong={isHighBidder}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                  <SectionLabel style={{ marginBottom: 2 }}>Current Bid</SectionLabel>
                  <IridText size={32}>${currentBid}</IridText>
              </div>
              <div style={{ textAlign: "right" }}>
                  <SectionLabel style={{ marginBottom: 2 }}>High Bidder</SectionLabel>
                  <div style={{ fontSize: 14, fontWeight: 600, color: isHighBidder ? "var(--am-positive)" : "var(--am-text)" }}>
                      {highBidderTeam?.name || '—'} {isHighBidder ? <Chip strong>You</Chip> : ''}
                  </div>
              </div>
          </div>
        </Glass>

        {/* Bid buttons + Decline toggle */}
        {isDeclined ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Glass>
                  <div style={{ textAlign: "center", padding: "8px 0" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "rgb(251, 191, 36)" }}>Passing on this player</div>
                    <div style={{ fontSize: 10, color: "var(--am-text-muted)", marginTop: 2 }}>You won't bid unless you rejoin</div>
                  </div>
                </Glass>
                <Button
                    variant="secondary"
                    className="h-10"
                    onClick={() => setIsDeclined(false)}
                >
                    <HandMetal size={14} /> Rejoin Bidding
                </Button>
            </div>
        ) : (
            <>
                {isPositionFull && !isHighBidder && (
                    <Glass>
                      <div style={{ textAlign: "center", padding: "4px 0", fontSize: 12, fontWeight: 600, color: "rgb(251, 191, 36)" }}>
                        Position full on your roster
                      </div>
                    </Glass>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <Button
                        disabled={!canAffordMin || isHighBidder || nomination.status !== 'running' || isPositionFull}
                        onClick={() => onBid(minRaise)}
                        variant="default"
                        className="h-14 flex flex-col items-center justify-center gap-0.5"
                    >
                        <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", opacity: 0.7 }}>+$1</span>
                        <span style={{ fontSize: 18, fontWeight: 700 }}>${minRaise}</span>
                    </Button>
                    <Button
                        disabled={!canAffordJump || isHighBidder || nomination.status !== 'running' || isPositionFull}
                        onClick={() => onBid(jumpRaise)}
                        variant="secondary"
                        className="h-14 flex flex-col items-center justify-center gap-0.5"
                        style={{ background: "var(--am-chip)", borderColor: "var(--am-border)" }}
                    >
                        <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", color: "var(--am-text-muted)", opacity: 0.7 }}>+$5</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--am-accent)" }}>${jumpRaise}</span>
                    </Button>
                </div>
                {/* AI Bid Advice */}
                {myTeam && nomination.status === 'running' && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {!bidAdvice && (
                      <button
                        onClick={async () => {
                          const lid = serverState?.leagueId;
                          if (!lid || !myTeamId || !nomination.playerId) return;
                          setBidAdviceLoading(true);
                          setBidAdviceError(null);
                          track("ai_auction_advice_requested", { playerId: nomination.playerId, currentBid });
                          try {
                            const result = await fetchJsonApi<BidAdvice>(
                              `${API_BASE}/auction/ai-advice?leagueId=${lid}&teamId=${myTeamId}&playerId=${nomination.playerId}&currentBid=${currentBid}`
                            );
                            setBidAdvice(result);
                          } catch (e: unknown) {
                            setBidAdviceError(e instanceof Error ? e.message : "Advice unavailable");
                          } finally {
                            setBidAdviceLoading(false);
                          }
                        }}
                        disabled={bidAdviceLoading}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          padding: "10px 0",
                          fontSize: 12,
                          color: "var(--am-text-muted)",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {bidAdviceLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        AI Bid Advice
                      </button>
                    )}
                    {bidAdviceError && (
                      <div style={{ fontSize: 10, color: "rgb(248, 113, 113)", textAlign: "center" }}>{bidAdviceError}</div>
                    )}
                    {bidAdvice && (
                      <Glass padded={false}>
                        <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {bidAdvice.shouldBid
                                ? <Check size={12} style={{ color: "var(--am-positive)" }} />
                                : <XCircle size={12} style={{ color: "var(--am-negative)" }} />
                              }
                              <span style={{ fontSize: 12, fontWeight: 600, color: bidAdvice.shouldBid ? "var(--am-positive)" : "var(--am-negative)" }}>
                                {bidAdvice.shouldBid ? 'Bid' : 'Pass'}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 12, color: "var(--am-text-muted)" }}>
                                Max: <span style={{ fontWeight: 700, color: "var(--am-text)" }}>${bidAdvice.maxRecommendedBid}</span>
                              </span>
                              <Chip strong>
                                <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase" }}>{bidAdvice.confidence}</span>
                              </Chip>
                            </div>
                          </div>
                          <p style={{ fontSize: 10, color: "var(--am-text-muted)", lineHeight: 1.5, margin: 0 }}>{bidAdvice.reasoning}</p>
                          {bidAdvice.categoryImpact && (
                            <p style={{ fontSize: 10, color: "var(--am-accent)", lineHeight: 1.5, fontStyle: "italic", margin: 0 }}>{bidAdvice.categoryImpact}</p>
                          )}
                        </div>
                      </Glass>
                    )}
                  </div>
                )}
                {/* Pass button — only show when not already high bidder */}
                {myTeam && !isHighBidder && nomination.status === 'running' && (
                    <button
                        onClick={() => setIsDeclined(true)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          padding: "10px 0",
                          fontSize: 12,
                          color: "var(--am-text-muted)",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                    >
                        <HandMetal size={14} />
                        Pass (sit out this player)
                    </button>
                )}
            </>
        )}

        {/* Proxy / Max Bid */}
        {myTeam && onSetProxyBid && nomination.status === 'running' && (
            <ProxyBidSection
                currentBid={currentBid}
                maxAffordable={myTeam.maxBid}
                myProxyBid={myProxyBid ?? null}
                onSet={onSetProxyBid}
                onCancel={onCancelProxyBid}
                isHighBidder={isHighBidder}
            />
        )}

        <div style={{ textAlign: "center", fontSize: 10, color: "var(--am-text-faint)" }}>
            {isHighBidder
              ? `You are the high bidder · Keeper next year: $${currentBid + 5}`
              : !myTeam
              ? 'No team assigned'
              : `Max bid: $${myTeam.maxBid}`
            }
        </div>

        {/* Commissioner controls — only shown if commissioner props are passed */}
        {(onPause || onResume || onReset) && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {nomination.status === 'running' && onPause && (
                    <Button variant="amber" size="sm" onClick={() => onPause()}>
                        <Pause size={12} /> Pause
                    </Button>
                )}
                {nomination.status === 'paused' && onResume && (
                    <Button variant="emerald" size="sm" onClick={() => onResume()}>
                        <Play size={12} /> Resume
                    </Button>
                )}
                {onReset && (
                    <Button
                        variant="red"
                        size="sm"
                        onClick={async () => {
                            if (await confirm('Reset Auction: This will DELETE all bids, draft picks, and auction rosters. This cannot be undone. Are you sure?')) onReset();
                        }}
                    >
                        <RotateCcw size={12} /> Reset Auction
                    </Button>
                )}
            </div>
        )}

        {/* Nomination queue */}
        <NominationQueue teams={teams} queue={queueIds} queueIndex={queueIndex} myTeamId={myTeamId} />
    </div>
  );
}

// --- Proxy Bid Sub-Component (Aurora chrome) ---

interface ProxyBidSectionProps {
  currentBid: number;
  maxAffordable: number;
  myProxyBid: number | null;
  onSet: (maxBid: number) => void;
  onCancel?: () => void;
  isHighBidder: boolean;
}

function ProxyBidSection({ currentBid, maxAffordable, myProxyBid, onSet, onCancel, isHighBidder }: ProxyBidSectionProps) {
  void isHighBidder;
  const [inputValue, setInputValue] = useState('');
  const [showInput, setShowInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when shown
  useEffect(() => {
    if (showInput && inputRef.current) inputRef.current.focus();
  }, [showInput]);

  const handleSubmit = () => {
    const val = parseInt(inputValue, 10);
    if (!val || val <= currentBid || val > maxAffordable) return;
    onSet(val);
    setInputValue('');
    setShowInput(false);
  };

  // Active proxy bid display
  if (myProxyBid) {
    return (
      <Glass>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Target size={16} style={{ color: "var(--am-accent)" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--am-accent)" }}>
              Auto-bid up to ${myProxyBid}
            </span>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              style={{ padding: 4, background: "transparent", border: "none", color: "var(--am-text-muted)", cursor: "pointer" }}
              title="Cancel auto-bid"
              aria-label="Cancel auto-bid"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </Glass>
    );
  }

  // Set proxy bid UI
  if (showInput) {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--am-text-muted)" }}>$</span>
          <input
            ref={inputRef}
            type="number"
            min={currentBid + 1}
            max={maxAffordable}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setShowInput(false); }}
            placeholder={`${currentBid + 1}–${maxAffordable}`}
            style={{
              width: "100%",
              paddingLeft: 24,
              paddingRight: 8,
              paddingTop: 8,
              paddingBottom: 8,
              fontSize: 14,
              borderRadius: 10,
              border: "1px solid var(--am-border)",
              background: "var(--am-surface-faint)",
              color: "var(--am-text)",
              outline: "none",
            }}
          />
        </div>
        <Button size="sm" onClick={handleSubmit} disabled={!inputValue || parseInt(inputValue) <= currentBid || parseInt(inputValue) > maxAffordable}>
          Set
        </Button>
        <button
          onClick={() => setShowInput(false)}
          style={{ padding: 6, background: "transparent", border: "none", color: "var(--am-text-muted)", cursor: "pointer" }}
          aria-label="Cancel"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // Button to open proxy bid input
  return (
    <button
      onClick={() => setShowInput(true)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "12px 16px",
        fontSize: 14,
        fontWeight: 600,
        borderRadius: 12,
        border: "1px solid var(--am-border)",
        background: "var(--am-chip)",
        color: "var(--am-accent)",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <Target size={16} />
      Set Max Bid (auto-bid)
    </button>
  );
}
