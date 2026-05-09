/**
 * ManagePanel unit tests — pin the route-segment → panel mapping that PR #309
 * (todo #150) introduced. Browser smoke proved the happy path; these tests
 * prevent the regressions that wouldn't show in tsc:
 *
 *  1. App.tsx adds a new manage mode (e.g. `/manage/trade`) but forgets to
 *     teach ManagePanel about it → null-render keeps the page from crashing.
 *  2. `useTeamManageContext` field name changes silently → panel renders the
 *     wrong props with no compile error (context is `unknown` at the
 *     useOutletContext seam).
 *  3. The `canManage` / loading guards get reordered → owners-without-perm
 *     see the panel briefly during page load, or the loading state never
 *     resolves.
 *  4. `effectiveDate: null` (the default) gets forwarded to a panel that
 *     types it as `undefined` → silent prop-type drift.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { ManagePanel } from "../ManagePanel";
import type { TeamManageContext } from "../../../pages/teamManageContext";

// Stub each transactions panel so we can assert routing without pulling in
// the full panel bundles (which expect a live API + rich player pool).
vi.mock("../../../../transactions/components/RosterMovesTab/AddDropPanel", () => ({
  default: (props: any) => (
    <div
      data-testid="add-drop-panel"
      data-league={props.leagueId}
      data-team={props.teamId}
      data-effective={String(props.effectiveDate)}
      data-players={String(props.players.length)}
    />
  ),
}));
vi.mock("../../../../transactions/components/RosterMovesTab/PlaceOnIlPanel", () => ({
  default: (props: any) => (
    <div
      data-testid="place-on-il-panel"
      data-initial-stash={String(props.initialStashPlayerId)}
      data-effective={String(props.effectiveDate)}
    />
  ),
}));
vi.mock("../../../../transactions/components/RosterMovesTab/ActivateFromIlPanel", () => ({
  default: (props: any) => (
    <div
      data-testid="activate-from-il-panel"
      data-initial-activate={String(props.initialActivatePlayerId)}
    />
  ),
}));

// SubrouteContainer is a thin chrome wrapper — pass children through so we
// can introspect the panel directly. Title/blurb assertions verify the
// chrome props separately.
vi.mock("../SubrouteContainer", () => ({
  SubrouteContainer: ({ title, blurb, children }: any) => (
    <div data-testid="subroute-container" data-title={title} data-blurb={blurb}>
      {children}
    </div>
  ),
}));

const onBack = vi.fn();
const onPanelComplete = vi.fn();

const baseCtx: TeamManageContext = {
  leagueId: 20,
  teamId: 147,
  canManage: true,
  players: [{ mlb_id: 1 } as any, { mlb_id: 2 } as any],
  effectiveDate: null,
  initialManagePlayerId: null,
  onBack,
  onPanelComplete,
};

function renderManageRoute(mode: string, ctx: Partial<TeamManageContext> = {}) {
  const merged: TeamManageContext = { ...baseCtx, ...ctx };
  return render(
    <MemoryRouter initialEntries={[`/teams/LDY/manage/${mode}`]}>
      <Routes>
        <Route path="/teams/:teamCode" element={<Outlet context={merged} />}>
          <Route path="manage/:mode" element={<ManagePanel />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ManagePanel", () => {
  // ── Mode → panel mapping ─────────────────────────────────────────

  it("renders AddDropPanel for /manage/claim", () => {
    renderManageRoute("claim");
    const panel = screen.getByTestId("add-drop-panel");
    expect(panel.dataset.league).toBe("20");
    expect(panel.dataset.team).toBe("147");
    expect(panel.dataset.players).toBe("2");
  });

  it("renders PlaceOnIlPanel for /manage/il-stash and forwards initialStashPlayerId", () => {
    renderManageRoute("il-stash", { initialManagePlayerId: 555 });
    const panel = screen.getByTestId("place-on-il-panel");
    expect(panel.dataset.initialStash).toBe("555");
  });

  it("renders ActivateFromIlPanel for /manage/il-activate and forwards initialActivatePlayerId", () => {
    renderManageRoute("il-activate", { initialManagePlayerId: 777 });
    const panel = screen.getByTestId("activate-from-il-panel");
    expect(panel.dataset.initialActivate).toBe("777");
  });

  // ── Defensive rendering ──────────────────────────────────────────

  it("renders null for an unknown mode (route table drift)", () => {
    const { container } = renderManageRoute("trade-unknown");
    // No SubrouteContainer at all — defensive null prevents crash + lets
    // App.tsx's catch-all handle the non-match.
    expect(screen.queryByTestId("subroute-container")).toBeNull();
    expect(container.querySelector("[data-testid$='-panel']")).toBeNull();
  });

  // ── Permission + loading guards ──────────────────────────────────

  it("shows the not-available message when canManage is false", () => {
    renderManageRoute("claim", { canManage: false });
    expect(screen.getByText(/not available to you/i)).toBeInTheDocument();
    expect(screen.queryByTestId("add-drop-panel")).toBeNull();
  });

  it("shows the loading state when leagueId is null", () => {
    renderManageRoute("claim", { leagueId: null });
    expect(screen.getByText(/loading…/i)).toBeInTheDocument();
    expect(screen.queryByTestId("add-drop-panel")).toBeNull();
  });

  it("shows the loading state when teamId is null", () => {
    renderManageRoute("claim", { teamId: null });
    expect(screen.getByText(/loading…/i)).toBeInTheDocument();
  });

  it("checks canManage BEFORE the loading guard so non-owners never see Loading…", () => {
    // Race-condition pin: if the page is still resolving (leagueId=null) AND
    // the viewer doesn't have perms, we surface the perm message — not a
    // misleading "Loading…" that would imply the panel is coming.
    renderManageRoute("claim", { canManage: false, leagueId: null, teamId: null });
    expect(screen.getByText(/not available to you/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading…/i)).toBeNull();
  });

  // ── Prop forwarding ──────────────────────────────────────────────

  it("forwards effectiveDate=null as undefined to the panel", () => {
    // The panel prop type is `string | undefined`, never null. The
    // `effectiveDate: null` → `undefined` coercion in ManagePanel keeps that
    // type contract honest.
    renderManageRoute("claim", { effectiveDate: null });
    const panel = screen.getByTestId("add-drop-panel");
    expect(panel.dataset.effective).toBe("undefined");
  });

  it("forwards a real effectiveDate string when commissioner-mode is set", () => {
    renderManageRoute("il-stash", { effectiveDate: "2026-04-15" });
    const panel = screen.getByTestId("place-on-il-panel");
    expect(panel.dataset.effective).toBe("2026-04-15");
  });

  // ── SubrouteContainer chrome ─────────────────────────────────────

  it("passes the mode-specific title + blurb to SubrouteContainer", () => {
    renderManageRoute("il-activate");
    const container = screen.getByTestId("subroute-container");
    expect(container.dataset.title).toBe("Activate from IL");
    expect(container.dataset.blurb).toMatch(/Return a player from IL/);
  });
});
