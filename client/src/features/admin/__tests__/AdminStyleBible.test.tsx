import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../../../auth/AuthProvider";
import AdminStyleBible from "../pages/AdminStyleBible";

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminStyleBible />
    </MemoryRouter>,
  );
}

describe("AdminStyleBible", () => {
  it("shows 'Admins only.' and no iframe for non-admins", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: false } } as any);
    renderPage();
    expect(screen.getByText("Admins only.")).toBeInTheDocument();
    expect(screen.queryByTitle("Style Bible")).toBeNull();
  });

  it("renders the iframe and full-page link for admins", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: true } } as any);
    renderPage();
    const frame = screen.getByTitle("Style Bible");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", "/style-bible/index.html");
    const link = screen.getByRole("link", { name: /Open full page/ });
    expect(link).toHaveAttribute("href", "/style-bible/index.html");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
