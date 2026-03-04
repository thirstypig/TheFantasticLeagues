// client/src/components/ThemeToggle.tsx
import React, { useEffect, useMemo, useState } from "react";

type ThemeMode = "dark" | "light";

function readInitialTheme(): ThemeMode {
  // 1) localStorage
  try {
    const v = localStorage.getItem("fbst_theme");
    if (v === "dark" || v === "light") return v;
  } catch {
    // ignore
  }

  // 2) current DOM
  if (typeof document !== "undefined") {
    if (document.documentElement.classList.contains("dark")) return "dark";
  }

  // 3) system preference
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }

  return "dark";
}

export default function ThemeToggle() {
  const initial = useMemo(() => readInitialTheme(), []);
  const [mode, setMode] = useState<ThemeMode>(initial);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "dark") root.classList.add("dark");
    else root.classList.remove("dark");

    try {
      localStorage.setItem("fbst_theme", mode);
    } catch {
      // ignore
    }
  }, [mode]);

  return (
    <button
      type="button"
      className="rounded-full border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-3 py-2 text-sm text-white/80 hover:bg-[var(--lg-tint-hover)]"
      onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {mode === "dark" ? "Dark" : "Light"}
    </button>
  );
}
