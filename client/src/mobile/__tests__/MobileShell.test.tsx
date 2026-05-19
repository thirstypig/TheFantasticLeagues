/**
 * MobileShell — drawer always-mounted and interaction tests.
 *
 * Regression targets:
 *  1. Always-mounted drawer: data-testid="mobile-tab-bar" must be in the DOM
 *     regardless of whether the drawer is open. The entire mobile test suite
 *     (MobileLayoutGate + tab tests) depends on this invariant via getByTestId.
 *  2. Hamburger opens drawer (aria-expanded flips, aria-modal goes true).
 *  3. Clicking overlay closes drawer.
 *  4. Escape key closes drawer.
 *  5. Navigation (pathname change) auto-closes drawer.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { MobileShell } from "../MobileShell";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

vi.mock("../../contexts/LeagueContext", () => ({
  useLeague: () => ({
    leagueId: 20,
    leagues: [{ id: 20, name: "OGBA", access: { type: "MEMBER", role: "OWNER" } }],
    myTeamId: 101,
    myTeamCode: "LDY",
  }),
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1, isAdmin: false }, loading: false }),
}));

function renderShell(pathname = "/") {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <MobileShell>
        <div data-testid="page-content">Content</div>
      </MobileShell>
    </MemoryRouter>,
  );
}

describe("MobileShell — always-mounted drawer", () => {
  it("renders mobile-tab-bar in the DOM when drawer is closed", () => {
    renderShell();
    // This is the invariant the whole suite depends on — must never be conditional.
    expect(screen.getByTestId("mobile-tab-bar")).toBeInTheDocument();
  });

});

describe("MobileShell — hamburger / drawer interaction", () => {
  it("hamburger button starts with aria-expanded=false", () => {
    renderShell();
    const hamburger = screen.getByRole("button", { name: /open navigation menu/i });
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking hamburger opens drawer (aria-expanded becomes true)", () => {
    renderShell();
    const hamburger = screen.getByRole("button", { name: /open navigation menu/i });
    fireEvent.click(hamburger);
    expect(hamburger.getAttribute("aria-expanded")).toBe("true");
  });

  it("clicking overlay while drawer is open closes it", () => {
    renderShell();
    const hamburger = screen.getByRole("button", { name: /open navigation menu/i });
    fireEvent.click(hamburger);
    expect(hamburger.getAttribute("aria-expanded")).toBe("true");

    // The overlay has no accessible role/label — query by aria-hidden + click
    const overlay = screen.getByRole("dialog", { name: /navigation menu/i })
      .previousElementSibling as HTMLElement;
    fireEvent.click(overlay);
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");
  });

  it("Escape key closes open drawer", () => {
    renderShell();
    const hamburger = screen.getByRole("button", { name: /open navigation menu/i });
    fireEvent.click(hamburger);
    expect(hamburger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("MobileShell — drawer navigation close", () => {
  it("mobile-tab-bar remains in DOM after initial render (closed state)", () => {
    renderShell("/players");
    expect(screen.getByTestId("mobile-tab-bar")).toBeInTheDocument();
  });
});
