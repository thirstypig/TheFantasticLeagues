/**
 * Shared accordion component for IL Report and Minors Report.
 * Renders a collapsible list of roster alerts with team-colored styling.
 */

export interface RosterAlertPlayer {
  playerName: string;
  mlbId: number | null;
  mlbTeam: string;
  position: string;
  mlbStatus: string;
  isInjured: boolean;
  isMinors: boolean;
  ilPlacedDate: string | null;
  ilDays: number | null;
  ilInjury: string | null;
  ilEligibleReturn: string | null;
  ilReplacement: string | null;
}

interface RosterAlertAccordionProps {
  players: RosterAlertPlayer[];
  colorScheme: "red" | "amber";
  label: string;
  maxDisplay?: number;
  mlbHeadshot: (mlbId: number | null | undefined) => string;
}

export default function RosterAlertAccordion({
  players,
  colorScheme,
  label,
  maxDisplay = 6,
  mlbHeadshot,
}: RosterAlertAccordionProps) {
  if (players.length === 0) return null;

  const colors = colorScheme === "red"
    ? { bg: "bg-red-500/5", border: "border-red-500/15", label: "text-red-400", headBorder: "border-red-500/20" }
    : { bg: "bg-amber-500/5", border: "border-amber-500/15", label: "text-amber-400", headBorder: "border-amber-500/20" };

  return (
    <div>
      <p className={`text-[9px] font-bold uppercase tracking-widest ${colors.label} mb-2`}>{label}</p>
      <div className="space-y-1">
        {players.slice(0, maxDisplay).map((p, i) => {
          const ilMatch = (p.mlbStatus || "").match(/(\d+)/);
          const statusLabel = colorScheme === "red"
            ? (ilMatch ? `${ilMatch[1]}-Day IL` : "IL")
            : "Minors";
          const eligDate = p.ilEligibleReturn ? new Date(p.ilEligibleReturn + "T12:00:00") : null;
          const eligStr = eligDate ? eligDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
          const placedDate = p.ilPlacedDate ? new Date(p.ilPlacedDate + "T12:00:00") : null;
          const placedStr = placedDate ? placedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;

          return (
            <details key={i} className={`${colors.bg} ${colors.border} border rounded-lg group`}>
              <summary className="flex items-center gap-2 p-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <img
                  src={mlbHeadshot(p.mlbId)}
                  alt={p.playerName}
                  className={`w-6 h-6 rounded-full object-cover flex-shrink-0 bg-[var(--lg-bg-card)] ${colors.headBorder} border opacity-60`}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-semibold text-[var(--lg-text-primary)]">{p.playerName}</span>
                  <span className={`text-[9px] ${colors.label} font-bold ml-1.5`}>{statusLabel}</span>
                </div>
                <svg className="w-3 h-3 text-[var(--lg-text-muted)] transition-transform group-open:rotate-180 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="text-[10px] text-[var(--lg-text-muted)] space-y-0.5 px-2 pb-2 ml-8">
                {colorScheme === "red" && p.ilInjury && <div className="text-red-300/80">{p.ilInjury}</div>}
                {colorScheme === "red" && placedStr && <div>Placed: {placedStr}</div>}
                {colorScheme === "red" && eligStr && <div>Eligible: <span className="text-[var(--lg-text-secondary)] font-medium">{eligStr}</span></div>}
                {colorScheme === "amber" && <div className="text-amber-300/80">{p.mlbStatus || "Minor League Assignment"}</div>}
                {colorScheme === "amber" && <div>Position: {p.position} · {p.mlbTeam}</div>}
                {p.ilReplacement && (
                  <div className="text-[var(--lg-text-secondary)]">
                    Replacement: <span className="font-medium">{p.ilReplacement}</span>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
