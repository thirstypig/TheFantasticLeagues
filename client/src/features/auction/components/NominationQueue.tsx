
import React from 'react';
import { Users } from 'lucide-react';

interface Team {
  id: number;
  name: string;
  code: string;
}

interface NominationQueueProps {
  teams: Team[];
  queue: number[];
  queueIndex: number;
  myTeamId?: number;
}

export default function NominationQueue({ teams, queue, queueIndex, myTeamId }: NominationQueueProps) {
  const countToShow = 5;
  let rotationIds: number[] = [];
  
  if (teams.length > 0 && queue.length > 0) {
      const doubleQueue = [...queue, ...queue]; 
      rotationIds = doubleQueue.slice(queueIndex, queueIndex + countToShow);
  }
  
  const rotationTeams = rotationIds.map((qid, index) => {
     const t = teams.find(team => team.id === qid);
     return t ? { ...t, uniqueKey: `${qid}-${index}` } : null;
  }).filter(Boolean) as (Team & { uniqueKey: string })[];

  if (rotationTeams.length === 0) return null;

  return (
    <div className="w-full bg-[var(--lg-glass-bg)] backdrop-blur-[var(--lg-glass-blur)] rounded-[var(--lg-radius-xl)] border border-[var(--lg-glass-border)] p-5 shadow-[var(--lg-glass-shadow)] transition-all">
      <div className="flex items-center gap-3 mb-5 pb-3 border-b border-[var(--lg-glass-border)] text-xs font-bold text-[var(--lg-text-muted)] uppercase tracking-wide opacity-60">
          <Users size={14} className="text-[var(--lg-accent)]" /> 
          <span>Nomination Order</span>
      </div>
      <div className="space-y-3">
          {rotationTeams.map((team, idx) => (
              <div 
                key={team.uniqueKey} 
                className={`flex items-center justify-between p-3 rounded-[var(--lg-radius-lg)] transition-all duration-300 ${
                  team.id === myTeamId 
                    ? 'bg-[var(--lg-accent)] text-white shadow-lg shadow-blue-500/20' 
                    : idx === 0 
                      ? 'bg-[var(--lg-glass-bg-hover)] border border-[var(--lg-glass-border)]' 
                      : 'bg-transparent border border-transparent'
                }`}
              >
                  <div className="flex items-center gap-4">
                      <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                        team.id === myTeamId
                          ? 'bg-white text-[var(--lg-accent)]'
                          : idx === 0 
                            ? 'bg-[var(--lg-accent)] text-white' 
                            : 'bg-[var(--lg-glass-bg)] text-[var(--lg-text-muted)] border border-[var(--lg-glass-border-subtle)]'
                      }`}>
                          {idx + 1}
                      </span>
                      <div className="flex flex-col">
                        <span className={`text-[11px] font-bold uppercase tracking-wide ${
                          team.id === myTeamId
                            ? 'text-white'
                            : idx === 0 
                              ? 'text-[var(--lg-text-primary)]' 
                              : 'text-[var(--lg-text-muted)] opacity-60'
                        }`}>
                            {team.name}
                        </span>
                        {team.id === myTeamId && (
                          <span className="text-[8px] font-bold uppercase tracking-wide text-white/70">Your Turn</span>
                        )}
                      </div>
                  </div>
                  
                  {idx === 0 && team.id !== myTeamId && (
                     <span className="text-xs font-bold uppercase tracking-wide text-[var(--lg-accent)] animate-pulse">On Clock</span>
                  )}
              </div>
          ))}
      </div>
    </div>
  );
}
