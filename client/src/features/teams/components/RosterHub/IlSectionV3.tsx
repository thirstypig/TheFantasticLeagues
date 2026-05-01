// client/src/features/teams/components/RosterHub/IlSectionV3.tsx
//
// IL section for the v3 layout. Same affordances as v2's `IlSection`
// but uses `PositionEligibilityCell` for consistency with the
// consolidated table above. IL rows render with a Status column
// (e.g. "Injured 10-Day") in place of season stats.
//
// IL scenario (this PR) wires up drag affordance:
//   - IL rows are draggable (encodeIlDndId(rosterId)) → dropping on an
//     active hub row queues an `il_activate` PendingChange.
//   - Empty IL slots are droppable (encodeIlEmptyDndId(idx)) → dragging
//     an injured Hub row onto one queues an `il_stash` PendingChange.
//   - Empty IL slots show a "Drop here to stash" affordance only while
//     a stash-eligible drag is in flight (driven by `ilStashEligible`).

import { Glass, SectionLabel } from "../../../../components/aurora/atoms";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { PositionEligibilityCell } from "./PositionEligibilityCell";
import { RowActionMenu, type RowAction } from "./RowActionMenu";
import { useRef, useState, useMemo } from "react";
import type { RosterHubPlayer } from "./types";
import { encodeIlDndId, encodeIlEmptyDndId } from "../../hooks/useRosterHubDrag";

interface IlSectionV3Props {
  players: RosterHubPlayer[];
  selectedRosterId: number | null;
  eligibleRosterIds: ReadonlySet<number>;
  pendingRosterIds: ReadonlySet<number>;
  isMobile: boolean;
  totalSlots: number;
  onPillClick: (rosterId: number) => void;
  buildActions: (player: RosterHubPlayer) => RowAction[];
  onRevert?: (rosterId: number) => void;
  /** When true, IL rows are draggable (IL → activate flow) and empty
   *  slots are droppable (Hub → stash flow). Caller MUST render the
   *  hub inside a `<DndContext>` and supply `useRosterHubDrag`. */
  dndEnabled?: boolean;
  /** True when the active drag is a stash-eligible Hub row — empty IL
   *  slots highlight the "Drop here to stash" affordance. */
  ilStashEligible?: boolean;
  /** rosterId currently in shake-reject state (cleared 400ms after drop). */
  shakeRowId?: number | null;
}

export function IlSectionV3({
  players,
  selectedRosterId,
  eligibleRosterIds,
  pendingRosterIds,
  isMobile,
  totalSlots,
  onPillClick,
  buildActions,
  onRevert,
  dndEnabled,
  ilStashEligible,
  shakeRowId,
}: IlSectionV3Props) {
  const empties = Math.max(0, totalSlots - players.length);

  return (
    <Glass padded={false} style={{ overflow: "visible" }}>
      <div style={{ padding: 16, paddingBottom: 6 }}>
        <SectionLabel>✦ Injured List · {totalSlots} slots</SectionLabel>
        <p style={{ margin: 0, fontSize: 12, color: "var(--am-text-muted)" }}>
          IL slots are out-of-band — players here don't count toward the 23-active limit.
        </p>
      </div>

      <div style={{ padding: "8px 16px 12px" }}>
        {isMobile ? (
          <div>
            {players.map((p) => (
              <IlMobileRow
                key={p.rosterId}
                player={p}
                isSelected={selectedRosterId === p.rosterId}
                isEligible={eligibleRosterIds.has(p.rosterId)}
                isDimmed={
                  selectedRosterId != null &&
                  !eligibleRosterIds.has(p.rosterId) &&
                  selectedRosterId !== p.rosterId
                }
                isPending={pendingRosterIds.has(p.rosterId)}
                isShakeRejecting={shakeRowId === p.rosterId}
                onPillClick={() => onPillClick(p.rosterId)}
                onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                actions={buildActions(p)}
                dndEnabled={!!dndEnabled}
              />
            ))}
            {Array.from({ length: empties }).map((_, i) => (
              <EmptyIlMobileRow
                key={`empty-${i}`}
                index={i}
                dndEnabled={!!dndEnabled}
                ilStashEligible={!!ilStashEligible}
              />
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              aria-label="Injured list roster"
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                tableLayout: "fixed",
                minWidth: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <thead>
                <tr>
                  {[
                    { key: "pos", label: "Pos · Eligibility", w: 220 },
                    { key: "name", label: "Player", w: 220 },
                    { key: "status", label: "Status", w: 220 },
                    { key: "act", label: "Actions", w: 80 },
                  ].map((c, idx) => (
                    <th
                      key={c.key}
                      scope="col"
                      style={{
                        textAlign: idx === 3 ? "right" : "left",
                        padding: "8px 12px",
                        fontSize: 10,
                        letterSpacing: 1.2,
                        textTransform: "uppercase",
                        color: "var(--am-text-muted)",
                        fontWeight: 600,
                        borderBottom: "1px solid var(--am-border)",
                        background: "var(--am-surface-faint)",
                        width: c.w,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const isSelected = selectedRosterId === p.rosterId;
                  const isEligible = eligibleRosterIds.has(p.rosterId);
                  const isDimmed =
                    selectedRosterId != null &&
                    !isEligible &&
                    !isSelected;
                  const isPending = pendingRosterIds.has(p.rosterId);
                  const isShake = shakeRowId === p.rosterId;

                  const cls: string[] = [];
                  if (isPending) cls.push("am-roster-row-pending");
                  if (isEligible && !isPending) cls.push("am-roster-row-eligible");
                  if (isDimmed) cls.push("am-roster-row-dimmed");
                  if (isShake) cls.push("am-roster-row-shake");

                  return (
                    <IlDesktopRow
                      key={p.rosterId}
                      player={p}
                      classes={cls.join(" ")}
                      isSelected={isSelected}
                      isEligible={isEligible}
                      isDimmed={isDimmed}
                      isPending={isPending}
                      onPillClick={() => onPillClick(p.rosterId)}
                      onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                      actions={buildActions(p)}
                      dndEnabled={!!dndEnabled}
                    />
                  );
                })}
                {Array.from({ length: empties }).map((_, i) => (
                  <EmptyIlDesktopRow
                    key={`empty-${i}`}
                    index={i}
                    dndEnabled={!!dndEnabled}
                    ilStashEligible={!!ilStashEligible}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Glass>
  );
}

interface IlDesktopRowProps {
  player: RosterHubPlayer;
  classes: string;
  isSelected: boolean;
  isEligible: boolean;
  isDimmed: boolean;
  isPending: boolean;
  onPillClick: () => void;
  onRevert?: () => void;
  actions: RowAction[];
  dndEnabled: boolean;
}

function IlDesktopRow({
  player,
  classes,
  isSelected,
  isEligible,
  isDimmed,
  isPending,
  onPillClick,
  onRevert,
  actions,
  dndEnabled,
}: IlDesktopRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  // dnd-kit hook always called (rules-of-hooks); `disabled` toggles the
  // affordance. Same pattern as RosterHubV3's row adapter.
  const dndId = encodeIlDndId(player.rosterId);
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: dndId,
    disabled: !dndEnabled,
  });
  const rowStyle = useMemo<React.CSSProperties | undefined>(
    () =>
      transform
        ? {
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
            transition: "none",
            zIndex: 50,
          }
        : undefined,
    [transform],
  );

  return (
    <tr
      ref={setNodeRef as unknown as React.Ref<HTMLTableRowElement>}
      className={classes + (isDragging ? " am-roster-row-dragging" : "")}
      style={rowStyle}
      data-dnd-id={dndEnabled ? dndId : undefined}
    >
      <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--am-border)" }}>
        <PositionEligibilityCell
          posList={player.posList}
          assignedSlot={player.assignedSlot}
          gamesPlayedByPosition={player.gamesPlayedByPosition}
          selected={isSelected}
          eligible={isEligible && !isSelected}
          dimmed={isDimmed}
          onPillClick={onPillClick}
        />
      </td>
      <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--am-border)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>
            {isPending && <span aria-hidden className="am-roster-name-modified-marker" />}
            {player.isKeeper && (
              <span aria-label="Keeper" style={{ color: "#fbbf24", marginRight: 6 }}>
                ★
              </span>
            )}
            {player.name}
          </span>
          <span style={{ fontSize: 11, color: "var(--am-text-faint)", letterSpacing: 0.4 }}>
            {(player.mlbTeam ?? "FA") + " · " + player.posPrimary}
          </span>
        </div>
      </td>
      <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--am-border)", color: "var(--am-text-muted)", fontSize: 12 }}>
        {player.statSnapshot ?? "—"}
      </td>
      <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--am-border)", textAlign: "right" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
          {dndEnabled && (
            <button
              type="button"
              className="am-roster-drag-handle"
              aria-label={`Drag ${player.name} to activate from IL`}
              {...attributes}
              {...listeners}
              style={{
                cursor: "grab",
                fontSize: 14,
                padding: "4px 6px",
                border: "1px solid transparent",
                background: "transparent",
                color: "var(--am-text-muted)",
                lineHeight: 1,
              }}
            >
              ⋮⋮
            </button>
          )}
          {isPending && onRevert && (
            <button
              type="button"
              className="am-roster-revert-button"
              onClick={onRevert}
              aria-label={`Revert pending change for ${player.name}`}
            >
              ↩
            </button>
          )}
          <button
            type="button"
            ref={triggerRef}
            className="am-roster-action-trigger"
            onClick={() => {
              if (triggerRef.current) {
                setAnchorRect(triggerRef.current.getBoundingClientRect());
              }
              setMenuOpen(true);
            }}
            aria-label={`Open actions menu for ${player.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            …
          </button>
          <RowActionMenu actions={actions} open={menuOpen} onClose={() => setMenuOpen(false)} anchorRect={anchorRect} />
        </div>
      </td>
    </tr>
  );
}

interface IlMobileRowProps {
  player: RosterHubPlayer;
  isSelected: boolean;
  isEligible: boolean;
  isDimmed: boolean;
  isPending: boolean;
  isShakeRejecting: boolean;
  onPillClick: () => void;
  onRevert?: () => void;
  actions: RowAction[];
  dndEnabled: boolean;
}

function IlMobileRow({
  player,
  isSelected,
  isEligible,
  isDimmed,
  isPending,
  isShakeRejecting,
  onPillClick,
  onRevert,
  actions,
  dndEnabled,
}: IlMobileRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const dndId = encodeIlDndId(player.rosterId);
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: dndId,
    disabled: !dndEnabled,
  });
  const rowStyle = useMemo<React.CSSProperties | undefined>(
    () =>
      transform
        ? {
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
            transition: "none",
            zIndex: 50,
          }
        : undefined,
    [transform],
  );

  const classes = ["am-roster-mobile-row"];
  if (isPending) classes.push("am-roster-row-pending");
  if (isEligible && !isPending) classes.push("am-roster-row-eligible");
  if (isDimmed) classes.push("am-roster-row-dimmed");
  if (isShakeRejecting) classes.push("am-roster-row-shake");
  if (isDragging) classes.push("am-roster-row-dragging");

  return (
    <div ref={setNodeRef as unknown as React.Ref<HTMLDivElement>} className={classes.join(" ")} style={rowStyle}>
      <PositionEligibilityCell
        posList={player.posList}
        assignedSlot={player.assignedSlot}
        gamesPlayedByPosition={player.gamesPlayedByPosition}
        selected={isSelected}
        eligible={isEligible && !isSelected}
        dimmed={isDimmed}
        onPillClick={onPillClick}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>
          {isPending && <span aria-hidden className="am-roster-name-modified-marker" />}
          {player.isKeeper && (
            <span aria-label="Keeper" style={{ color: "#fbbf24", marginRight: 6 }}>
              ★
            </span>
          )}
          {player.name}
        </span>
        <span style={{ fontSize: 11, color: "var(--am-text-faint)" }}>
          {(player.mlbTeam ?? "FA") + " · " + (player.statSnapshot ?? player.posPrimary)}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2, justifyContent: "flex-end" }}>
        {dndEnabled && (
          <button
            type="button"
            className="am-roster-drag-handle"
            aria-label={`Drag ${player.name} to activate from IL`}
            {...attributes}
            {...listeners}
            style={{
              cursor: "grab",
              fontSize: 14,
              padding: "4px 6px",
              border: "1px solid transparent",
              background: "transparent",
              color: "var(--am-text-muted)",
              lineHeight: 1,
            }}
          >
            ⋮⋮
          </button>
        )}
        {isPending && onRevert && (
          <button
            type="button"
            className="am-roster-revert-button"
            onClick={onRevert}
            aria-label={`Revert pending change for ${player.name}`}
          >
            ↩
          </button>
        )}
        <button
          type="button"
          ref={triggerRef}
          className="am-roster-action-trigger"
          onClick={() => {
            if (triggerRef.current) {
              setAnchorRect(triggerRef.current.getBoundingClientRect());
            }
            setMenuOpen(true);
          }}
          aria-label={`Open actions menu for ${player.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          …
        </button>
        <RowActionMenu actions={actions} open={menuOpen} onClose={() => setMenuOpen(false)} anchorRect={anchorRect} />
      </div>
    </div>
  );
}

/**
 * Empty IL slot row (desktop). Wraps `useDroppable` so a Hub-source drag
 * can resolve here as an `il_stash`. The row body shows "Drop here to
 * stash" only while a stash-eligible drag is in flight (`ilStashEligible`).
 */
interface EmptyIlRowProps {
  index: number;
  dndEnabled: boolean;
  ilStashEligible: boolean;
}

function EmptyIlDesktopRow({ index, dndEnabled, ilStashEligible }: EmptyIlRowProps) {
  const id = encodeIlEmptyDndId(index);
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !dndEnabled });
  const showAffordance = dndEnabled && ilStashEligible;
  const showLanding = showAffordance && isOver;

  return (
    <tr
      ref={setNodeRef as unknown as React.Ref<HTMLTableRowElement>}
      className={
        "am-roster-il-empty" +
        (showLanding ? " am-roster-il-empty-over" : "") +
        (showAffordance ? " am-roster-il-empty-active" : "")
      }
      data-testid="il-empty-row"
    >
      <td
        colSpan={4}
        style={{
          padding: "10px 14px",
          color: showAffordance ? "#f59e0b" : "var(--am-text-faint)",
          fontSize: 12,
          borderBottom: "1px solid var(--am-border)",
          background: showLanding
            ? "color-mix(in srgb, #f59e0b 14%, transparent)"
            : showAffordance
            ? "color-mix(in srgb, #f59e0b 6%, transparent)"
            : undefined,
          transition: "background 160ms ease, color 160ms ease",
        }}
      >
        {showAffordance ? "✦ Drop here to stash" : "Empty IL slot"}
      </td>
    </tr>
  );
}

function EmptyIlMobileRow({ index, dndEnabled, ilStashEligible }: EmptyIlRowProps) {
  const id = encodeIlEmptyDndId(index);
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !dndEnabled });
  const showAffordance = dndEnabled && ilStashEligible;
  const showLanding = showAffordance && isOver;

  return (
    <div
      ref={setNodeRef as unknown as React.Ref<HTMLDivElement>}
      className="am-roster-mobile-row am-roster-il-empty"
      data-testid="il-empty-row"
      style={{
        color: showAffordance ? "#f59e0b" : "var(--am-text-faint)",
        fontSize: 12,
        background: showLanding
          ? "color-mix(in srgb, #f59e0b 14%, transparent)"
          : showAffordance
          ? "color-mix(in srgb, #f59e0b 6%, transparent)"
          : undefined,
        transition: "background 160ms ease, color 160ms ease",
      }}
    >
      <div style={{ opacity: 0.4 }}>—</div>
      <div>{showAffordance ? "✦ Drop here to stash" : "Empty IL slot"}</div>
      <div />
    </div>
  );
}
