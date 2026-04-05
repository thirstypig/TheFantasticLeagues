import React, { useMemo, useRef, useEffect } from "react";
import type { DraftPickEntry } from "../api";

/** Position badge color mapping */
const POS_COLORS: Record<string, string> = {
  C: "bg-rose-500/15 text-rose-400",
  "1B": "bg-orange-500/15 text-orange-400",
  "2B": "bg-amber-500/15 text-amber-400",
  "3B": "bg-yellow-500/15 text-yellow-400",
  SS: "bg-lime-500/15 text-lime-400",
  LF: "bg-green-500/15 text-green-400",
  CF: "bg-emerald-500/15 text-emerald-400",
  RF: "bg-teal-500/15 text-teal-400",
  OF: "bg-green-500/15 text-green-400",
  DH: "bg-cyan-500/15 text-cyan-400",
  UT: "bg-slate-500/15 text-slate-400",
  P: "bg-blue-500/15 text-blue-400",
  SP: "bg-blue-500/15 text-blue-400",
  RP: "bg-indigo-500/15 text-indigo-400",
};

interface DraftBoardProps {
  picks: DraftPickEntry[];
  teamOrder: number[];
  totalRounds: number;
  teams: Record<number, string>;
  currentPickIndex: number;
  pickOrder: number[];
  myTeamId?: number;
}

export default function DraftBoard({
  picks,
  teamOrder,
  totalRounds,
  teams,
  currentPickIndex,
  pickOrder,
  myTeamId,
}: DraftBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Build a lookup: "round-teamId" -> pick entry
  const pickMap = useMemo(() => {
    const map = new Map<string, DraftPickEntry>();
    for (const p of picks) {
      map.set(`${p.round}-${p.teamId}`, p);
    }
    return map;
  }, [picks]);

  // Current pick info
  const currentTeamId = pickOrder[currentPickIndex];
  const currentRound = currentPickIndex < pickOrder.length
    ? Math.floor(currentPickIndex / teamOrder.length) + 1
    : totalRounds + 1;

  // Auto-scroll to keep current pick visible
  useEffect(() => {
    if (!containerRef.current) return;
    const currentCell = containerRef.current.querySelector("[data-current-pick]");
    if (currentCell) {
      currentCell.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [currentPickIndex]);

  const teamCount = teamOrder.length;

  return (
    <div className="rounded-xl border border-[var(--lg-border-subtle)] overflow-hidden">
      <div ref={containerRef} className="overflow-auto max-h-[600px]">
        <table className="w-full text-xs border-collapse" style={{ minWidth: `${teamCount * 110 + 50}px` }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 bg-[var(--lg-bg-card)] border-b border-r border-[var(--lg-border-faint)] px-2 py-2 text-[10px] font-bold uppercase text-[var(--lg-text-muted)] text-center w-[50px]">
                Rd
              </th>
              {teamOrder.map(teamId => (
                <th
                  key={teamId}
                  className={`bg-[var(--lg-bg-card)] border-b border-r border-[var(--lg-border-faint)] px-2 py-2 text-[10px] font-bold uppercase text-center whitespace-nowrap ${
                    teamId === myTeamId ? "text-[var(--lg-accent)]" : "text-[var(--lg-text-muted)]"
                  }`}
                >
                  {(teams[teamId] || `Team ${teamId}`).slice(0, 12)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: totalRounds }, (_, roundIdx) => {
              const round = roundIdx + 1;
              return (
                <tr key={round}>
                  <td className="sticky left-0 z-[5] bg-[var(--lg-bg-card)] border-b border-r border-[var(--lg-border-faint)] px-2 py-1 text-center font-bold text-[var(--lg-text-muted)] tabular-nums">
                    {round}
                  </td>
                  {teamOrder.map(teamId => {
                    const pick = pickMap.get(`${round}-${teamId}`);
                    const isCurrent = round === currentRound && teamId === currentTeamId && !pick;
                    const isMyTeamCol = teamId === myTeamId;
                    const posColor = pick?.position ? (POS_COLORS[pick.position] || "bg-slate-500/15 text-slate-400") : "";

                    return (
                      <td
                        key={`${round}-${teamId}`}
                        {...(isCurrent ? { "data-current-pick": true } : {})}
                        className={`border-b border-r border-[var(--lg-border-faint)] px-1.5 py-1 text-center min-w-[100px] transition-colors ${
                          isCurrent
                            ? "bg-[var(--lg-accent)]/10 ring-2 ring-inset ring-[var(--lg-accent)] animate-pulse"
                            : isMyTeamCol
                              ? "bg-[var(--lg-accent)]/[0.03]"
                              : ""
                        }`}
                      >
                        {pick ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-medium text-[var(--lg-text-primary)] truncate max-w-[90px] leading-tight">
                              {pick.playerName || "SKIP"}
                            </span>
                            {pick.position && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${posColor}`}>
                                {pick.position}
                              </span>
                            )}
                            {pick.isAutoPick && (
                              <span className="text-[8px] text-amber-400 font-bold">AUTO</span>
                            )}
                          </div>
                        ) : isCurrent ? (
                          <span className="text-[10px] font-bold text-[var(--lg-accent)] animate-pulse">
                            ON CLOCK
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
