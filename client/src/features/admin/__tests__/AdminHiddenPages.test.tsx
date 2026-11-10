import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../auth/AuthProvider", () => ({ useAuth: vi.fn() }));
vi.mock("../components/AdminLeagueTools", () => ({ default: () => <div /> }));
vi.mock("../../../api/base", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../../api/base");
  return { ...actual, API_BASE: "/api", fetchJsonApi: vi.fn(async () => ({})) };
});
vi.mock("../../../lib/errorBus", () => ({ subscribeErrors: () => () => {} }));

import { useAuth } from "../../../auth/AuthProvider";
import Admin from "../pages/Admin";

describe("Admin hidden pages", () => {
  it("lists /ai and /tech under Hidden pages", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: true } } as any);
    render(<MemoryRouter><Admin /></MemoryRouter>);
    expect(screen.getByText("Hidden pages")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI" })).toHaveAttribute("href", "/ai");
    expect(screen.getByRole("link", { name: "Under the Hood" })).toHaveAttribute("href", "/tech");
  });
});
