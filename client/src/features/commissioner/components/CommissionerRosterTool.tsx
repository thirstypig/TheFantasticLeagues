
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
  
  // Refresh trigger to force grid update
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchRosters = async () => {
    setLoading(true);
    try {
      const rosterData = await getCommissionerRosters(leagueId);
      setRosters(rosterData);
    } catch (err: any) {
      setError(err.message);
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
       {/* Controls */}
       <RosterControls leagueId={leagueId} teams={teams} onUpdate={handleUpdate} />

       {/* Roster Grid */}
       <RosterGrid teams={teams} rosters={rosters} />
    </div>
  );
}
