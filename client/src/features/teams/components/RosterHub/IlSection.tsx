// client/src/features/teams/components/RosterHub/IlSection.tsx
//
// Separate section below the active table for IL roster. Five slots
// per the OGBA rules; rendered as the same table primitive so the
// "selected → eligible glow" affordance unifies across active + IL.

import { Glass, SectionLabel } from "../../../../components/aurora/atoms";
import { ThemedTable, ThemedThead, ThemedTbody, ThemedTr, ThemedTh } from "../../../../components/ui/ThemedTable";
import { RosterRow } from "./RosterRow";
import { MobileRow } from "./MobileRow";
import type { RowAction } from "./RowActionMenu";
import type { RosterHubPlayer } from "./types";

interface IlSectionProps {
  /** IL-stashed players. Render as table at >640px, list below. */
  players: RosterHubPlayer[];
  selectedRosterId: number | null;
  eligibleRosterIds: ReadonlySet<number>;
  pendingRosterIds: ReadonlySet<number>;
  isMobile: boolean;
  /** Slot count of an empty IL section, e.g. 5 OGBA slots. */
  totalSlots: number;
  onPillClick: (rosterId: number) => void;
  buildActions: (player: RosterHubPlayer) => RowAction[];
  onRevert?: (rosterId: number) => void;
}

export function IlSection({
  players,
  selectedRosterId,
  eligibleRosterIds,
  pendingRosterIds,
  isMobile,
  totalSlots,
  onPillClick,
  buildActions,
  onRevert,
}: IlSectionProps) {
  const empties = Math.max(0, totalSlots - players.length);

  return (
    <Glass padded={false} style={{ overflow: "hidden" }}>
      <div style={{ padding: 16, paddingBottom: 6 }}>
        <SectionLabel>✦ Injured List · {totalSlots} slots</SectionLabel>
        <p style={{ margin: 0, fontSize: 12, color: "var(--am-text-muted)" }}>
          IL slots are out-of-band — players here don't count toward the 23-active limit.
        </p>
      </div>

      {isMobile ? (
        <div>
          {players.map((p) => (
            <MobileRow
              key={p.rosterId}
              player={p}
              isSelected={selectedRosterId === p.rosterId}
              isEligible={eligibleRosterIds.has(p.rosterId)}
              isDimmed={selectedRosterId != null && !eligibleRosterIds.has(p.rosterId) && selectedRosterId !== p.rosterId}
              isPending={pendingRosterIds.has(p.rosterId)}
              onPillClick={() => onPillClick(p.rosterId)}
              onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
              actions={buildActions(p)}
            />
          ))}
          {/* Empty IL placeholders — visually communicate available capacity. */}
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
        <ThemedTable bare density="default" minWidth={600} aria-label="Injured list roster">
          <ThemedThead>
            <ThemedTr>
              <ThemedTh frozen scope="col">
                Slot
              </ThemedTh>
              <ThemedTh scope="col">Player</ThemedTh>
              <ThemedTh scope="col">Eligibility</ThemedTh>
              <ThemedTh scope="col">Status</ThemedTh>
              <ThemedTh align="right" scope="col">
                Actions
              </ThemedTh>
            </ThemedTr>
          </ThemedThead>
          <ThemedTbody>
            {players.map((p) => (
              <RosterRow
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
                isDragSource={false}
                isDropTarget={false}
                onPillClick={() => onPillClick(p.rosterId)}
                onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                actions={buildActions(p)}
              />
            ))}
            {Array.from({ length: empties }).map((_, i) => (
              <ThemedTr key={`empty-${i}`}>
                <td colSpan={5} style={{ padding: "10px 14px", color: "var(--am-text-faint)", fontSize: 12 }}>
                  Empty IL slot
                </td>
              </ThemedTr>
            ))}
          </ThemedTbody>
        </ThemedTable>
      )}
    </Glass>
  );
}
