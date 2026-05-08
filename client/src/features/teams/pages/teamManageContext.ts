// client/src/features/teams/pages/teamManageContext.ts
//
// React Router outlet context for the Team page's manage sub-routes
// (`/teams/:teamCode/manage/{claim,il-stash,il-activate}`). Per todo #150,
// the v3 hub now mounts those flows as nested `<Route>` children of
// `<Team />` and forwards the panel inputs through `<Outlet context={…}>`.
// This typed wrapper keeps the contract honest — child route components
// (currently `ManagePanel`) consume the context via `useTeamManageContext`,
// and adding a new field forces both ends of the wire to update.

import { useOutletContext } from "react-router-dom";
import type { RosterMovesPlayer } from "../../transactions/components/RosterMovesTab/types";

export interface TeamManageContext {
  /** Active league id; null while the page is still resolving. */
  leagueId: number | null;
  /** Active team id; null while the page is still resolving. */
  teamId: number | null;
  /** True when the viewer can run mutations on this team. */
  canManage: boolean;
  /** Enriched FA + own-team player pool the panels filter against. */
  players: RosterMovesPlayer[];
  /** Commissioner-mode backdate forwarded to each panel. */
  effectiveDate: string | null;
  /** Optional ?playerId= seed for the IL panels. */
  initialManagePlayerId: number | null;
  /** Back button → returns to the roster table. */
  onBack: () => void;
  /** Panel onComplete → bumps reloadKey + navigates back to the table. */
  onPanelComplete: () => void;
}

export function useTeamManageContext(): TeamManageContext {
  return useOutletContext<TeamManageContext>();
}
