/**
 * MobileShell — bottom tab bar, account sheet, no drawer.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileShell } from "../MobileShell";

const logout = vi.fn().mockResolvedValue(undefined);
let isAdmin = false;

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", preference: "system", setPreference: vi.fn(), toggleTheme: vi.fn() }),
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
  useAuth: () => ({ user: { id: 1, isAdmin }, loading: false, logout }),
}));

function renderShell(pathname = "/ai") {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <MobileShell>
        <div data-testid="page-content">Content</div>
      </MobileShell>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  isAdmin = false;
  logout.mockClear();
});

describe("MobileShell — bottom tab bar", () => {
  it("renders the four tabs", () => {
    renderShell();
    const bar = screen.getByTestId("mobile-tab-bar");
    expect(within(bar).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Today", "My Team", "Players", "League",
    ]);
  });

  it("marks League active on a team that is not mine", () => {
    renderShell("/teams/SKD");
    const bar = screen.getByTestId("mobile-tab-bar");
    expect(bar.querySelector('[data-tab-key="league"]')?.getAttribute("aria-current")).toBe("page");
    expect(bar.querySelector('[data-tab-key="myTeam"]')?.getAttribute("aria-current")).toBeNull();
  });

  it("pads the content so the bar never covers it", () => {
    renderShell();
    const content = screen.getByTestId("mobile-content");
    expect(content.style.paddingBottom).toContain("64px");
    expect(content.style.paddingBottom).toContain("env(safe-area-inset-bottom)");
    expect(content).toContainElement(screen.getByTestId("page-content"));
  });
});

describe("MobileShell — bottom/top insets for pages with fixed or full-height UI", () => {
  it("publishes --shell-bottom-inset (tab bar + safe area) and --shell-top-inset (top bar)", () => {
    renderShell();
    const root = screen.getByTestId("mobile-shell");
    expect(root.style.getPropertyValue("--shell-bottom-inset")).toBe("calc(64px + env(safe-area-inset-bottom))");
    expect(root.style.getPropertyValue("--shell-top-inset")).toBe("50px");
  });

  it("also publishes them on <html> so portal-level UI (toasts) sees them, and cleans up", () => {
    const { unmount } = renderShell();
    const html = document.documentElement.style;
    expect(html.getPropertyValue("--shell-bottom-inset")).toBe("calc(64px + env(safe-area-inset-bottom))");
    expect(html.getPropertyValue("--shell-top-inset")).toBe("50px");
    unmount();
    expect(html.getPropertyValue("--shell-bottom-inset")).toBe("");
    expect(html.getPropertyValue("--shell-top-inset")).toBe("");
  });
});

describe("MobileShell — no drawer, no theme toggle", () => {
  it("has no navigation-menu button or dialog", () => {
    renderShell();
    expect(screen.queryByLabelText("Open navigation menu")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders no theme toggle", () => {
    renderShell();
    expect(
      screen.queryAllByRole("button", { name: /switch to (light|dark) theme|light theme|dark theme/i, hidden: true }),
    ).toHaveLength(0);
  });
});

describe("MobileShell — account sheet", () => {
  it("is closed until the Account button is pressed", () => {
    renderShell();
    expect(screen.queryByRole("dialog", { name: /account/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Account" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("lists Profile, Help & Guide, About and Sign out for an owner", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    const sheet = screen.getByRole("dialog", { name: /account/i });
    expect(within(sheet).getByRole("link", { name: "Profile" }).getAttribute("href")).toBe("/profile");
    expect(within(sheet).getByRole("link", { name: "Help & Guide" }).getAttribute("href")).toBe("/guide");
    expect(within(sheet).getByRole("link", { name: "About" }).getAttribute("href")).toBe("/about");
    expect(within(sheet).queryByRole("link", { name: "Admin" })).toBeNull();
    expect(within(sheet).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("adds Admin for an admin", () => {
    isAdmin = true;
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    const sheet = screen.getByRole("dialog", { name: /account/i });
    expect(within(sheet).getByRole("link", { name: "Admin" }).getAttribute("href")).toBe("/admin");
  });

  it("moves focus into the sheet when it opens", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    const sheet = screen.getByRole("dialog", { name: /account/i });
    expect(sheet.contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /account/i })).toBeNull();
  });

  it("closes when the scrim is clicked", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(screen.getByTestId("account-sheet-scrim"));
    expect(screen.queryByRole("dialog", { name: /account/i })).toBeNull();
  });

  it("closes after following a link", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(screen.getByRole("link", { name: "Profile" }));
    expect(screen.queryByRole("dialog", { name: /account/i })).toBeNull();
  });

  it("signs out through the auth provider", async () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
