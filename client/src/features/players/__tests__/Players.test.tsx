import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 20, myTeamId: 1, myTeamCode: "LOS", outfieldMode: "OF", seasonStatus: "IN_SEASON" }),
}));
vi.mock("../../../components/shared/playerCard/PlayerCardProvider", () => ({
  usePlayerCard: () => ({ open: vi.fn(), close: vi.fn() }),
  PlayerLink: ({ name }: { name: string }) => <button type="button">{name}</button>,
}));
vi.mock("../../../hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("../../../api", async (orig) => ({
  ...(await orig<typeof import("../../../api")>()),
  getPlayerSeasonStatsMeta: vi.fn(),
  getPlayerPeriodStatsMeta: vi.fn(),
}));
vi.mock("../api", () => ({
  getPendingWirePeriodId: vi.fn(),
  addToWireList: vi.fn(),
}));

import * as rootApi from "../../../api";
import * as localApi from "../api";
import Players from "../pages/Players";

const season = vi.mocked(rootApi.getPlayerSeasonStatsMeta);
const period = vi.mocked(rootApi.getPlayerPeriodStatsMeta);

const H = (id: number, name: string, positions: string, team: string, code = "", teamId: number | null = null, r = 10) => ({
  id, mlb_id: String(id * 10), row_id: `${id * 10}-H`, player_name: name, positions, is_pitcher: false,
  mlb_team: team, ogba_team_code: code, ogba_team_id: teamId, R: r, HR: 1, RBI: 2, SB: 3, AVG: 0.25, G: 20,
});
const P = (id: number, name: string) => ({
  id, mlb_id: String(id * 10), row_id: `${id * 10}-P`, player_name: name, positions: "P", is_pitcher: true,
  mlb_team: "PIT", ogba_team_code: "", ogba_team_id: null, W: 4, SV: 0, K: 50, ERA: 3.1, WHIP: 1.1, G: 10,
});

beforeEach(() => {
  vi.clearAllMocks();
  season.mockResolvedValue({
    stats: [
      H(1, "Free Outfielder", "OF", "ATL", "", null, 41),
      H(2, "Free Shortstop", "SS", "NYM"),
      H(3, "Bomber First", "1B", "PHI", "BOM", 2),
      H(4, "Mine Catcher", "C", "LAD", "LOS", 1),
      P(5, "Free Pitcher"),
    ] as any,
    computedAt: null,
  });
  period.mockResolvedValue({
    stats: [{ mlb_id: "10", periodId: 3, periodName: "Period 3", R: 7, HR: 0, RBI: 1, SB: 0, AVG: 0.5 }] as any,
    computedAt: null,
  });
  vi.mocked(localApi.getPendingWirePeriodId).mockResolvedValue(3);
  vi.mocked(localApi.addToWireList).mockResolvedValue(undefined);
});

const renderPage = () => render(<MemoryRouter initialEntries={["/players"]}><Players /></MemoryRouter>);

describe("Players page", () => {
  it("defaults to free agents (hitters)", async () => {
    renderPage();
    await screen.findByText("Free Outfielder");
    expect(screen.getByText("Free Shortstop")).toBeInTheDocument();
    expect(screen.queryByText("Bomber First")).toBeNull();
    expect(screen.queryByText("Mine Catcher")).toBeNull();
    expect(screen.queryByText("Free Pitcher")).toBeNull();
  });

  it("availability All players / On a team", async () => {
    renderPage();
    await screen.findByText("Free Outfielder");
    fireEvent.change(screen.getByLabelText("Availability"), { target: { value: "all" } });
    expect(screen.getByText("Bomber First")).toBeInTheDocument();
    expect(screen.getByText("Free Outfielder")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Availability"), { target: { value: "taken" } });
    expect(screen.getByText("Bomber First")).toBeInTheDocument();
    expect(screen.queryByText("Free Outfielder")).toBeNull();
  });

  it("search filters by name; position and availability filters combine", async () => {
    renderPage();
    await screen.findByText("Free Outfielder");
    fireEvent.change(screen.getByLabelText("Search players"), { target: { value: "short" } });
    expect(screen.getByText("Free Shortstop")).toBeInTheDocument();
    expect(screen.queryByText("Free Outfielder")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search players"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Availability"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Position"), { target: { value: "SS" } });
    expect(screen.getByText("Free Shortstop")).toBeInTheDocument();
    expect(screen.queryByText("Bomber First")).toBeNull();
    fireEvent.change(screen.getByLabelText("Availability"), { target: { value: "taken" } });
    expect(screen.queryByText("Free Shortstop")).toBeNull();
  });

  it("pitchers tab shows pitcher rows", async () => {
    renderPage();
    await screen.findByText("Free Outfielder");
    fireEvent.click(screen.getByRole("button", { name: "Pitchers" }));
    expect(screen.getByText("Free Pitcher")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "WHIP" })).toBeInTheDocument();
  });

  it("This period range reads period stats", async () => {
    renderPage();
    await screen.findByText("Free Outfielder");
    expect(screen.getByText("41")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Range"), { target: { value: "period" } });
    const row = screen.getByText("Free Outfielder").closest("tr")!;
    expect(within(row).getByText("7")).toBeInTheDocument();
    expect(within(row).queryByText("41")).toBeNull();
    expect(within(row).getByText(".500")).toBeInTheDocument();
  });

  it("+ Wire List posts to the pending period and then shows On Wire List", async () => {
    renderPage();
    await screen.findByText("Free Outfielder");
    const row = screen.getByText("Free Outfielder").closest("tr")!;
    fireEvent.click(await within(row).findByRole("button", { name: "+ Wire List" }));
    await waitFor(() => expect(localApi.addToWireList).toHaveBeenCalledWith(3, 1, 1));
    expect(await within(row).findByRole("button", { name: "On Wire List" })).toBeDisabled();
  });

  it("an already-listed 409 is treated as On Wire List", async () => {
    const { ApiError } = await import("../../../api/base");
    vi.mocked(localApi.addToWireList).mockRejectedValue(new ApiError({ message: "dup", status: 409, url: "", requestId: null, body: null }));
    renderPage();
    await screen.findByText("Free Outfielder");
    const row = screen.getByText("Free Outfielder").closest("tr")!;
    fireEvent.click(await within(row).findByRole("button", { name: "+ Wire List" }));
    expect(await within(row).findByRole("button", { name: "On Wire List" })).toBeDisabled();
  });

  it("no + Wire List when no pending period", async () => {
    vi.mocked(localApi.getPendingWirePeriodId).mockResolvedValue(null);
    renderPage();
    await screen.findByText("Free Outfielder");
    expect(screen.queryByRole("button", { name: "+ Wire List" })).toBeNull();
  });
});
