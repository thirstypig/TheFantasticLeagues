import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPassword from "../pages/ForgotPassword";

let mockTheme: "light" | "dark" = "light";

vi.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    theme: mockTheme,
    preference: mockTheme,
    setPreference: vi.fn(),
    toggleTheme: vi.fn(),
  }),
}));

vi.mock("../../../lib/supabase", () => ({
  supabase: { auth: { resetPasswordForEmail: vi.fn() } },
}));

function renderPage() {
  const { container } = render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>,
  );
  return container.querySelector(".aurora-theme") as HTMLElement;
}

describe("public pre-auth page follows the resolved theme", () => {
  beforeEach(() => {
    mockTheme = "light";
  });

  it("omits the dark class when the theme is light", () => {
    const wrapper = renderPage();
    expect(wrapper).not.toBeNull();
    expect(wrapper.classList.contains("dark")).toBe(false);
  });

  it("adds the dark class when the theme is dark", () => {
    mockTheme = "dark";
    const wrapper = renderPage();
    expect(wrapper.classList.contains("dark")).toBe(true);
  });
});
