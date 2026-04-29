import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlaceOnIlPanel from "../PlaceOnIlPanel";
import { ilStash } from "../../../../transactions/api";
import type { RosterMovesPlayer } from "../types";

// Mock the API wrapper at the module boundary — we're asserting the panel
// forwards `effectiveDate` correctly into the payload, not re-testing the
// wrapper (that belongs to ../__tests__/api.test.ts).
vi.mock("../../../../transactions/api", () => ({
  ilStash: vi.fn().mockResolvedValue({ success: true }),
  formatReassignmentsToast: vi.fn().mockReturnValue(null),
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

// mlbStatus that matches the real MLB API format — isMlbIlStatus regex is
// /^Injured (List )?\d+-Day$/. An MLB-IL-status roster player is required
// for the server to accept an il-stash; the panel surfaces the warning
// up-front when not present.
const ilStashCandidate = {
  _dbPlayerId: 500,
  _dbTeamId: 147,
  player_name: "Byron Buxton",
  assignedPosition: "OF",
  posPrimary: "OF",
  positions: "OF",
  mlbStatus: "Injured 10-Day",
} as RosterMovesPlayer;

const freeAgentReplacement = {
  mlb_id: "642731",
  player_name: "Jake Bauers",
  positions: "OF,1B",
} as RosterMovesPlayer;

beforeEach(() => {
  vi.clearAllMocks();
});

async function setUpAndSubmit(effectiveDate?: string) {
  const user = userEvent.setup();
  render(
    <PlaceOnIlPanel
      leagueId={20}
      teamId={147}
      players={[ilStashCandidate, freeAgentReplacement]}
      onComplete={vi.fn()}
      effectiveDate={effectiveDate}
    />
  );

  // Pick the stash player from the only <select> in the panel. The panel's
  // selects aren't wired with htmlFor/id, so we query by role rather than
  // label text.
  const stashSelect = screen.getByRole("combobox");
  await user.selectOptions(stashSelect, String(ilStashCandidate._dbPlayerId));

  // Pick the free-agent replacement button.
  await user.click(screen.getByText("Jake Bauers"));

  // Submit.
  await user.click(screen.getByRole("button", { name: /Stash \+ Add/i }));
}

describe("PlaceOnIlPanel initialStashPlayerId preselection", () => {
  it("preselects the stash dropdown when initialStashPlayerId is provided", () => {
    render(
      <PlaceOnIlPanel
        leagueId={20}
        teamId={147}
        players={[ilStashCandidate, freeAgentReplacement]}
        onComplete={vi.fn()}
        initialStashPlayerId={ilStashCandidate._dbPlayerId}
      />
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe(String(ilStashCandidate._dbPlayerId));
  });

  it("re-applies preselection when initialStashPlayerId changes (e.g., commissioner clicks IL on a different row)", async () => {
    const otherCandidate = {
      ...ilStashCandidate,
      _dbPlayerId: 501,
      player_name: "Other Player",
    } as RosterMovesPlayer;

    const { rerender } = render(
      <PlaceOnIlPanel
        leagueId={20}
        teamId={147}
        players={[ilStashCandidate, otherCandidate, freeAgentReplacement]}
        onComplete={vi.fn()}
        initialStashPlayerId={ilStashCandidate._dbPlayerId}
      />
    );

    let select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe(String(ilStashCandidate._dbPlayerId));

    // Parent updates the preselect to a different player.
    rerender(
      <PlaceOnIlPanel
        leagueId={20}
        teamId={147}
        players={[ilStashCandidate, otherCandidate, freeAgentReplacement]}
        onComplete={vi.fn()}
        initialStashPlayerId={otherCandidate._dbPlayerId}
      />
    );

    select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe(String(otherCandidate._dbPlayerId));
  });
});

describe("PlaceOnIlPanel effectiveDate forwarding", () => {
  it("forwards effectiveDate to ilStash when the prop is set", async () => {
    await setUpAndSubmit("2026-04-20");

    expect(ilStash).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(ilStash).mock.calls[0][0];
    expect(payload).toMatchObject({
      leagueId: 20,
      teamId: 147,
      stashPlayerId: 500,
      addMlbId: 642731,
      effectiveDate: "2026-04-20",
    });
  });

  it("omits effectiveDate from the payload when the prop is undefined", async () => {
    await setUpAndSubmit(undefined);

    expect(ilStash).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(ilStash).mock.calls[0][0];
    expect(payload).not.toHaveProperty("effectiveDate");
  });

  it("omits effectiveDate from the payload when the prop is an empty string", async () => {
    // Empty string is the "use server default" sentinel — the panel's spread
    // `...(effectiveDate ? { effectiveDate } : {})` must treat it the same
    // as undefined, otherwise a stale empty string from the header picker
    // would hit the server as effectiveDate=""` and fail validation.
    await setUpAndSubmit("");

    expect(ilStash).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(ilStash).mock.calls[0][0];
    expect(payload).not.toHaveProperty("effectiveDate");
  });
});

describe("PlaceOnIlPanel — Yahoo-style auto-resolve toast (PR1 of plan #166)", () => {
  it("calls toast() when server returns appliedReassignments", async () => {
    // Override the formatter to return a non-null string so we can assert
    // the toast call without needing to keep the real format in lockstep.
    const { formatReassignmentsToast } = await import("../../../../transactions/api");
    vi.mocked(formatReassignmentsToast).mockReturnValueOnce("Stashed Buxton. Also moved: X 2B → SS.");
    vi.mocked(ilStash).mockResolvedValueOnce({
      success: true,
      stashPlayerId: 500,
      addPlayerId: 999,
      appliedReassignments: [
        { rosterId: 7, playerId: 5, playerName: "X", oldSlot: "2B", newSlot: "SS" },
      ],
    });
    await setUpAndSubmit(undefined);
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringContaining("Also moved"),
      "success",
    );
  });
});
