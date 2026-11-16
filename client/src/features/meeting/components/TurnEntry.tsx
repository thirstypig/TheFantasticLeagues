// One team's turn: pick an add (from the Wire List or a free-agent search) and a
// drop, then Submit move or Pass. Shared by the commissioner's "Enter for them"
// and the owner's turn screen. Inline sections only, no modals.
import React, { useEffect, useId, useRef, useState } from "react";
import type { MeetingChoicesResponse, MeetingPlayer } from "@shared/api/meeting";
import { SectionLabel } from "../../../components/aurora/atoms";
import { ListHelp } from "../../../components/shared/ListHelp";
import { getChoices, searchFreeAgents } from "../api";
import { ERROR, MUTED, PRIMARY, SECONDARY, disabled } from "./styles";

const SEARCH_DEBOUNCE_MS = 300;

/** SectionLabel's look, on a real <label> (a div can't sit inside one). */
const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: "var(--am-text-faint)",
  fontWeight: 700,
  marginBottom: 8,
};

function message(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function PlayerButton({ p, rank, picked, onPick }: { p: MeetingPlayer; rank?: number; picked: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={picked}
      onClick={onPick}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        width: "100%",
        minHeight: 48,
        padding: "8px 12px",
        border: 0,
        borderBottom: "1px solid var(--am-border)",
        background: picked ? "var(--am-surface-alt)" : "transparent",
        color: "var(--am-text)",
        fontFamily: "inherit",
        fontSize: 17,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span style={{ fontWeight: picked ? 700 : 400 }}>{`${picked ? "✓ " : ""}${rank != null ? `${rank}. ` : ""}${p.name}`}</span>
      <span style={MUTED}>{[p.pos, p.mlbTeam].filter(Boolean).join(" · ")}</span>
    </button>
  );
}

export function TurnEntry({
  leagueId,
  sessionId,
  teamId,
  onSubmit,
  onPass,
}: {
  leagueId: number;
  sessionId: number;
  teamId: number;
  onSubmit: (addPlayerId: number, dropPlayerId: number) => Promise<void>;
  onPass: () => Promise<void>;
}) {
  const [data, setData] = useState<MeetingChoicesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [add, setAdd] = useState<MeetingPlayer | null>(null);
  const [dropId, setDropId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MeetingPlayer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);
  const searchId = useId();
  const dropSelectId = useId();

  useEffect(() => {
    let live = true;
    setData(null);
    setLoadError(null);
    setAdd(null);
    setDropId(null);
    getChoices(sessionId, teamId).then(
      (res) => live && setData(res),
      (e) => live && setLoadError(message(e, "Couldn’t load this team’s choices.")),
    );
    return () => {
      live = false;
    };
  }, [sessionId, teamId]);

  useEffect(() => {
    const seq = ++searchSeq.current;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchFreeAgents(leagueId, query).then(
        (rows) => seq === searchSeq.current && setResults(rows),
        () => seq === searchSeq.current && setResults([]),
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [leagueId, query]);

  if (loadError) return <p role="alert" style={ERROR}>{loadError}</p>;
  if (!data) return <p aria-busy="true" style={MUTED}>Loading choices…</p>;

  const drop = data.roster.find((p) => p.playerId === dropId) ?? null;
  const ready = !!add && !!drop && !busy;
  const n = data.activeCount;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(message(e, "That didn’t go through. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const pick = (p: MeetingPlayer) => setAdd((cur) => (cur?.playerId === p.playerId ? null : p));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <SectionLabel>Add</SectionLabel>
        {data.list.length > 0 && (
          <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
            <span style={{ ...MUTED, display: "inline-flex", alignItems: "center", gap: 4 }}>
              From your List <ListHelp kind="wire" />
            </span>
            <div>
              {data.list.map((p, i) => (
                <PlayerButton key={p.playerId} p={p} rank={i + 1} picked={add?.playerId === p.playerId} onPick={() => pick(p)} />
              ))}
            </div>
          </div>
        )}
        <label htmlFor={searchId} style={{ ...MUTED, display: "block", marginBottom: 4 }}>Search free agents</label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Player name"
          autoComplete="off"
          style={{
            width: "100%",
            minHeight: 44,
            boxSizing: "border-box",
            padding: "0 12px",
            borderRadius: 6,
            border: "1px solid var(--am-border-strong)",
            background: "var(--am-surface)",
            color: "var(--am-text)",
            fontSize: 17,
            fontFamily: "inherit",
          }}
        />
        {results.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {results.map((p) => (
              <PlayerButton key={p.playerId} p={p} picked={add?.playerId === p.playerId} onPick={() => pick(p)} />
            ))}
          </div>
        )}
        {add && !data.list.some((p) => p.playerId === add.playerId) && !results.some((p) => p.playerId === add.playerId) && (
          <p style={{ margin: "8px 0 0", fontSize: 17, color: "var(--am-text)" }}>{`Adding ${add.name}`}</p>
        )}
      </div>

      <div>
        <label htmlFor={dropSelectId} style={LABEL}>Drop</label>
        <select
          id={dropSelectId}
          value={dropId ?? ""}
          onChange={(e) => setDropId(e.target.value ? Number(e.target.value) : null)}
          style={{
            width: "100%",
            minHeight: 44,
            padding: "0 8px",
            borderRadius: 6,
            border: "1px solid var(--am-border-strong)",
            background: "var(--am-surface)",
            color: "var(--am-text)",
            fontSize: 17,
            fontFamily: "inherit",
          }}
        >
          <option value="">Choose a player to drop</option>
          {data.roster.map((p) => (
            <option key={p.playerId} value={p.playerId}>{`${p.name} · ${p.pos}`}</option>
          ))}
        </select>
      </div>

      {add && drop && <p style={{ margin: 0, fontSize: 15, color: "var(--am-positive)" }}>{`✓ Roster stays at ${n} / ${n}`}</p>}
      {error && <p role="alert" style={ERROR}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
        <button type="button" disabled={busy} style={disabled(SECONDARY, busy)} onClick={() => run(onPass)}>
          Pass
        </button>
        <button
          type="button"
          disabled={!ready}
          style={disabled(PRIMARY, !ready)}
          onClick={() => {
            if (add && drop) void run(() => onSubmit(add.playerId, drop.playerId));
          }}
        >
          Submit move
        </button>
      </div>
    </div>
  );
}

export default TurnEntry;
