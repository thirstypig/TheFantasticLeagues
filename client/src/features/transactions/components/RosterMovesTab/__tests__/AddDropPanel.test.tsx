import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddDropPanel from "../AddDropPanel";
import type { RosterMovesPlayer } from "../types";

// Critical fixture: seasonStatus controls DROP_REQUIRED. The test below
// verifies the inline enforcement that keeps users from hitting a server
// 400 when they try to add without a drop in-season — which was the
// original Phase 5 blocker tracked in memory/roster_rules_feature.md.
const mockSeasonStatus = { value: "IN_SEASON" as string | null };
vi.mock("../../../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ seasonStatus: mockSeasonStatus.value }),
}));

vi.mock("../../../../../api/base", () => ({
  fetchJsonApi: vi.fn().mockResolvedValue({ success: true }),
  API_BASE: "/api",
}));

vi.mock("../../../../../lib/errorBus", () => ({
  reportError: vi.fn(),
}));

vi.mock("../../../../../components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

const BASE_PROPS = {
  leagueId: 20,
  teamId: 147,
  onComplete: vi.fn(),
};

// Free agents come from getPlayerSeasonStats and are NOT enriched with
// _dbPlayerId — that field is only set on rows joined against a Roster
// row. mlb_id is the stable identifier the panel keys on and what the
// server accepts via the /transactions/claim dual-ID contract.
const freeAgent = {
  mlb_id: "642731",
  _dbTeamId: undefined,
  player_name: "Jake Bauers",
  positions: "1B,OF",
} as RosterMovesPlayer;

const ownRosterPlayer = {
  _dbPlayerId: 600,
  _dbTeamId: 147,
  player_name: "Michael Busch",
  assignedPosition: "1B",
  positions: "1B",
} as RosterMovesPlayer;

beforeEach(() => {
  mockSeasonStatus.value = "IN_SEASON";
});

describe("AddDropPanel — DROP_REQUIRED in-season", () => {
  it("in-season, the drop label reads 'required in-season'", () => {
    mockSeasonStatus.value = "IN_SEASON";
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);
    // The label contains both "Drop player" and the required-in-season hint.
    expect(screen.getByText(/required in-season/i)).toBeInTheDocument();
  });

  it("in-season, submit is disabled when no drop is selected — even with an add selected", async () => {
    mockSeasonStatus.value = "IN_SEASON";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);

    // Select the free-agent add.
    await user.click(screen.getByText("Jake Bauers"));

    const submit = screen.getByRole("button", { name: /^Add$/ });
    expect(submit).toBeDisabled();
  });

  it("in-season, inline amber warning appears when add is picked but drop isn't — the UX that prevents the server 400", async () => {
    // This is the exact regression the plan was designed to prevent. If this
    // test fails, users who add without dropping will get "DROP_REQUIRED" back
    // from the server with no client-side explanation.
    mockSeasonStatus.value = "IN_SEASON";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);

    expect(screen.queryByText(/In-season adds require a matching drop/)).not.toBeInTheDocument();
    await user.click(screen.getByText("Jake Bauers"));
    expect(screen.getByText(/In-season adds require a matching drop/)).toBeInTheDocument();
  });

  it("in-season, submit button enables when both add and drop are selected", async () => {
    mockSeasonStatus.value = "IN_SEASON";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);

    await user.click(screen.getByText("Jake Bauers"));
    await user.selectOptions(screen.getByRole("combobox"), String(ownRosterPlayer._dbPlayerId));

    const submit = screen.getByRole("button", { name: /Add \+ Drop/ });
    expect(submit).not.toBeDisabled();
  });
});

describe("AddDropPanel — free-agent key uniqueness (regression)", () => {
  // Regression for a bug where every free-agent button shared key=0 because
  // the panel fell back to `_dbPlayerId ?? 0` — which is undefined for FAs.
  // Clicking one FA flipped `isSelected` true for every row. Fixture here
  // mirrors real data: multiple FAs with distinct mlb_id and no _dbPlayerId.
  it("clicking one free agent selects only that one, not every FA with missing _dbPlayerId", async () => {
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    const fas: RosterMovesPlayer[] = [
      { mlb_id: "1001", player_name: "Alpha One", positions: "1B" },
      { mlb_id: "1002", player_name: "Bravo Two", positions: "OF" },
      { mlb_id: "1003", player_name: "Charlie Three", positions: "P" },
    ];
    render(<AddDropPanel {...BASE_PROPS} players={[...fas, ownRosterPlayer]} />);

    await user.click(screen.getByText("Bravo Two"));

    // Only the clicked FA gets the selected background class.
    const allFaButtons = screen.getAllByRole("button").filter((b) =>
      fas.some((f) => b.textContent?.includes(f.player_name ?? ""))
    );
    const selected = allFaButtons.filter((b) => b.className.includes("bg-[var(--lg-accent)]/15"));
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain("Bravo Two");
  });
});

describe("AddDropPanel — preseason / SETUP", () => {
  it("non-in-season, the drop label does NOT say 'required in-season'", () => {
    // Inverse assertion — the in-season DROP_REQUIRED affordance must not
    // appear pre-season. "optional" appears in multiple places and is
    // cross-element text which is brittle; asserting absence of the
    // specific in-season phrasing is stable.
    mockSeasonStatus.value = "SETUP";
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);
    expect(screen.queryByText(/required in-season/i)).not.toBeInTheDocument();
  });

  it("non-in-season, submit enables with only an add selected (no drop)", async () => {
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);

    await user.click(screen.getByText("Jake Bauers"));

    const submit = screen.getByRole("button", { name: /^Add$/ });
    expect(submit).not.toBeDisabled();
  });

  it("does not show the DROP_REQUIRED warning pre-season", async () => {
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);

    await user.click(screen.getByText("Jake Bauers"));

    expect(screen.queryByText(/In-season adds require a matching drop/)).not.toBeInTheDocument();
  });
});
