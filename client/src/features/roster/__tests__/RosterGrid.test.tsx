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

describe("RosterGrid position dropdown eligibility filter", () => {
  // When canEditPosition is true, each non-pitcher row renders a <select> that
  // must be filtered to the player's eligible roster slots.  These tests pin
  // down the three branches of the IIFE inside the select:
  //   1. Pitcher  → always ["P"]
  //   2. No posList → all 9 hitter slots (unfiltered fallback)
  //   3. Has posList → eligible set ∪ {displayPos} ∪ {DH}

  const getOptions = (select: HTMLElement) =>
    Array.from((select as HTMLSelectElement).options).map(o => o.value);

  it("shows only 'P' for a pitcher row regardless of posList", () => {
    const pitcher = {
      id: 2001, teamId: 147, assignedPosition: "P",
      player: { id: 610, name: "Gerrit Cole", posPrimary: "SP", posList: "SP" },
      price: 25,
    };
    render(<RosterGrid teams={teams} rosters={[pitcher]} canEditPosition />);
    expect(getOptions(screen.getByRole("combobox"))).toEqual(["P"]);
  });

  it("shows all 9 hitter slots when posList is absent (unfiltered fallback)", () => {
    const noList = {
      id: 2002, teamId: 147, assignedPosition: "OF",
      player: { id: 611, name: "Cody Bellinger", posPrimary: "OF" }, // no posList
      price: 18,
    };
    render(<RosterGrid teams={teams} rosters={[noList]} canEditPosition />);
    expect(getOptions(screen.getByRole("combobox"))).toEqual([
      "C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH",
    ]);
  });

  it("filters to eligible slots for a pure SS player (SS + MI + DH only)", () => {
    const ssPlayer = {
      id: 2003, teamId: 147, assignedPosition: "SS",
      player: { id: 612, name: "Francisco Lindor", posPrimary: "SS", posList: "SS" },
      price: 30,
    };
    render(<RosterGrid teams={teams} rosters={[ssPlayer]} canEditPosition />);
    expect(getOptions(screen.getByRole("combobox"))).toEqual(["SS", "MI", "DH"]);
  });

  it("includes the union of eligible slots for a multi-position player (2B,SS → 2B + SS + MI + DH)", () => {
    const multi = {
      id: 2004, teamId: 147, assignedPosition: "2B",
      player: { id: 613, name: "Jazz Chisholm", posPrimary: "2B", posList: "2B,SS" },
      price: 22,
    };
    render(<RosterGrid teams={teams} rosters={[multi]} canEditPosition />);
    expect(getOptions(screen.getByRole("combobox"))).toEqual(["2B", "SS", "MI", "DH"]);
  });

  it("always includes the current assigned position even when posList doesn't cover it (grandfathered slot guard)", () => {
    // Player is assigned to CM but this season only has OF in their posList.
    // displayPos ("CM") must stay in the dropdown so the commissioner can
    // keep the slot — the grandfathering logic is intentional.
    const grandfathered = {
      id: 2005, teamId: 147, assignedPosition: "CM",
      player: { id: 614, name: "Garrett Cooper", posPrimary: "OF", posList: "OF" },
      price: 5,
    };
    render(<RosterGrid teams={teams} rosters={[grandfathered]} canEditPosition />);
    const options = getOptions(screen.getByRole("combobox"));
    expect(options).toEqual(["CM", "OF", "DH"]);
    expect(options).not.toContain("1B");
    expect(options).not.toContain("SS");
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
