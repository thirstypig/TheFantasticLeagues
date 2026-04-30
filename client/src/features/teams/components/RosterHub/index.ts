// client/src/features/teams/components/RosterHub/index.ts
//
// Barrel exports for the RosterHub component family. Co-located so
// PR2 can `import { RosterHub } from "../components/RosterHub"` and
// pick up the whole tree.

export { RosterHub } from "./RosterHub";
export { RosterRow } from "./RosterRow";
export { MobileRow } from "./MobileRow";
export { PositionPill } from "./PositionPill";
export { EligibilityChips } from "./EligibilityChips";
export { RowActionMenu } from "./RowActionMenu";
export { PendingChangeBar } from "./PendingChangeBar";
export { IlSection } from "./IlSection";

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
  RosterHubPreviewState,
  RosterHubV3PreviewState,
  DragSimState,
  HitterStats,
  PitcherStats,
} from "./types";
export type { RowAction } from "./RowActionMenu";
