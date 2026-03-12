
import React, { useState, useEffect } from 'react';
import { getCommissionerRosters } from '../api';
import RosterGrid from '../../roster/components/RosterGrid';
import RosterControls from '../../roster/components/RosterControls';

interface Team {
  id: number;
  name: string;
  code?: string | null;
  budget?: number | null;
  owner?: string | null;
}

interface RosterItem {
    id: number;
    teamId: number;
    player: {
        id: number;
        name: string;
        posPrimary: string;
        mlbId?: number;
    };
    price: number;
}

interface CommissionerRosterToolProps {
  leagueId: number;
  teams: Team[];
  onUpdate: () => void;
}

export default function CommissionerRosterTool({ leagueId, teams, onUpdate }: CommissionerRosterToolProps) {
  const [rosters, setRosters] = useState<RosterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingAsTeamId, setActingAsTeamId] = useState<number | null>(teams[0]?.id ?? null);

  // Refresh trigger to force grid update
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchRosters = async () => {
    setLoading(true);
    try {
      const rosterData = await getCommissionerRosters(leagueId);
      setRosters(rosterData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (leagueId) fetchRosters();
  }, [leagueId, refreshKey]);

  const handleUpdate = () => {
      setRefreshKey(prev => prev + 1);
      onUpdate();
  };

  return (
    <div className="space-y-6">
       {/* Acting As Team Selector */}
       <div className="flex items-center gap-3">
         <label className="text-xs font-medium uppercase text-[var(--lg-text-muted)]">Acting As:</label>
         <select
           value={actingAsTeamId ?? ''}
           onChange={(e) => setActingAsTeamId(Number(e.target.value))}
           className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl px-4 py-2 text-xs font-bold text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all"
         >
           {teams.map((t) => (
             <option key={t.id} value={t.id} className="text-black">{t.name}</option>
           ))}
         </select>
       </div>

       {/* Controls */}
       <RosterControls leagueId={leagueId} teams={teams} onUpdate={handleUpdate} />

       {/* Roster Grid */}
       <RosterGrid teams={teams} rosters={rosters} />
    </div>
  );
}
