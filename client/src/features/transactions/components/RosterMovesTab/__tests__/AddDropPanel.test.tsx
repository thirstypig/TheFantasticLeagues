import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ButtonHTMLAttributes } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddDropPanel from "../AddDropPanel";
import { fetchJsonApi } from "../../../../../api/base";
import type { RosterMovesPlayer } from "../types";
import type { ClaimResponse } from "@shared/api/rosterMoves";
import type { RosterMovePreviewResult } from "../../../api";

// Critical fixture: seasonStatus controls DROP_REQUIRED. The test below
// verifies the inline enforcement that keeps users from hitting a server
// 400 when they try to add without a drop in-season — which was the
// original Phase 5 blocker tracked in memory/roster_rules_feature.md.
const mockSeasonStatus = { value: "IN_SEASON" as string | null };
vi.mock("../../../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ seasonStatus: mockSeasonStatus.value }),
}));

vi.mock("../../../../../api/base", () => ({
  fetchJsonApi: vi.fn((url: string) =>
    Promise.resolve(url.includes("/preview") ? { ok: true, message: "Roster rules satisfied." } : { success: true }),
  ),
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
  Button: ({ children, onClick, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
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

const pitcherOnlyFreeAgent = {
  mlb_id: "999001",
  player_name: "Pitcher Only",
  positions: "P",
} as RosterMovesPlayer;

beforeEach(() => {
  mockSeasonStatus.value = "IN_SEASON";
});

async function selectDrop(user: ReturnType<typeof userEvent.setup>, name = "Michael Busch") {
  await user.click(screen.getByRole("row", { name: new RegExp(name) }));
}

async function executeAndConfirm(user: ReturnType<typeof userEvent.setup>, executeName: RegExp, confirmName: RegExp) {
  await user.click(screen.getByRole("button", { name: executeName }));
  await user.click(screen.getByRole("button", { name: confirmName }));
}

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

    const submit = screen.getByRole("button", { name: /^Execute Add/ });
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
    await selectDrop(user);

    const submit = screen.getByRole("button", { name: /Execute Add \+ Drop/ });
    await waitFor(() => expect(submit).not.toBeDisabled());
  });

  it("keeps confirm disabled when selected add cannot satisfy the drop slot", async () => {
    mockSeasonStatus.value = "IN_SEASON";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[pitcherOnlyFreeAgent, ownRosterPlayer]} />);

    await user.click(screen.getByText("Pitcher Only"));
    expect(screen.getByText(/No rostered players qualify/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Execute Add/ })).toBeDisabled();
  });
});

describe("AddDropPanel — free-agent key uniqueness (regression)", () => {
  // Regression for a bug where every free-agent button shared key=0 because
  // the panel fell back to `_dbPlayerId ?? 0` — which is undefined for FAs.
  // Clicking one FA flipped `isSelected` true for every row. Fixture here
  // mirrors real data: multiple FAs with distinct mlb_id and no _dbPlayerId.
  it("defaults to no selected free-agent rows when FAs are missing _dbPlayerId", () => {
    mockSeasonStatus.value = "SETUP";
    const fas: RosterMovesPlayer[] = [
      { mlb_id: "1001", player_name: "Alpha One", positions: "1B" },
      { mlb_id: "1002", player_name: "Bravo Two", positions: "OF" },
      { mlb_id: "1003", player_name: "Charlie Three", positions: "P" },
    ];
    render(<AddDropPanel {...BASE_PROPS} players={[...fas, ownRosterPlayer]} />);

    const allFaRows = screen.getAllByRole("row").filter((row) =>
      fas.some((f) => row.textContent?.includes(f.player_name ?? ""))
    );
    expect(allFaRows).toHaveLength(3);
    expect(allFaRows.every((row) => row.getAttribute("aria-selected") === "false")).toBe(true);
    expect(screen.queryByText("Selected")).not.toBeInTheDocument();
  });

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

    // Only the clicked FA gets the selected row state.
    const allFaRows = screen.getAllByRole("row").filter((row) =>
      fas.some((f) => row.textContent?.includes(f.player_name ?? ""))
    );
    const selected = allFaRows.filter((row) => row.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain("Bravo Two");
  });
});

describe("AddDropPanel — free-agent stats, filters, and sorting", () => {
  it("shows stats in the free-agent table and filters by outfield position", async () => {
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    const fas: RosterMovesPlayer[] = [
      { mlb_id: "2001", player_name: "Outfield Bat", positions: "OF", is_pitcher: false, R: 8, HR: 3, RBI: 11, SB: 2, AVG: 0.286 },
      { mlb_id: "2002", player_name: "Corner Bat", positions: "1B", is_pitcher: false, R: 4, HR: 1, RBI: 5, SB: 0, AVG: 0.244 },
    ];
    render(<AddDropPanel {...BASE_PROPS} players={[...fas, ownRosterPlayer]} />);

    expect(screen.getByText("Outfield Bat")).toBeInTheDocument();
    expect(screen.getByText(".286")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "OF" }));

    expect(screen.getByText("Outfield Bat")).toBeInTheDocument();
    expect(screen.queryByText("Corner Bat")).not.toBeInTheDocument();
  });

  it("sorts free agents by selected stat", async () => {
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    const fas: RosterMovesPlayer[] = [
      { mlb_id: "3001", player_name: "Low Power", positions: "OF", is_pitcher: false, HR: 1 },
      { mlb_id: "3002", player_name: "High Power", positions: "OF", is_pitcher: false, HR: 9 },
    ];
    render(<AddDropPanel {...BASE_PROPS} players={[...fas, ownRosterPlayer]} />);

    await user.click(screen.getAllByRole("button", { name: "HR" })[0]);

    const faRows = screen.getAllByRole("row").filter((row) =>
      row.textContent?.includes("Power")
    );
    expect(faRows[0].textContent).toContain("High Power");
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
    await executeAndConfirm(user, /^Execute Add/, /^Confirm Add/);

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
    await selectDrop(user);
    await waitFor(() => expect(screen.getByRole("button", { name: /Execute Add \+ Drop/ })).not.toBeDisabled());
    await executeAndConfirm(user, /Execute Add \+ Drop/, /Confirm Add \+ Drop/);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, init] = mockFetch.mock.calls[1];
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

    const submit = screen.getByRole("button", { name: /^Execute Add/ });
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
    await executeAndConfirm(user, /^Execute Add/, /^Confirm Add/);

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
    await executeAndConfirm(user, /^Execute Add/, /^Confirm Add/);

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
    await executeAndConfirm(user, /^Execute Add/, /^Confirm Add/);

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).not.toHaveProperty("effectiveDate");
  });
});

describe("AddDropPanel — post-commit modal with auto-resolve cascade (PR #359)", () => {
  // The server returns `appliedReassignments: [...]` when auto_resolve_slots
  // is on AND the matcher reshuffled other roster rows to fit the new player.
  // The panel surfaces those moves as a cascade list inside the post-commit
  // TransactionResultModal (replaces the earlier toast pattern).

  it("renders cascade list in the result modal when server returns appliedReassignments", async () => {
    mockSeasonStatus.value = "IN_SEASON";
    const mockFetch = vi.mocked(fetchJsonApi);
    mockFetch.mockResolvedValueOnce({ ok: true, message: "Roster rules satisfied." } satisfies RosterMovePreviewResult);
    mockFetch.mockResolvedValueOnce({
      success: true,
      playerId: 100,
      appliedReassignments: [
        { rosterId: 7, playerId: 5, playerName: "Trea Turner", oldSlot: "2B", newSlot: "SS" },
        { rosterId: 8, playerId: 6, playerName: "Alec Bohm", oldSlot: "SS", newSlot: "CM" },
      ],
    } satisfies ClaimResponse);
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);

    await user.click(screen.getByText("Jake Bauers"));
    await selectDrop(user);
    await waitFor(() => expect(screen.getByRole("button", { name: /Execute Add \+ Drop/ })).not.toBeDisabled());
    await executeAndConfirm(user, /Execute Add \+ Drop/, /Confirm Add \+ Drop/);

    const modal = await screen.findByTestId("transaction-result-modal");
    expect(modal.textContent).toContain("Jake Bauers");
    const cascade = await screen.findByTestId("transaction-result-cascade");
    expect(cascade.textContent).toContain("Trea Turner");
    expect(cascade.textContent).toContain("2B");
    expect(cascade.textContent).toContain("SS");
    expect(cascade.textContent).toContain("Alec Bohm");
    expect(cascade.textContent).toContain("CM");
  });

  it("renders modal WITHOUT cascade list when appliedReassignments is empty", async () => {
    mockSeasonStatus.value = "IN_SEASON";
    const mockFetch = vi.mocked(fetchJsonApi);
    mockFetch.mockResolvedValueOnce({ ok: true, message: "Roster rules satisfied." } satisfies RosterMovePreviewResult);
    mockFetch.mockResolvedValueOnce({
      success: true,
      playerId: 100,
      appliedReassignments: [],
    } satisfies ClaimResponse);
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);

    await user.click(screen.getByText("Jake Bauers"));
    await selectDrop(user);
    await waitFor(() => expect(screen.getByRole("button", { name: /Execute Add \+ Drop/ })).not.toBeDisabled());
    await executeAndConfirm(user, /Execute Add \+ Drop/, /Confirm Add \+ Drop/);

    expect(await screen.findByTestId("transaction-result-modal")).toBeInTheDocument();
    expect(screen.queryByTestId("transaction-result-cascade")).not.toBeInTheDocument();
  });

  it("renders modal WITHOUT cascade list when appliedReassignments missing (legacy server)", async () => {
    mockSeasonStatus.value = "IN_SEASON";
    const mockFetch = vi.mocked(fetchJsonApi);
    mockFetch.mockResolvedValueOnce({ ok: true, message: "Roster rules satisfied." } satisfies RosterMovePreviewResult);
    mockFetch.mockResolvedValueOnce({ success: true, playerId: 100 } satisfies ClaimResponse);
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer]} />);

    await user.click(screen.getByText("Jake Bauers"));
    await selectDrop(user);
    await waitFor(() => expect(screen.getByRole("button", { name: /Execute Add \+ Drop/ })).not.toBeDisabled());
    await executeAndConfirm(user, /Execute Add \+ Drop/, /Confirm Add \+ Drop/);

    expect(await screen.findByTestId("transaction-result-modal")).toBeInTheDocument();
    expect(screen.queryByTestId("transaction-result-cascade")).not.toBeInTheDocument();
  });
});

describe("AddDropPanel — SlotRearrangementSection (PR #347)", () => {
  const multiSlotPlayer: RosterMovesPlayer = {
    _dbPlayerId: 700,
    _dbTeamId: 147,
    player_name: "Fernando Tatis Jr.",
    assignedPosition: "2B",
    positions: "2B,OF",
  } as RosterMovesPlayer;

  it("does not appear before a drop player is selected", async () => {
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer, multiSlotPlayer]} />);
    await user.click(screen.getByText("Jake Bauers"));
    expect(screen.queryByText(/adjust slot assignments/i)).not.toBeInTheDocument();
  });

  it("appears after add + drop are both selected", async () => {
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer, multiSlotPlayer]} />);
    await user.click(screen.getByText("Jake Bauers"));
    await selectDrop(user);
    expect(screen.getByText(/adjust slot assignments/i)).toBeInTheDocument();
  });

  it("shows eligible slot options in the dropdown when the section is opened", async () => {
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer, multiSlotPlayer]} />);
    await user.click(screen.getByText("Jake Bauers"));
    await selectDrop(user);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await user.click(screen.getByText(/adjust slot assignments/i));
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(expect.arrayContaining(["2B", "MI", "OF"]));
    expect(select.value).toBe("2B");
  });

  it("shows N-changes badge when a slot is moved and clears it on revert", async () => {
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer, multiSlotPlayer]} />);
    await user.click(screen.getByText("Jake Bauers"));
    await selectDrop(user);
    expect(screen.queryByText(/1 change/i)).not.toBeInTheDocument();
    await user.click(screen.getByText(/adjust slot assignments/i));
    await user.selectOptions(screen.getByRole("combobox"), "OF");
    expect(screen.getByText("1 change")).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox"), "2B");
    expect(screen.queryByText(/1 change/i)).not.toBeInTheDocument();
  });

  it("includes slotChanges in the claim body when a slot is adjusted", async () => {
    mockSeasonStatus.value = "SETUP";
    const mockFetch = vi.mocked(fetchJsonApi);
    mockFetch.mockClear();
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer, multiSlotPlayer]} />);
    await user.click(screen.getByText("Jake Bauers"));
    await selectDrop(user);
    await user.click(screen.getByText(/adjust slot assignments/i));
    await user.selectOptions(screen.getByRole("combobox"), "OF");
    await executeAndConfirm(user, /Execute Add \+ Drop/, /Confirm Add \+ Drop/);
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      slotChanges: [{ playerId: 700, slot: "OF" }],
    });
  });

  it("omits slotChanges from the body when no slot is adjusted", async () => {
    mockSeasonStatus.value = "SETUP";
    const mockFetch = vi.mocked(fetchJsonApi);
    mockFetch.mockClear();
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[freeAgent, ownRosterPlayer, multiSlotPlayer]} />);
    await user.click(screen.getByText("Jake Bauers"));
    await selectDrop(user);
    await executeAndConfirm(user, /Execute Add \+ Drop/, /Confirm Add \+ Drop/);
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).not.toHaveProperty("slotChanges");
  });
});

describe("AddDropPanel — chain-drop-candidates (PR #349)", () => {
  // Free agent that plays 2B — addSlots = {2B, MI}
  const fa2B: RosterMovesPlayer = {
    mlb_id: "800001",
    player_name: "Rennie Lile",
    positions: "2B",
  } as RosterMovesPlayer;

  // Tatis-like: assigned 2B, eligible for 2B and OF — direct fit for 2B FA
  const tatisFake: RosterMovesPlayer = {
    _dbPlayerId: 801,
    _dbTeamId: 147,
    player_name: "Tatis Fake",
    assignedPosition: "2B",
    positions: "2B,OF",
  } as RosterMovesPlayer;

  // Pure OF: NOT a direct or indirect fit — only reachable via chain (Tatis 2B→OF frees 2B)
  const pureOf: RosterMovesPlayer = {
    _dbPlayerId: 802,
    _dbTeamId: 147,
    player_name: "Pure OF Guy",
    assignedPosition: "OF",
    positions: "OF",
  } as RosterMovesPlayer;

  // Pure 1B: no chain path to 2B or MI — should never appear for a 2B FA
  const pureFirstBase: RosterMovesPlayer = {
    _dbPlayerId: 803,
    _dbTeamId: 147,
    player_name: "First Base Only",
    assignedPosition: "1B",
    positions: "1B",
  } as RosterMovesPlayer;

  it("chain-fit player appears when a moveable 2B+OF player creates a vacancy path", async () => {
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[fa2B, tatisFake, pureOf, pureFirstBase]} />);
    await user.click(screen.getByText("Rennie Lile"));
    expect(await screen.findByRole("row", { name: /Pure OF Guy/ })).toBeInTheDocument();
  });

  it("direct-fit player still appears alongside the chain-fit player", async () => {
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[fa2B, tatisFake, pureOf, pureFirstBase]} />);
    await user.click(screen.getByText("Rennie Lile"));
    expect(await screen.findByRole("row", { name: /Tatis Fake/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Pure OF Guy/ })).toBeInTheDocument();
  });

  it("player with no chain path does not appear in the drop list", async () => {
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[fa2B, tatisFake, pureOf, pureFirstBase]} />);
    await user.click(screen.getByText("Rennie Lile"));
    await screen.findByRole("row", { name: /Tatis Fake/ }); // wait for drop table to render
    expect(screen.queryByRole("row", { name: /First Base Only/ })).not.toBeInTheDocument();
  });

  it("shows updated 'New player eligible for' label after free agent is selected", async () => {
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[fa2B, tatisFake, pureOf]} />);
    await user.click(screen.getByText("Rennie Lile"));
    expect(await screen.findByText(/New player eligible for:/)).toBeInTheDocument();
  });

  it("shows updated empty-state text when no drops qualify", async () => {
    const pitcherFa: RosterMovesPlayer = { mlb_id: "800005", player_name: "Pitcher Paul", positions: "P" } as RosterMovesPlayer;
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[pitcherFa, pureFirstBase]} />);
    await user.click(screen.getByText("Pitcher Paul"));
    expect(await screen.findByText(/No rostered players qualify as a drop/)).toBeInTheDocument();
  });

  it("removes the 10-player cap — all 11 chain-fit players appear", async () => {
    const players: RosterMovesPlayer[] = [fa2B, tatisFake];
    for (let i = 1; i <= 11; i++) {
      players.push({
        _dbPlayerId: 900 + i,
        _dbTeamId: 147,
        player_name: `OF Player ${i}`,
        assignedPosition: "OF",
        positions: "OF",
      } as RosterMovesPlayer);
    }
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={players} />);
    await user.click(screen.getByText("Rennie Lile"));
    await screen.findByText("OF Player 1"); // wait for drop table
    for (let i = 1; i <= 11; i++) {
      expect(screen.getByText(`OF Player ${i}`)).toBeInTheDocument();
    }
  });

  it("Execute button is enabled when a chain-fit drop is selected in SETUP mode", async () => {
    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[fa2B, tatisFake, pureOf, pureFirstBase]} />);
    await user.click(screen.getByText("Rennie Lile"));
    await screen.findByRole("row", { name: /Pure OF Guy/ }); // wait for drop table
    await user.click(screen.getByRole("row", { name: /Pure OF Guy/ }));
    expect(screen.getByRole("button", { name: /Execute Add \+ Drop/ })).not.toBeDisabled();
  });

  it("3-hop chain: drop candidate only reachable through two intermediate moves is surfaced", async () => {
    // FA plays 3B → addSlots = {3B, CM}
    // catcherOnly (slot C): slotsFor("C") = {C} — no intersection with {3B, CM}: Tier 1/2 fail
    // BFS when catcherOnly is dropped:
    //   vacated={C} → catcherDh (C,DH eligible) moves to C → vacated adds DH
    //   vacated={C,DH} → cornerInfield (1B,DH eligible) moves to DH → vacated adds CM
    //   CM is in addSlots → chain-fit ✓ (3 hops: C→DH→CM)
    const fa3B: RosterMovesPlayer = {
      mlb_id: "900002",
      player_name: "Hitter McThird",
      positions: "3B",
    } as RosterMovesPlayer;
    const catcherOnly: RosterMovesPlayer = {
      _dbPlayerId: 904,
      _dbTeamId: 147,
      player_name: "Catcher Drop",
      assignedPosition: "C",
      positions: "C",
    } as RosterMovesPlayer;
    const catcherDh: RosterMovesPlayer = {
      _dbPlayerId: 905,
      _dbTeamId: 147,
      player_name: "Catcher DH Combo",
      assignedPosition: "DH",
      positions: "C,DH",
    } as RosterMovesPlayer;
    const cornerInfield: RosterMovesPlayer = {
      _dbPlayerId: 906,
      _dbTeamId: 147,
      player_name: "Corner Infield Guy",
      assignedPosition: "CM",
      positions: "1B,DH",
    } as RosterMovesPlayer;
    const pitcherNoPath: RosterMovesPlayer = {
      _dbPlayerId: 907,
      _dbTeamId: 147,
      player_name: "Pitcher No Path",
      assignedPosition: "P",
      positions: "SP",
    } as RosterMovesPlayer;

    mockSeasonStatus.value = "SETUP";
    const user = userEvent.setup();
    render(<AddDropPanel {...BASE_PROPS} players={[fa3B, catcherOnly, catcherDh, cornerInfield, pitcherNoPath]} />);
    await user.click(screen.getByText("Hitter McThird"));
    await screen.findByRole("row", { name: /Catcher Drop/ }); // wait for drop table
    expect(screen.getByRole("row", { name: /Catcher Drop/ })).toBeInTheDocument();
    // Pitcher has no chain path to 3B/CM and must not appear
    expect(screen.queryByRole("row", { name: /Pitcher No Path/ })).not.toBeInTheDocument();
  });
});
