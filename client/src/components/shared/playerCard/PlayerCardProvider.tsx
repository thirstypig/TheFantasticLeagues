import { useLocation } from "react-router-dom";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PlayerCard } from "./PlayerCard";

type Ctx = { open(mlbId: number): void; close(): void };
const PlayerCardContext = createContext<Ctx>({ open() {}, close() {} });

export function usePlayerCard(): Ctx {
  return useContext(PlayerCardContext);
}

export function PlayerCardProvider({ children }: { children: React.ReactNode }) {
  const [mlbId, setMlbId] = useState<number | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  const open = useCallback((id: number) => {
    // Keep the first trigger when swapping players so focus returns to the original name.
    if (!trigger.current || !trigger.current.isConnected) {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    setMlbId(id);
  }, []);

  const close = useCallback(() => {
    setMlbId(null);
    const el = trigger.current;
    trigger.current = null;
    if (el && el.isConnected) el.focus();
  }, []);

  const { pathname } = useLocation();
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setMlbId(null);
      trigger.current = null;
    }
  }, [pathname]);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <PlayerCardContext.Provider value={value}>
      {children}
      {mlbId !== null && <PlayerCard mlbId={mlbId} onClose={close} />}
    </PlayerCardContext.Provider>
  );
}

/** A player name that opens the card; plain text when there is no mlbId. */
export function PlayerLink({
  mlbId,
  name,
  className,
}: {
  mlbId?: number | null;
  name: string;
  className?: string;
}) {
  const { open } = usePlayerCard();
  if (!mlbId) return <span className={className}>{name}</span>;
  return (
    <button
      type="button"
      className={`pc-link${className ? ` ${className}` : ""}`}
      onClick={() => open(mlbId)}
    >
      {name}
    </button>
  );
}
