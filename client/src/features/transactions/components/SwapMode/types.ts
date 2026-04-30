// client/src/features/transactions/components/SwapMode/types.ts
//
// Shared types for the SwapMode component family. Designed to be
// consumed by both the static design preview at `/design/swap-mode`
// AND the eventual PR2 production wiring (which will plug real roster
// data + a `POST /api/teams/:teamId/lineup` endpoint into the same
// component tree).
//
// Plan reference: docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md
// §5B (Swap Mode UI) and §8 (Aurora visual spec).

import type { SlotCode } from "../../../../lib/positionEligibility";

/**
 * A slot occupant — minimal shape needed to render a SlotCell. Uses
 * `rosterId` rather than `playerId` because the Roster row identity is
 * what the lineup endpoint needs (a player can't appear twice on the
 * same team but the rosterId is still the canonical key).
 */
export interface SwapModePlayer {
  rosterId: number;
  playerId: number;
  name: string;
  /** Comma-separated eligible positions per `Player.posList` (e.g. "OF,2B"). */
  posList: string;
  /** MLB team abbr — purely for display; does not affect eligibility. */
  mlbTeam?: string;
  /** Keeper visual flag (gold ring + ★ glyph per resolved decision Q7). */
  isKeeper?: boolean;
  /**
   * Pitcher subtype label — "SP" / "RP" / "CL" — used as a display chip
   * on Pitcher cells. NOT used for slot-fit logic; all P-eligible players
   * collapse to the single `P` SlotCode per `positionToSlots`.
   */
  pitcherKind?: "SP" | "RP" | "CL";
}

/**
 * One slot in a position group. `code` is the canonical SlotCode (C / 1B
 * / ... / DH / P). `instanceIndex` differentiates multi-capacity slots
 * — OF1/OF2/OF3 share `code: "OF"` but vary in instanceIndex 0/1/2.
 */
export interface SwapModeSlot {
  code: SlotCode;
  instanceIndex: number;
  /** rosterId of the current occupant, or null if empty. */
  occupantRosterId: number | null;
}

/**
 * Position group rendered as one glass card. Five groups per the §8
 * layout: Catchers, Infield, Outfield, Flex (MI/CM/DH), Pitchers.
 */
export interface SwapModePositionGroup {
  key: "catchers" | "infield" | "outfield" | "flex" | "pitchers";
  title: string;
  slots: SwapModeSlot[];
  /** Render hint — pitcher card uses drag-handle indicators per Q3. */
  layout: "grid" | "list-draggable";
}

/**
 * One queued swap. The preview models swaps as "player A goes to slot B,
 * the prior occupant of B (if any) backfills A's old slot." For the
 * static demo we only need the visual identity (which slots are dashed
 * iridescent) — real swap-resolution math lives in PR2 server-side.
 */
export interface PendingSwap {
  id: string;
  sourceSlot: { code: SlotCode; instanceIndex: number };
  destSlot: { code: SlotCode; instanceIndex: number };
  movingRosterId: number;
  displacedRosterId: number | null;
}

/**
 * Visual state machine for the preview's toggle UI. Lets the user cycle
 * through the seven canonical states in §5B without wiring real
 * interaction logic.
 */
export type PreviewState =
  | "idle"
  | "playerSelected"
  | "pendingSwapSingle"
  | "pendingSwapMultiple"
  | "keeperFlag"
  | "pitcherDragLayout"
  | "actionBar";
