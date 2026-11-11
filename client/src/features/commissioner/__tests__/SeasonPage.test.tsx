import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mockToast = vi.fn();
const auth = vi.hoisted(() => ({ user: { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] } as any }));
vi.mock("../../../auth/AuthProvider", () => ({ useAuth: () => ({ me: { user: auth.user } }) }));
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: mockToast, confirm: vi.fn() }),
}));
vi.mock("../api", () => ({
  getCommissionerSeason: vi.fn(),
  createSeasonPeriod: vi.fn(),
  updateSeasonPeriod: vi.fn(),
  deleteSeasonPeriod: vi.fn(),
}));

import * as api from "../api";
import SeasonPage from "../pages/SeasonPage";

const m = vi.mocked(api);

const p = (id: number, name: string, s: string, e: string, status: string) => ({
  id, name, startDate: `${s}T12:00:00.000Z`, endDate: `${e}T12:00:00.000Z`, status,
});

function season(periods: ReturnType<typeof p>[]) {
  return { id: 5, leagueId: 20, year: 2026, status: "IN_SEASON", periods } as any;
}

const DEFAULT_PERIODS = [
  p(7, "Period 7", "2026-05-03", "2026-05-16", "completed"),
  p(8, "Period 8", "2026-05-17", "2026-05-30", "completed"),
  p(9, "Period 9", "2026-06-01", "2026-06-14", "active"),
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/commissioner/20/season"]}>
      <Routes>
        <Route path="/commissioner/:leagueId/season" element={<SeasonPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] };
  m.getCommissionerSeason.mockResolvedValue(season(DEFAULT_PERIODS));
});

describe("SeasonPage", () => {
  it("defaults the add form from the last period", async () => {
    renderPage();
    await screen.findByText("Period 9");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Period 10");
    expect((screen.getByLabelText("Start") as HTMLInputElement).value).toBe("2026-06-15");
    expect((screen.getByLabelText("End") as HTMLInputElement).value).toBe("2026-06-28");
  });

  it("rolls the defaults across a month boundary using the latest end", async () => {
    m.getCommissionerSeason.mockResolvedValue(season([p(1, "Period 1", "2026-01-18", "2026-01-31", "completed")]));
    renderPage();
    await screen.findByText("Period 1");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Period 2");
    expect((screen.getByLabelText("Start") as HTMLInputElement).value).toBe("2026-02-01");
    expect((screen.getByLabelText("End") as HTMLInputElement).value).toBe("2026-02-14");
  });

  it("refuses an end date that is not after the start, with no POST", async () => {
    renderPage();
    await screen.findByText("Period 9");
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "2026-06-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    expect(await screen.findByText("End date must be after the start date.")).toBeTruthy();
    expect(m.createSeasonPeriod).not.toHaveBeenCalled();
  });

  it("submits the exact body", async () => {
    m.createSeasonPeriod.mockResolvedValue(p(10, "Period 10", "2026-06-15", "2026-06-28", "pending") as any);
    renderPage();
    await screen.findByText("Period 9");
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    await waitFor(() => expect(m.createSeasonPeriod).toHaveBeenCalledTimes(1));
    expect(m.createSeasonPeriod).toHaveBeenCalledWith({
      leagueId: 20, seasonId: 5, name: "Period 10", startDate: "2026-06-15", endDate: "2026-06-28",
    });
    expect(await screen.findByText("Period 10")).toBeTruthy();
  });

  it("shows a server error inline", async () => {
    m.createSeasonPeriod.mockRejectedValue(new Error("Dates overlap Period 9"));
    renderPage();
    await screen.findByText("Period 9");
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    expect(await screen.findByText("Dates overlap Period 9")).toBeTruthy();
  });

  it("shows the right status chips and flow links", async () => {
    m.getCommissionerSeason.mockResolvedValue(season([
      ...DEFAULT_PERIODS,
      p(10, "Period 10", "2026-06-15", "2026-06-28", "pending"),
      p(11, "Period 11", "2026-06-29", "2026-07-12", "pending"),
    ]));
    renderPage();
    await screen.findByText("Period 11");
    const row = (name: string) => screen.getByText(name).closest("[data-testid='period-row']") as HTMLElement;
    expect(within(row("Period 8")).getByText("Closed")).toBeTruthy();
    expect(within(row("Period 9")).getByText("Now")).toBeTruthy();
    expect(within(row("Period 10")).getByText("Next")).toBeTruthy();
    expect(within(row("Period 11")).getByText("Upcoming")).toBeTruthy();
    expect(within(row("Period 9")).getByText("Jun 1 – Jun 14")).toBeTruthy();
    expect(within(row("Period 9")).getByRole("link", { name: /Close/ }).getAttribute("href")).toBe("/commissioner/20/close/9");
    expect(within(row("Period 10")).getByRole("link", { name: /Start/ }).getAttribute("href")).toBe("/commissioner/20/start/10");
    expect(within(row("Period 11")).queryByRole("link", { name: /Start/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Season status/ }).getAttribute("href")).toBe("/commissioner/20/archive");
    expect(screen.getByRole("link", { name: "‹ Commissioner" }).getAttribute("href")).toBe("/commissioner/20");
  });

  it("offers Delete and Edit on pending periods only; delete goes through the sheet", async () => {
    m.getCommissionerSeason.mockResolvedValue(season([
      ...DEFAULT_PERIODS,
      p(10, "Period 10", "2026-06-15", "2026-06-28", "pending"),
    ]));
    m.deleteSeasonPeriod.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText("Period 10");
    expect(screen.getAllByRole("button", { name: /^Delete / })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete Period 10" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Delete Period 10?")).toBeTruthy();
    expect(within(sheet).getByText("This can't be undone.")).toBeTruthy();
    expect(m.deleteSeasonPeriod).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole("button", { name: "Delete period" }));
    await waitFor(() => expect(m.deleteSeasonPeriod).toHaveBeenCalledWith(10));
    await waitFor(() => expect(screen.queryByText("Period 10", { selector: "[data-testid='period-row'] *" })).toBeNull());
  });

  it("edits a pending period inline with PATCH", async () => {
    m.getCommissionerSeason.mockResolvedValue(season([
      ...DEFAULT_PERIODS,
      p(10, "Period 10", "2026-06-15", "2026-06-28", "pending"),
    ]));
    m.updateSeasonPeriod.mockResolvedValue(p(10, "Period 10b", "2026-06-16", "2026-06-29", "pending") as any);
    renderPage();
    await screen.findByText("Period 10");
    fireEvent.click(screen.getByRole("button", { name: "Edit Period 10" }));
    fireEvent.change(screen.getByLabelText("Edit name"), { target: { value: "Period 10b" } });
    fireEvent.change(screen.getByLabelText("Edit start"), { target: { value: "2026-06-16" } });
    fireEvent.change(screen.getByLabelText("Edit end"), { target: { value: "2026-06-29" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.updateSeasonPeriod).toHaveBeenCalledWith(10, {
      name: "Period 10b", startDate: "2026-06-16", endDate: "2026-06-29",
    }));
    expect(await screen.findByText("Period 10b")).toBeTruthy();
  });

  it("shows Commissioners only. to a non-commissioner", () => {
    auth.user = { isAdmin: false, memberships: [{ leagueId: "20", role: "OWNER" }] };
    renderPage();
    expect(screen.getByText("Commissioners only.")).toBeTruthy();
    expect(m.getCommissionerSeason).not.toHaveBeenCalled();
  });
});
