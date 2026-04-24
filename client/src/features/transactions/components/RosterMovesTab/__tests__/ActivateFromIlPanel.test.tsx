import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivateFromIlPanel from "../ActivateFromIlPanel";
import { ilActivate } from "../../../../transactions/api";
import type { RosterMovesPlayer } from "../types";

vi.mock("../../../../transactions/api", () => ({
  ilActivate: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("../../../../../lib/errorBus", () => ({
  reportError: vi.fn(),
}));

vi.mock("../../../../../components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

const ilPlayer = {
  _dbPlayerId: 500,
  _dbTeamId: 147,
  player_name: "Byron Buxton",
  assignedPosition: "IL",
  posPrimary: "OF",
  positions: "OF",
} as RosterMovesPlayer;

const dropCandidate = {
  _dbPlayerId: 600,
  _dbTeamId: 147,
  player_name: "Jake Bauers",
  assignedPosition: "OF",
  positions: "OF,1B",
} as RosterMovesPlayer;

beforeEach(() => {
  vi.clearAllMocks();
});

async function setUpAndSubmit(effectiveDate?: string) {
  const user = userEvent.setup();
  render(
    <ActivateFromIlPanel
      leagueId={20}
      teamId={147}
      players={[ilPlayer, dropCandidate]}
      onComplete={vi.fn()}
      effectiveDate={effectiveDate}
    />
  );

  // Two selects in document order: [activate, drop]. Panel's selects aren't
  // wired with htmlFor/id; use role + positional index for stability.
  const [activateSelect, dropSelect] = screen.getAllByRole("combobox");
  await user.selectOptions(activateSelect, String(ilPlayer._dbPlayerId));
  await user.selectOptions(dropSelect, String(dropCandidate._dbPlayerId));
  await user.click(screen.getByRole("button", { name: /Activate \+ Drop/i }));
}

describe("ActivateFromIlPanel initialActivatePlayerId preselection", () => {
  it("preselects the activate dropdown when initialActivatePlayerId is provided", () => {
    render(
      <ActivateFromIlPanel
        leagueId={20}
        teamId={147}
        players={[ilPlayer, dropCandidate]}
        onComplete={vi.fn()}
        initialActivatePlayerId={ilPlayer._dbPlayerId}
      />
    );
    const [activateSelect] = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(activateSelect.value).toBe(String(ilPlayer._dbPlayerId));
  });
});

describe("ActivateFromIlPanel effectiveDate forwarding", () => {
  it("forwards effectiveDate to ilActivate when the prop is set", async () => {
    await setUpAndSubmit("2026-04-20");

    expect(ilActivate).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(ilActivate).mock.calls[0][0];
    expect(payload).toMatchObject({
      leagueId: 20,
      teamId: 147,
      activatePlayerId: 500,
      dropPlayerId: 600,
      effectiveDate: "2026-04-20",
    });
  });

  it("omits effectiveDate from the payload when the prop is undefined", async () => {
    await setUpAndSubmit(undefined);

    expect(ilActivate).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(ilActivate).mock.calls[0][0];
    expect(payload).not.toHaveProperty("effectiveDate");
  });

  it("omits effectiveDate from the payload when the prop is an empty string", async () => {
    await setUpAndSubmit("");

    expect(ilActivate).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(ilActivate).mock.calls[0][0];
    expect(payload).not.toHaveProperty("effectiveDate");
  });
});
