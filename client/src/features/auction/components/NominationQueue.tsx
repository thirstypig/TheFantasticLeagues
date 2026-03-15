
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
    <div className="rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-[var(--lg-border-subtle)] text-[10px] font-semibold text-[var(--lg-text-muted)] uppercase tracking-wide">
          <Users size={10} className="text-[var(--lg-accent)]" />
          <span>Nomination Order</span>
      </div>
      <div className="flex gap-1 p-1.5">
          {rotationTeams.map((team, idx) => (
              <div
                key={team.uniqueKey}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-all flex-1 min-w-0 ${
                  team.id === myTeamId
                    ? 'bg-[var(--lg-accent)] text-white'
                    : idx === 0
                      ? 'bg-[var(--lg-bg-secondary)] border border-[var(--lg-border-subtle)] text-[var(--lg-text-primary)]'
                      : 'text-[var(--lg-text-muted)] opacity-50'
                }`}
              >
                  <span className={`text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                    team.id === myTeamId
                      ? 'bg-white/20'
                      : idx === 0
                        ? 'bg-[var(--lg-accent)] text-white'
                        : 'bg-[var(--lg-tint)]'
                  }`}>
                      {idx + 1}
                  </span>
                  <span className="truncate">{team.code || team.name}</span>
                  {idx === 0 && team.id !== myTeamId && (
                     <span className="text-[var(--lg-accent)] animate-pulse ml-auto shrink-0">●</span>
                  )}
              </div>
          ))}
      </div>
    </div>
  );
}
