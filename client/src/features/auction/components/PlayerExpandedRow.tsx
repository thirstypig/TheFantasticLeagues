import React, { useState, useEffect } from 'react';
import { getPrimaryPosition } from '../../../lib/baseballUtils';
import {
  PlayerSeasonStat,
  getPlayerCareerStats,
  getPlayerFieldingStats,
  CareerHittingRow,
  CareerPitchingRow,
  FieldingStatRow
} from '../../../api';
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";

interface PlayerExpandedRowProps {
  player: PlayerSeasonStat;
  isTaken: boolean;
  ownerName?: string;
  onNominate?: (player: PlayerSeasonStat) => void;
  onQueue?: (playerId: string | number) => void;
  isQueued?: (playerId: string | number) => boolean;
  colSpan?: number;
}

export default function PlayerExpandedRow({ player, isTaken, ownerName, onNominate, onQueue, isQueued, colSpan = 7 }: PlayerExpandedRowProps) {
  const [careerStats, setCareerStats] = useState<(CareerHittingRow | CareerPitchingRow)[]>([]);
  const [fieldingStats, setFieldingStats] = useState<FieldingStatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!player.mlb_id) return;

    const fetchStats = async () => {
        setLoading(true);
        try {
            const mode = player.is_pitcher ? 'pitching' : 'hitting';
            const [cRes, fRes] = await Promise.all([
                getPlayerCareerStats(player.mlb_id, mode),
                !player.is_pitcher ? getPlayerFieldingStats(player.mlb_id, 2024) : Promise.resolve([]) 
            ]);
            
            // Sort Career: Years ASC, then TOT last
            const rows = (cRes.rows || []).sort((a, b) => {
                if (a.year === 'TOT') return 1;
                if (b.year === 'TOT') return -1;
                return Number(a.year) - Number(b.year);
            });
            
            setCareerStats(rows);
            setFieldingStats(fRes);
        } catch (e) {
            console.error(e);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    fetchStats();
  }, [player.mlb_id, player.is_pitcher]);

  const isPitcher = player.is_pitcher;

  return (
    <tr className="bg-[var(--lg-bg-secondary)]/20 cursor-default" onClick={e => e.stopPropagation()}>
        <ThemedTd colSpan={colSpan} className="px-3 py-3">
            <div className="flex flex-col gap-3">
                
                {/* Positional Usage */}
                <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-[var(--lg-text-muted)]">POSITIONS:</span>
                    <span className="font-mono bg-[var(--lg-glass-bg-hover)] px-2 py-0.5 rounded border border-[var(--lg-table-border)] text-[var(--lg-text-primary)]">
                        {getPrimaryPosition(player.positions) || 'N/A'}
                    </span>
                </div>

                {/* Fielding Stats (2024) - Hitters Only */}
                {!isPitcher && fieldingStats.length > 0 && (
                    <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium uppercase text-[var(--lg-text-muted)]">2024 Defensive Usage</span>
                        <div className="flex flex-wrap gap-2">
                            {fieldingStats.map((f, i) => (
                                <div key={i} className="text-xs bg-[var(--lg-glass-bg-hover)] border border-[var(--lg-table-border)] px-2 py-1 rounded flex gap-2 items-center text-[var(--lg-text-primary)]">
                                    <span className="font-bold">{f.position}</span>
                                    <span className="text-[var(--lg-text-muted)]">{f.games} G</span>
                                    <span className="text-[var(--lg-text-muted)]">({f.gamesStarted} GS)</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Career Stats Table */}
                <div className="overflow-x-auto rounded border border-[var(--lg-table-border)]">
                    <ThemedTable bare>
                        <ThemedThead>
                            <ThemedTr>
                                <ThemedTh>Year</ThemedTh>
                                <ThemedTh align="center">Team</ThemedTh>
                                {isPitcher ? (
                                    <>
                                        <ThemedTh align="center">W</ThemedTh><ThemedTh align="center">L</ThemedTh><ThemedTh align="center">SV</ThemedTh><ThemedTh align="center">K</ThemedTh><ThemedTh align="center">ERA</ThemedTh><ThemedTh align="center">WHIP</ThemedTh><ThemedTh align="center">SO</ThemedTh>
                                    </>
                                ) : (
                                    <>
                                        <ThemedTh align="center">AB</ThemedTh><ThemedTh align="center">R</ThemedTh><ThemedTh align="center">HR</ThemedTh><ThemedTh align="center">RBI</ThemedTh><ThemedTh align="center">SB</ThemedTh><ThemedTh align="center">AVG</ThemedTh><ThemedTh align="center">GS</ThemedTh>
                                    </>
                                )}
                            </ThemedTr>
                        </ThemedThead>
                        <tbody>
                            {loading && <ThemedTr><ThemedTd colSpan={9} align="center" className="py-4"><span className="text-[var(--lg-text-muted)]">Loading stats...</span></ThemedTd></ThemedTr>}
                            {error && !loading && <ThemedTr><ThemedTd colSpan={9} align="center" className="py-4"><span className="text-red-500">Failed to load stats.</span></ThemedTd></ThemedTr>}
                            {!loading && !error && careerStats.map((r, i) => (
                                <ThemedTr key={i} className={r.year === 'TOT' ? 'font-bold bg-[var(--lg-bg-secondary)]/50' : ''}>
                                    <ThemedTd>{r.year === 'TOT' ? 'Career totals' : r.year}</ThemedTd>
                                    <ThemedTd align="center">{r.tm}</ThemedTd>
                                    {isPitcher ? (
                                        <>
                                            <ThemedTd align="center">{(r as CareerPitchingRow).W}</ThemedTd>
                                            <ThemedTd align="center">{(r as CareerPitchingRow).L}</ThemedTd>
                                            <ThemedTd align="center">{(r as CareerPitchingRow).SV}</ThemedTd>
                                            <ThemedTd align="center">{(r as CareerPitchingRow).SO}</ThemedTd>
                                            <ThemedTd align="center">{(r as CareerPitchingRow).ERA}</ThemedTd>
                                            <ThemedTd align="center">{(r as CareerPitchingRow).WHIP}</ThemedTd>
                                            <ThemedTd align="center">{(r as CareerPitchingRow).SHO}</ThemedTd>
                                        </>
                                    ) : (
                                        <>
                                            <ThemedTd align="center">{(r as CareerHittingRow).AB}</ThemedTd>
                                            <ThemedTd align="center">{(r as CareerHittingRow).R}</ThemedTd>
                                            <ThemedTd align="center">{(r as CareerHittingRow).HR}</ThemedTd>
                                            <ThemedTd align="center">{(r as CareerHittingRow).RBI}</ThemedTd>
                                            <ThemedTd align="center">{(r as CareerHittingRow).SB}</ThemedTd>
                                            <ThemedTd align="center">{(r as CareerHittingRow).AVG}</ThemedTd>
                                            <ThemedTd align="center">{(r as CareerHittingRow).GS}</ThemedTd>
                                        </>
                                    )}
                                </ThemedTr>
                            ))}
                        </tbody>
                    </ThemedTable>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2">
                    {!isTaken && onQueue && (
                        <button 
                            onClick={() => onQueue(player.mlb_id || '')}
                            className={`text-sm font-bold bg-[var(--lg-bg-secondary)] border border-[var(--lg-table-border)] text-[var(--lg-text-primary)] px-4 py-2 rounded shadow hover:bg-[var(--lg-glass-bg-hover)] active:scale-95 transition-all ${isQueued?.(player.mlb_id || '') ? 'text-[var(--lg-success)] border-[var(--lg-success)]' : ''}`}
                        >
                            {isQueued?.(player.mlb_id || '') ? '✓ Queued' : '+ Queue'}
                        </button>
                    )}
                    {!isTaken && onNominate && (
                        <button 
                            onClick={() => onNominate(player)}
                            className="text-sm font-bold bg-[var(--lg-text-primary)] text-[var(--lg-glass-bg)] px-4 py-2 rounded shadow hover:opacity-90 active:scale-95 transition-all"
                        >
                            Nominate
                        </button>
                    )}
                    {isTaken && (
                        <span className="text-xs font-bold text-[var(--lg-text-muted)] self-center px-2">
                            {ownerName ? `Held by ${ownerName}` : 'Player Taken'}
                        </span>
                    )}
                </div>
            </div>
        </ThemedTd>
    </tr>
  );
}
