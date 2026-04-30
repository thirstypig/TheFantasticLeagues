// client/src/features/teams/components/RosterHub/PositionPill.tsx
//
// The interactive position pill — Yahoo's actual production model
// (per best-practices-researcher §0). Tapping a pill selects the
// player; eligible destination slots glow across the table.
//
// Three visual variants:
//   - default  → a normal chip (idle table)
//   - selected → iridescent fill (this player is the focus)
//   - eligible → iridescent ring (a different player is selected and
//                  THIS row is a legal destination)
//
// Touch target ≥ 44×44 enforced via CSS (see `rosterHub.css`).

import type { CSSProperties } from "react";
import type { SlotCode } from "../../../../lib/positionEligibility";

interface PositionPillProps {
  /** Slot label rendered inside the pill (typically the row's `assignedSlot`). */
  slot: SlotCode | "IL";
  /** Click handler — selects this player (or commits a move on eligible rows). */
  onClick?: () => void;
  /** True when this pill represents the currently-selected player. */
  selected?: boolean;
  /** True when this row is a legal destination for the currently-selected player. */
  eligible?: boolean;
  /** True when another player is selected and this row is NOT eligible. */
  dimmed?: boolean;
  /** Optional override label (e.g. "P · SP" to surface pitcher kind). */
  label?: string;
  /** ARIA label override. Defaults to a sensible composition for screenreaders. */
  ariaLabel?: string;
  style?: CSSProperties;
}

export function PositionPill({
  slot,
  onClick,
  selected,
  eligible,
  dimmed,
  label,
  ariaLabel,
  style,
}: PositionPillProps) {
  // Aria intent: a pill is a button when interactive, an inert label
  // otherwise. Selected state surfaces via aria-pressed.
  const interactive = Boolean(onClick);

  return (
    <button
      type="button"
      className="am-roster-pill"
      data-selected={selected ? "true" : undefined}
      data-eligible={eligible && !selected ? "true" : undefined}
      data-dimmed={dimmed && !selected && !eligible ? "true" : undefined}
      onClick={onClick}
      disabled={!interactive}
      aria-pressed={selected ? "true" : undefined}
      aria-label={ariaLabel ?? `${label ?? slot} — tap to ${selected ? "deselect" : "select"} player`}
      style={style}
    >
      {label ?? slot}
    </button>
  );
}
