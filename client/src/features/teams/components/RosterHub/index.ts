// client/src/features/teams/components/RosterHub/index.ts
//
// Barrel exports for the maintained v3 RosterHub component family.

export { PositionPill } from "./PositionPill";
export { EligibilityChips } from "./EligibilityChips";
export { RowActionMenu } from "./RowActionMenu";
export { PendingChangeBar } from "./PendingChangeBar";
export type { PendingChangeBarItem } from "./PendingChangeBar";
export { SaveDiffPreviewModal } from "./SaveDiffPreviewModal";
export type { DiffRow } from "./SaveDiffPreviewModal";
export { FreeAgentPanel, encodeFaDndId, decodeFaDndId, FA_DND_ID_PREFIX } from "./FreeAgentPanel";
export { DropPool } from "./DropPool";

// v3 (consolidated table + GP numbers + sub-routes — see types for spec ref)
export { RosterHubV3 } from "./RosterHubV3";
export { RosterRowV3 } from "./RosterRowV3";
export { MobileRowV3 } from "./MobileRowV3";
export { IlSectionV3 } from "./IlSectionV3";
export { PositionEligibilityCell } from "./PositionEligibilityCell";
export { SubrouteContainer } from "./SubrouteContainer";
export {
  AddDropPanelMock,
  IlStashPanelMock,
  IlActivatePanelMock,
  DropPanelMock,
} from "./SubroutePanelMocks";

export type {
  RosterHubPlayer,
  PendingChange,
  RosterHubV3PreviewState,
  DragSimState,
  HitterStats,
  PitcherStats,
} from "./types";
export type { RowAction } from "./RowActionMenu";
