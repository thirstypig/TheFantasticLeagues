// client/src/features/teams/components/RosterHub/types.ts
//
// Shared types for the RosterHub component family. Designed for the
// hub-and-spokes Team page redesign per
// `docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md` §0.
//
// Props-driven so PR2 can pass real data + handlers without
// restructuring. The static design preview at `/design/roster-hub`
// feeds these same components mock state.

import type { SlotCode } from "../../../../lib/positionEligibility";

/**
 * Snapshot of a roster row used by the table. `assignedSlot` may be a
 * structural slot (`IL`) when the player sits in an IL section. The
 * preview models active rows with a SlotCode and IL rows with `"IL"`.
 */
export interface RosterHubPlayer {
  rosterId: number;
  playerId: number;
  name: string;
  /** Comma-separated eligible positions per `Player.posList` (e.g. "OF,2B"). */
  posList: string;
  posPrimary: string;
  /** Current lineup assignment — SlotCode for active rows, "IL" for IL pool. */
  assignedSlot: SlotCode | "IL";
  /** Optional duplicate-instance index for multi-capacity slots (OF1/OF2/OF3). */
  slotInstance?: number;
  mlbTeam?: string;
  /** Stat snapshot — display-only, free-form short string ("28 HR · .284 AVG"). */
  statSnapshot?: string;
  /** Keeper visual flag (gold ring + ★ glyph). */
  isKeeper?: boolean;
}

/**
 * One queued change. Records both endpoints of a swap so the UI can
 * highlight source + destination rows. `kind: "swap"` covers the
 * canonical case; future kinds (`drop`, `add`, `il-stash`) plug in
 * here without restructuring callers.
 */
export interface PendingChange {
  id: string;
  kind: "swap";
  /** rosterId of the moving player. */
  movingRosterId: number;
  /** rosterId of the displaced player (the row that the moving player landed on). */
  displacedRosterId: number;
  /** Where the moving player came from. */
  fromSlot: SlotCode;
  /** Where the moving player landed. */
  toSlot: SlotCode;
}

/**
 * The 8 visual states demonstrated by the preview's floating toggler.
 * Each maps to an annotated snapshot of mock state below.
 */
export type RosterHubPreviewState =
  | "idle"
  | "playerSelected"
  | "pendingSingle"
  | "pendingMultiple"
  | "dragging"
  | "rowMenuOpen"
  | "mobile"
  | "freeAgentPanel";

/**
 * Free-floating drag state used by the preview only. PR2's drag
 * handling will use `@dnd-kit`'s native `DragOverlay`; the preview
 * fakes this with a positioned ghost element.
 */
export interface DragSimState {
  rosterId: number;
  /** CSS top/left offsets for the ghost card relative to the viewport. */
  ghostX: number;
  ghostY: number;
}
