import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type Theme = 'dark' | 'light';
export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextType {
  /** Resolved scheme actually applied to <html>. */
  theme: Theme;
  /** What the user chose; `system` follows the OS. */
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Sets an explicit preference opposite to the current resolved theme. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const PREF_KEY = 'fbst-theme-pref';
// Legacy key: it was written on every render, so it never reflected a choice.
const LEGACY_KEY = 'fbst-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function getSystemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function readPreference(): ThemePreference {
  try {
    localStorage.removeItem(LEGACY_KEY);
    const stored = localStorage.getItem(PREF_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // storage unavailable — fall through to system
  }
  return 'system';
}

function syncThemeColorMeta(theme: Theme) {
  const color = theme === 'dark' ? '#3a1f22' : '#e0d3ae';
  let meta = document.querySelector('meta[name="theme-color"]:not([media])') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = color;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);

  // Follow the OS only while the preference is `system`.
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = (e: { matches: boolean }) => setSystemTheme(e.matches ? 'dark' : 'light');
    setSystemTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const theme: Theme = preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
    syncThemeColorMeta(theme);
  }, [theme]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(PREF_KEY, p);
    } catch {
      // ignore — preference still applies for this session
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setPreference]);

  const value = useMemo(
    () => ({ theme, preference, setPreference, toggleTheme }),
    [theme, preference, setPreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
