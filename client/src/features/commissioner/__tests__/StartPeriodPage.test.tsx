import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mockToast = vi.fn();
const auth = vi.hoisted(() => ({ user: { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] } as any }));
vi.mock("../../../auth/AuthProvider", () => ({ useAuth: () => ({ me: { user: auth.user } }) }));

vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: mockToast, confirm: vi.fn() }),
}));

vi.mock("../api", () => ({
  getLeaguePeriods: vi.fn(),
  getMovesSinceStart: vi.fn(),
  setPeriodStatus: vi.fn(),
  getRosterCheck: vi.fn(),
}));

import * as api from "../api";
import StartPeriodPage from "../pages/StartPeriodPage";

const m = vi.mocked(api);

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/commissioner/:leagueId/start/:periodId" element={<StartPeriodPage />} />
        <Route path="/commissioner/:leagueId" element={<div>HUB PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const URL = "/commissioner/20/start/8";

function period(over: Partial<api.HubPeriod> = {}): api.HubPeriod {
  return { id: 8, name: "Period 8", startDate: "2026-09-29T00:00:00.000Z", endDate: "2026-10-12T00:00:00.000Z", status: "pending", ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T15:00:00.000Z"));
  m.getLeaguePeriods.mockResolvedValue([period()]);
  m.getMovesSinceStart.mockResolvedValue([]);
  m.setPeriodStatus.mockResolvedValue(period({ status: "active" }));
  m.getRosterCheck.mockResolvedValue({ cap: 23, teams: [{ teamId: 1, teamName: "Devil Dawgs", activeCount: 23, over: false }, { teamId: 2, teamName: "Skunk Dogs", activeCount: 22, over: false }] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StartPeriodPage", () => {
  it("shows the dates and a 'today' badge when the start date is today", async () => {
    renderAt(URL);
    expect(await screen.findByText("today")).toBeTruthy();
    expect(screen.getByText("No moves since the start date.")).toBeTruthy();
    expect(m.getLeaguePeriods).toHaveBeenCalledWith(20);
    expect(m.getMovesSinceStart).toHaveBeenCalledWith(20, 8);
  });

  it("pluralizes the late badge", async () => {
    vi.setSystemTime(new Date("2026-09-30T15:00:00.000Z"));
    const { unmount } = renderAt(URL);
    expect(await screen.findByText("1 day late")).toBeTruthy();
    unmount();
    vi.setSystemTime(new Date("2026-10-01T15:00:00.000Z"));
    renderAt(URL);
    expect(await screen.findByText("2 days late")).toBeTruthy();
  });

  it("groups moves by team: adds in positive, drops in negative, link to rosters", async () => {
    m.getMovesSinceStart.mockResolvedValue([
      { id: 1, teamName: "Devil Dawgs", playerName: "Webb", transactionType: "ADD", effDate: "2026-09-30T00:00:00.000Z" },
      { id: 2, teamName: "Devil Dawgs", playerName: "Sheehan", transactionType: "DROP", effDate: "2026-09-30T00:00:00.000Z" },
      { id: 3, teamName: "Skunk Dogs", playerName: "Ohtani", transactionType: "ADD", effDate: "2026-10-01T00:00:00.000Z" },
    ]);
    renderAt(URL);
    expect(await screen.findByText("Moves since the start date · 3")).toBeTruthy();
    const dawgs = screen.getByTestId("team-moves-Devil Dawgs");
    expect(within(dawgs).getByText("Devil Dawgs")).toBeTruthy();
    const add = within(dawgs).getByText(/Webb/);
    const drop = within(dawgs).getByText(/Sheehan/);
    expect(add.getAttribute("style")).toContain("--am-positive");
    expect(drop.getAttribute("style")).toContain("--am-negative");
    expect(within(screen.getByTestId("team-moves-Skunk Dogs")).getByText(/Ohtani/)).toBeTruthy();
    expect(screen.getByText(/Webb/).closest("a")?.getAttribute("href")).toBe("/commissioner/20/rosters");
  });

  it("shows the dates with weekday and the day count", async () => {
    renderAt(URL);
    expect(await screen.findByText("Tue Sep 29 – Mon Oct 12")).toBeTruthy();
    expect(screen.getByText("14 days")).toBeTruthy();
  });

  it("roster check: all within the cap", async () => {
    renderAt(URL);
    expect(await screen.findByText("✓ All 2 rosters within 23")).toBeTruthy();
  });

  it("roster check: over-limit teams link to rosters and do not block Start", async () => {
    m.getRosterCheck.mockResolvedValue({ cap: 23, teams: [{ teamId: 1, teamName: "Devil Dawgs", activeCount: 25, over: true }] });
    renderAt(URL);
    const link = await screen.findByRole("link", { name: /Devil Dawgs 25 \/ 23/ });
    expect(link.getAttribute("href")).toBe("/commissioner/20/rosters");
    await waitFor(() => expect((screen.getByRole("button", { name: "Start Period 8" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("roster check failure does not block Start", async () => {
    m.getRosterCheck.mockRejectedValue(new Error("x"));
    renderAt(URL);
    expect(await screen.findByText("Couldn’t load roster sizes.")).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "Start Period 8" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("nothing is written until the sheet is confirmed; cancel writes nothing", async () => {
    renderAt(URL);
    await screen.findByText("No moves since the start date.");
    fireEvent.click(screen.getByRole("button", { name: "Start Period 8" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Start Period 8?")).toBeTruthy();
    expect(within(sheet).getByText("Owners see the new rosters right away.")).toBeTruthy();
    expect(m.setPeriodStatus).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole("button", { name: /Cancel/ }));
    expect(m.setPeriodStatus).not.toHaveBeenCalled();
  });

  it("says already started when the period is not pending", async () => {
    m.getLeaguePeriods.mockResolvedValue([period({ status: "active" })]);
    renderAt(URL);
    expect(await screen.findByText(/This period has already started/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Start/ })).toBeNull();
    expect(m.setPeriodStatus).not.toHaveBeenCalled();
  });

  it("says no next period when the id is unknown", async () => {
    m.getLeaguePeriods.mockResolvedValue([period({ id: 99 })]);
    renderAt(URL);
    expect(await screen.findByText("No next period set up")).toBeTruthy();
    expect(screen.getByText(/Set up periods/).closest("a")?.getAttribute("href")).toBe("/commissioner/20/season");
  });

  it("Start is disabled with a reload hint when moves fail to load", async () => {
    m.getMovesSinceStart.mockRejectedValue(new Error("boom"));
    renderAt(URL);
    expect(await screen.findByText("Couldn’t load moves — reload before starting")).toBeTruthy();
    const start = screen.getByRole("button", { name: "Start Period 8" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.click(start);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(m.setPeriodStatus).not.toHaveBeenCalled();
  });

  it("Start is disabled while moves are still loading", async () => {
    m.getMovesSinceStart.mockReturnValue(new Promise(() => {}));
    renderAt(URL);
    expect(await screen.findByText("Loading moves…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Start Period 8" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("confirming calls setPeriodStatus(8, active) once, toasts, and goes to the hub", async () => {
    renderAt(URL);
    await screen.findByText("No moves since the start date.");
    fireEvent.click(screen.getByRole("button", { name: "Start Period 8" }));
    const sheet = await screen.findByRole("dialog");
    const confirmBtn = within(sheet).getByRole("button", { name: "Start period" });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(screen.getByText("HUB PAGE")).toBeTruthy());
    expect(m.setPeriodStatus).toHaveBeenCalledTimes(1);
    expect(m.setPeriodStatus).toHaveBeenCalledWith(8, { status: "active" });
    expect(mockToast).toHaveBeenCalledWith("Period 8 started", "success");
  });
});

describe("StartPeriodPage — another period still active", () => {
  it("shows a warning card linking to the active period's close job, and Start stays allowed", async () => {
    m.getLeaguePeriods.mockResolvedValue([
      period({ id: 7, name: "Period 7", startDate: "2026-09-15T00:00:00.000Z", endDate: "2026-09-28T00:00:00.000Z", status: "active" }),
      period(),
    ]);
    renderAt(URL);
    expect(
      await screen.findByText("Period 7 is still active — close it first so standings and moves land in the right period."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Close Period 7/ }).getAttribute("href")).toBe("/commissioner/20/close/7");
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Start Period 8" }) as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("no warning when nothing else is active", async () => {
    renderAt(URL);
    await screen.findByRole("button", { name: "Start Period 8" });
    expect(screen.queryByText(/is still active/)).toBeNull();
  });
});
