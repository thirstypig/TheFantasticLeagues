import { useLocation } from "react-router-dom";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PlayerCard } from "./PlayerCard";

export type CardGroup = "hitting" | "pitching";
type OpenOpts = { group?: CardGroup };
type Ctx = { open(mlbId: number, opts?: OpenOpts): void; close(): void };
const PlayerCardContext = createContext<Ctx>({ open() {}, close() {} });

export function usePlayerCard(): Ctx {
  return useContext(PlayerCardContext);
}

export function PlayerCardProvider({ children }: { children: React.ReactNode }) {
  const [mlbId, setMlbId] = useState<number | null>(null);
  const [group, setGroup] = useState<CardGroup | undefined>(undefined);
  const trigger = useRef<HTMLElement | null>(null);

  const open = useCallback((id: number, opts?: OpenOpts) => {
    // Keep the first trigger when swapping players so focus returns to the original name.
    if (!trigger.current || !trigger.current.isConnected) {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    setGroup(opts?.group);
    setMlbId(id);
  }, []);

  const close = useCallback(() => {
    setMlbId(null);
    setGroup(undefined);
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
      setGroup(undefined);
      trigger.current = null;
    }
  }, [pathname]);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <PlayerCardContext.Provider value={value}>
      {children}
      {mlbId !== null && <PlayerCard mlbId={mlbId} group={group} onClose={close} />}
    </PlayerCardContext.Provider>
  );
}

/** A player name that opens the card; plain text when there is no mlbId. */
export function PlayerLink({
  mlbId,
  name,
  className,
  group,
}: {
  mlbId?: number | null;
  name: string;
  className?: string;
  /** Which stat side a two-way player's card opens on (e.g. the Pitchers tab row). */
  group?: CardGroup;
}) {
  const { open } = usePlayerCard();
  if (!mlbId) return <span className={className}>{name}</span>;
  return (
    <button
      type="button"
      className={`pc-link${className ? ` ${className}` : ""}`}
      onClick={() => open(mlbId, group ? { group } : undefined)}
    >
      {name}
    </button>
  );
}
