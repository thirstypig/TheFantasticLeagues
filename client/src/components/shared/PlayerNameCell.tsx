import React from "react";

interface PlayerNameCellProps {
  position: string;
  name: string | undefined;
  /** Accepts boolean or truthy number (e.g. 1/0 from API) */
  isPitcher?: boolean | number;
  /** Extra classes on the outer wrapper */
  className?: string;
}

/**
 * Consistent position-badge + player-name display used in table cells.
 *
 * Expects the parent `<tr>` to have `className="group"` so the
 * hover highlight on the name works.
 */
export function PlayerNameCell({ position, name, isPitcher, className }: PlayerNameCellProps) {
  const badgeColor = !!isPitcher
    ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
    : "bg-blue-500/10 text-blue-400 border border-blue-500/20";

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <span
        className={`px-1 py-px rounded text-[8px] font-bold uppercase tracking-wide flex-shrink-0 ${badgeColor}`}
      >
        {position}
      </span>
      <span className="font-semibold text-[var(--lg-text-primary)] text-[11px] tracking-tight group-hover:text-[var(--lg-accent)] transition-colors leading-tight truncate">
        {name ?? ""}
      </span>
    </div>
  );
}
