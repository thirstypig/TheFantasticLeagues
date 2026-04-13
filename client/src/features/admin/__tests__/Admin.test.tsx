import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock auth
vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

// Mock child component
vi.mock("../components/AdminLeagueTools", () => ({
  default: () => <div data-testid="admin-league-tools">AdminLeagueTools</div>,
}));

// Mock API — dashboard fetches /admin/stats and /admin/errors on mount
vi.mock("../../../api/base", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../../api/base");
  return {
    ...actual,
    API_BASE: "/api",
    fetchJsonApi: vi.fn(),
  };
});

// errorBus subscribe is a side-channel; no-op it out
vi.mock("../../../lib/errorBus", () => ({
  subscribeErrors: () => () => {},
}));

import { useAuth } from "../../../auth/AuthProvider";
import { fetchJsonApi } from "../../../api/base";
import Admin from "../pages/Admin";

const EMPTY_STATS = {
  users: { total: 0, active30d: 0, newThisMonth: 0, paid: 0 },
  leagues: { total: 0, byStatus: { setup: 0, draft: 0, inSeason: 0, completed: 0 } },
  aiInsights: { total: 0, generatedThisWeek: 0, latestWeekKey: null },
  todos: { total: 0, notStarted: 0, inProgress: 0, done: 0, topActive: [] },
  recentActivity: [],
  recentErrors: [],
  generatedAt: new Date().toISOString(),
};

const EMPTY_ERRORS = { errors: [], bufferSize: 0, bufferCapacity: 100 };

function renderPage() {
  return render(
    <MemoryRouter>
      <Admin />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(fetchJsonApi).mockReset();
  vi.mocked(fetchJsonApi).mockImplementation(async (url: string) => {
    if (url.includes("/admin/stats")) return EMPTY_STATS as unknown;
    if (url.includes("/admin/errors")) return EMPTY_ERRORS as unknown;
    return {} as unknown;
  });
});

describe("Admin", () => {
  it("renders dashboard title", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: true } } as any);
    renderPage();
    expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
  });

  it("renders subtitle", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: true } } as any);
    renderPage();
    expect(screen.getByText(/Ops command center/i)).toBeInTheDocument();
  });

  it("fetches stats and errors on mount for admin users", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: true } } as any);
    renderPage();
    await waitFor(() => {
      expect(vi.mocked(fetchJsonApi)).toHaveBeenCalledWith(expect.stringContaining("/admin/stats"));
      expect(vi.mocked(fetchJsonApi)).toHaveBeenCalledWith(expect.stringContaining("/admin/errors"));
    });
  });

  it("shows access denied for non-admin users", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: false } } as any);
    renderPage();
    expect(screen.getByText("Admin access required.")).toBeInTheDocument();
  });

  it("shows access denied when user is null", () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any);
    renderPage();
    expect(screen.getByText("Admin access required.")).toBeInTheDocument();
  });

  it("does not fetch stats for non-admin", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: false } } as any);
    renderPage();
    // Small delay to allow any stray effects to fire
    await new Promise((r) => setTimeout(r, 10));
    expect(vi.mocked(fetchJsonApi)).not.toHaveBeenCalled();
  });
});
