// client/src/features/teams/components/RosterHub/PositionEligibilityCell.tsx
//
// v3 refinement #3 — merged Position + Eligibility column with games-played
// numbers. Replaces v2's separate `PositionPill` + `EligibilityChips` pair.
//
// Rendering example for a multi-position hitter:
//
//     [OF (12)] · 2B (3) · MI
//
// Where:
//   - The first chip is the row's *currently assigned* slot — rendered as
//     the iridescent "primary pill" (the click affordance, same as v2).
//   - Subsequent chips are other slots the player is eligible for.
//   - `(N)` is the games-played count at that position. Omitted on slots
//     without a meaningful GP threshold (e.g. MI, CM, DH) since the
//     eligibility comes from the underlying real position.
//
// Per §0.5 of the plan this column lives where v2 had two separate
// columns. The pill click contract is unchanged — tap the *primary*
// pill to select the player. Secondary chips are display-only.
//
// React.memo'd. Pure given (assignedSlot, posList, gp map identity) —
// the parent caches `gamesPlayedByPosition` per player so identity is
// stable across re-renders.

import React, { useMemo } from "react";
import { PositionPill } from "./PositionPill";
import { slotsFor, type SlotCode } from "../../../../lib/positionEligibility";
import type { SlotCode as WireSlotCode } from "@shared/api/rosterMoves";

interface PositionEligibilityCellProps {
  /** Comma-separated `Player.posList` (e.g. "OF,2B"). */
  posList: string;
  /**
   * Currently-assigned slot — rendered as the primary, interactive pill.
   * Accepts any wire SlotCode (BN, IL, SP, RP, plus the 10 eligibility
   * codes) since the row's assignment can be any of those.
   */
  assignedSlot: WireSlotCode;
  /** GP-by-position map. Omitted positions render without a count. */
  gamesPlayedByPosition?: Partial<Record<SlotCode, number>>;

  /** Visual state for the primary pill (mirrors v2's `PositionPill`). */
  selected: boolean;
  eligible: boolean;
  dimmed: boolean;
  onPillClick: () => void;
  ariaLabel?: string;
}

/**
 * Slots that cannot have a meaningful GP count attached because they're
 * structural rather than positional (MI = middle-infield flex, CM =
 * corner-man flex). DH similarly has no defensive GP threshold — Rule
 * eligibility comes from being a hitter, not from games played at DH.
 * Typed as `ReadonlySet<string>` so it accepts both eligibility-only
 * SlotCodes (used by `slotsFor`) and the broader wire SlotCode used by
 * `assignedSlot`.
 */
const NO_GP_SLOTS: ReadonlySet<string> = new Set(["MI", "CM", "DH"]);

function PositionEligibilityCellImpl({
  posList,
  assignedSlot,
  gamesPlayedByPosition,
  selected,
  eligible,
  dimmed,
  onPillClick,
  ariaLabel,
}: PositionEligibilityCellProps) {
  // The full set of slots this player is eligible for. The primary pill
  // is always the assigned slot; secondary chips are the rest.
  const eligibleSlots = useMemo(() => slotsFor(posList), [posList]);

  // Order: primary first, then everything else in `slotsFor` order
  // minus the primary.
  const secondarySlots: SlotCode[] = useMemo(() => {
    const out: SlotCode[] = [];
    for (const s of eligibleSlots) {
      if (s !== assignedSlot) out.push(s);
    }
    return out;
  }, [eligibleSlots, assignedSlot]);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
        rowGap: 4,
      }}
    >
      {/* Primary pill — the assigned slot. Stays interactive. */}
      <PositionPill
        slot={assignedSlot}
        selected={selected}
        eligible={eligible && !selected}
        dimmed={dimmed}
        onClick={onPillClick}
        label={formatPrimaryLabel(assignedSlot, gamesPlayedByPosition)}
        ariaLabel={ariaLabel}
      />

      {/* Inter-pill separator dot, only when there are secondaries. */}
      {secondarySlots.length > 0 && (
        <span
          aria-hidden
          style={{ color: "var(--am-text-faint)", fontSize: 11, lineHeight: 1 }}
        >
          ·
        </span>
      )}

      {/* Secondary eligibility chips — small, non-interactive. */}
      {secondarySlots.map((slot, idx) => (
        <React.Fragment key={slot}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: "2px 8px",
              borderRadius: 99,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 0.4,
              color: "var(--am-text-muted)",
              background: "var(--am-chip)",
              border: "1px solid var(--am-border)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span>{slot}</span>
            {renderGpSuffix(slot, gamesPlayedByPosition)}
          </span>
          {idx < secondarySlots.length - 1 && (
            <span
              aria-hidden
              style={{ color: "var(--am-text-faint)", fontSize: 11, lineHeight: 1 }}
            >
              ·
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/**
 * Build the primary-pill label including the GP count for the assigned
 * slot. `IL` and structural slots render without parens.
 */
function formatPrimaryLabel(
  slot: WireSlotCode,
  gp?: Partial<Record<SlotCode, number>>,
): string {
  if (slot === "IL") return "IL";
  if (NO_GP_SLOTS.has(slot)) return slot;
  // Only eligibility-slot keys can have a GP count (the gp map is keyed on
  // them). Structural / pitcher sub-codes fall through with no count.
  const n = gp?.[slot as SlotCode];
  if (n == null) return slot;
  return `${slot} (${n})`;
}

/**
 * Render the optional `(N)` suffix on a secondary chip. De-emphasized
 * via `--am-text-dim` (the spec calls this out specifically — GP
 * numbers should be present-but-quiet, not loud).
 */
function renderGpSuffix(
  slot: SlotCode,
  gp?: Partial<Record<SlotCode, number>>,
): React.ReactNode {
  if (NO_GP_SLOTS.has(slot)) return null;
  const n = gp?.[slot];
  if (n == null) return null;
  return (
    <span
      style={{
        color: "var(--am-text-dim, var(--am-text-faint))",
        fontWeight: 500,
      }}
    >
      ({n})
    </span>
  );
}

export const PositionEligibilityCell = React.memo(PositionEligibilityCellImpl);
