import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getPrimaryPosition } from '../../../lib/baseballUtils';
import {
  PlayerSeasonStat,
  getPlayerCareerStats,
  getPlayerFieldingStats,
  CareerHittingRow,
  CareerPitchingRow,
  FieldingStatRow
} from '../../../api';
import { useLeague } from "../../../contexts/LeagueContext";
import { mapPosition } from "../../../lib/sportConfig";
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";

interface PlayerExpandedRowProps {
  player: PlayerSeasonStat;
  isTaken: boolean;
  ownerName?: string;
  onNominate?: (player: PlayerSeasonStat) => void;
  onQueue?: (playerId: string | number) => void;
  isQueued?: (playerId: string | number) => boolean;
  onViewDetail?: (player: PlayerSeasonStat) => void;
  colSpan?: number;
  onForceAssign?: (player: PlayerSeasonStat, teamId: number, price: number) => void;
  assignTeams?: { id: number; name: string }[];
}

export default function PlayerExpandedRow({ player, isTaken, ownerName, onNominate, onQueue, isQueued, onViewDetail, colSpan = 7, onForceAssign, assignTeams }: PlayerExpandedRowProps) {
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
                getPlayerFieldingStats(player.mlb_id)
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
  const { outfieldMode } = useLeague();

  // Merge fielding positions based on outfieldMode (CF/RF/LF → OF when mode is "OF")
  const mappedFielding = useMemo(() => {
    if (!fieldingStats.length) return fieldingStats;
    const merged = new Map<string, { position: string; games: number }>();
    for (const f of fieldingStats) {
      const mapped = mapPosition(f.position, outfieldMode);
      const prev = merged.get(mapped) ?? { position: mapped, games: 0 };
      prev.games += f.games;
      merged.set(mapped, prev);
    }
    return Array.from(merged.values()).sort((a, b) => b.games - a.games);
  }, [fieldingStats, outfieldMode]);

  return (
    <tr className="bg-[var(--lg-bg-secondary)]/20 cursor-default" onClick={e => e.stopPropagation()}>
        <ThemedTd colSpan={colSpan} className="px-3 py-3">
            <div className="flex flex-col gap-3">

                {/* Positional Usage */}
                <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="font-semibold text-[var(--lg-text-muted)]">POSITIONS:</span>
                    {mappedFielding.length > 0 ? (
                        mappedFielding.map((f, i) => (
                            <span key={i} className="font-mono bg-[var(--lg-glass-bg-hover)] px-2 py-0.5 rounded border border-[var(--lg-table-border)] text-[var(--lg-text-primary)]">
                                {f.position} <span className="text-[var(--lg-text-muted)]">{f.games} GP</span>
                            </span>
                        ))
                    ) : (
                        <span className="font-mono bg-[var(--lg-glass-bg-hover)] px-2 py-0.5 rounded border border-[var(--lg-table-border)] text-[var(--lg-text-primary)]">
                            {getPrimaryPosition(player.positions) || 'N/A'}
                        </span>
                    )}
                </div>

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
                                <ThemedTr key={i} className={r.year === 'TOT' ? 'font-semibold bg-[var(--lg-bg-secondary)]/50' : ''}>
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
                <div className="flex justify-end gap-2 flex-wrap">
                    {onViewDetail && (
                        <button
                            onClick={() => onViewDetail(player)}
                            className="text-sm font-semibold bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] text-[var(--lg-text-primary)] px-4 py-2 rounded shadow-sm hover:bg-[var(--lg-tint-hover)] active:scale-95 transition-all"
                        >
                            Full Profile
                        </button>
                    )}
                    {!isTaken && onQueue && (
                        <button
                            onClick={() => onQueue(player.mlb_id || '')}
                            className={`text-sm font-semibold bg-[var(--lg-bg-secondary)] border border-[var(--lg-table-border)] text-[var(--lg-text-primary)] px-4 py-2 rounded shadow hover:bg-[var(--lg-glass-bg-hover)] active:scale-95 transition-all ${isQueued?.(player.mlb_id || '') ? 'text-[var(--lg-success)] border-[var(--lg-success)]' : ''}`}
                        >
                            {isQueued?.(player.mlb_id || '') ? '✓ Queued' : '+ Queue'}
                        </button>
                    )}
                    {!isTaken && onForceAssign && assignTeams && (
                        <ForceAssignForm player={player} teams={assignTeams} onAssign={onForceAssign} />
                    )}
                    {isTaken && (
                        <span className="text-xs font-semibold text-[var(--lg-text-muted)] self-center px-2">
                            {ownerName ? `Held by ${ownerName}` : 'Player Taken'}
                        </span>
                    )}
                </div>
            </div>
        </ThemedTd>
    </tr>
  );
}

// --- Force Assign Inline Form (Commissioner only) ---
function ForceAssignForm({ player, teams, onAssign }: {
  player: PlayerSeasonStat;
  teams: { id: number; name: string }[];
  onAssign: (player: PlayerSeasonStat, teamId: number, price: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState<number>(teams[0]?.id ?? 0);
  const [price, setPrice] = useState('1');
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && priceRef.current) priceRef.current.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-semibold bg-amber-900/20 border border-amber-500/30 text-amber-400 px-4 py-2 rounded shadow-sm hover:bg-amber-900/30 active:scale-95 transition-all"
      >
        Force Assign
      </button>
    );
  }

  const handleSubmit = () => {
    const p = parseInt(price, 10);
    if (!teamId || isNaN(p) || p < 0) return;
    onAssign(player, teamId, p);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-2 bg-[var(--lg-bg-secondary)] border border-amber-500/30 rounded px-3 py-2">
      <select
        value={teamId}
        onChange={e => setTeamId(Number(e.target.value))}
        className="text-xs bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] text-[var(--lg-text-primary)] rounded px-2 py-1"
      >
        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--lg-text-muted)]">$</span>
        <input
          ref={priceRef}
          type="number"
          min={0}
          max={999}
          value={price}
          onChange={e => setPrice(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setOpen(false); }}
          className="w-16 pl-5 pr-1 py-1 text-xs rounded border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-[var(--lg-text-primary)]"
        />
      </div>
      <button
        onClick={handleSubmit}
        className="text-xs font-semibold bg-amber-600 text-white px-3 py-1 rounded hover:bg-amber-500 transition-colors"
      >
        Assign
      </button>
      <button
        onClick={() => setOpen(false)}
        className="text-xs text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] px-1"
      >
        Cancel
      </button>
    </div>
  );
}
