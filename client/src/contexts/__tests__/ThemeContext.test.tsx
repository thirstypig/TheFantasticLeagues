/**
 * ThemeContext — System / Light / Dark preference model.
 *
 * The stored value is a preference ('system' | 'light' | 'dark') under
 * `fbst-theme-pref`; `system` follows the OS live. The legacy `fbst-theme`
 * key was written on every render (so it never reflected a choice) and is
 * removed and ignored.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "../ThemeContext";

type Listener = (e: { matches: boolean }) => void;

let osDark = true;
let listeners: Set<Listener>;

function installMatchMedia() {
  listeners = new Set();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return query.includes("dark") ? osDark : !osDark;
      },
      media: query,
      addEventListener: (_: string, l: Listener) => listeners.add(l),
      removeEventListener: (_: string, l: Listener) => listeners.delete(l),
      addListener: (l: Listener) => listeners.add(l),
      removeListener: (l: Listener) => listeners.delete(l),
    })),
  );
}

function fireOsChange(dark: boolean) {
  osDark = dark;
  act(() => {
    [...listeners].forEach((l) => l({ matches: dark }));
  });
}

function Consumer() {
  const { theme, preference, setPreference, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="pref">{preference}</span>
      <button onClick={() => setPreference("light")}>set-light</button>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <ThemeProvider>
      <Consumer />
    </ThemeProvider>,
  );
}

// Browsers use the FIRST matching theme-color meta in document order.
const metaContent = () =>
  (document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null)?.content;

/** Mirror client/index.html: two media-scoped theme-color metas. */
function installIndexHtmlMetas() {
  for (const [content, scheme] of [
    ["#3a1f22", "dark"],
    ["#e0d3ae", "light"],
  ]) {
    const m = document.createElement("meta");
    m.setAttribute("name", "theme-color");
    m.setAttribute("content", content);
    m.setAttribute("media", `(prefers-color-scheme: ${scheme})`);
    document.head.appendChild(m);
  }
}

beforeEach(() => {
  osDark = true;
  installMatchMedia();
  localStorage.clear();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  document.documentElement.classList.remove("dark", "light");
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("ThemeContext preference model", () => {
  it("defaults to system and resolves to the OS scheme", () => {
    renderProvider();
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("pref").textContent).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("ignores and removes the legacy fbst-theme key", () => {
    localStorage.setItem("fbst-theme", "light");
    renderProvider();
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(localStorage.getItem("fbst-theme")).toBeNull();
  });

  it("does not persist anything until a preference is chosen", () => {
    renderProvider();
    expect(localStorage.getItem("fbst-theme-pref")).toBeNull();
  });

  it("restores a stored explicit preference", () => {
    localStorage.setItem("fbst-theme-pref", "light");
    renderProvider();
    expect(screen.getByTestId("pref").textContent).toBe("light");
    expect(screen.getByTestId("theme").textContent).toBe("light");
  });

  it("falls back to system for an invalid stored value", () => {
    localStorage.setItem("fbst-theme-pref", "purple");
    renderProvider();
    expect(screen.getByTestId("pref").textContent).toBe("system");
  });

  it("follows a live OS change while preference is system", () => {
    renderProvider();
    fireOsChange(false);
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("explicit preference wins over the OS and persists", () => {
    renderProvider();
    act(() => screen.getByRole("button", { name: "set-light" }).click());
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(localStorage.getItem("fbst-theme-pref")).toBe("light");
    expect(listeners.size).toBe(0); // unsubscribed once not following the OS
    fireOsChange(true);
    expect(screen.getByTestId("theme").textContent).toBe("light");
  });

  it("unsubscribes from OS changes on unmount", () => {
    const { unmount } = renderProvider();
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });

  it("toggleTheme sets the opposite explicit preference", () => {
    renderProvider();
    act(() => screen.getByRole("button", { name: "toggle" }).click());
    expect(screen.getByTestId("pref").textContent).toBe("light");
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(localStorage.getItem("fbst-theme-pref")).toBe("light");
  });

  it("theme-color meta follows the resolved theme", () => {
    renderProvider();
    expect(metaContent()).toBe("#3a1f22");
    fireOsChange(false);
    expect(metaContent()).toBe("#e0d3ae");
  });

  it("updates an existing meta tag rather than creating a duplicate", () => {
    const existing = document.createElement("meta");
    existing.name = "theme-color";
    document.head.appendChild(existing);
    renderProvider();
    const metas = document.querySelectorAll('meta[name="theme-color"]:not([media])');
    expect(metas.length).toBe(1);
    expect((metas[0] as HTMLMetaElement).content).toBe("#3a1f22");
  });

  it("an explicit Light on a dark OS recolors the first theme-color meta (index.html metas)", () => {
    installIndexHtmlMetas();
    renderProvider();
    act(() => screen.getByRole("button", { name: "set-light" }).click());
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')] as HTMLMetaElement[];
    expect(metas.length).toBe(2); // no third, ignored meta appended
    expect(metas[0].getAttribute("media")).toContain("dark"); // the one a dark-OS browser would pick
    expect(metas[0].content).toBe("#e0d3ae");
    expect(metas.every((m) => m.content === "#e0d3ae")).toBe(true);
  });

  it("creates a theme-color meta when none exist", () => {
    renderProvider();
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    expect(metas.length).toBe(1);
    expect((metas[0] as HTMLMetaElement).content).toBe("#3a1f22");
  });
});
