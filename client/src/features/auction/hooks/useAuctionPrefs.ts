import { useState, useCallback } from 'react';

export interface AuctionPrefs {
  sounds: boolean;
  chat: boolean;
  watchlist: boolean;
  openingBidPicker: boolean;
  valueColumn: boolean;
  spendingPace: boolean;
}

const DEFAULTS: AuctionPrefs = {
  sounds: true,
  chat: true,
  watchlist: true,
  openingBidPicker: true,
  valueColumn: true,
  spendingPace: true,
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

  const update = useCallback((key: keyof AuctionPrefs, value: boolean) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      save(next);
      return next;
    });
  }, []);

  const toggle = useCallback((key: keyof AuctionPrefs) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: !prev[key] };
      save(next);
      return next;
    });
  }, []);

  return { prefs, update, toggle };
}
