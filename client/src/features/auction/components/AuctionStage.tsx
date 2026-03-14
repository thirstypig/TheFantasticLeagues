
import React, { useEffect, useState } from 'react';
import { Users, MonitorStop, Pause, Play, RotateCcw } from 'lucide-react';
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
}

export default function AuctionStage({ serverState, myTeamId, onBid, onFinish, onPause, onResume, onReset }: AuctionStageProps) {
  const { confirm } = useToast();

  // Computed helpers
  const nomination = serverState?.nomination;
  const teams = serverState?.teams as Team[] || [];
  
  const [timeLeft, setTimeLeft] = useState(0);

  // Timer Sync and Auto-Finish
  useEffect(() => {
    if (!nomination || nomination.status !== 'running') {
        setTimeLeft(0);
        return;
    }
    
    // Check immediatley
    const checkTime = () => {
        const end = new Date(nomination.endTime).getTime();
        const now = Date.now();
        const diff = Math.max(0, Math.ceil((end - now)/1000));
        setTimeLeft(diff);

        if (diff <= 0) {
            onFinish();
        }
    };

    checkTime(); 
    const interval = setInterval(checkTime, 200);
    return () => clearInterval(interval);
  }, [nomination, onFinish]);


  // Skeleton while connecting to auction server
  if (!serverState) {
      return (
          <div className="h-full flex flex-col gap-6 p-6 animate-pulse">
              <div className="h-64 rounded-2xl bg-[var(--lg-tint)]" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="h-48 rounded-2xl bg-[var(--lg-tint)]" />
                  <div className="h-48 rounded-2xl bg-[var(--lg-tint)]" />
              </div>
          </div>
      );
  }

  if (!nomination) {
      // Waiting State
      const queueIds = serverState?.queue || [];
      const queueIndex = serverState?.queueIndex || 0;
      const rotationTeams = queueIds.slice(queueIndex, queueIndex + 5).map(qid => teams.find(t => t.id === qid)).filter(Boolean) as Team[];

      return (
          <div className="h-full flex flex-col items-center justify-center p-12 lg-card relative overflow-hidden bg-transparent">
               <Users size={300} className="absolute -bottom-20 -right-20 text-[var(--lg-accent)] opacity-[0.03] rotate-12" />

               <div className="flex flex-col items-center text-center z-10">
                  <div className="w-20 h-20 rounded-full bg-[var(--lg-tint)] flex items-center justify-center mb-8 border border-[var(--lg-border-subtle)] shadow-2xl">
                    <MonitorStop size={32} className="text-[var(--lg-text-muted)] opacity-40" />
                  </div>
                  <h3 className="text-4xl font-semibold uppercase tracking-tight text-[var(--lg-text-heading)] mb-3">Awaiting Nomination</h3>
                  <p className="text-xs max-w-xs text-[var(--lg-text-muted)] mb-12 font-semibold uppercase tracking-wide leading-relaxed opacity-60">
                     {myTeamId && rotationTeams[0]?.id === myTeamId ? 
                        <span className="text-[var(--lg-accent)] animate-pulse">It's your turn. Select a player to begin.</span> : 
                        "The room is open. Stand by for the next nominee."}
                  </p>
                  
                  {rotationTeams.length > 0 && (
                      <div className="w-full max-w-md">
                           <NominationQueue 
                                 teams={teams} 
                                 queue={queueIds} 
                                 queueIndex={queueIndex} 
                                 myTeamId={myTeamId} 
                           />
                      </div>
                  )}
               </div>
          </div>
      );
  }

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
    <div className="flex flex-col h-full gap-8">
        {/* Nominee Card */}
        <div className="lg-card p-0 overflow-hidden flex flex-col md:flex-row relative bg-transparent animate-in fade-in slide-in-from-top-4 duration-500">
            
            {/* Player Image */}
            <div className="w-full md:w-1/3 bg-[var(--lg-bg-secondary)] border-r border-[var(--lg-glass-border)] relative flex items-center justify-center min-h-[260px] group">
                 <img 
                    src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_426,q_auto:best/v1/people/${nomination.playerId}/headshot/67/current`}
                    alt={nomination.playerName}
                    className="object-cover h-full w-full opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                    onError={(e) => (e.currentTarget.src = 'https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_426,q_auto:best/v1/people/generic/headshot/67/current')}
                 />
                 <div className="absolute top-4 left-4 bg-[var(--lg-accent)] text-white px-4 py-2 rounded-[var(--lg-radius-lg)] text-[11px] font-bold uppercase tracking-wide shadow-2xl">
                    {nomination.positions || (nomination.isPitcher ? 'P' : 'UT')}
                 </div>
            </div>

            {/* Info & Timer */}
            <div className="flex-1 flex flex-col">
                <div className="p-8 border-b border-[var(--lg-glass-border)] flex justify-between items-start bg-[var(--lg-tint)]">
                    <div>
                        <h2 className="text-4xl font-semibold text-[var(--lg-text-heading)] leading-none tracking-tight mb-3">{nomination.playerName}</h2>
                        <div className="text-[11px] font-semibold text-[var(--lg-text-muted)] uppercase tracking-wide flex items-center gap-2 opacity-60">
                             {nomination.playerTeam}
                        </div>
                    </div>
                    
                    {/* Timer Display */}
                    <div className="flex flex-col items-end">
                        <div className={`text-7xl font-bold tabular-nums tracking-tight transition-all duration-300 ${
                            isCriticalTime ? 'text-[var(--lg-error)] animate-pulse scale-110 origin-right' : 'text-[var(--lg-text-primary)]'
                        }`}>
                            {timeLeft}
                        </div>
                        {nomination.status === 'paused' && <div className="text-[var(--lg-warning)] font-bold uppercase text-xs tracking-wide mt-2 border border-[var(--lg-warning)]/20 bg-[var(--lg-warning)]/10 px-2 py-0.5 rounded-md">SYSTEM PAUSED</div>}
                    </div>
                </div>

                <div className="p-8 bg-[var(--lg-tint)] flex-1 flex flex-col justify-center">
                   <div className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] mb-5 flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full animate-pulse ${isCriticalTime ? 'bg-[var(--lg-error)]' : 'bg-[var(--lg-accent)]'}`} /> 
                      Live Auction Stream Active
                   </div>
                   <p className="text-sm font-semibold text-[var(--lg-text-secondary)] uppercase tracking-wider leading-relaxed opacity-60">
                      Real-time valuation engine initialized. Detailed projections available in the performance module.
                   </p>
                </div>
            </div>
        </div>

        {/* Commissioner Actions */}
        <div className="flex gap-4 justify-end">
            {nomination.status === 'running' && (
                <Button 
                    variant="amber"
                    onClick={() => onPause && onPause()}
                >
                    <Pause size={14} /> PAUSE AUCTION
                </Button>
            )}
             {nomination.status === 'paused' && (
                <Button 
                    variant="emerald"
                    onClick={() => onResume && onResume()}
                >
                    <Play size={14} /> RESUME AUCTION
                </Button>
            )}
             <Button
                variant="red"
                onClick={async () => {
                    if (await confirm('Reset auction? This clears ALL records.')) {
                        onReset && onReset();
                    }
                }}
            >
                <RotateCcw size={14} /> RESET OPS
            </Button>
        </div>

        {/* Bidding Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Current Valuation Status */}
            <div className={`lg-card p-4 md:p-10 flex flex-col justify-between relative overflow-hidden transition-all duration-500 ${isHighBidder ? 'border-[var(--lg-success)]/40 bg-[var(--lg-success)]/5 ring-1 ring-[var(--lg-success)]/20' : 'bg-transparent'}`}>
                {isHighBidder && (
                  <div className="absolute top-0 right-0 bg-[var(--lg-success)] text-white px-6 py-2 rounded-bl-[var(--lg-radius-2xl)] text-xs font-bold uppercase tracking-wide shadow-xl">
                    Leading Bidder
                  </div>
                )}
                <div>
                   <div className="text-xs font-semibold text-[var(--lg-text-muted)] uppercase tracking-wide mb-6 opacity-60">Live Valuation</div>
                   <div className="text-8xl font-bold text-[var(--lg-text-heading)] tracking-tight tabular-nums mb-6 flex items-start">
                       <span className="text-3xl mt-3 opacity-20 mr-1">$</span>{currentBid}
                   </div>
                   <div className="flex flex-col gap-1">
                      <div className="text-xs font-semibold text-[var(--lg-text-muted)] uppercase tracking-wide opacity-40">Identity Held By:</div>
                      <div className={`text-sm font-semibold uppercase tracking-wide ${isHighBidder ? 'text-[var(--lg-success)]' : 'text-[var(--lg-text-primary)]'}`}>
                          {highBidderTeam?.name || 'GENESIS BID'} {isHighBidder ? '(YOU)' : ''}
                      </div>
                   </div>
                </div>
            </div>

            {/* Bidding Actions */}
            <div className="lg-card p-4 md:p-10 flex flex-col gap-6 justify-center bg-transparent">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                     <Button 
                        disabled={!canAffordMin || isHighBidder || nomination.status !== 'running'}
                        onClick={() => onBid(minRaise)}
                        variant="default"
                        size="lg"
                        className="h-32 flex flex-col items-center justify-center gap-1 shadow-2xl shadow-blue-500/40 relative overflow-hidden group"
                    >
                         <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="text-xs font-semibold uppercase tracking-wide opacity-60">Increment +$1</span>
                        <span className="text-3xl font-semibold tracking-tight">BID ${minRaise}</span>
                     </Button>
                     <Button 
                        disabled={!canAffordJump || isHighBidder || nomination.status !== 'running'}
                        onClick={() => onBid(jumpRaise)}
                        variant="secondary"
                        size="lg"
                        className="h-32 flex flex-col items-center justify-center gap-1 bg-[var(--lg-tint)] border-[var(--lg-border-subtle)] hover:bg-[var(--lg-tint-hover)] transition-all group"
                     >
                        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] opacity-60">Strategic +$5</span>
                        <span className="text-3xl font-semibold tracking-tight text-[var(--lg-accent)]">JUMP ${jumpRaise}</span>
                     </Button>
                 </div>
                 
                 <div className="mt-2 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] opacity-30">
                       Max Strategic Reserve: <span className="text-[var(--lg-text-primary)] opacity-100">${myTeam?.maxBid || 0}</span>
                    </p>
                 </div>
            </div>
        </div>
        
        {/* Nomination Queue Section */}
        <div className="w-full mt-4 bg-transparent rounded-[var(--lg-radius-2xl)] border border-[var(--lg-border-faint)] p-1">
            <NominationQueue 
                teams={teams} 
                queue={serverState?.queue || []} 
                queueIndex={serverState?.queueIndex || 0} 
                myTeamId={myTeamId} 
            />
        </div>
    </div>
  );
}
