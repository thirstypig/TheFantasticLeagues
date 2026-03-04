
import React, { useMemo } from 'react';
import { TrendingUp, Award, AlertCircle, BarChart3 } from 'lucide-react';
import { AuctionLogEvent } from '../hooks/useAuctionState';

interface AIAnalysisTabProps {
  log: AuctionLogEvent[];
  teams: any[];
}

interface TeamGrade {
  teamId: number;
  name: string;
  grade: string;
  score: number;
  reason: string;
}

export default function AIAnalysisTab({ log, teams }: AIAnalysisTabProps) {
  
  // 1. Analyze Wins
  const wins = useMemo(() => {
    return log.filter(e => e.type === 'WIN');
  }, [log]);

  // 2. Identify "Steals" and "Overpays" (Mock Logic for now)
  // Real logic would compare price vs projected value.
  // Here we'll just flag extreme values for demo.
  const notableTransactions = useMemo(() => {
      // Mock "Value" as just random distribution around $15 for now since we lack projections
      // In real app, pass 'players' with values.
      return wins.map(w => {
          const price = w.amount || 0;
          // Simple heuristic: If price < 5 it's a "Projected Steal". If > 40 it's "Premium Pay".
          let type: 'STEAL' | 'OVERPAY' | 'FAIR' = 'FAIR';
          if (price < 5) type = 'STEAL';
          if (price > 40) type = 'OVERPAY';
          
          return { ...w, type };
      });
  }, [wins]);


  // 3. Team Grades
  const teamGrades: TeamGrade[] = useMemo(() => {
      return teams.map(t => {
          // Heuristic: Fill roster efficiently?
          // Grade S: > 20 players, solid budget management
          // Grade A: > 15 players
          // Grade B: > 10 players
          // Grade C: < 10 players
          
          let grade = 'C';
          let score = 70;
          
          if (t.rosterCount > 10) { grade = 'B'; score = 80; }
          if (t.rosterCount > 15) { grade = 'A'; score = 90; }
          if (t.rosterCount > 20) { grade = 'A+'; score = 95; }
          
          // Budget Penalty: If 0 budget but slots left
          if (t.budget <= 0 && t.spotsLeft > 0) {
              grade = 'D';
              score = 60;
          }

          return {
              teamId: t.id,
              name: t.name,
              grade,
              score,
              reason: `${t.rosterCount} Players, $${t.budget} Left`
          };
      }).sort((a,b) => b.score - a.score);
  }, [teams]);


  return (
    <div className="h-full overflow-auto p-4 space-y-8 bg-[var(--lg-glass-bg)] text-[var(--lg-text-primary)]">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--lg-table-border)] pb-4">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2 text-purple-400">
                <Award className="w-6 h-6" />
                AI Auction Analysis
            </h3>
            <p className="text-xs text-[var(--lg-text-muted)] mt-1">
                Real-time evaluation of auction performance and roster construction.
            </p>
          </div>
          <div className="text-right">
             <div className="text-xs text-[var(--lg-text-muted)]">Transactions Analyzed</div>
             <div className="font-bold text-lg">{wins.length}</div>
          </div>
      </div>

      {/* Team Grades */}
      <section>
          <h4 className="text-sm font-bold uppercase tracking-wider text-[var(--lg-text-muted)] mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Live Team Grades
          </h4>
          <div className="grid grid-cols-1 gap-3">
              {teamGrades.map(t => (
                  <div key={t.teamId} className="flex items-center justify-between p-3 bg-[var(--lg-bg-secondary)] rounded-lg border border-[var(--lg-table-border)]">
                      <div className="flex items-center gap-3">
                          <div className={`
                             w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg border-2
                             ${t.grade.startsWith('A') ? 'border-green-500 text-green-500 bg-green-500/10' : 
                               t.grade.startsWith('B') ? 'border-blue-500 text-blue-500 bg-blue-500/10' :
                               t.grade.startsWith('C') ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10' :
                               'border-red-500 text-red-500 bg-red-500/10'}
                          `}>
                              {t.grade}
                          </div>
                          <div>
                              <div className="font-bold">{t.name}</div>
                              <div className="text-xs text-[var(--lg-text-muted)]">{t.reason}</div>
                          </div>
                      </div>
                      <div className="text-xs font-mono opacity-50">SCORE: {t.score}</div>
                  </div>
              ))}
          </div>
      </section>

      {/* Notable Transactions */}
      <section>
          <h4 className="text-sm font-bold uppercase tracking-wider text-[var(--lg-text-muted)] mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Notable Moves
          </h4>
          <div className="space-y-2">
               {notableTransactions.filter(t => t.type !== 'FAIR').length === 0 && (
                   <div className="text-sm text-[var(--lg-text-muted)] italic">No notable steals or overpays yet.</div>
               )}
               {notableTransactions.filter(t => t.type !== 'FAIR').slice(0, 5).map((t, i) => (
                   <div key={i} className="flex items-center justify-between p-2 text-sm border-b border-[var(--lg-table-border)]/50 last:border-0">
                       <div className="flex items-center gap-2">
                           {t.type === 'STEAL' ? <TrendingUp className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-orange-500" />}
                           <span><span className="font-bold">{t.playerName}</span> to {t.teamName}</span>
                       </div>
                       <div className="font-mono">
                           ${t.amount} <span className="text-[var(--lg-text-muted)] text-xs">({t.type})</span>
                       </div>
                   </div>
               ))}
          </div>
      </section>

    </div>
  );
}
