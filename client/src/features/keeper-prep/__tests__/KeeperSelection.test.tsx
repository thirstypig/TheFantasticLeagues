import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Mock leagues API (getMyRoster, saveKeepers)
vi.mock("../../leagues/api", () => ({
  getMyRoster: vi.fn(),
  saveKeepers: vi.fn(),
}));

// Mock ToastContext
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({
    toast: vi.fn(),
    confirm: vi.fn().mockResolvedValue(true),
  }),
}));

import { getMyRoster, saveKeepers } from "../../leagues/api";
import KeeperSelection from "../pages/KeeperSelection";

const mockRoster = [
  { id: 1, price: 25, isKeeper: false, player: { name: "Mike Trout", posPrimary: "CF", mlbTeam: "LAA" } },
  { id: 2, price: 30, isKeeper: true, player: { name: "Mookie Betts", posPrimary: "RF", mlbTeam: "LAD" } },
  { id: 3, price: 15, isKeeper: false, player: { name: "Gerrit Cole", posPrimary: "SP", mlbTeam: "NYY" } },
];

function renderWithRoute() {
  return render(
    <MemoryRouter initialEntries={["/keeper-prep/1"]}>
      <Routes>
        <Route path="/keeper-prep/:id" element={<KeeperSelection />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMyRoster).mockResolvedValue({
    team: { name: "Aces", budget: 260 },
    roster: mockRoster,
    isLocked: false,
    keeperLimit: 4,
  });
});

describe("KeeperSelection", () => {
  it("renders page header", async () => {
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText("Keeper Selection")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    vi.mocked(getMyRoster).mockReturnValue(new Promise(() => {}));
    renderWithRoute();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows error state when API fails", async () => {
    vi.mocked(getMyRoster).mockRejectedValue(new Error("Network error"));
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText(/Failed to load roster/)).toBeInTheDocument();
    });
  });

  it("renders player names from roster", async () => {
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText("Mike Trout")).toBeInTheDocument();
      expect(screen.getByText("Mookie Betts")).toBeInTheDocument();
      expect(screen.getByText("Gerrit Cole")).toBeInTheDocument();
    });
  });

  it("displays budget summary card", async () => {
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText("Total Budget")).toBeInTheDocument();
      expect(screen.getByText("Keeper Cost")).toBeInTheDocument();
      expect(screen.getByText("Available")).toBeInTheDocument();
    });
  });

  it("pre-selects keepers based on server state", async () => {
    renderWithRoute();
    await waitFor(() => {
      // Mookie Betts has isKeeper: true, so checkbox should be checked
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes).toHaveLength(3);
      // Second checkbox (Mookie) should be checked
      expect(checkboxes[1]).toBeChecked();
      // First and third should not
      expect(checkboxes[0]).not.toBeChecked();
    });
  });

  it("shows locked banner when keepers are locked", async () => {
    vi.mocked(getMyRoster).mockResolvedValue({
      team: { name: "Aces", budget: 260 },
      roster: mockRoster,
      isLocked: true,
      keeperLimit: 4,
    });
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText("Keepers are Locked")).toBeInTheDocument();
      expect(screen.getByText("Keepers Locked")).toBeInTheDocument(); // button text
    });
  });

  it("shows empty state when roster is empty", async () => {
    vi.mocked(getMyRoster).mockResolvedValue({
      team: { name: "Aces", budget: 260 },
      roster: [],
      isLocked: false,
      keeperLimit: 4,
    });
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText("No players on roster.")).toBeInTheDocument();
    });
  });
});
