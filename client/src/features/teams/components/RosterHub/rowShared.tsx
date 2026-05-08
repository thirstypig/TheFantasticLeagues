// client/src/features/teams/components/RosterHub/rowShared.tsx
//
// Shared pieces for `RosterRowV3` (desktop table row) and `MobileRowV3`
// (mobile flex card). Per todo #127, the two row variants had drifted
// duplicate copies of the action-menu state machine, the keeper-star /
// pending-dot name decoration, the class-name builder, and the revert /
// kebab affordances. A full collapse into a single component with a
// `layout` prop was rejected: the container element type (`<tr>` vs
// `<div>`), drag-handle position, expand affordance, and stat-cell
// rendering are genuinely divergent and a unified render path would
// require conditional logic on nearly every line of JSX.
//
// Instead, this module exports the truly shared pieces as small hooks
// and components. Each variant remains a thin shell that wires its
// container-specific markup around these shared bits — so a bug fix to
// the keeper star, action menu, or revert button only has to land in
// one place.

import React, { useRef, useState } from "react";
import { RowActionMenu, type RowAction } from "./RowActionMenu";
import type { RosterHubPlayer } from "./types";

/**
 * State + handlers for the `…` action-menu trigger. Both row variants
 * render the same kebab button + `RowActionMenu` popover; the only
 * difference was a duplicate `useState`/`useRef`/`onTriggerClick` body
 * in each file. Hoisting it here is the smallest refactor that removes
 * the duplication.
 */
export function useActionMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const onTriggerClick = () => {
    if (triggerRef.current) {
      setAnchorRect(triggerRef.current.getBoundingClientRect());
    }
    setMenuOpen(true);
  };

  const close = () => setMenuOpen(false);

  return { menuOpen, triggerRef, anchorRect, onTriggerClick, close };
}

/**
 * Builds the row-state class list shared by both variants. The mobile
 * variant prepends `am-roster-mobile-row` as a base class, so callers
 * can pass `base` to seed the list. The desktop variant additionally
 * tracks `isDragSource`/`isDropTarget` from a non-DnD source (e.g. the
 * legacy keyboard selection model); those are passed via `extra` to
 * keep this helper allocation-free for the mobile path.
 */
export function buildRowClasses(opts: {
  base?: string;
  isPending: boolean;
  isEligible: boolean;
  isDimmed: boolean;
  isDragging?: boolean;
  isOverEligible?: boolean;
  isShakeRejecting?: boolean;
  /** Desktop-only: legacy non-DnD drag source flag. */
  isDragSource?: boolean;
  /** Desktop-only: legacy non-DnD drop target flag. */
  isDropTarget?: boolean;
}): string {
  const classes: string[] = [];
  if (opts.base) classes.push(opts.base);
  if (opts.isPending) classes.push("am-roster-row-pending");
  if (opts.isEligible && !opts.isPending) classes.push("am-roster-row-eligible");
  if (opts.isDimmed) classes.push("am-roster-row-dimmed");
  if (opts.isDragSource || opts.isDragging) classes.push("am-roster-row-dragging-source");
  if (opts.isDropTarget || opts.isOverEligible) classes.push("am-roster-row-drop-target");
  if (opts.isShakeRejecting) classes.push("am-roster-row-shake");
  return classes.join(" ");
}

/**
 * Inline name decoration: pending-dot marker + keeper star, followed by
 * the player name. Both row variants render the same prefix sequence;
 * desktop wraps it in a `<button>` for the expand-on-click affordance
 * while mobile uses a plain `<span>` — so this helper returns just the
 * inner content (markers + name text) and lets each variant decide on
 * the wrapping element.
 */
export function PlayerNameContent({
  player,
  isPending,
}: {
  player: RosterHubPlayer;
  isPending: boolean;
}): React.ReactElement {
  return (
    <>
      {isPending && <span aria-hidden className="am-roster-name-modified-marker" />}
      {player.isKeeper && (
        <span aria-label="Keeper" style={{ color: "#fbbf24", marginRight: 6 }}>
          ★
        </span>
      )}
      {player.name}
    </>
  );
}

/**
 * Subtitle line under the player name: MLB team abbr + primary
 * position, joined by a middle-dot. Identical markup in both variants.
 */
export function PlayerSubtitle({ player }: { player: RosterHubPlayer }): React.ReactElement {
  return (
    <span style={{ fontSize: 11, color: "var(--am-text-faint)", letterSpacing: 0.4 }}>
      {(player.mlbTeam ?? "FA") + " · " + player.posPrimary}
    </span>
  );
}

/**
 * Inline ↩ revert button rendered when a row has a pending change.
 * Identical in both variants — same class, label, and icon.
 */
export function RevertButton({
  player,
  onRevert,
}: {
  player: RosterHubPlayer;
  onRevert: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className="am-roster-revert-button"
      onClick={onRevert}
      aria-label={`Revert pending change for ${player.name}`}
      title="Revert this change"
    >
      ↩
    </button>
  );
}

/**
 * Kebab `…` menu trigger + `RowActionMenu` popover. Both variants
 * render this identical pair — the only difference was the duplicate
 * `useState`/`useRef`/`onTriggerClick` plumbing that `useActionMenu`
 * now centralizes.
 */
export function ActionMenuTrigger({
  player,
  actions,
}: {
  player: RosterHubPlayer;
  actions: RowAction[];
}): React.ReactElement | null {
  const { menuOpen, triggerRef, anchorRect, onTriggerClick, close } = useActionMenu();

  if (actions.length === 0) return null;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="am-roster-action-trigger"
        onClick={onTriggerClick}
        aria-label={`Open actions menu for ${player.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        …
      </button>
      <RowActionMenu actions={actions} open={menuOpen} onClose={close} anchorRect={anchorRect} />
    </>
  );
}
