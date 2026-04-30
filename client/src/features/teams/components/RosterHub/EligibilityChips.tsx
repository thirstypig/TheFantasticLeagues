// client/src/features/teams/components/RosterHub/EligibilityChips.tsx
//
// Row of small chips listing every SlotCode a player is eligible for.
// Uses `slotsFor()` from `client/src/lib/positionEligibility.ts` so the
// preview honors the same eligibility ladder PR2 will respect (Rules
// 1/2/3 surface as `Player.posList` upstream).

import { useMemo } from "react";
import { slotsFor, type SlotCode } from "../../../../lib/positionEligibility";

interface EligibilityChipsProps {
  /** Comma-separated `posList` (e.g. "OF,2B"). */
  posList: string;
  /**
   * Optional active highlighting set — chips for these slots render
   * with the iridescent ring. Used when the preview wants to show
   * "this row's player could move into [SlotCode]" alongside the row.
   */
  activeSlots?: ReadonlySet<SlotCode>;
}

/**
 * Renders one small chip per eligible slot. Memoized via the parent
 * `RosterRow` (`React.memo`) and stable inputs — `slotsFor()` is
 * pure — so this stays cheap inside a 23-row table.
 */
export function EligibilityChips({ posList, activeSlots }: EligibilityChipsProps) {
  const slots = useMemo(() => Array.from(slotsFor(posList)), [posList]);
  if (slots.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {slots.map((slot) => {
        const isActive = activeSlots?.has(slot);
        return (
          <span
            key={slot}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 7px",
              borderRadius: 99,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 0.4,
              color: isActive ? "var(--am-text)" : "var(--am-text-muted)",
              background: isActive ? "var(--am-chip-strong)" : "var(--am-chip)",
              border: "1px solid " + (isActive ? "var(--am-border-strong)" : "var(--am-border)"),
            }}
          >
            {slot}
          </span>
        );
      })}
    </div>
  );
}
