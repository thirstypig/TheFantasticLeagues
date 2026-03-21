import { useState, useCallback } from 'react';

export type LeagueFilter = 'ALL' | 'NL' | 'AL';

export interface AuctionPrefs {
  sounds: boolean;
  notifications: boolean;
  chat: boolean;
  watchlist: boolean;
  openingBidPicker: boolean;
  valueColumn: boolean;
  spendingPace: boolean;
  defaultLeagueFilter: LeagueFilter;
}

const DEFAULTS: AuctionPrefs = {
  sounds: true,
  notifications: true,
  chat: true,
  watchlist: true,
  openingBidPicker: true,
  valueColumn: true,
  spendingPace: true,
  defaultLeagueFilter: 'ALL',
};

const STORAGE_KEY = 'auctionPrefs';

function load(): AuctionPrefs {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

function save(prefs: AuctionPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function useAuctionPrefs() {
  const [prefs, setPrefs] = useState<AuctionPrefs>(load);

  const update = useCallback(<K extends keyof AuctionPrefs>(key: K, value: AuctionPrefs[K]) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      save(next);
      return next;
    });
  }, []);

  const toggle = useCallback((key: keyof AuctionPrefs) => {
    setPrefs(prev => {
      const val = prev[key];
      if (typeof val !== 'boolean') return prev;
      const next = { ...prev, [key]: !val };
      save(next);
      return next;
    });
  }, []);

  return { prefs, update, toggle };
}
