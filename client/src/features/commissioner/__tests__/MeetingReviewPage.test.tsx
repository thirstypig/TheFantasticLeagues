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
  getLeaguePeriods: vi.fn(),
  previewMove: vi.fn(),
  saveMove: vi.fn(),
}));

import * as api from "../api";
import MeetingReviewPage from "../pages/MeetingReviewPage";
import { draftKey, emptyDraft } from "../lib/meetingDraft";
import type { MeetingDraft } from "../lib/meetingDraft";

const m = vi.mocked(api);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/commissioner/20/meeting/9/review"]}>
      <Routes>
        <Route path="/commissioner/:leagueId/meeting/:periodId/review" element={<MeetingReviewPage />} />
        <Route path="/commissioner/:leagueId/meeting/:periodId" element={<div>MEETING STUB</div>} />
        <Route path="/commissioner/:leagueId/start/:periodId" element={<div>START STUB</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const P9 = { id: 9, name: "Period 9", startDate: "2026-06-15T12:00:00.000Z", endDate: "2026-06-28T12:00:00.000Z", status: "pending" };
const pl = (playerId: number, name: string, pos = "OF") => ({ playerId, name, pos, mlbTeam: null, mlbId: null });
const mv = (id: string, teamId: number, add: any, drop: any, error?: string) => ({ id, teamId, add, drop, ...(error ? { error } : {}) });

function seed(moves: any[]) {
  const d: MeetingDraft = { ...emptyDraft(20, 9), moves, marks: { 1: "passed" }, selectedTeamId: null };
  localStorage.setItem(draftKey(20, 9), JSON.stringify(d));
}
function stored(): MeetingDraft {
  return JSON.parse(localStorage.getItem(draftKey(20, 9)) as string);
}

const THREE = () => [
  mv("a", 2, pl(101, "Jake Fraley"), pl(51, "Tommy Pham")),
  mv("b", 4, pl(102, "Triston Casas", "1B"), pl(41, "Pete Alonso", "1B")),
  mv("c", 4, pl(103, "Ward Ashcraft", "SP"), pl(43, "Bench Joe")),
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.user = { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] };
  m.getCommissionerOverview.mockResolvedValue({
    league: { id: 20, name: "OGBA", season: 2026 },
    teams: [{ id: 4, name: "Skunk Dogs" }, { id: 2, name: "Bombers" }],
  } as any);
  m.getLeaguePeriods.mockResolvedValue([P9] as any);
  m.previewMove.mockResolvedValue({ ok: true } as any);
  m.saveMove.mockResolvedValue(undefined);
});

async function openSheet() {
  fireEvent.click(await screen.findByRole("button", { name: "Save 3 moves for 2 teams" }));
}

describe("MeetingReviewPage", () => {
  it("shows flags from flagMoves and stored errors, and disables Save", async () => {
    seed([
      mv("a", 2, pl(101, "Jake Fraley"), null),
      mv("b", 4, pl(102, "Triston Casas"), pl(41, "Pete Alonso"), "Casas was claimed by another team."),
      mv("c", 4, pl(103, "Ward Ashcraft"), pl(43, "Bench Joe")),
    ]);
    renderPage();
    expect(await screen.findByText("Bombers: Needs a drop")).toBeTruthy();
    expect(screen.getByText("Skunk Dogs: Casas was claimed by another team.")).toBeTruthy();
    // The rule flag (Bombers needs a drop) blocks Save; the stored error alone would not.
    const save = screen.getByRole("button", { name: /Save 2 moves for 1 team/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText("Fix the flagged move first.")).toBeTruthy();
  });

  it("a stored error with no rule flags shows but does not block, and saving re-previews it", async () => {
    seed([mv("b", 4, pl(102, "Triston Casas", "1B"), pl(41, "Pete Alonso", "1B"), "Casas was claimed by another team.")]);
    renderPage();
    expect(await screen.findByText("Skunk Dogs: Casas was claimed by another team.")).toBeTruthy();
    expect(screen.queryByText("Fix the flagged move first.")).toBeNull();
    const save = screen.getByRole("button", { name: "Save 1 move for 1 team" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    fireEvent.click(screen.getByRole("button", { name: "Save moves" }));
    await screen.findByText("START STUB");
    expect(m.previewMove).toHaveBeenCalledWith(20, 4, 102, 41);
    expect(m.saveMove).toHaveBeenCalledWith(20, 4, 102, 41, "2026-06-15");
  });

  it("removes each saved move from storage immediately and freezes the sheet title", async () => {
    seed(THREE());
    let release!: (v: any) => void;
    m.previewMove.mockImplementation((_l, _t, a) =>
      a === 102 ? new Promise((r) => { release = r; }) : Promise.resolve({ ok: true } as any));
    renderPage();
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Save moves" }));
    await waitFor(() => expect(m.previewMove).toHaveBeenCalledTimes(2));
    expect(stored().moves.map((x) => x.id)).toEqual(["b", "c"]); // move a gone while b is pending
    expect(screen.getByText("Save 3 moves for 2 teams?")).toBeTruthy();
    release({ ok: true });
    await screen.findByText("START STUB");
  });

  it("renders the confirm sheet copy exactly", async () => {
    seed(THREE());
    renderPage();
    await openSheet();
    expect(screen.getByText("Save 3 moves for 2 teams?")).toBeTruthy();
    expect(screen.getByText("Rosters change effective Mon Jun 15. Owners see the moves in Activity.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save moves" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep reviewing" })).toBeTruthy();
    expect(m.saveMove).not.toHaveBeenCalled();
  });

  it("previews then saves each move in order with the period start date", async () => {
    seed(THREE());
    const calls: string[] = [];
    m.previewMove.mockImplementation(async (_l, _t, a) => { calls.push(`p${a}`); return { ok: true } as any; });
    m.saveMove.mockImplementation(async (_l, _t, a) => { calls.push(`s${a}`); });
    renderPage();
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Save moves" }));
    await screen.findByText("START STUB");
    expect(calls).toEqual(["p101", "s101", "p102", "s102", "p103", "s103"]);
    expect(m.saveMove).toHaveBeenNthCalledWith(1, 20, 2, 101, 51, "2026-06-15");
    expect(m.saveMove).toHaveBeenNthCalledWith(3, 20, 4, 103, 43, "2026-06-15");
    expect(localStorage.getItem(draftKey(20, 9))).toBeNull();
    expect(mockToast).toHaveBeenCalledWith("Saved 3 moves", "success");
  });

  it("a preview failure on move 2 saves 1 and 3, keeps 2 with its error, never claims 2", async () => {
    seed(THREE());
    m.previewMove.mockImplementation(async (_l, _t, a) =>
      a === 102 ? ({ ok: false, error: "Casas is on Bombers." } as any) : ({ ok: true } as any));
    renderPage();
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Save moves" }));
    expect(await screen.findByText("Saved 2 of 3 moves. The rest need a look.")).toBeTruthy();
    expect(m.saveMove).toHaveBeenCalledTimes(2);
    expect(m.saveMove.mock.calls.map((c) => c[2])).toEqual([101, 103]);
    const d = stored();
    expect(d.moves).toHaveLength(1);
    expect(d.moves[0].id).toBe("b");
    expect(d.moves[0].error).toBe("Casas is on Bombers.");
    expect(screen.getAllByText(/Casas is on Bombers\./).length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: /Save 1 move for 1 team/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("START STUB")).toBeNull();
  });

  it("does not clobber storage that changed while a save was running", async () => {
    seed(THREE());
    m.previewMove.mockImplementation(async (_l, _t, a) =>
      a === 102 ? ({ ok: false, error: "Casas is on Bombers." } as any) : ({ ok: true } as any));
    m.saveMove.mockImplementationOnce(async () => {
      // another tab / the meeting page edits the draft mid-save
      const d = stored();
      d.moves.push(mv("z", 2, pl(555, "Late Add"), pl(556, "Late Drop")) as any);
      d.marks[3] = "done";
      localStorage.setItem(draftKey(20, 9), JSON.stringify(d));
    });
    renderPage();
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Save moves" }));
    await screen.findByText(/Saved 2 of 3 moves/);
    const d = stored();
    expect(d.moves.map((x) => x.id).sort()).toEqual(["b", "z"]);
    expect(d.marks[3]).toBe("done");
  });

  it("a save that throws keeps the move with the server message and continues", async () => {
    seed(THREE());
    m.saveMove.mockImplementation(async (_l, _t, a) => { if (a === 101) throw new Error("Roster is full."); });
    renderPage();
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Save moves" }));
    expect(await screen.findByText("Saved 2 of 3 moves. The rest need a look.")).toBeTruthy();
    expect(stored().moves.map((x) => [x.id, x.error])).toEqual([["a", "Roster is full."]]);
  });

  it("Edit selects the team in the draft and goes back to the meeting page", async () => {
    seed(THREE());
    renderPage();
    const row = (await screen.findAllByTestId("review-move"))[1];
    fireEvent.click(within(row).getByRole("link", { name: /Edit/ }));
    expect(await screen.findByText("MEETING STUB")).toBeTruthy();
    expect(stored().selectedTeamId).toBe(4);
    expect(stored().moves).toHaveLength(3);
    expect(stored().marks).toEqual({ 1: "passed" });
  });

  it("shows the already-started message and no Save when the period is not pending", async () => {
    seed(THREE());
    m.getLeaguePeriods.mockResolvedValue([{ ...P9, status: "active" }] as any);
    renderPage();
    expect(await screen.findByText(/already started/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
  });
});
