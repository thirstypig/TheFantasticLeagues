import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 20, myTeamId: leagueState.myTeamId, myTeamResolved: leagueState.myTeamResolved }),
}));
const leagueState = vi.hoisted(() => ({ myTeamId: 1 as number | null, myTeamResolved: true }));
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

function renderPage(url = "/trades/new") {
  return render(
    <MemoryRouter initialEntries={[url]}>
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
  leagueState.myTeamId = 1;
  leagueState.myTeamResolved = true;
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
  it("preselects team and player from ?team=&get=", async () => {
    renderPage("/trades/new?team=2&get=202");
    await screen.findByText("Pete Alonso");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Pete Alonso/ })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: /Bryce Harper/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Bombers" })).toHaveAttribute("aria-pressed", "true");
  });

  it("the query overrides a restored draft's partner and get list", async () => {
    saveTradeDraft({ leagueId: 20, partnerId: 3, give: [101], get: [999], giveDollars: 0, getDollars: 0 });
    renderPage("/trades/new?team=2&get=203");
    await screen.findByText("Elly De La Cruz");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Elly De La Cruz/ })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: /Tatis/ })).toBeChecked(); // my give side survives
    expect(loadTradeDraft(20)?.partnerId).toBe(2);
    expect(loadTradeDraft(20)?.get).toEqual([203]);
  });

  it("applies ?get= once: an untick survives a later roster refresh", async () => {
    renderPage("/trades/new?team=2&get=202");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Pete Alonso/ })).toBeChecked());
    fireEvent.click(screen.getByRole("checkbox", { name: /Pete Alonso/ }));
    expect(screen.getByRole("checkbox", { name: /Pete Alonso/ })).not.toBeChecked();
    // Re-pick the same partner after another: roster reloads for the same team id.
    fireEvent.click(screen.getByRole("button", { name: "Black Sox" }));
    fireEvent.click(screen.getByRole("button", { name: "Bombers" }));
    await screen.findByText("Bryce Harper");
    expect(screen.getByRole("checkbox", { name: /Pete Alonso/ })).not.toBeChecked();
  });

  it("selects the partner but not a player who is not on their roster", async () => {
    renderPage("/trades/new?team=2&get=555");
    await screen.findByText("Bryce Harper");
    for (const box of screen.getAllByRole("checkbox")) expect(box).not.toBeChecked();
  });

  it("does not tick an IL player from the query", async () => {
    m.getTradeTeamRoster.mockImplementation(async (id: number) =>
      (id === 1 ? MINE : { ...THEIRS, currentRoster: [row(201, "Bryce Harper", "1B", "PHI"), row(204, "Hurt Guy", "OF", "NYM", "IL")] }) as any);
    renderPage("/trades/new?team=2&get=204");
    await screen.findByText("Bryce Harper");
    expect(screen.getByRole("checkbox", { name: /Hurt Guy/ })).not.toBeChecked();
    expect(loadTradeDraft(20)?.get ?? []).toEqual([]);
  });

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

  it("caps the give side at my budget and the get side at theirs", async () => {
    renderPage();
    await pickBombers();
    fireEvent.click(screen.getByRole("button", { name: "+ Add auction dollars" }));
    fireEvent.change(screen.getByLabelText("You give $"), { target: { value: "99" } });
    expect(screen.getByLabelText("You give $")).toHaveValue(40);
    expect(screen.getByLabelText("You give $")).toHaveAttribute("max", "40");
    expect(screen.getByText("of $40")).toBeInTheDocument();
    expect(screen.getByLabelText("You get $")).toHaveAttribute("max", "12");
    expect(screen.getByText("of $12")).toBeInTheDocument();
  });

  it("clamps a restored draft's dollars to each side's own budget", async () => {
    saveTradeDraft({ leagueId: 20, partnerId: 2, give: [], get: [], giveDollars: 30, getDollars: 30 });
    renderPage();
    await screen.findByText("Bryce Harper");
    expect(screen.getByLabelText("You give $")).toHaveValue(30); // under my 40
    expect(screen.getByLabelText("You get $")).toHaveValue(12); // over their 12
    expect(loadTradeDraft(20)).toMatchObject({ giveDollars: 30, getDollars: 12 });
  });

  it("turns negative or fractional restored dollars into whole non-negative numbers", async () => {
    localStorage.setItem("fbst.tradeDraft.v1.20", JSON.stringify({ leagueId: 20, partnerId: 2, give: [], get: [], giveDollars: -5, getDollars: 2.7 }));
    renderPage();
    await screen.findByText("Bryce Harper");
    expect(loadTradeDraft(20)).toMatchObject({ giveDollars: 0, getDollars: 2 });
  });

  it("drops a restored partner that is not in the league without fetching its roster", async () => {
    m.getTradeTeamRoster.mockImplementation(async (id: number) => {
      if (id === 1) return MINE as any;
      if (id === 77) throw new Error("Team not found");
      return THEIRS as any;
    });
    saveTradeDraft({ leagueId: 20, partnerId: 77, give: [101], get: [], giveDollars: 0, getDollars: 0 });
    renderPage();
    await screen.findAllByTestId("partner-pill");
    expect(m.getTradeTeamRoster).not.toHaveBeenCalledWith(77);
    expect(screen.queryByText(/Couldn.t load the trade screen/)).not.toBeInTheDocument();
    expect(loadTradeDraft(20)?.partnerId).toBeNull();
  });

  it("a failed partner roster load is an inline error that picking another team clears", async () => {
    m.getTradeTeamRoster.mockImplementation(async (id: number) => {
      if (id === 1) return MINE as any;
      if (id === 3) throw new Error("Team not found");
      return THEIRS as any;
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Black Sox" }));
    expect(await screen.findByText(/Couldn.t load Black Sox/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bombers" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bombers" }));
    await screen.findByText("Bryce Harper");
    expect(screen.queryByText(/Couldn.t load Black Sox/)).not.toBeInTheDocument();
  });

  it("a slow roster for a previous partner does not overwrite the current one", async () => {
    let releaseSlow: (v: any) => void = () => {};
    const slow = new Promise((r) => { releaseSlow = r; });
    m.getTradeTeamRoster.mockImplementation((id: number) =>
      id === 1 ? Promise.resolve(MINE as any) : id === 3 ? (slow as any) : Promise.resolve(THEIRS as any));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Black Sox" }));
    fireEvent.click(screen.getByRole("button", { name: "Bombers" }));
    await screen.findByText("Bryce Harper");
    releaseSlow({ team: { id: 3, name: "Black Sox", owner: "x", budget: 1 }, currentRoster: [row(301, "Late Guy", "C", "NYY")] });
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText("Late Guy")).not.toBeInTheDocument();
    expect(screen.getByText("Bryce Harper")).toBeInTheDocument();
  });

  it("does not say you need a team while your team is still resolving", async () => {
    leagueState.myTeamId = null;
    leagueState.myTeamResolved = false;
    renderPage();
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText(/You need a team/)).not.toBeInTheDocument();
  });

  it("says you need a team once resolution finished with none", async () => {
    leagueState.myTeamId = null;
    renderPage();
    expect(await screen.findByText(/You need a team/)).toBeInTheDocument();
  });
});
