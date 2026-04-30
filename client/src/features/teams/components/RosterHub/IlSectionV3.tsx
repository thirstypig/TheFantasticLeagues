// client/src/features/teams/components/RosterHub/IlSectionV3.tsx
//
// IL section for the v3 layout. Same affordances as v2's `IlSection`
// but uses `PositionEligibilityCell` for consistency with the
// consolidated table above. IL rows render with a Status column
// (e.g. "Knee · 60-day") in place of season stats.

import { Glass, SectionLabel } from "../../../../components/aurora/atoms";
import { PositionEligibilityCell } from "./PositionEligibilityCell";
import { RowActionMenu, type RowAction } from "./RowActionMenu";
import { useRef, useState } from "react";
import type { RosterHubPlayer } from "./types";

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
                onPillClick={() => onPillClick(p.rosterId)}
                onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                actions={buildActions(p)}
              />
            ))}
            {Array.from({ length: empties }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="am-roster-mobile-row"
                style={{ color: "var(--am-text-faint)", fontSize: 12 }}
              >
                <div style={{ opacity: 0.4 }}>—</div>
                <div>Empty IL slot</div>
                <div />
              </div>
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

                  const cls: string[] = [];
                  if (isPending) cls.push("am-roster-row-pending");
                  if (isEligible && !isPending) cls.push("am-roster-row-eligible");
                  if (isDimmed) cls.push("am-roster-row-dimmed");

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
                    />
                  );
                })}
                {Array.from({ length: empties }).map((_, i) => (
                  <tr key={`empty-${i}`}>
                    <td
                      colSpan={4}
                      style={{ padding: "10px 14px", color: "var(--am-text-faint)", fontSize: 12 }}
                    >
                      Empty IL slot
                    </td>
                  </tr>
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
}: IlDesktopRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  return (
    <tr className={classes}>
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
  onPillClick: () => void;
  onRevert?: () => void;
  actions: RowAction[];
}

function IlMobileRow({
  player,
  isSelected,
  isEligible,
  isDimmed,
  isPending,
  onPillClick,
  onRevert,
  actions,
}: IlMobileRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const classes = ["am-roster-mobile-row"];
  if (isPending) classes.push("am-roster-row-pending");
  if (isEligible && !isPending) classes.push("am-roster-row-eligible");
  if (isDimmed) classes.push("am-roster-row-dimmed");

  return (
    <div className={classes.join(" ")}>
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
