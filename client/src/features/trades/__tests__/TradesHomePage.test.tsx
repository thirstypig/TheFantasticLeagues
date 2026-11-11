import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 20, myTeamId: 1, myTeamResolved: true }),
}));
const toast = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast, confirm: vi.fn() }),
}));
vi.mock("../api", () => ({
  getTrades: vi.fn(),
  getTradeWindow: vi.fn(),
  acceptTrade: vi.fn(),
  rejectTrade: vi.fn(),
  cancelTrade: vi.fn(),
}));

import * as api from "../api";
import TradesHomePage from "../pages/TradesHomePage";
import { saveTradeDraft } from "../lib/tradeDraft";

const m = vi.mocked(api);

const team = (id: number, name: string) => ({ id, name, code: name.slice(0, 3).toUpperCase() });
const ME = team(1, "Los Doyers");
const SKUNK = team(4, "Skunk Dogs");
const BOMB = team(2, "Bombers");
const BLACK = team(3, "Black Sox");

const player = (id: number, name: string, posPrimary = "OF") => ({ id, name, posPrimary, mlbId: id * 10, mlbTeam: "SD" });
const pItem = (senderId: number, recipientId: number, p: ReturnType<typeof player>) => ({
  senderId, recipientId, assetType: "PLAYER", playerId: p.id, player: p,
  sender: [ME, SKUNK, BOMB, BLACK].find((t) => t.id === senderId), recipient: [ME, SKUNK, BOMB, BLACK].find((t) => t.id === recipientId),
});
const bItem = (senderId: number, recipientId: number, amount: number) => ({
  senderId, recipientId, assetType: "BUDGET", amount,
  sender: [ME, SKUNK, BOMB, BLACK].find((t) => t.id === senderId), recipient: [ME, SKUNK, BOMB, BLACK].find((t) => t.id === recipientId),
});
const trade = (id: number, status: string, proposer: any, items: any[], createdAt = "2026-06-14T19:42:00.000Z") => ({
  id, leagueId: 20, status, proposerId: proposer.id, proposer, items, createdAt,
});

const OFFER = trade(11, "PROPOSED", SKUNK, [pItem(4, 1, player(682, "Elly De La Cruz", "SS")), pItem(1, 4, player(694, "Paul Skenes", "SP")), bItem(1, 4, 5)]);
const MINE = trade(12, "PROPOSED", ME, [pItem(1, 2, player(665, "Fernando Tatis Jr.")), pItem(2, 1, player(547, "Bryce Harper", "1B"))]);
const ACCEPTED = trade(13, "ACCEPTED", ME, [pItem(1, 3, player(901, "Some Guy")), pItem(3, 1, player(902, "Other Guy"))]);
const ELSEWHERE = trade(14, "PROPOSED", BOMB, [pItem(2, 3, player(801, "Hidden Hitter"))]);
const DONE = trade(15, "PROCESSED", ME, [pItem(1, 2, player(903, "Done Guy")), pItem(2, 1, player(904, "Done Two"))], "2026-05-17T15:00:00.000Z");

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/trades"]}>
      <Routes>
        <Route path="/trades" element={<TradesHomePage />} />
        <Route path="/trades/new" element={<div>NEW STUB</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  m.getTradeWindow.mockResolvedValue({ open: true, message: null, rosterCap: 23 });
  m.getTrades.mockResolvedValue({ trades: [OFFER, MINE, ACCEPTED, ELSEWHERE, DONE] } as any);
  m.acceptTrade.mockResolvedValue({} as any);
  m.rejectTrade.mockResolvedValue({} as any);
  m.cancelTrade.mockResolvedValue({ success: true });
});

const card = (id: number) => screen.getByTestId(`trade-${id}`);

describe("TradesHomePage", () => {
  it("shows an offer to me with both lists and Accept / Reject", async () => {
    renderPage();
    const c = within(await screen.findByTestId("trade-11"));
    expect(c.getByText("From Skunk Dogs")).toBeInTheDocument();
    expect(c.getByText(/You get:.*Elly De La Cruz/)).toBeInTheDocument();
    expect(c.getByText(/You give:.*Paul Skenes.*\$5 auction/)).toBeInTheDocument();
    expect(c.getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(c.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("accept goes through a confirm sheet and calls acceptTrade", async () => {
    renderPage();
    await screen.findByTestId("trade-11");
    fireEvent.click(within(card(11)).getByRole("button", { name: "Accept" }));
    const dialog = await screen.findByRole("dialog");
    expect(m.acceptTrade).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Accept trade" }));
    await waitFor(() => expect(m.acceptTrade).toHaveBeenCalledWith(11));
    await waitFor(() => expect(m.getTrades).toHaveBeenCalledTimes(2));
  });

  it("reject calls rejectTrade after confirming", async () => {
    renderPage();
    await screen.findByTestId("trade-11");
    fireEvent.click(within(card(11)).getByRole("button", { name: "Reject" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Reject trade" }));
    await waitFor(() => expect(m.rejectTrade).toHaveBeenCalledWith(11));
  });

  it("my offer shows Waiting and Cancel; cancel calls cancelTrade", async () => {
    renderPage();
    await screen.findByTestId("trade-12");
    const c = within(card(12));
    expect(c.getByText("Waiting")).toBeInTheDocument();
    expect(c.getByText("To Bombers")).toBeInTheDocument();
    fireEvent.click(c.getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel offer" }));
    await waitFor(() => expect(m.cancelTrade).toHaveBeenCalledWith(12));
  });

  it("an accepted trade says it is with the commissioner", async () => {
    renderPage();
    await screen.findByTestId("trade-13");
    expect(within(card(13)).getByText(/Accepted · with commissioner/)).toBeInTheDocument();
    expect(within(card(13)).queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("hides trades that do not involve my team", async () => {
    renderPage();
    await screen.findByTestId("trade-11");
    expect(screen.queryByTestId("trade-14")).not.toBeInTheDocument();
    expect(screen.queryByText(/Hidden Hitter/)).not.toBeInTheDocument();
  });

  it("lists processed trades under Done this season, one line each", async () => {
    renderPage();
    await screen.findByText("Done this season");
    const line = screen.getByTestId("trade-15");
    expect(line).toHaveTextContent(/Bombers/);
    expect(line).toHaveTextContent(/processed/i);
  });

  it("disables Accept with the window message when the window is closed", async () => {
    m.getTradeWindow.mockResolvedValue({ open: false, message: "Trades open at the next meeting, after Period 8 closes.", rosterCap: 23 });
    renderPage();
    await screen.findByTestId("trade-11");
    expect(within(card(11)).getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(await within(card(11)).findByText("Trades open at the next meeting, after Period 8 closes.")).toBeInTheDocument();
  });

  it("reloads after a 400 and shows the error on that card", async () => {
    m.acceptTrade.mockRejectedValue(new Error("Bryce Harper is no longer on Bombers"));
    m.getTrades.mockResolvedValueOnce({ trades: [OFFER, MINE] } as any).mockResolvedValue({ trades: [OFFER, MINE] } as any);
    renderPage();
    await screen.findByTestId("trade-11");
    fireEvent.click(within(card(11)).getByRole("button", { name: "Accept" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Accept trade" }));
    expect(await within(card(11)).findByRole("alert")).toHaveTextContent("Bryce Harper is no longer on Bombers");
    await waitFor(() => expect(m.getTrades).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(card(12)).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("only a recipient gets Accept/Reject; a sender-only team sees Waiting", async () => {
    // Skunk Dogs (4) proposes; I (1) receive from 4 and also send to 3? Use 3 teams: A=4 proposes, 4->1 and 3->4.
    const THREE = trade(21, "PROPOSED", SKUNK, [pItem(4, 1, player(701, "To Me")), pItem(1, 3, player(702, "Mine Out")), pItem(3, 4, player(703, "To Skunk"))]);
    // A trade where I only SEND: Skunk proposes, I send to Skunk, Black Sox sends to Skunk... recipient is Skunk only.
    const SENDER_ONLY = trade(22, "PROPOSED", SKUNK, [pItem(1, 2, player(711, "Sender Only")), pItem(2, 4, player(712, "Elsewhere"))]);
    m.getTrades.mockResolvedValue({ trades: [THREE, SENDER_ONLY] } as any);
    renderPage();
    await screen.findByTestId("trade-21");
    expect(within(card(21)).getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(within(card(22)).queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(within(card(22)).queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(within(card(22)).getByText("Waiting")).toBeInTheDocument();
  });

  it("names every other team in the confirm title", async () => {
    const MULTI = trade(23, "PROPOSED", SKUNK, [pItem(4, 1, player(721, "A")), pItem(2, 1, player(722, "B"))]);
    m.getTrades.mockResolvedValue({ trades: [MULTI] } as any);
    renderPage();
    await screen.findByTestId("trade-23");
    fireEvent.click(within(card(23)).getByRole("button", { name: "Accept" }));
    expect(await screen.findByText(/Accept this trade from Bombers and Skunk Dogs\?/)).toBeInTheDocument();
  });

  it("raises an error toast when an action fails", async () => {
    m.acceptTrade.mockRejectedValue(new Error("Trade is not in PROPOSED status"));
    renderPage();
    await screen.findByTestId("trade-11");
    fireEvent.click(within(card(11)).getByRole("button", { name: "Accept" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Accept trade" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Trade is not in PROPOSED status", "error"));
  });

  it("lists Done newest first and caps at 20", async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      trade(100 + i, "PROCESSED", ME, [pItem(1, 2, player(900 + i, `P${i}`)), pItem(2, 1, player(950 + i, `Q${i}`))],
        new Date(Date.UTC(2026, 4, 1 + i, 12)).toISOString()));
    m.getTrades.mockResolvedValue({ trades: many } as any);
    renderPage();
    await screen.findByText("Done this season");
    const ids = screen.getAllByTestId(/^trade-/).map((el) => el.getAttribute("data-testid"));
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe("trade-124"); // newest
    expect(ids[19]).toBe("trade-105");
    expect(screen.queryByTestId("trade-104")).not.toBeInTheDocument();
  });

  it("New trade links to /trades/new and reads Continue trade when a draft exists", async () => {
    const { unmount } = renderPage();
    const link = await screen.findByRole("link", { name: "+ New trade" });
    expect(link).toHaveAttribute("href", "/trades/new");
    unmount();
    saveTradeDraft({ leagueId: 20, partnerId: 2, give: [], get: [], giveDollars: 0, getDollars: 0 });
    renderPage();
    expect(await screen.findByRole("link", { name: "Continue trade" })).toHaveAttribute("href", "/trades/new");
  });

  it("shows the empty state when nothing involves me", async () => {
    m.getTrades.mockResolvedValue({ trades: [ELSEWHERE] } as any);
    renderPage();
    expect(await screen.findByText("No trades yet.")).toBeInTheDocument();
    expect(screen.queryByText("Offers to you")).not.toBeInTheDocument();
  });
});
