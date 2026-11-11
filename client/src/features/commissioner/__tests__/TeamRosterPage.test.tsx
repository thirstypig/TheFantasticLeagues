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
  getCommissionerOverview: vi.fn(),
  getCommissionerRosters: vi.fn(),
  getRosterCheck: vi.fn(),
  getGhostIlSummary: vi.fn(),
  getCommissionerRules: vi.fn(),
  searchFreeAgents: vi.fn(),
  previewCommissionerIlStash: vi.fn(),
  commissionerIlStash: vi.fn(),
  previewCommissionerIlActivate: vi.fn(),
  commissionerIlActivate: vi.fn(),
  previewOneOffSwap: vi.fn(),
  oneOffSwap: vi.fn(),
}));

import * as api from "../api";
import TeamRosterPage from "../pages/TeamRosterPage";

const m = vi.mocked(api);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/commissioner/20/rosters/4"]}>
      <Routes>
        <Route path="/commissioner/:leagueId/rosters/:teamId" element={<TeamRosterPage />} />
        <Route path="/commissioner/:leagueId/rosters" element={<div>ROSTERS STUB</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const row = (id: number, teamId: number, name: string, pos: string, slot: string) => ({
  id: id + 1000, teamId, assignedPosition: slot, price: 1,
  player: { id, name, posPrimary: pos, mlbId: id },
});

const ROWS = () => [
  row(1, 4, "Shohei Ohtani", "DH", "DH"),
  row(2, 4, "Bryce Harper", "1B", "1B"),
  row(3, 4, "Gerrit Cole", "SP", "SP"),
  row(4, 4, "Zac Gallen", "SP", "IL"),
  row(6, 4, "Catcher Joe", "C", "C"),
  row(99, 7, "Other Team Guy", "OF", "OF"),
];

const fa = (playerId: number, name: string) => ({ playerId, name, pos: "OF", mlbTeam: "NYM", mlbId: playerId });

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] };
  m.getCommissionerOverview.mockResolvedValue({ league: { id: 20, name: "OGBA", season: 2026 }, teams: [{ id: 4, name: "Demolition Lumber" }] } as any);
  m.getCommissionerRosters.mockResolvedValue(ROWS() as any);
  m.getRosterCheck.mockResolvedValue({ cap: 4, teams: [{ teamId: 4, teamName: "Demolition Lumber", activeCount: 4, over: false }] } as any);
  m.getGhostIlSummary.mockResolvedValue({ teams: [{ teamId: 4, ghosts: [{ rosterId: 1004, playerId: 4, playerName: "Zac Gallen", currentMlbStatus: "Active" }] }], totalTeamsWithGhosts: 1, totalGhosts: 1 } as any);
  m.getCommissionerRules.mockResolvedValue([
    { id: 1, category: "il", key: "il_slot_1_cost", value: "10", label: "", isLocked: false },
    { id: 2, category: "il", key: "il_slot_2_cost", value: "15", label: "", isLocked: false },
  ] as any);
  m.searchFreeAgents.mockResolvedValue([fa(201, "Jake Fraley")]);
  m.previewCommissionerIlStash.mockResolvedValue({ ok: true });
  m.previewCommissionerIlActivate.mockResolvedValue({ ok: true });
  m.previewOneOffSwap.mockResolvedValue({ ok: true });
  m.commissionerIlStash.mockResolvedValue(undefined);
  m.commissionerIlActivate.mockResolvedValue(undefined);
  m.oneOffSwap.mockResolvedValue(undefined);
});

function sheetConfirmButton(sheet: HTMLElement) {
  return within(sheet).getAllByRole("button").find((b) => b.textContent !== "Cancel")!;
}
function confirmInSheet() {
  fireEvent.click(sheetConfirmButton(screen.getByRole("dialog")));
}
async function openActions(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: `Actions for ${name}` }));
}
async function pickFa(placeholder: string, text = "Fra", result = "Jake Fraley") {
  fireEvent.change(screen.getByLabelText(placeholder), { target: { value: text } });
  fireEvent.click(await screen.findByText(result, {}, { timeout: 2000 }));
}

describe("TeamRosterPage", () => {
  it("tells non-commissioners it is for commissioners only", async () => {
    auth.user = { isAdmin: false, memberships: [] };
    renderPage();
    expect(await screen.findByText("Commissioners only.")).toBeTruthy();
    expect(m.getCommissionerRosters).not.toHaveBeenCalled();
  });

  it("shows the team title and the ghost banner copy", async () => {
    renderPage();
    expect(await screen.findByText("Demolition Lumber")).toBeTruthy();
    expect(await screen.findByText(/Gallen is back from the MLB IL but still in your IL slot\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Activate ›" })).toBeTruthy();
  });

  it("lists only this team's players, in slot order", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Actions for Harper" });
    const names = screen.getAllByTestId("team-roster-row").map((r) => r.getAttribute("data-player"));
    expect(names).toEqual(["Catcher Joe", "Bryce Harper", "Shohei Ohtani", "Gerrit Cole", "Zac Gallen"]);
    expect(screen.queryByText(/Other Team Guy/)).toBeNull();
  });

  it("Move to IL shows IL slot 2 of 2 and fee $15 when one IL slot is used", async () => {
    m.getCommissionerRosters.mockResolvedValue(ROWS().filter((r) => r.player.id !== 5) as any);
    renderPage();
    await openActions("Harper");
    fireEvent.click(screen.getByRole("button", { name: "Move to IL ›" }));
    expect(screen.getByText("Harper: move to IL")).toBeTruthy();
    expect(screen.getByText("IL slot 2 of 2 · fee $15 per period")).toBeTruthy();
  });

  it("uses the slot 1 fee when no IL slot is used", async () => {
    m.getCommissionerRosters.mockResolvedValue(ROWS().filter((r) => r.player.id !== 5 && r.player.id !== 4) as any);
    renderPage();
    await openActions("Harper");
    fireEvent.click(screen.getByRole("button", { name: "Move to IL ›" }));
    expect(screen.getByText("IL slot 1 of 2 · fee $10 per period")).toBeTruthy();
  });

  it("Move to IL: previews with the right ids, confirms, and sends no effectiveDate", async () => {
    renderPage();
    await openActions("Harper");
    fireEvent.click(screen.getByRole("button", { name: "Move to IL ›" }));
    const btn = screen.getByRole("button", { name: "Move Harper to IL" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await pickFa("Add a replacement: search NL free agents");
    await waitFor(() => expect(m.previewCommissionerIlStash).toHaveBeenCalledWith(20, 4, 2, 201));
    expect(await screen.findByText("✓ Roster stays at 4 / 4")).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "Move Harper to IL" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Move Harper to IL" }));
    confirmInSheet();
    await waitFor(() => expect(m.commissionerIlStash).toHaveBeenCalledTimes(1));
    expect(m.commissionerIlStash).toHaveBeenCalledWith(20, 4, 2, 201);
    expect(m.commissionerIlStash.mock.calls[0]).toHaveLength(4);
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(m.getCommissionerRosters.mock.calls.length).toBeGreaterThan(1);
  });

  it("a failed preview shows the server error and keeps the button disabled", async () => {
    m.previewCommissionerIlStash.mockResolvedValue({ ok: false, error: "Roster would be over the cap." });
    renderPage();
    await openActions("Harper");
    fireEvent.click(screen.getByRole("button", { name: "Move to IL ›" }));
    await pickFa("Add a replacement: search NL free agents");
    expect(await screen.findByText("Roster would be over the cap.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Move Harper to IL" }) as HTMLButtonElement).disabled).toBe(true);
    expect(m.commissionerIlStash).not.toHaveBeenCalled();
  });

  it("ignores a stale preview for a replaced selection", async () => {
    let resolveFirst: (v: any) => void = () => {};
    m.previewCommissionerIlStash
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({ ok: false, error: "Second failed." });
    m.searchFreeAgents.mockResolvedValue([fa(201, "Jake Fraley"), fa(202, "Ward Ashcraft")]);
    renderPage();
    await openActions("Harper");
    fireEvent.click(screen.getByRole("button", { name: "Move to IL ›" }));
    await pickFa("Add a replacement: search NL free agents");
    await pickFa("Add a replacement: search NL free agents", "Ash", "Ward Ashcraft");
    expect(await screen.findByText("Second failed.")).toBeTruthy();
    resolveFirst({ ok: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Roster stays/)).toBeNull();
    expect((screen.getByRole("button", { name: "Move Harper to IL" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Drop flow previews the swap and calls oneOffSwap", async () => {
    renderPage();
    await openActions("Harper");
    fireEvent.click(screen.getByRole("button", { name: "Drop ›" }));
    await pickFa("Add a free agent: search NL free agents");
    await waitFor(() => expect(m.previewOneOffSwap).toHaveBeenCalledWith(20, 4, 201, 2));
    await waitFor(() => expect((screen.getByRole("button", { name: "Drop Harper, add Fraley" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Drop Harper, add Fraley" }));
    await screen.findByRole("dialog");
    confirmInSheet();
    await waitFor(() => expect(m.oneOffSwap).toHaveBeenCalledWith(20, 4, 201, 2));
    expect(m.oneOffSwap.mock.calls[0]).toHaveLength(4);
  });

  it("Activate flow chooses a drop, previews, and calls commissionerIlActivate once even on double tap", async () => {
    let finish: () => void = () => {};
    m.commissionerIlActivate.mockImplementation(() => new Promise<void>((r) => { finish = r; }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Open activate for Gallen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Drop Harper" }));
    await waitFor(() => expect(m.previewCommissionerIlActivate).toHaveBeenCalledWith(20, 4, 4, 2));
    await waitFor(() => expect((screen.getByRole("button", { name: "Activate Gallen" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Activate Gallen" }));
    const sheet = await screen.findByRole("dialog");
    const confirm = sheetConfirmButton(sheet);
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(m.commissionerIlActivate).toHaveBeenCalledTimes(1));
    expect(m.commissionerIlActivate).toHaveBeenCalledWith(20, 4, 4, 2);
    finish();
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
  });

  it("the ghost banner Activate opens the activate flow for that player", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Activate ›" }));
    expect(await screen.findByText("Gallen: activate from IL")).toBeTruthy();
  });

  it("degrades quietly when the ghost and rules reads fail", async () => {
    m.getGhostIlSummary.mockRejectedValue(new Error("x"));
    m.getCommissionerRules.mockRejectedValue(new Error("x"));
    m.getCommissionerRosters.mockResolvedValue(ROWS().filter((r) => r.player.id !== 5) as any);
    renderPage();
    await openActions("Harper");
    fireEvent.click(screen.getByRole("button", { name: "Move to IL ›" }));
    expect(screen.getByText("IL slot 2 of 2 · fee $15 per period")).toBeTruthy();
    expect(screen.queryByText(/back from the MLB IL/)).toBeNull();
  });

  it("fails the page when rosters cannot load", async () => {
    m.getCommissionerRosters.mockRejectedValue(new Error("x"));
    renderPage();
    expect(await screen.findByText("Couldn’t load this roster.")).toBeTruthy();
  });

  it("uses il.slot_count for 'of N'", async () => {
    m.getCommissionerRules.mockResolvedValue([{ id: 3, category: "il", key: "slot_count", value: "3", label: "", isLocked: false }] as any);
    m.getCommissionerRosters.mockResolvedValue(ROWS().filter((r) => r.player.id !== 5) as any);
    renderPage();
    await openActions("Harper");
    fireEvent.click(screen.getByRole("button", { name: "Move to IL ›" }));
    expect(screen.getByText("IL slot 2 of 3 · fee $15 per period")).toBeTruthy();
  });

  it("when all IL slots are full, says so and offers no search or move button", async () => {
    m.getCommissionerRosters.mockResolvedValue([...ROWS(), row(5, 4, "Pete Alonso", "1B", "IL")] as any);
    renderPage();
    await openActions("Harper");
    fireEvent.click(screen.getByRole("button", { name: "Move to IL ›" }));
    expect(screen.getByText("All 2 IL slots are full. Activate or drop an IL player first.")).toBeTruthy();
    expect(screen.queryByLabelText("Add a replacement: search NL free agents")).toBeNull();
    expect(screen.queryByRole("button", { name: "Move Harper to IL" })).toBeNull();
  });

  it("shows a $0 fee as $0", async () => {
    m.getCommissionerRules.mockResolvedValue([{ id: 2, category: "il", key: "il_slot_2_cost", value: "0", label: "", isLocked: false }] as any);
    m.getCommissionerRosters.mockResolvedValue(ROWS().filter((r) => r.player.id !== 5) as any);
    renderPage();
    await openActions("Harper");
    fireEvent.click(screen.getByRole("button", { name: "Move to IL ›" }));
    expect(screen.getByText("IL slot 2 of 2 · fee $0 per period")).toBeTruthy();
  });

  async function readyToConfirmStash() {
    m.getCommissionerRosters.mockResolvedValue(ROWS().filter((r) => r.player.id !== 5) as any);
    renderPage();
    await openActions("Harper");
    fireEvent.click(screen.getByRole("button", { name: "Move to IL ›" }));
    await pickFa("Add a replacement: search NL free agents");
    await waitFor(() => expect((screen.getByRole("button", { name: "Move Harper to IL" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Move Harper to IL" }));
    await screen.findByRole("dialog");
  }

  it("a failed mutation shows the server error and re-enables the button", async () => {
    m.commissionerIlStash.mockRejectedValue(new Error("Player already on a roster."));
    await readyToConfirmStash();
    confirmInSheet();
    expect(await screen.findByText("Player already on a roster.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByRole("button", { name: "Move Harper to IL" }) as HTMLButtonElement).disabled).toBe(false);
    expect(m.commissionerIlStash).toHaveBeenCalledTimes(1);
  });

  it("success closes the panel and reloads rosters", async () => {
    await readyToConfirmStash();
    confirmInSheet();
    await waitFor(() => expect(screen.queryByTestId("team-action-panel")).toBeNull());
    await waitFor(() => expect(m.getCommissionerRosters).toHaveBeenCalledTimes(2));
  });

  it("notes when the reload after a save fails", async () => {
    await readyToConfirmStash();
    m.getCommissionerRosters.mockRejectedValue(new Error("x"));
    confirmInSheet();
    expect(await screen.findByText("Saved. Couldn’t refresh the roster — reload the page.")).toBeTruthy();
  });
});
