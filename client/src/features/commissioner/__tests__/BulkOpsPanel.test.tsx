import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────

const mockToast = vi.fn();
const mockConfirm = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: mockToast, confirm: mockConfirm }),
}));

vi.mock("../api", () => ({
  getIlAudit: vi.fn(),
  postBulkIlStash: vi.fn(),
  postCleanupDropped: vi.fn(),
}));

import { getIlAudit, postBulkIlStash, postCleanupDropped } from "../api";
import BulkOpsPanel from "../components/BulkOpsPanel";

beforeEach(() => {
  vi.clearAllMocks();
  mockConfirm.mockResolvedValue(true);
});

describe("BulkOpsPanel — initial render", () => {
  it("shows the empty state when no IL-eligible players are surfaced", async () => {
    vi.mocked(getIlAudit).mockResolvedValue({
      rows: [], totalRows: 0, totalTeams: 0, fetchedAt: "2026-04-30T00:00:00Z",
    });
    render(<BulkOpsPanel leagueId={1} />);
    await waitFor(() => {
      expect(screen.getByText(/No MLB-IL players/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("il-audit-table")).not.toBeInTheDocument();
  });

  it("renders the audit table with one row per IL-eligible player", async () => {
    vi.mocked(getIlAudit).mockResolvedValue({
      rows: [
        { teamId: 10, teamName: "Aces", teamCode: "ACE",
          playerId: 100, playerName: "Mike Trout", mlbId: 545361,
          mlbStatus: "Injured 10-Day", assignedPosition: "OF" },
        { teamId: 20, teamName: "Titans", teamCode: "TTN",
          playerId: 200, playerName: "Aaron Judge", mlbId: 592450,
          mlbStatus: "Injured 60-Day", assignedPosition: "OF" },
      ],
      totalRows: 2, totalTeams: 2,
      fetchedAt: "2026-04-30T00:00:00Z",
    });
    render(<BulkOpsPanel leagueId={1} />);
    await waitFor(() => {
      expect(screen.getByTestId("il-audit-table")).toBeInTheDocument();
    });
    expect(screen.getByText("Mike Trout")).toBeInTheDocument();
    expect(screen.getByText("Aaron Judge")).toBeInTheDocument();
    expect(screen.getByText("Injured 10-Day")).toBeInTheDocument();
    expect(screen.getByText(/2 MLB-IL players across 2 teams/)).toBeInTheDocument();
  });

  it("disables the Stash all button when there are no rows", async () => {
    vi.mocked(getIlAudit).mockResolvedValue({
      rows: [], totalRows: 0, totalTeams: 0, fetchedAt: "",
    });
    render(<BulkOpsPanel leagueId={1} />);
    await waitFor(() => {
      const btn = screen.getByTestId("il-stash-all") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });
});

describe("BulkOpsPanel — Stash all flow", () => {
  it("submits all rows in a batch when confirmed and reports the summary", async () => {
    vi.mocked(getIlAudit).mockResolvedValueOnce({
      rows: [
        { teamId: 10, teamName: "Aces", teamCode: "ACE",
          playerId: 100, playerName: "Mike Trout", mlbId: 545361,
          mlbStatus: "Injured 10-Day", assignedPosition: "OF" },
        { teamId: 20, teamName: "Titans", teamCode: "TTN",
          playerId: 200, playerName: "Aaron Judge", mlbId: 592450,
          mlbStatus: "Injured 60-Day", assignedPosition: "OF" },
      ],
      totalRows: 2, totalTeams: 2, fetchedAt: "",
    }).mockResolvedValueOnce({
      // Re-fetch after the bulk run — empty.
      rows: [], totalRows: 0, totalTeams: 0, fetchedAt: "",
    });
    vi.mocked(postBulkIlStash).mockResolvedValue({
      succeeded: [
        { teamId: 10, playerId: 100, outcome: "stashed" },
        { teamId: 20, playerId: 200, outcome: "stashed" },
      ],
      failed: [],
    });

    render(<BulkOpsPanel leagueId={42} />);
    await waitFor(() => {
      expect(screen.getByTestId("il-stash-all")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("il-stash-all"));

    await waitFor(() => {
      expect(postBulkIlStash).toHaveBeenCalledWith(42, [
        { teamId: 10, playerId: 100 },
        { teamId: 20, playerId: 200 },
      ]);
    });
    expect(mockConfirm).toHaveBeenCalledWith(expect.stringMatching(/Stash 2 players across 2 teams/i));
    expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/Stashed 2 · failed 0/), "success");
  });

  it("shows the failure summary when some entries fail", async () => {
    vi.mocked(getIlAudit).mockResolvedValueOnce({
      rows: [
        { teamId: 10, teamName: "Aces", teamCode: "ACE",
          playerId: 100, playerName: "Mike Trout", mlbId: 545361,
          mlbStatus: "Injured 10-Day", assignedPosition: "OF" },
      ],
      totalRows: 1, totalTeams: 1, fetchedAt: "",
    }).mockResolvedValueOnce({
      rows: [], totalRows: 0, totalTeams: 0, fetchedAt: "",
    });
    vi.mocked(postBulkIlStash).mockResolvedValue({
      succeeded: [],
      failed: [
        { teamId: 10, playerId: 100, reason: "MLB feed unavailable", code: "MLB_FEED_UNAVAILABLE" },
      ],
    });

    render(<BulkOpsPanel leagueId={1} />);
    await waitFor(() => {
      expect(screen.getByTestId("il-stash-all")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("il-stash-all"));

    await waitFor(() => {
      expect(screen.getByTestId("il-bulk-failures")).toBeInTheDocument();
    });
    expect(screen.getByText(/MLB feed unavailable/)).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/failed 1/), "warning");
  });

  it("aborts the bulk submit when the user cancels the confirm modal", async () => {
    mockConfirm.mockResolvedValue(false);
    vi.mocked(getIlAudit).mockResolvedValue({
      rows: [
        { teamId: 10, teamName: "Aces", teamCode: "ACE",
          playerId: 100, playerName: "Mike Trout", mlbId: 545361,
          mlbStatus: "Injured 10-Day", assignedPosition: "OF" },
      ],
      totalRows: 1, totalTeams: 1, fetchedAt: "",
    });
    render(<BulkOpsPanel leagueId={1} />);
    await waitFor(() => {
      expect(screen.getByTestId("il-stash-all")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("il-stash-all"));
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalled();
    });
    expect(postBulkIlStash).not.toHaveBeenCalled();
  });
});

describe("BulkOpsPanel — Roster cleanup flow", () => {
  it("invokes postCleanupDropped with the input day count after confirm", async () => {
    vi.mocked(getIlAudit).mockResolvedValue({
      rows: [], totalRows: 0, totalTeams: 0, fetchedAt: "",
    });
    vi.mocked(postCleanupDropped).mockResolvedValue({
      deletedCount: 5,
      cutoff: "2026-04-01T00:00:00Z",
    });

    render(<BulkOpsPanel leagueId={42} />);
    await waitFor(() => {
      expect(screen.getByTestId("cleanup-days-input")).toBeInTheDocument();
    });
    const input = screen.getByTestId("cleanup-days-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "60" } });
    fireEvent.click(screen.getByTestId("cleanup-run"));

    await waitFor(() => {
      expect(postCleanupDropped).toHaveBeenCalledWith(42, 60);
    });
    expect(mockConfirm).toHaveBeenCalledWith(expect.stringMatching(/older than 60 days/i));
    await waitFor(() => {
      expect(screen.getByTestId("cleanup-result")).toBeInTheDocument();
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringMatching(/Cleaned up 5/i),
      "success",
    );
  });

  it("warns and short-circuits on a non-positive day count", async () => {
    vi.mocked(getIlAudit).mockResolvedValue({
      rows: [], totalRows: 0, totalTeams: 0, fetchedAt: "",
    });
    render(<BulkOpsPanel leagueId={1} />);
    await waitFor(() => {
      expect(screen.getByTestId("cleanup-days-input")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("cleanup-days-input"), { target: { value: "0" } });
    fireEvent.click(screen.getByTestId("cleanup-run"));
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/positive/i), "warning");
    });
    expect(postCleanupDropped).not.toHaveBeenCalled();
  });
});
