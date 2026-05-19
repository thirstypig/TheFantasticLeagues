/**
 * ThemeContext — Score Sheet meta theme-color and localStorage tests.
 *
 * Regression targets:
 *  1. syncThemeColorMeta emits Score Sheet palette (#3d434b dark / #ebe6db light),
 *     not the old Aurora navy/gray values (#0a0f1a / #e4e9f0).
 *  2. Meta tag is created if absent and updated if already present.
 *  3. Theme is persisted to / restored from localStorage under the 'fbst-theme' key.
 *  4. toggleTheme flips between dark and light.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "../ThemeContext";

function ThemeConsumer() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

function renderProvider(initialTheme?: string) {
  if (initialTheme) {
    localStorage.setItem("fbst-theme", initialTheme);
  }
  return render(
    <ThemeProvider>
      <ThemeConsumer />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  // Remove any theme-color meta tags from previous tests
  document
    .querySelectorAll('meta[name="theme-color"]:not([media])')
    .forEach((m) => m.remove());
  document.documentElement.classList.remove("dark", "light");
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("ThemeContext — Score Sheet meta theme-color", () => {
  it("sets meta theme-color to Score Sheet dark value #3d434b in dark mode", () => {
    renderProvider("dark");
    const meta = document.querySelector(
      'meta[name="theme-color"]:not([media])',
    ) as HTMLMetaElement | null;
    expect(meta).not.toBeNull();
    expect(meta!.content).toBe("#3d434b");
  });

  it("sets meta theme-color to Score Sheet light value #ebe6db in light mode", () => {
    renderProvider("light");
    const meta = document.querySelector(
      'meta[name="theme-color"]:not([media])',
    ) as HTMLMetaElement | null;
    expect(meta).not.toBeNull();
    expect(meta!.content).toBe("#ebe6db");
  });

  it("does NOT emit the old Aurora dark value #0a0f1a", () => {
    renderProvider("dark");
    const meta = document.querySelector(
      'meta[name="theme-color"]:not([media])',
    ) as HTMLMetaElement | null;
    expect(meta?.content).not.toBe("#0a0f1a");
  });

  it("updates existing meta tag rather than creating a duplicate", () => {
    // Pre-seed a meta tag (simulates the static HTML tags in index.html)
    const existing = document.createElement("meta");
    existing.name = "theme-color";
    document.head.appendChild(existing);

    renderProvider("dark");

    const metas = document.querySelectorAll('meta[name="theme-color"]:not([media])');
    expect(metas.length).toBe(1);
    expect((metas[0] as HTMLMetaElement).content).toBe("#3d434b");
  });
});

describe("ThemeContext — localStorage persistence", () => {
  it("reads initial theme from fbst-theme key", () => {
    renderProvider("dark");
    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
  });

  it("writes updated theme to fbst-theme key on toggle", async () => {
    renderProvider("light");
    const btn = screen.getByRole("button", { name: /toggle/i });
    act(() => btn.click());
    expect(localStorage.getItem("fbst-theme")).toBe("dark");
  });

  it("adds 'dark' class to documentElement in dark mode", () => {
    renderProvider("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("adds 'light' class to documentElement in light mode", () => {
    renderProvider("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });
});

describe("ThemeContext — toggleTheme", () => {
  it("toggles from light to dark", () => {
    renderProvider("light");
    expect(screen.getByTestId("theme-value").textContent).toBe("light");
    act(() => screen.getByRole("button", { name: /toggle/i }).click());
    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
  });

  it("toggles from dark to light", () => {
    renderProvider("dark");
    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
    act(() => screen.getByRole("button", { name: /toggle/i }).click());
    expect(screen.getByTestId("theme-value").textContent).toBe("light");
  });
});
