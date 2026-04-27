import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RosterGrid from "../components/RosterGrid";

// RosterGrid pulls a few app-wide hooks. Stub them to a hermetic baseline —
// the tests below only exercise the per-row IL shortcut buttons, not data
// fetching or the in-place edit affordances.
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ outfieldMode: "of", leagueId: 20, seasonStatus: "IN_SEASON" }),
}));

vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn(), confirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock("../../../api/base", () => ({
  fetchJsonApi: vi.fn().mockResolvedValue({}),
  API_BASE: "/api",
}));

const teams = [{ id: 147, name: "Test Team", code: "TST", budget: 300 }];

const activeIlEligible = {
  id: 1001,
  teamId: 147,
  assignedPosition: "OF",
  player: { id: 500, name: "Byron Buxton", posPrimary: "OF" },
  price: 30,
};

const activeHealthy = {
  id: 1002,
  teamId: 147,
  assignedPosition: "1B",
  player: { id: 501, name: "Pete Alonso", posPrimary: "1B" },
  price: 25,
};

const ilSlotted = {
  id: 1003,
  teamId: 147,
  assignedPosition: "IL",
  player: { id: 502, name: "Bryce Harper", posPrimary: "OF" },
  price: 40,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RosterGrid IL shortcut buttons", () => {
  it("shows the 'Place on IL' button only on rows whose mlbStatus matches the MLB-IL regex", () => {
    const onPlaceIl = vi.fn();
    render(
      <RosterGrid
        teams={teams}
        rosters={[activeIlEligible, activeHealthy]}
        onPlaceIl={onPlaceIl}
        mlbStatusByPlayerId={
          new Map<number, string | undefined>([
            [500, "Injured 10-Day"], // matches /^Injured (List )?\d+-Day$/ — button shows
            [501, "Active"],         // does NOT match — no button
          ])
        }
      />
    );

    expect(screen.getByLabelText(/Place Byron Buxton on IL/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Place Pete Alonso on IL/i)).toBeNull();
  });

  it("does not render the 'Place on IL' button without onPlaceIl callback (non-commissioner contexts)", () => {
    render(
      <RosterGrid
        teams={teams}
        rosters={[activeIlEligible]}
        mlbStatusByPlayerId={
          new Map<number, string | undefined>([[500, "Injured 10-Day"]])
        }
      />
    );

    expect(screen.queryByLabelText(/Place Byron Buxton on IL/i)).toBeNull();
  });

  it("fires onPlaceIl with the clicked roster item", async () => {
    const user = userEvent.setup();
    const onPlaceIl = vi.fn();
    render(
      <RosterGrid
        teams={teams}
        rosters={[activeIlEligible]}
        onPlaceIl={onPlaceIl}
        mlbStatusByPlayerId={
          new Map<number, string | undefined>([[500, "Injured 10-Day"]])
        }
      />
    );

    await user.click(screen.getByLabelText(/Place Byron Buxton on IL/i));

    expect(onPlaceIl).toHaveBeenCalledTimes(1);
    expect(onPlaceIl).toHaveBeenCalledWith(activeIlEligible);
  });

  it("shows the 'Activate' button only on rows already in the IL slot", () => {
    const onActivateIl = vi.fn();
    render(
      <RosterGrid
        teams={teams}
        rosters={[ilSlotted, activeHealthy]}
        onActivateIl={onActivateIl}
      />
    );

    expect(screen.getByLabelText(/Activate Bryce Harper from IL/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Activate Pete Alonso from IL/i)).toBeNull();
  });

  it("fires onActivateIl with the clicked roster item", async () => {
    const user = userEvent.setup();
    const onActivateIl = vi.fn();
    render(
      <RosterGrid
        teams={teams}
        rosters={[ilSlotted]}
        onActivateIl={onActivateIl}
      />
    );

    await user.click(screen.getByLabelText(/Activate Bryce Harper from IL/i));

    expect(onActivateIl).toHaveBeenCalledTimes(1);
    expect(onActivateIl).toHaveBeenCalledWith(ilSlotted);
  });
});

describe("RosterGrid unbounded mode", () => {
  // Regression test for the Skunk Dogs "missing player" report in session 80.
  // The focused single-team view in CommissionerRosterTool inherited the
  // grid's `h-96` per-card height + internal scroll, designed for the 8-up
  // grid. With 23 rows and ~10 visible without scrolling, users assumed
  // pitchers (e.g., Ohtani Pitcher at row 14) were missing entirely. The
  // `unbounded` prop drops the height + scroll so the focused card grows
  // to fit all rows.
  it("by default renders the team card with the h-96 height + internal scroll", () => {
    const { container } = render(
      <RosterGrid teams={teams} rosters={[activeIlEligible]} />
    );
    const teamCard = container.querySelector(
      '[class*="rounded-xl"][class*="overflow-hidden"][class*="flex flex-col"]'
    ) as HTMLElement;
    expect(teamCard).toBeTruthy();
    expect(teamCard.className).toContain("h-96");
    const scrollPane = container.querySelector('[class*="overflow-y-auto"]');
    expect(scrollPane).toBeTruthy();
  });

  it("when unbounded, drops both the height constraint and the internal scroll pane", () => {
    const { container } = render(
      <RosterGrid teams={teams} rosters={[activeIlEligible]} unbounded />
    );
    const teamCard = container.querySelector(
      '[class*="rounded-xl"][class*="overflow-hidden"][class*="flex flex-col"]'
    ) as HTMLElement;
    expect(teamCard).toBeTruthy();
    expect(teamCard.className).not.toContain("h-96");
    const scrollPane = container.querySelector('[class*="overflow-y-auto"]');
    expect(scrollPane).toBeNull();
  });
});
