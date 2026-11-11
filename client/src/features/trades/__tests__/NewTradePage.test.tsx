import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 20, myTeamId: 1 }),
}));
const toast = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast, confirm: vi.fn() }),
}));
vi.mock("../api", () => ({
  getTradeWindow: vi.fn(),
  getTradeLeagueTeams: vi.fn(),
  getTradeTeamRoster: vi.fn(),
  proposeTrade: vi.fn(),
}));

import * as api from "../api";
import NewTradePage from "../pages/NewTradePage";
import { loadTradeDraft, saveTradeDraft } from "../lib/tradeDraft";

const m = vi.mocked(api);

const row = (playerId: number, name: string, posPrimary: string, mlbTeam: string, assignedPosition: string | null = posPrimary) => ({
  id: playerId + 1000, playerId, mlbId: playerId * 10, name, posPrimary, mlbTeam, assignedPosition, price: 1,
});

const MINE = {
  team: { id: 1, name: "Los Doyers", owner: "Me", budget: 40 },
  currentRoster: [
    row(101, "Fernando Tatis Jr.", "OF", "SD"),
    row(102, "Paul Skenes", "SP", "PIT"),
    row(103, "Zac Gallen", "SP", "ARI", "IL"),
  ],
};
const THEIRS = {
  team: { id: 2, name: "Bombers", owner: "Them", budget: 12 },
  currentRoster: [
    row(201, "Bryce Harper", "1B", "PHI"),
    row(202, "Pete Alonso", "1B", "NYM"),
    row(203, "Elly De La Cruz", "SS", "CIN"),
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/trades/new"]}>
      <Routes>
        <Route path="/trades/new" element={<NewTradePage />} />
        <Route path="/trades" element={<div>TRADES STUB</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const tick = (name: string) => fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(name) }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  m.getTradeWindow.mockResolvedValue({ open: true, message: null, rosterCap: 3 });
  m.getTradeLeagueTeams.mockResolvedValue([
    { id: 2, name: "Bombers", code: "BOM" },
    { id: 1, name: "Los Doyers", code: "LOS" },
    { id: 3, name: "Black Sox", code: "BLK" },
  ] as any);
  m.getTradeTeamRoster.mockImplementation(async (id: number) => (id === 1 ? MINE : THEIRS) as any);
  m.proposeTrade.mockResolvedValue({ id: 9 } as any);
});

async function pickBombers() {
  fireEvent.click(await screen.findByRole("button", { name: "Bombers" }));
  await screen.findByText("Bryce Harper");
}

describe("NewTradePage", () => {
  it("lists every team but mine A to Z as pills", async () => {
    renderPage();
    const pills = await screen.findAllByTestId("partner-pill");
    expect(pills.map((p) => p.textContent)).toEqual(["Black Sox", "Bombers"]);
  });

  it("renders both rosters for the chosen partner", async () => {
    renderPage();
    await pickBombers();
    expect(screen.getByText("You give · Los Doyers")).toBeInTheDocument();
    expect(screen.getByText("You get · Bombers")).toBeInTheDocument();
    expect(screen.getByText("Fernando Tatis Jr.")).toBeInTheDocument();
    expect(screen.getByText("Pete Alonso")).toBeInTheDocument();
    expect(screen.getByText("OF · SD")).toBeInTheDocument();
  });

  it("does not let an IL player be ticked", async () => {
    renderPage();
    await pickBombers();
    const gallen = screen.getByRole("checkbox", { name: /Zac Gallen/ });
    expect(gallen).toBeDisabled();
    expect(screen.getByText("On IL")).toBeInTheDocument();
    fireEvent.click(gallen);
    expect(loadTradeDraft(20)?.give ?? []).toEqual([]);
    expect(screen.getByRole("button", { name: "Review trade" })).toBeDisabled();
  });

  it("keeps the button disabled as Review trade until something is ticked", async () => {
    renderPage();
    await pickBombers();
    expect(screen.getByRole("button", { name: "Review trade" })).toBeDisabled();
  });

  it("a 2-for-1 that overflows the partner disables Send and shows the bad line", async () => {
    renderPage();
    await pickBombers();
    tick("Fernando Tatis Jr.");
    tick("Paul Skenes");
    tick("Bryce Harper");
    expect(screen.getByText("Bombers would have 4 players (limit 3)")).toBeInTheDocument();
    expect(screen.getByText("Los Doyers goes to 1 and fills the spot at the meeting")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send to Bombers" })).toBeDisabled();
  });

  it("a closed window shows the banner and a disabled button", async () => {
    m.getTradeWindow.mockResolvedValue({ open: false, message: "Trades open at the next meeting, after Period 8 closes.", rosterCap: 3 });
    renderPage();
    await pickBombers();
    expect(screen.getByText(/Trades open at the next meeting, after Period 8 closes\./)).toBeInTheDocument();
    expect(screen.getByText(/You can build one now and send it then\./)).toBeInTheDocument();
    tick("Fernando Tatis Jr.");
    tick("Bryce Harper");
    expect(screen.getByRole("button", { name: "Trades open at the next meeting" })).toBeDisabled();
    expect(loadTradeDraft(20)).toMatchObject({ partnerId: 2, give: [101], get: [201] });
  });

  it("send posts the exact items, clears the draft and goes to /trades", async () => {
    renderPage();
    await pickBombers();
    tick("Fernando Tatis Jr.");
    tick("Bryce Harper");
    fireEvent.click(screen.getByRole("button", { name: "+ Add auction dollars" }));
    fireEvent.change(screen.getByLabelText("You give $"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("You get $"), { target: { value: "99" } }); // capped at 12
    expect(screen.getByLabelText("You get $")).toHaveValue(12);
    fireEvent.change(screen.getByLabelText("You get $"), { target: { value: "0" } });

    fireEvent.click(screen.getByRole("button", { name: "Send to Bombers" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Send this trade to Bombers?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Send trade" }));

    await waitFor(() => expect(m.proposeTrade).toHaveBeenCalledTimes(1));
    expect(m.proposeTrade).toHaveBeenCalledWith({
      leagueId: 20,
      proposerTeamId: 1,
      items: [
        { senderId: 1, recipientId: 2, assetType: "PLAYER", playerId: 101 },
        { senderId: 2, recipientId: 1, assetType: "PLAYER", playerId: 201 },
        { senderId: 1, recipientId: 2, assetType: "BUDGET", amount: 5 },
      ],
    });
    await screen.findByText("TRADES STUB");
    expect(toast).toHaveBeenCalled();
    expect(loadTradeDraft(20)).toBeNull();
  });

  it("keeps the draft when send returns 409", async () => {
    m.proposeTrade.mockRejectedValue(new Error("Trades open at the next meeting, after Period 8 closes."));
    renderPage();
    await pickBombers();
    tick("Fernando Tatis Jr.");
    tick("Bryce Harper");
    fireEvent.click(screen.getByRole("button", { name: "Send to Bombers" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Send trade" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Trades open at the next meeting, after Period 8 closes.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("TRADES STUB")).not.toBeInTheDocument();
    expect(loadTradeDraft(20)).toMatchObject({ partnerId: 2, give: [101], get: [201] });
  });

  it("restores the draft after a remount, dropping players no longer on the roster", async () => {
    saveTradeDraft({ leagueId: 20, partnerId: 2, give: [101, 999], get: [202], giveDollars: 3, getDollars: 0 });
    renderPage();
    await screen.findByText("Bryce Harper");
    expect(screen.getByRole("checkbox", { name: /Fernando Tatis Jr\./ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Pete Alonso/ })).toBeChecked();
    expect(screen.getByLabelText("You give $")).toHaveValue(3);
    expect(loadTradeDraft(20)?.give).toEqual([101]);
  });

  it("ignores a draft whose partner no longer exists", async () => {
    saveTradeDraft({ leagueId: 20, partnerId: 77, give: [101], get: [], giveDollars: 0, getDollars: 0 });
    renderPage();
    await screen.findAllByTestId("partner-pill");
    expect(screen.queryByText(/You give ·/)).not.toBeInTheDocument();
  });
});
