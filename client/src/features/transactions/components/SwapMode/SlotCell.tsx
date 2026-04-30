// client/src/features/transactions/components/SwapMode/SlotCell.tsx
//
// Individual slot tile rendering an occupant's name, eligibility chips,
// and (visual) state per the §8 Aurora spec. Pure props in / JSX out —
// no business logic, no data fetching. PR2 will reuse this component
// untouched and pass real props + onClick handlers from a state hook.

import { CSSProperties } from "react";
import { Chip } from "../../../../components/aurora/atoms";
import { slotsFor, type SlotCode } from "../../../../lib/positionEligibility";
import type { SwapModePlayer } from "./types";

export interface SlotCellProps {
  /** Canonical slot code (e.g. "OF", "P", "MI"). */
  slotCode: SlotCode;
  /**
   * Disambiguates multi-capacity slots when more than one cell shares a
   * `slotCode` (OF×3, P×9). Used in the visible slot label only.
   */
  instanceIndex?: number;
  /** Occupant or null for empty slot. */
  occupant: SwapModePlayer | null;
  /** Visual state — determines border / ring / opacity treatment. */
  selected?: boolean;
  eligibleHighlight?: boolean;
  ineligibleDimmed?: boolean;
  pendingSource?: boolean;
  pendingDest?: boolean;
  pulseChanged?: boolean;
  /** Show drag-handle indicator (pitcher card layout). */
  dragHandle?: boolean;
  /** Visual click — preview wires this to its toggle store. */
  onClick?: () => void;
}

/**
 * Slot label visible in the cell footer — "OF1" / "OF2" / "P3" etc.
 * Single-capacity slots (C, 1B, MI, ...) drop the index entirely.
 */
function slotLabel(code: SlotCode, idx?: number): string {
  if (idx == null) return code;
  // OF and P are the two known multi-capacity slots; all others are 1-cap.
  if (code === "OF" || code === "P") return `${code}${idx + 1}`;
  return code;
}

export function SlotCell({
  slotCode,
  instanceIndex,
  occupant,
  selected,
  eligibleHighlight,
  ineligibleDimmed,
  pendingSource,
  pendingDest,
  pulseChanged,
  dragHandle,
  onClick,
}: SlotCellProps) {
  const eligibleSlots = occupant ? slotsFor(occupant.posList) : new Set<SlotCode>();
  const eligibleArr = Array.from(eligibleSlots);

  // Compose the cell's outer style based on visual state. Each state
  // listed in priority order matches the §8 spec; later states stack
  // ring colors via box-shadow rather than fighting border priority.
  const baseStyle: CSSProperties = {
    position: "relative",
    padding: 12,
    borderRadius: 14,
    background: "var(--am-surface-faint)",
    border: "1px solid var(--am-border)",
    cursor: onClick ? "pointer" : "default",
    transition: "transform 200ms ease, box-shadow 200ms ease, opacity 200ms ease, filter 200ms ease",
    minHeight: 84,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };

  // Layered visual states. Order matters — later spreads override.
  if (ineligibleDimmed) {
    baseStyle.opacity = 0.4;
    baseStyle.filter = "grayscale(0.8)";
  }
  if (eligibleHighlight) {
    // Animated iridescent border per --am-glow (token note: --am-glow
    // doesn't exist in aurora.css yet; we use --am-irid + a subtle
    // animation. PR2 should formalize --am-glow as the eligible-slot
    // pulse if design wants a distinct token.)
    baseStyle.background = "var(--am-surface)";
    baseStyle.boxShadow = "0 0 0 2px rgba(74,140,255,0.55), 0 0 22px rgba(138,43,214,0.25)";
    baseStyle.animation = "am-glow-pulse 2.4s ease-in-out infinite";
  }
  if (pendingSource || pendingDest) {
    baseStyle.background = "var(--am-surface)";
    baseStyle.outline = "2px dashed transparent";
    baseStyle.outlineOffset = "-2px";
    // Using a CSS variable trick: paint a dashed iridescent border via
    // background-clip on a wrapper would be cleaner, but for the static
    // preview a solid box-shadow + dashed outline reads correctly.
    baseStyle.boxShadow = "0 0 0 2px rgba(214,43,155,0.65), 0 0 18px rgba(74,140,255,0.30)";
    baseStyle.borderStyle = "dashed";
    baseStyle.borderColor = "rgba(214,43,155,0.7)";
  }
  if (selected) {
    baseStyle.transform = "scale(1.04)";
    // Ringed iridescent treatment matches AuctionStage PR #157.
    baseStyle.boxShadow = "0 0 0 2px transparent, 0 14px 32px rgba(0,0,0,0.22), 0 0 0 3px rgba(255,255,255,0.04) inset";
    baseStyle.background = "var(--am-surface-strong)";
  }
  if (pulseChanged) {
    baseStyle.animation = "am-pulse-changed 1.6s ease-out 3";
  }

  // Keeper accent — gold ring per Q7. amber-400 fallback because there
  // is no Aurora --am-positive-warm token; TODO: surface a token if the
  // gold treatment proves load-bearing for keepers across other screens.
  const keeperRing = occupant?.isKeeper
    ? { boxShadow: `${baseStyle.boxShadow ? baseStyle.boxShadow + ", " : ""}0 0 0 2px #fbbf24` }
    : null;

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${slotLabel(slotCode, instanceIndex)}${occupant ? ` — ${occupant.name}` : " — empty"}`}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{ ...baseStyle, ...keeperRing }}
    >
      {/* Iridescent ring overlay for selected state — sits above
          background but below content. Done as a child div rather than
          ::before so we can tune layering inline. */}
      {selected && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: -2,
            borderRadius: 16,
            padding: 2,
            background: "var(--am-irid)",
            // mask-composite trick to create a gradient ring border
            WebkitMask:
              "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Header row — slot label + drag handle (if pitcher) + keeper star. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "var(--am-text-faint)",
            fontWeight: 600,
          }}
        >
          {slotLabel(slotCode, instanceIndex)}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {occupant?.isKeeper && (
            <span
              aria-label="Keeper"
              title="Keeper"
              style={{ fontSize: 12, color: "#fbbf24", lineHeight: 1 }}
            >
              ★
            </span>
          )}
          {dragHandle && (
            <span
              aria-hidden
              title="Drag to reorder"
              style={{
                fontSize: 12,
                color: "var(--am-text-faint)",
                cursor: "grab",
                userSelect: "none",
                lineHeight: 1,
              }}
            >
              ⋮⋮
            </span>
          )}
        </div>
      </div>

      {/* Occupant name + MLB team. */}
      {occupant ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--am-text)",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {occupant.name}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--am-text-faint)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {occupant.mlbTeam && <span>{occupant.mlbTeam}</span>}
            {occupant.pitcherKind && <span>· {occupant.pitcherKind}</span>}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--am-text-faint)", fontStyle: "italic" }}>empty</div>
      )}

      {/* Eligibility chip row — small pills showing every slot the
          occupant can play. Demo of "valid slots light up" north star. */}
      {occupant && eligibleArr.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: "auto" }}>
          {eligibleArr.map((s) => (
            <Chip
              key={s}
              style={{
                fontSize: 9,
                padding: "2px 6px",
                background: s === slotCode ? "var(--am-chip-strong)" : "var(--am-chip)",
                color: s === slotCode ? "var(--am-text)" : "var(--am-text-muted)",
              }}
            >
              {s}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
