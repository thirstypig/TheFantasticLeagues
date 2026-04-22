import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../api/base", () => ({
  fetchJsonApi: vi.fn(),
  API_BASE: "/api",
}));

const useLeagueMock = vi.fn();
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => useLeagueMock(),
}));

const toastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("../../../lib/sportConfig", () => ({
  positionToSlots: (pos: string) => [pos],
}));

import { fetchJsonApi } from "../../../api/base";
import WaiverClaimForm from "../components/WaiverClaimForm";

const freeAgent = {
  mlb_id: "777",
  _dbPlayerId: 777,
  player_name: "Alek Thomas",
  positions: "OF",
  mlb_team: "ARI",
} as any;

const freeAgentSS = {
  mlb_id: "888",
  _dbPlayerId: 888,
  player_name: "Bo Bichette",
  positions: "SS",
  mlb_team: "TOR",
} as any;

const rosteredOf = {
  _dbPlayerId: 303,
  player_name: "Bryce Harper",
  positions: "OF",
  posPrimary: "OF",
  assignedPosition: "OF",
  mlb_team: "PHI",
} as any;

const rosteredSs = {
  _dbPlayerId: 202,
  player_name: "Xander Bogaerts",
  positions: "SS",
  posPrimary: "SS",
  assignedPosition: "SS",
  mlb_team: "SD",
} as any;

function renderForm(opts: { seasonStatus?: string; myRoster?: any[]; players?: any[] } = {}) {
  useLeagueMock.mockReturnValue({ leagueId: 1, seasonStatus: opts.seasonStatus ?? "IN_SEASON" });
  return render(
    <WaiverClaimForm
      players={opts.players ?? [freeAgent, freeAgentSS]}
      myTeamId={10}
      myTeamBudget={100}
      myRoster={opts.myRoster ?? [rosteredOf, rosteredSs]}
      onComplete={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchJsonApi).mockResolvedValue({ claim: { id: 1 } });
});

describe("WaiverClaimForm — Phase 2b", () => {
  it("labels the drop dropdown 'required in-season' during IN_SEASON", async () => {
    renderForm({ seasonStatus: "IN_SEASON" });
    fireEvent.change(screen.getByPlaceholderText(/Type player name/i), { target: { value: "Alek" } });
    fireEvent.click(screen.getByText("Alek Thomas"));
    expect(screen.getByText(/Drop Player.*required in-season/i)).toBeInTheDocument();
  });

  it("labels the drop dropdown 'optional' outside IN_SEASON", async () => {
    renderForm({ seasonStatus: "DRAFT" });
    fireEvent.change(screen.getByPlaceholderText(/Type player name/i), { target: { value: "Alek" } });
    fireEvent.click(screen.getByText("Alek Thomas"));
    expect(screen.getByText(/Drop Player.*optional/i)).toBeInTheDocument();
  });

  it("disables submit when drop is required but not chosen", async () => {
    renderForm({ seasonStatus: "IN_SEASON" });
    fireEvent.change(screen.getByPlaceholderText(/Type player name/i), { target: { value: "Alek" } });
    fireEvent.click(screen.getByText("Alek Thomas"));
    const submit = screen.getByRole("button", { name: /Submit Claim/i });
    expect(submit).toBeDisabled();
  });

  it("flags ineligible drop targets inline and renders an eligibility warning", async () => {
    renderForm({ seasonStatus: "IN_SEASON" });
    fireEvent.change(screen.getByPlaceholderText(/Type player name/i), { target: { value: "Alek" } });
    fireEvent.click(screen.getByText("Alek Thomas"));
    const ssOption = screen.getByRole("option", { name: /Xander Bogaerts/i }) as HTMLOptionElement;
    expect(ssOption.textContent).toMatch(/ineligible/i);

    const dropSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(dropSelect, { target: { value: "202" } });
    expect(screen.getByText(/Alek Thomas.*not eligible for the SS slot/i)).toBeInTheDocument();
  });

  it("enables submit once an eligible drop is chosen in-season", async () => {
    renderForm({ seasonStatus: "IN_SEASON" });
    fireEvent.change(screen.getByPlaceholderText(/Type player name/i), { target: { value: "Alek" } });
    fireEvent.click(screen.getByText("Alek Thomas"));
    const dropSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(dropSelect, { target: { value: "303" } });
    const submit = screen.getByRole("button", { name: /Submit Claim/i });
    expect(submit).not.toBeDisabled();
  });

  it("submits with dropPlayerId in the payload", async () => {
    renderForm({ seasonStatus: "IN_SEASON" });
    fireEvent.change(screen.getByPlaceholderText(/Type player name/i), { target: { value: "Alek" } });
    fireEvent.click(screen.getByText("Alek Thomas"));
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "303" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit Claim/i }));
    await waitFor(() => expect(fetchJsonApi).toHaveBeenCalled());
    const call = vi.mocked(fetchJsonApi).mock.calls[0];
    expect(call[0]).toContain("/api/waivers");
    const body = JSON.parse((call[1] as any).body);
    expect(body.dropPlayerId).toBe(303);
    expect(body.teamId).toBe(10);
  });
});
