import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const auth = vi.hoisted(() => ({ user: { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] } as any }));
vi.mock("../../../auth/AuthProvider", () => ({ useAuth: () => ({ me: { user: auth.user } }) }));

vi.mock("../api", () => ({
  getLeaguePeriods: vi.fn(),
  getGhostIlSummary: vi.fn(),
  getRosterCheck: vi.fn(),
  getAcceptedTradeCount: vi.fn(),
  getUnbilledPeriods: vi.fn(),
  getRecentChanges: vi.fn(),
}));

import * as api from "../api";
import CommissionerHub from "../pages/CommissionerHub";
import RecentChangesPage from "../pages/RecentChangesPage";

const m = vi.mocked(api);
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10) + "T00:00:00.000Z";

function renderHub() {
  return render(
    <MemoryRouter initialEntries={["/commissioner/20"]}>
      <Routes>
        <Route path="/commissioner/:leagueId" element={<CommissionerHub />} />
        <Route path="/commissioner/:leagueId/recent" element={<RecentChangesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Pinned to the morning (before the 14:00 UTC close threshold) so Needs-you
  // ordering doesn't depend on the wall clock.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T10:00:00.000Z"));
  m.getLeaguePeriods.mockResolvedValue([
    { id: 7, name: "Period 7", startDate: day(-14), endDate: day(-1), status: "active" },
    { id: 8, name: "Period 8", startDate: day(0), endDate: day(14), status: "pending" },
  ]);
  m.getGhostIlSummary.mockResolvedValue({ teams: [], totalTeamsWithGhosts: 0, totalGhosts: 0 });
  m.getRosterCheck.mockResolvedValue({ cap: 23, teams: [] });
  m.getAcceptedTradeCount.mockResolvedValue(0);
  m.getUnbilledPeriods.mockResolvedValue([]);
  m.getRecentChanges.mockResolvedValue([
    { id: 1, action: "PERIOD_CLOSE", resourceType: "Period", resourceId: "7", createdAt: new Date().toISOString(), userName: "Jim", metadata: { leagueId: 20, periodId: 7, billed: true } },
    { id: 2, action: "TRADE_PROCESS", resourceType: "Trade", resourceId: "55", createdAt: new Date().toISOString(), userName: "Jim", metadata: null },
    { id: 3, action: "SOME_OTHER_THING", resourceType: "X", resourceId: null, createdAt: new Date().toISOString(), userName: null, metadata: null },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CommissionerHub", () => {
  it("puts 'Start Period 8 · today' first, linking to start/8", async () => {
    renderHub();
    const link = await screen.findByRole("link", { name: /Start Period 8 · today/ });
    expect(link.getAttribute("href")).toBe("/commissioner/20/start/8");
    const needs = link.closest("[data-testid='needs-you']") as HTMLElement;
    expect(within(needs).getAllByRole("link")[0]).toBe(link);
    expect(m.getLeaguePeriods).toHaveBeenCalledWith(20);
    expect(m.getRecentChanges).toHaveBeenCalledWith(20, 3);
  });

  it("renders exactly seven job rows with the right hrefs", async () => {
    renderHub();
    const jobs = await screen.findByTestId("jobs");
    await waitFor(() => expect(within(jobs).getAllByRole("link")).toHaveLength(7));
    const hrefs = within(jobs).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/commissioner/20/close/7",
      "/commissioner/20/start/8",
      "/commissioner/20/rosters",
      "/commissioner/20/trades",
      "/commissioner/20/money",
      "/commissioner/20/rules",
      "/commissioner/20/owners",
    ]);
    expect(screen.getByRole("link", { name: /Overview/ }).getAttribute("href")).toBe("/commissioner/20/overview");
    expect(screen.getByRole("link", { name: /Archive/ }).getAttribute("href")).toBe("/commissioner/20/archive");
    expect(screen.getByRole("link", { name: "Scoring categories" }).getAttribute("href")).toBe("/commissioner/20/scoring");
    expect(screen.getByRole("link", { name: "Wire List settings" }).getAttribute("href")).toBe("/commissioner/20/wire-list");
  });

  it("after the close threshold on start day, Close Period 7 is listed before Start Period 8", async () => {
    vi.setSystemTime(new Date("2026-09-29T15:00:00.000Z"));
    m.getLeaguePeriods.mockResolvedValue([
      { id: 7, name: "Period 7", startDate: day(-14), endDate: day(-1), status: "active" },
      { id: 8, name: "Period 8", startDate: day(0), endDate: day(14), status: "pending" },
    ]);
    renderHub();
    const start = await screen.findByRole("link", { name: /Start Period 8 · today/ });
    const needs = start.closest("[data-testid='needs-you']") as HTMLElement;
    const links = within(needs).getAllByRole("link");
    expect(links[0].getAttribute("href")).toBe("/commissioner/20/close/7");
    expect(links[1]).toBe(start);
    expect(within(start).getByText("Close Period 7 first, then start Period 8.")).toBeTruthy();
  });

  it("with no pending period, 'Start next period' links to settings with a hint", async () => {
    m.getLeaguePeriods.mockResolvedValue([
      { id: 7, name: "Period 7", startDate: day(-14), endDate: day(3), status: "active" },
    ]);
    renderHub();
    const row = await screen.findByRole("link", { name: /Start next period/ });
    expect(row.getAttribute("href")).toBe("/commissioner/20/settings");
    expect(within(row).getByText("No next period set up")).toBeTruthy();
  });

  it("with no closeable period, 'Close a period' stays disabled with a reason", async () => {
    m.getLeaguePeriods.mockResolvedValue([
      { id: 8, name: "Period 8", startDate: day(3), endDate: day(14), status: "pending" },
    ]);
    renderHub();
    const jobs = await screen.findByTestId("jobs");
    const row = await within(jobs).findByText("Close a period");
    const disabled = row.closest("[aria-disabled='true']") as HTMLElement;
    expect(disabled).toBeTruthy();
    expect(within(disabled).getByText("No active period")).toBeTruthy();
    expect(within(jobs).queryByRole("link", { name: /Close a period/ })).toBeNull();
  });

  it("shows recent changes with audit copy and an All link", async () => {
    renderHub();
    expect(await screen.findByText("Closed Period 7 (fees billed)")).toBeTruthy();
    expect(screen.getByText("Processed trade #55")).toBeTruthy();
    expect(screen.getByText("Some other thing")).toBeTruthy();
    expect(screen.getByRole("link", { name: /All/ }).getAttribute("href")).toBe("/commissioner/20/recent");
  });

  it("still renders Needs you and Jobs when getRecentChanges rejects", async () => {
    m.getRecentChanges.mockRejectedValue(new Error("boom"));
    renderHub();
    expect(await screen.findByRole("link", { name: /Start Period 8 · today/ })).toBeTruthy();
    const jobs = await screen.findByTestId("jobs");
    await waitFor(() => expect(within(jobs).getAllByRole("link")).toHaveLength(7));
    expect(await screen.findByText(/Couldn.t load recent changes/)).toBeTruthy();
  });
});

describe("RecentChangesPage", () => {
  it("loads 50 and shows the footnote", async () => {
    render(
      <MemoryRouter initialEntries={["/commissioner/20/recent"]}>
        <Routes><Route path="/commissioner/:leagueId/recent" element={<RecentChangesPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Processed trade #55")).toBeTruthy();
    expect(m.getRecentChanges).toHaveBeenCalledWith(20, 50);
    expect(screen.getByText("Older actions from before this feature may not appear.")).toBeTruthy();
  });
});
