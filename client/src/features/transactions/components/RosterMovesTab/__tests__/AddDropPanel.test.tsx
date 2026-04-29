import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddDropPanel from "../AddDropPanel";
import { fetchJsonApi } from "../../../../../api/base";
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

const mockToast = vi.fn();
vi.mock("../../../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: mockToast, confirm: vi.fn() }),
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

describe("AddDropPanel — submit body contract", () => {
  // Regression lock for the server-contract change in the free-agent fix.
  // The server's /transactions/claim accepts either playerId (DB Player.id)
  // or mlbId. Free agents from getPlayerSeasonStats have mlb_id but no
  // _dbPlayerId, so the client must send mlbId — not playerId=0. Before
  // the fix, every FA was keyed on _dbPlayerId ?? 0 and handleSubmit
  // posted { playerId: 0 }, which the server rejected.

  it("posts mlbId (not playerId) for free agents with no _dbPlayerId", async () => {
    mockSeasonStatus.value = "SETUP"; // no drop required
    const mockFetch = vi.mocked(fetchJsonApi);
    mockFetch.mockClear();
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);

    await user.click(screen.getByText("Jake Bauers"));
    await user.click(screen.getByRole("button", { name: /^Add$/ }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/transactions/claim");
    const body = JSON.parse((init as RequestInit).body as string);
    // mlbId must be sent for the server to resolve the free agent.
    expect(body).toMatchObject({
      leagueId: 20,
      teamId: 147,
      mlbId: "642731",
    });
    // playerId must NOT be present when _dbPlayerId is undefined —
    // sending playerId: 0 or null would fail the server lookup.
    expect(body).not.toHaveProperty("playerId");
    // No drop selected, so dropPlayerId must be absent.
    expect(body).not.toHaveProperty("dropPlayerId");
  });

  it("posts both mlbId and dropPlayerId for in-season add+drop", async () => {
    mockSeasonStatus.value = "IN_SEASON";
    const mockFetch = vi.mocked(fetchJsonApi);
    mockFetch.mockClear();
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);

    await user.click(screen.getByText("Jake Bauers"));
    await user.selectOptions(screen.getByRole("combobox"), String(ownRosterPlayer._dbPlayerId));
    await user.click(screen.getByRole("button", { name: /Add \+ Drop/ }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      leagueId: 20,
      teamId: 147,
      mlbId: "642731",
      dropPlayerId: 600,
    });
    expect(body).not.toHaveProperty("playerId");
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

describe("AddDropPanel — effectiveDate forwarding (commissioner backdate)", () => {
  // Mirror of the props added to PlaceOnIlPanel/ActivateFromIlPanel in PR #127.
  // CommissionerRosterTool lifts the effective-date picker to its header and
  // passes the value down; the panel must forward it to /transactions/claim
  // when truthy and omit the key entirely when empty/undefined.
  it("forwards effectiveDate to /transactions/claim when set", async () => {
    mockSeasonStatus.value = "SETUP";
    const mockFetch = vi.mocked(fetchJsonApi);
    mockFetch.mockClear();
    const user = userEvent.setup();
    render(
      <AddDropPanel
        {...BASE_PROPS}
        players={[freeAgent, ownRosterPlayer]}
        effectiveDate="2026-04-20"
      />
    );

    await user.click(screen.getByText("Jake Bauers"));
    await user.click(screen.getByRole("button", { name: /^Add$/ }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ effectiveDate: "2026-04-20" });
  });

  it("omits effectiveDate when prop is undefined", async () => {
    mockSeasonStatus.value = "SETUP";
    const mockFetch = vi.mocked(fetchJsonApi);
    mockFetch.mockClear();
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);

    await user.click(screen.getByText("Jake Bauers"));
    await user.click(screen.getByRole("button", { name: /^Add$/ }));

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).not.toHaveProperty("effectiveDate");
  });

  it("omits effectiveDate when prop is empty string (header picker default)", async () => {
    // Empty string is the "use server default" sentinel — must be treated
    // identically to undefined so a stale empty string from the header
    // picker doesn't hit the server literally.
    mockSeasonStatus.value = "SETUP";
    const mockFetch = vi.mocked(fetchJsonApi);
    mockFetch.mockClear();
    const user = userEvent.setup();
    render(
      <AddDropPanel
        {...BASE_PROPS}
        players={[freeAgent, ownRosterPlayer]}
        effectiveDate=""
      />
    );

    await user.click(screen.getByText("Jake Bauers"));
    await user.click(screen.getByRole("button", { name: /^Add$/ }));

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).not.toHaveProperty("effectiveDate");
  });
});

describe("AddDropPanel — Yahoo-style auto-resolve toast (PR1 of plan #166)", () => {
  // The server returns `appliedReassignments: [...]` when auto_resolve_slots
  // is on AND the matcher reshuffled other roster rows to fit the new player.
  // The panel surfaces those moves as a single-line success toast.

  beforeEach(() => {
    mockToast.mockClear();
  });

  it("renders a toast with reassignments when server returns appliedReassignments", async () => {
    mockSeasonStatus.value = "IN_SEASON";
    const mockFetch = vi.mocked(fetchJsonApi);
    mockFetch.mockResolvedValueOnce({
      success: true,
      playerId: 100,
      appliedReassignments: [
        {
          rosterId: 7,
          playerId: 5,
          playerName: "Trea Turner",
          oldSlot: "2B",
          newSlot: "SS",
        },
        {
          rosterId: 8,
          playerId: 6,
          playerName: "Alec Bohm",
          oldSlot: "SS",
          newSlot: "CM",
        },
      ],
    } as any);
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);

    await user.click(screen.getByText("Jake Bauers"));
    await user.selectOptions(screen.getByRole("combobox"), String(ownRosterPlayer._dbPlayerId));
    await user.click(screen.getByRole("button", { name: /Add \+ Drop/ }));

    expect(mockToast).toHaveBeenCalledTimes(1);
    const [msg, variant] = mockToast.mock.calls[0];
    expect(msg).toContain("Jake Bauers");
    expect(msg).toContain("Trea Turner 2B → SS");
    expect(msg).toContain("Alec Bohm SS → CM");
    expect(variant).toBe("success");
  });

  it("does NOT render a toast when appliedReassignments is empty (clean add+drop)", async () => {
    mockSeasonStatus.value = "IN_SEASON";
    const mockFetch = vi.mocked(fetchJsonApi);
    mockFetch.mockResolvedValueOnce({
      success: true,
      playerId: 100,
      appliedReassignments: [],
    } as any);
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);

    await user.click(screen.getByText("Jake Bauers"));
    await user.selectOptions(screen.getByRole("combobox"), String(ownRosterPlayer._dbPlayerId));
    await user.click(screen.getByRole("button", { name: /Add \+ Drop/ }));

    expect(mockToast).not.toHaveBeenCalled();
  });

  it("does NOT render a toast when appliedReassignments is missing (legacy server)", async () => {
    // Older server build without the auto-resolve patch — response has no
    // `appliedReassignments` field at all. Panel must tolerate this.
    mockSeasonStatus.value = "IN_SEASON";
    const mockFetch = vi.mocked(fetchJsonApi);
    mockFetch.mockResolvedValueOnce({ success: true, playerId: 100 } as any);
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);

    await user.click(screen.getByText("Jake Bauers"));
    await user.selectOptions(screen.getByRole("combobox"), String(ownRosterPlayer._dbPlayerId));
    await user.click(screen.getByRole("button", { name: /Add \+ Drop/ }));

    expect(mockToast).not.toHaveBeenCalled();
  });
});
