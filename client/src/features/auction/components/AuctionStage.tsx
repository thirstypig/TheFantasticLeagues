
import React, { useEffect, useState, useRef } from 'react';
import { Pause, Play, RotateCcw, Undo2, Target, X, HandMetal } from 'lucide-react';
import { ClientAuctionState } from '../hooks/useAuctionState';
import NominationQueue from './NominationQueue';
import { Button } from '../../../components/ui/button';
import { useToast } from "../../../contexts/ToastContext";

interface Team {
  id: number;
  name: string;
  code: string;
  budget: number;
  maxBid: number;
  rosterCount: number;
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

  const nomination = serverState?.nomination;
  const teams = serverState?.teams as Team[] || [];

  const [timeLeft, setTimeLeft] = useState(0);

  // Timer Sync (display only — server is authoritative for auto-finish)
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

  // Skeleton
  if (!serverState) {
      return (
          <div className="animate-pulse space-y-3">
              <div className="h-24 rounded-lg bg-[var(--lg-tint)]" />
              <div className="h-16 rounded-lg bg-[var(--lg-tint)]" />
          </div>
      );
  }

  const queueIds = serverState?.queue || [];
  const queueIndex = serverState?.queueIndex || 0;

  // --- Waiting for Nomination ---
  if (!nomination) {
      return (
          <div className="flex flex-col gap-3">
              {/* Status */}
              <div className="text-center py-4">
                  <div className="text-lg font-semibold text-[var(--lg-text-heading)] mb-1">Awaiting Nomination</div>
                  <p className="text-xs text-[var(--lg-text-muted)]">
                     {myTeamId && queueIds[queueIndex] === myTeamId
                        ? <span className="text-[var(--lg-accent)] font-semibold animate-pulse">Your turn — select a player</span>
                        : "Stand by for the next nominee"}
                  </p>
              </div>

              {/* Queue */}
              <NominationQueue teams={teams} queue={queueIds} queueIndex={queueIndex} myTeamId={myTeamId} />

              {/* Admin actions */}
              {onUndoFinish && (
                  <div className="flex justify-center pt-1">
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
      );
  }

  // --- Active Bidding ---
  const isCriticalTime = timeLeft <= 5 && nomination.status === 'running';
  const currentBid = nomination.currentBid;
  const highBidderTeam = teams.find(t => t.id === nomination.highBidderTeamId);
  const myTeam = teams.find(t => t.id === myTeamId);
  const minRaise = currentBid + 1;
  const jumpRaise = currentBid + 5;
  const canAffordMin = myTeam ? myTeam.maxBid >= minRaise : false;
  const canAffordJump = myTeam ? myTeam.maxBid >= jumpRaise : false;
  const isHighBidder = nomination.highBidderTeamId === myTeamId;

  return (
    <div className="flex flex-col gap-3">
        {/* Nominee: photo + info + timer in one compact row */}
        <div className="flex gap-3 items-stretch rounded-lg overflow-hidden border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)]">
            {/* Player headshot */}
            <div className="w-20 shrink-0 relative bg-[var(--lg-bg-secondary)]">
                <img
                    src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${nomination.playerId}/headshot/67/current`}
                    alt={nomination.playerName}
                    className="object-cover h-full w-full"
                    onError={(e) => (e.currentTarget.src = 'https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/generic/headshot/67/current')}
                />
                <div className="absolute bottom-1 left-1 bg-[var(--lg-accent)] text-white px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">
                    {nomination.positions || (nomination.isPitcher ? 'P' : 'UT')}
                </div>
            </div>

            {/* Player info */}
            <div className="flex-1 py-2 pr-2 flex flex-col justify-center min-w-0">
                <div className="text-sm font-semibold text-[var(--lg-text-heading)] truncate">{nomination.playerName}</div>
                <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">{nomination.playerTeam}</div>
            </div>

            {/* Timer */}
            <div className="flex items-center pr-3">
                <div className={`text-4xl font-bold tabular-nums transition-all ${
                    isCriticalTime ? 'text-[var(--lg-error)] animate-pulse' : 'text-[var(--lg-text-primary)]'
                }`}>
                    {timeLeft}
                </div>
            </div>
        </div>

        {nomination.status === 'paused' && (
            <div className="text-center text-[var(--lg-warning)] font-bold uppercase text-xs tracking-wide border border-[var(--lg-warning)]/20 bg-[var(--lg-warning)]/10 px-2 py-1 rounded">PAUSED</div>
        )}

        {/* Current bid + high bidder */}
        <div className={`rounded-lg p-3 border transition-all ${isHighBidder ? 'border-[var(--lg-success)]/40 bg-[var(--lg-success)]/5' : 'border-[var(--lg-border-subtle)] bg-[var(--lg-tint)]'}`}>
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-[10px] font-semibold text-[var(--lg-text-muted)] uppercase mb-0.5">Current Bid</div>
                    <div className="text-3xl font-bold text-[var(--lg-text-heading)] tabular-nums">${currentBid}</div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] font-semibold text-[var(--lg-text-muted)] uppercase mb-0.5">High Bidder</div>
                    <div className={`text-sm font-semibold ${isHighBidder ? 'text-[var(--lg-success)]' : 'text-[var(--lg-text-primary)]'}`}>
                        {highBidderTeam?.name || '—'} {isHighBidder ? '(You)' : ''}
                    </div>
                </div>
            </div>
        </div>

        {/* Bid buttons + Decline toggle */}
        {isDeclined ? (
            <div className="flex flex-col gap-2">
                <div className="text-center py-3 rounded-lg border border-[var(--lg-warning)]/30 bg-[var(--lg-warning)]/5">
                    <div className="text-sm font-semibold text-[var(--lg-warning)]">Passing on this player</div>
                    <div className="text-[10px] text-[var(--lg-text-muted)] mt-0.5">You won't bid unless you rejoin</div>
                </div>
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
                <div className="grid grid-cols-2 gap-2">
                    <Button
                        disabled={!canAffordMin || isHighBidder || nomination.status !== 'running'}
                        onClick={() => onBid(minRaise)}
                        variant="default"
                        className="h-14 flex flex-col items-center justify-center gap-0.5"
                    >
                        <span className="text-[10px] font-medium uppercase opacity-70">+$1</span>
                        <span className="text-lg font-bold">${minRaise}</span>
                    </Button>
                    <Button
                        disabled={!canAffordJump || isHighBidder || nomination.status !== 'running'}
                        onClick={() => onBid(jumpRaise)}
                        variant="secondary"
                        className="h-14 flex flex-col items-center justify-center gap-0.5 bg-[var(--lg-tint)] border-[var(--lg-border-subtle)]"
                    >
                        <span className="text-[10px] font-medium uppercase text-[var(--lg-text-muted)] opacity-70">+$5</span>
                        <span className="text-lg font-bold text-[var(--lg-accent)]">${jumpRaise}</span>
                    </Button>
                </div>
                {/* Pass button — only show when not already high bidder */}
                {myTeam && !isHighBidder && nomination.status === 'running' && (
                    <button
                        onClick={() => setIsDeclined(true)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-[var(--lg-text-muted)] hover:text-[var(--lg-warning)] transition-colors"
                    >
                        <HandMetal size={12} />
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

        <div className="text-center text-[10px] text-[var(--lg-text-muted)] opacity-50">
            {isHighBidder
              ? 'You are the high bidder'
              : !myTeam
              ? 'No team assigned'
              : `Max bid: $${myTeam.maxBid}`
            }
        </div>

        {/* Commissioner controls — only shown if commissioner props are passed */}
        {(onPause || onResume || onReset) && (
            <div className="flex gap-2 justify-center flex-wrap">
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

// --- Proxy Bid Sub-Component ---

interface ProxyBidSectionProps {
  currentBid: number;
  maxAffordable: number;
  myProxyBid: number | null;
  onSet: (maxBid: number) => void;
  onCancel?: () => void;
  isHighBidder: boolean;
}

function ProxyBidSection({ currentBid, maxAffordable, myProxyBid, onSet, onCancel, isHighBidder }: ProxyBidSectionProps) {
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
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-[var(--lg-accent)]/30 bg-[var(--lg-accent)]/5">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-[var(--lg-accent)]" />
          <span className="text-sm font-semibold text-[var(--lg-accent)]">
            Auto-bid up to ${myProxyBid}
          </span>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-1 text-[var(--lg-text-muted)] hover:text-red-400 rounded"
            title="Cancel auto-bid"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }

  // Set proxy bid UI
  if (showInput) {
    return (
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--lg-text-muted)]">$</span>
          <input
            ref={inputRef}
            type="number"
            min={currentBid + 1}
            max={maxAffordable}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setShowInput(false); }}
            placeholder={`${currentBid + 1}–${maxAffordable}`}
            className="w-full pl-6 pr-2 py-2 text-sm rounded-md border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-secondary)] text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--lg-accent)]"
          />
        </div>
        <Button size="sm" onClick={handleSubmit} disabled={!inputValue || parseInt(inputValue) <= currentBid || parseInt(inputValue) > maxAffordable}>
          Set
        </Button>
        <button onClick={() => setShowInput(false)} className="p-1.5 text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]">
          <X size={14} />
        </button>
      </div>
    );
  }

  // Button to open proxy bid input
  return (
    <button
      onClick={() => setShowInput(true)}
      className="w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold rounded-lg border border-[var(--lg-accent)]/30 bg-[var(--lg-accent)]/5 text-[var(--lg-accent)] hover:bg-[var(--lg-accent)]/10 transition-colors"
    >
      <Target size={16} />
      Set Max Bid (auto-bid)
    </button>
  );
}
