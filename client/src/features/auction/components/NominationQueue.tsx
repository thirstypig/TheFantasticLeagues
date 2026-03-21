
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
  const countToShow = 3;
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
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--lg-border-subtle)] text-[10px] font-semibold text-[var(--lg-text-muted)] uppercase tracking-wide">
          <Users size={10} className="text-[var(--lg-accent)]" />
          <span>Nomination Order</span>
      </div>
      <div className="flex flex-col divide-y divide-[var(--lg-border-faint)]">
          {rotationTeams.map((team, idx) => {
              const isMe = team.id === myTeamId;
              const isCurrent = idx === 0;

              return (
                <div
                  key={team.uniqueKey}
                  className={`flex items-center gap-2.5 px-3 py-2 transition-all ${
                    isMe
                      ? 'bg-[var(--lg-accent)]/10'
                      : isCurrent
                        ? 'bg-[var(--lg-bg-secondary)]'
                        : ''
                  }`}
                >
                    <span className={`text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      isMe
                        ? 'bg-[var(--lg-accent)] text-white'
                        : isCurrent
                          ? 'bg-[var(--lg-accent)] text-white'
                          : 'bg-[var(--lg-tint)] text-[var(--lg-text-muted)]'
                    }`}>
                        {idx + 1}
                    </span>
                    <span className={`text-xs font-semibold flex-1 ${
                      isMe
                        ? 'text-[var(--lg-accent)]'
                        : isCurrent
                          ? 'text-[var(--lg-text-primary)]'
                          : 'text-[var(--lg-text-muted)]'
                    }`}>
                        {team.name}
                    </span>
                    {isCurrent && (
                       <span className={`text-[10px] font-bold uppercase tracking-wide shrink-0 ${isMe ? 'text-[var(--lg-accent)]' : 'text-[var(--lg-accent)] animate-pulse'}`}>
                           {isMe ? 'You' : 'Now'}
                       </span>
                    )}
                </div>
              );
          })}
      </div>
    </div>
  );
}
