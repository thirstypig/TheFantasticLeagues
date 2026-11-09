import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "../pages/ProfilePage";
import { getMyProfile } from "../api";

const setPreferenceMock = vi.fn();

vi.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    theme: "light",
    preference: "light",
    setPreference: setPreferenceMock,
    toggleTheme: vi.fn(),
  }),
}));

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { user: { id: 1 } }, isAdmin: false }),
}));

vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("../../notifications", () => ({
  NotificationSettings: () => <div data-testid="notification-settings" />,
}));

vi.mock("../api", () => ({
  getMyProfile: vi.fn().mockResolvedValue({
    user: { id: 1, name: "James Chang", email: "j@example.com", avatarUrl: null },
    profile: null,
    leagueHistory: [],
  }),
  getPublicProfile: vi.fn(),
  updateMyProfile: vi.fn(),
}));

async function renderProfile() {
  render(
    <MemoryRouter initialEntries={["/profile"]}>
      <ProfilePage />
    </MemoryRouter>,
  );
  // The control also renders during loading; wait for the loaded page so the
  // queried node is the one that stays mounted.
  await screen.findByRole("heading", { name: "My Profile" });
  return screen.getByRole("radiogroup", { name: "Appearance" });
}

describe("Profile appearance control", () => {
  beforeEach(() => setPreferenceMock.mockClear());

  it("renders System / Light / Dark with the current preference checked", async () => {
    const group = await renderProfile();
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["System", "Light", "Dark"]);
    expect(within(group).getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "false");
    expect(within(group).getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "false");
  });

  it("is anchored at #appearance", async () => {
    const group = await renderProfile();
    expect(group.closest("#appearance")).not.toBeNull();
  });

  it("calls setPreference with the clicked option", async () => {
    const group = await renderProfile();
    fireEvent.click(within(group).getByRole("radio", { name: "Dark" }));
    expect(setPreferenceMock).toHaveBeenCalledTimes(1);
    expect(setPreferenceMock).toHaveBeenCalledWith("dark");
    await waitFor(() => expect(setPreferenceMock).toHaveBeenCalledTimes(1));
  });

  it("stays available when the profile fetch fails", async () => {
    vi.mocked(getMyProfile).mockRejectedValueOnce(new Error("500"));
    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <ProfilePage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Profile not found.")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Appearance" })).toBeInTheDocument();
    expect(getMyProfile).toHaveBeenCalled();
  });

  it("is available while the profile is still loading", () => {
    vi.mocked(getMyProfile).mockReturnValueOnce(new Promise(() => {}));
    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <ProfilePage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Loading profile…")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Appearance" })).toBeInTheDocument();
  });
});
