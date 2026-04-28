import React from 'react';
import { PlayerSeasonStat } from '../../../api';
import { Trash2, Gavel, ChevronUp, ChevronDown } from 'lucide-react';
import { getPrimaryPosition } from '../../../lib/baseballUtils';

interface MyNominationQueueProps {
    players: PlayerSeasonStat[]; // Full list to lookup details
    queueIds: string[];
    onRemove: (id: string) => void;
    onMoveUp?: (id: string) => void;
    onMoveDown?: (id: string) => void;
    onNominate?: (player: PlayerSeasonStat) => void;
    isMyTurn?: boolean;
    myTeamId?: number;
}

export default function MyNominationQueueLegacy({ players, queueIds, onRemove, onMoveUp, onMoveDown, onNominate, isMyTurn, myTeamId }: MyNominationQueueProps) {
    if (!myTeamId) return null;

    const queuedPlayers = queueIds.map(id => players.find(p => String(p.mlb_id) === id)).filter(Boolean) as PlayerSeasonStat[];

    return (
        <div className="w-full bg-[var(--lg-glass-bg-hover)] rounded-xl border border-[var(--lg-table-border)] flex flex-col shadow-sm max-h-[300px] flex-1">
            <div className="p-3 border-b border-[var(--lg-table-border)] flex justify-between items-center bg-[var(--lg-bg-secondary)]">
                <div className="text-xs font-semibold text-[var(--lg-text-muted)] uppercase tracking-wider flex items-center gap-2">
                    <span>Your Nomination Queue</span>
                    <span className="bg-[var(--lg-glass-bg-hover)] px-1.5 rounded text-[var(--lg-text-primary)]">{queueIds.length}</span>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {queuedPlayers.length === 0 && (
                    <div className="text-center text-[var(--lg-text-muted)] text-xs italic py-8">
                        Your queue is empty.
                        <br/>
                        Add players from the Player Pool.
                    </div>
                )}
                {queuedPlayers.map(p => (
                    <div key={p.mlb_id} className="flex items-center justify-between p-2 rounded bg-[var(--lg-glass-bg)] border border-[var(--lg-table-border)] group hover:border-[var(--lg-accent)] transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-[var(--lg-tint)] overflow-hidden shrink-0">
                                 <img 
                                    src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_426,q_auto:best/v1/people/${p.mlb_id}/headshot/67/current`}
                                    alt={p.player_name}
                                    className="w-full h-full object-cover"
                                 />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-[var(--lg-text-primary)] leading-tight">{p.player_name}</span>
                                <div className="text-xs text-[var(--lg-text-muted)] flex gap-1">
                                     <span className="font-mono">{getPrimaryPosition(p.positions) || (p.is_pitcher ? 'P' : 'UT')}</span>
                                     <span>•</span>
                                     <span>{p.mlb_team}</span>
                                     <span className="text-[var(--lg-success)] font-semibold ml-1">${p.value || p.dollar_value}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-0.5">
                            {onMoveUp && (
                                <button
                                    onClick={() => onMoveUp(String(p.mlb_id))}
                                    className="p-1 text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] rounded"
                                    title="Move Up"
                                >
                                    <ChevronUp size={14} />
                                </button>
                            )}
                            {onMoveDown && (
                                <button
                                    onClick={() => onMoveDown(String(p.mlb_id))}
                                    className="p-1 text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] rounded"
                                    title="Move Down"
                                >
                                    <ChevronDown size={14} />
                                </button>
                            )}
                            {onNominate && isMyTurn && (
                                <button
                                    onClick={() => onNominate(p)}
                                    className="p-1.5 bg-[var(--lg-accent)] hover:bg-[var(--lg-accent)]/90 text-white rounded shadow-sm"
                                    title="Nominate Now"
                                >
                                    <Gavel size={14} />
                                </button>
                            )}
                            <button
                                onClick={() => onRemove(String(p.mlb_id))}
                                className="p-1.5 text-[var(--lg-text-muted)] hover:text-red-400 hover:bg-red-900/20 rounded"
                                title="Remove from Queue"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
