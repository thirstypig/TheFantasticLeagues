import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const league = vi.hoisted(() => ({ seasonStatus: "IN_SEASON" as string }));
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 20, seasonStatus: league.seasonStatus }),
}));

vi.mock("../api", () => ({
  getCommissionerRules: vi.fn(),
  saveCommissionerRules: vi.fn(),
}));

import * as api from "../api";
import { ApiError } from "../../../api/base";
import RulesPage from "../pages/RulesPage";

const m = vi.mocked(api);

function row(id: number, category: string, key: string, value: string, label: string, isLocked = true) {
  return { id, category, key, value, label, isLocked };
}

const ROWS = [
  row(1, "roster", "batter_count", "14", "Batters"),
  row(2, "roster", "pitcher_count", "9", "Pitchers"),
  row(3, "overview", "stats_source", "NL", "Stats source"),
  row(4, "il", "il_slot_1_cost", "10", "IL 1"),
  row(5, "il", "il_slot_2_cost", "15", "IL 2"),
  row(6, "scoring", "min_innings", "50", "Min innings"),
  row(7, "transactions", "trade_window", "anytime", "When trades are allowed"),
  row(8, "transactions", "owner_self_serve", "false", "Owner self serve"),
  row(9, "draft", "auction_budget", "400", "Budget"),
  row(10, "draft", "bid_timer", "15", "Bid timer"),
  row(11, "draft", "nomination_timer", "30", "Nomination timer"),
  ...["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"].map((n, i) =>
    row(20 + i, "payouts", `payout_${n}`, String([40, 25, 15, 10, 5, 3, 2, 0][i]), n),
  ),
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/commissioner/20/rules"]}>
      <Routes>
        <Route path="/commissioner/:leagueId/rules" element={<RulesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function rowOf(label: string): HTMLElement {
  return screen.getByText(label).closest("[data-testid='rule-row']") as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  league.seasonStatus = "IN_SEASON";
  m.getCommissionerRules.mockResolvedValue(ROWS.map((r) => ({ ...r })));
  m.saveCommissionerRules.mockResolvedValue(undefined);
});

describe("RulesPage", () => {
  it("locked rows show value + 'Locked for the season' and no control", async () => {
    renderPage();
    await screen.findByText("IL fee, 1st player on IL");
    const r = rowOf("IL fee, 1st player on IL");
    expect(within(r).getByText("$10")).toBeTruthy();
    expect(within(r).getByText("Locked for the season")).toBeTruthy();
    expect(within(r).queryByRole("switch")).toBeNull();
    expect(within(r).queryByRole("button")).toBeNull();
  });

  it("a stray transactions.il_slot_1_cost row does not override the real il fee", async () => {
    m.getCommissionerRules.mockResolvedValue([...ROWS.map((r) => ({ ...r })), row(99, "transactions", "il_slot_1_cost", "99", "Stray")]);
    renderPage();
    await screen.findByText("IL fee, 1st player on IL");
    expect(within(rowOf("IL fee, 1st player on IL")).getByText("$10")).toBeTruthy();
    expect(screen.queryByText("$99")).toBeNull();
  });

  it("trade_window segmented control is enabled on a locked season and saves", async () => {
    renderPage();
    const meeting = await screen.findByRole("button", { name: "Meeting day only" });
    expect((meeting as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Anytime" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(meeting);
    await waitFor(() => expect(m.saveCommissionerRules).toHaveBeenCalledWith(20, [{ id: 7, value: "meeting_day" }]));
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Meeting day only" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("owner_self_serve is a switch that saves true/false", async () => {
    renderPage();
    const sw = await screen.findByRole("switch", { name: "Owners make their own moves" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    await waitFor(() => expect(m.saveCommissionerRules).toHaveBeenCalledWith(20, [{ id: 8, value: "true" }]));
  });

  it("without a trade_window row the Trades row is absent and the page renders", async () => {
    m.getCommissionerRules.mockResolvedValue(ROWS.filter((r) => r.key !== "trade_window"));
    renderPage();
    await screen.findByText("Roster size");
    expect(screen.queryByText("When trades are allowed")).toBeNull();
    expect(screen.getByText("Owners make their own moves")).toBeTruthy();
  });

  it("a rejected save shows the server message and reverts the control", async () => {
    m.saveCommissionerRules.mockRejectedValue(
      new ApiError({ message: "Bad", status: 403, url: "/x", requestId: null, body: null, serverMessage: "Rules are locked for this season" }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Meeting day only" }));
    expect(await screen.findByText("Rules are locked for this season")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anytime" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Meeting day only" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Roster size")).toBeTruthy();
  });

  it("Roster size is batters + pitchers with the split sub-line", async () => {
    renderPage();
    await screen.findByText("Roster size");
    const r = rowOf("Roster size");
    expect(within(r).getByText("23")).toBeTruthy();
    expect(within(r).getByText("14 hitters · 9 pitchers")).toBeTruthy();
  });

  it("formats NL, innings, auction and payouts", async () => {
    renderPage();
    await screen.findByText("Roster size");
    expect(within(rowOf("NL players only")).getByText("On")).toBeTruthy();
    expect(within(rowOf("Minimum innings per period")).getByText("50 IP")).toBeTruthy();
    expect(screen.getByText("The app flags teams under it at close; you decide")).toBeTruthy();
    expect(screen.getByText("$400")).toBeTruthy();
    expect(screen.getAllByText("15 sec").length).toBe(1);
    expect(screen.getByText("30 sec")).toBeTruthy();
    expect(screen.getByText("40 / 25 / 15 / 10 / 5 / 3 / 2 / 0 %")).toBeTruthy();
  });

  it("in SETUP with unlocked rows, only transactions rows get controls", async () => {
    league.seasonStatus = "SETUP";
    m.getCommissionerRules.mockResolvedValue(ROWS.map((r) => ({ ...r, isLocked: false })));
    renderPage();
    await screen.findByText("Roster size");
    expect(screen.getByRole("switch", { name: "Owners make their own moves" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Anytime" }) as HTMLButtonElement).disabled).toBe(false);
    const il = rowOf("IL fee, 1st player on IL");
    expect(within(il).queryByRole("button")).toBeNull();
    expect(within(il).queryByText("Locked for the season")).toBeNull();
  });
});
