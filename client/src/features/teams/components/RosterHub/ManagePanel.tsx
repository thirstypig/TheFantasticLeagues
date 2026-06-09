// client/src/features/teams/components/RosterHub/ManagePanel.tsx
//
// Outlet-mounted child route for the v3 hub manage flows. Routed under
// `/teams/:teamCode/manage/:mode` where `:mode` ∈ {claim, il-stash,
// il-activate, il-release}. Reads the URL segment + the parent Team layout's shared
// state (panel inputs) via `useOutletContext`, and renders the matching
// transactions panel inside a `SubrouteContainer`. Per todo #150, this
// replaces the legacy three-`useMatch` + ternary chain in Team.tsx with
// a declarative nested route.
//
// The transactions panels themselves (AddDropPanel / PlaceOnIlPanel /
// ActivateFromIlPanel / DropFromIlPanel) are unchanged — this component only owns the
// "which panel for which URL" decision plus the surrounding container
// chrome (title, blurb, back button).

import { useParams } from "react-router-dom";
import { SubrouteContainer } from "./SubrouteContainer";
import AddDropPanel from "../../../transactions/components/RosterMovesTab/AddDropPanel";
import PlaceOnIlPanel from "../../../transactions/components/RosterMovesTab/PlaceOnIlPanel";
import ActivateFromIlPanel from "../../../transactions/components/RosterMovesTab/ActivateFromIlPanel";
import DropFromIlPanel from "../../../transactions/components/RosterMovesTab/DropFromIlPanel";
import type { RosterMovesPlayer } from "../../../transactions/components/RosterMovesTab/types";
import { useTeamManageContext } from "../../pages/teamManageContext";

/** URL `:mode` segment vocabulary — pinned so a typo in App.tsx surfaces here. */
type ManageMode = "claim" | "il-stash" | "il-activate" | "il-release";

const TITLES: Record<ManageMode, string> = {
  "claim": "Add free agent",
  "il-stash": "Place on IL",
  "il-activate": "Activate from IL",
  "il-release": "Release from IL",
};

const BLURBS: Record<ManageMode, string> = {
  "claim":
    "Pick a free agent and the player on your roster they'll replace. Auto-resolve handles slot conflicts.",
  "il-stash":
    "Move an injured player to your IL slot and bring in a replacement at their vacated position.",
  "il-activate":
    "Return a player from IL and pick an active-roster player to drop in their place.",
  "il-release":
    "Permanently release an IL-slotted player from your roster. The IL slot is freed immediately.",
};

function isManageMode(value: string | undefined): value is ManageMode {
  return (
    value === "claim" ||
    value === "il-stash" ||
    value === "il-activate" ||
    value === "il-release"
  );
}

export function ManagePanel() {
  const params = useParams();
  const ctx = useTeamManageContext();
  const mode = params.mode;
  if (!isManageMode(mode)) {
    // Unknown sub-route — render nothing; App.tsx's catch-all (or a future
    // 404) handles the non-match. Keeping this defensive avoids crashing
    // the page if the route table and this component drift.
    return null;
  }

  const players: RosterMovesPlayer[] = ctx.players;
  const effectiveDate = ctx.effectiveDate ?? undefined;

  return (
    <SubrouteContainer title={TITLES[mode]} blurb={BLURBS[mode]} onBack={ctx.onBack}>
      {!ctx.canManage ? (
        <div style={{ padding: 16, color: "var(--am-text-muted)", fontSize: 12 }}>
          Roster transactions on this team are not available to you.
        </div>
      ) : !ctx.leagueId || !ctx.teamId ? (
        <div style={{ padding: 16, color: "var(--am-text-faint)", fontSize: 12 }}>Loading…</div>
      ) : mode === "claim" ? (
        <AddDropPanel
          leagueId={ctx.leagueId}
          teamId={ctx.teamId}
          players={players}
          onComplete={ctx.onPanelComplete}
          effectiveDate={effectiveDate}
        />
      ) : mode === "il-stash" ? (
        <PlaceOnIlPanel
          leagueId={ctx.leagueId}
          teamId={ctx.teamId}
          players={players}
          onComplete={ctx.onPanelComplete}
          effectiveDate={effectiveDate}
          initialStashPlayerId={ctx.initialManagePlayerId}
        />
      ) : mode === "il-activate" ? (
        <ActivateFromIlPanel
          leagueId={ctx.leagueId}
          teamId={ctx.teamId}
          players={players}
          onComplete={ctx.onPanelComplete}
          effectiveDate={effectiveDate}
          initialActivatePlayerId={ctx.initialManagePlayerId}
        />
      ) : (
        <DropFromIlPanel
          leagueId={ctx.leagueId}
          teamId={ctx.teamId}
          players={players}
          onComplete={ctx.onPanelComplete}
          effectiveDate={effectiveDate}
          initialReleasePlayerId={ctx.initialManagePlayerId}
        />
      )}
    </SubrouteContainer>
  );
}
