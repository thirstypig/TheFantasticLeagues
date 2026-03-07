
import React, { useEffect, useState } from 'react';
import { 
    getPeriods, savePeriod, deletePeriod, type PeriodDef, 
    getLeagueRules, saveLeagueRule, type LeagueRule,
    endAuction
} from '../../../api';

interface CommissionerControlsProps {
  leagueId: number;
}

export default function CommissionerControls({ leagueId }: CommissionerControlsProps) {
    // --- State ---
    const [periods, setPeriods] = useState<PeriodDef[]>([]);
    const [rules, setRules] = useState<LeagueRule[]>([]);
    const [loading, setLoading] = useState(false);
    
    // --- Form State ---
    // Period Edit
    const [pId, setPId] = useState<number | null>(null);
    const [pName, setPName] = useState('');
    const [pStart, setPStart] = useState('');
    const [pEnd, setPEnd] = useState('');
    
    // Rule Edit
    const [timerDuration, setTimerDuration] = useState('30');

    // --- Actions ---
    const refresh = async () => {
        setLoading(true);
        try {
            const [pRes, rRes] = await Promise.all([
                getPeriods(),
                getLeagueRules(leagueId)
            ]);
            setPeriods(pRes.periods);
            setRules(rRes.rules);

            // Set timer if exists
            const tRule = rRes.rules.find(r => r.key === 'timer_duration');
            if (tRule) setTimerDuration(tRule.value);
        } catch (e) {
            console.error(e);
            alert('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
    }, [leagueId]);

    // Period Save
    const handleSavePeriod = async () => {
        if (!pName || !pStart || !pEnd) return alert('Fill all period fields');
        try {
            await savePeriod({ 
                id: pId || undefined, 
                name: pName, 
                startDate: new Date(pStart).toISOString(), 
                endDate: new Date(pEnd).toISOString(),
                status: 'upcoming'
            });
            await refresh();
            setPId(null); setPName(''); setPStart(''); setPEnd('');
        } catch (e) {
            console.error(e);
            alert('Failed to save period');
        }
    };

    const handleDeletePeriod = async (id: number) => {
        if (!confirm('Delete period?')) return;
        try {
            await deletePeriod(id);
            await refresh();
        } catch (e) {
            console.error(e);
        }
    };

    // Rule Save
    const handleSaveTimer = async () => {
        try {
            await saveLeagueRule(leagueId, {
                category: 'auction',
                key: 'timer_duration',
                value: timerDuration,
                label: 'Auction Time Limit (sec)'
            });
            alert('Saved timer settings');
        } catch (e) {
            console.error(e);
            alert('Failed to save rule');
        }
    };

    // End Auction
    const handleEndAuction = async () => {
        if (!confirm('Are you sure you want to END the auction? This will snapshot current rosters for Period 1.')) return;
        try {
            const res = await endAuction(leagueId);
            alert(`Auction Ended. ${res.snapshotted} roster entries archived.`);
        } catch (e) {
            console.error(e);
            alert('Failed to end auction');
        }
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString();

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* 1. Period Setup */}
            <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
                <h3 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4">Season Periods</h3>

                {/* List */}
                <div className="space-y-2 mb-4">
                    {periods.length === 0 && <div className="text-[var(--lg-text-muted)] text-sm italic">No periods defined.</div>}
                    {periods.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-sm bg-[var(--lg-tint)] p-2 rounded">
                            <div>
                                <span className="font-medium text-[var(--lg-text-primary)]">{p.name}</span>
                                <span className="mx-2 text-[var(--lg-text-muted)]">|</span>
                                <span className="text-[var(--lg-text-muted)]">{formatDate(p.startDate)} — {formatDate(p.endDate)}</span>
                            </div>
                            <button onClick={() => handleDeletePeriod(p.id)} className="text-red-400 hover:text-red-300 px-2">×</button>
                        </div>
                    ))}
                </div>

                {/* Add Form */}
                <div className="bg-[var(--lg-tint)] p-3 rounded-xl space-y-3">
                    <div className="text-xs font-semibold text-[var(--lg-text-muted)] uppercase">Add / Edit Period</div>
                    <input 
                        className="w-full bg-[var(--lg-glass-bg)] border border-[var(--lg-border-subtle)] rounded px-2 py-1 text-[var(--lg-text-primary)] text-sm"
                        placeholder="Period Name (e.g. Period 1)"
                        value={pName}
                        onChange={e => setPName(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-xs text-[var(--lg-text-muted)] block">Start Date</label>
                            <input 
                                type="date" 
                                className="w-full bg-[var(--lg-glass-bg)] border border-[var(--lg-border-subtle)] rounded px-2 py-1 text-[var(--lg-text-primary)] text-sm"
                                value={pStart}
                                onChange={e => setPStart(e.target.value)}
                            />
                        </div>
                        <div>
                        <label className="text-xs text-[var(--lg-text-muted)] block">End Date</label>
                            <input 
                                type="date" 
                                className="w-full bg-[var(--lg-glass-bg)] border border-[var(--lg-border-subtle)] rounded px-2 py-1 text-[var(--lg-text-primary)] text-sm"
                                value={pEnd}
                                onChange={e => setPEnd(e.target.value)}
                            />
                        </div>
                    </div>
                    <button 
                        onClick={handleSavePeriod} 
                        className="w-full bg-[var(--lg-accent)] text-white text-sm font-bold py-1.5 rounded hover:opacity-90"
                    >
                        Save Period
                    </button>
                </div>
            </div>

            <div className="space-y-6">
                {/* 2. Auction Settings */}
                <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
                    <h3 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4">Auction Settings</h3>
                    
                    <div className="bg-[var(--lg-tint)] p-3 rounded-xl space-y-3">
                        <label className="block text-sm text-[var(--lg-text-primary)]">Bid Limit Timer (Seconds)</label>
                        <div className="flex gap-2">
                            <input 
                                type="number" 
                                className="flex-1 bg-[var(--lg-glass-bg)] border border-[var(--lg-border-subtle)] rounded px-2 py-1 text-[var(--lg-text-primary)]"
                                value={timerDuration}
                                onChange={e => setTimerDuration(e.target.value)}
                            />
                            <button 
                                onClick={handleSaveTimer}
                                className="px-4 bg-[var(--lg-tint-hover)] hover:bg-[var(--lg-tint-hover)] text-[var(--lg-text-primary)] rounded text-sm"
                            >
                                Save
                            </button>
                        </div>
                        <p className="text-xs text-[var(--lg-text-muted)]">Set to 0 to disable timer for high-value players.</p>
                    </div>
                </div>

                {/* 3. Actions */}
                <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
                    <h3 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4">Actions</h3>
                    
                    <button 
                        onClick={handleEndAuction}
                        className="w-full py-3 bg-red-600/80 hover:bg-red-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
                    >
                        <span className="text-xl">🏁</span> End Auction & Finalize
                    </button>
                    <p className="mt-2 text-xs text-[var(--lg-text-muted)] text-center">
                        This creates a snapshot of all current rosters as the "Start of Season" state (Period 1).
                    </p>
                </div>
            </div>

        </div>
    );
}
