// One team (screen 15): one-off fixes between meetings. Every action goes
// through the same preview the server enforces, then a confirm sheet. These
// writes never carry an effectiveDate; only the meeting Save does.
import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { ConfirmSheet } from "../../../components/shared/ConfirmSheet";
import { PlayerFace } from "../../../components/shared/PlayerFace";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { useToast } from "../../../contexts/ToastContext";
import { CardError, LINK, PRIMARY, ROW, SECONDARY, Skeleton, useLoad } from "../components/cardParts";
import {
  commissionerIlActivate,
  commissionerIlStash,
  getCommissionerOverview,
  getCommissionerRosters,
  getCommissionerRules,
  getGhostIlSummary,
  getRosterCheck,
  oneOffSwap,
  previewCommissionerIlActivate,
  previewCommissionerIlStash,
  previewOneOffSwap,
} from "../api";
import type { FreeAgent, PreviewResult, RosterItem } from "../api";
import { CommissionerOnly } from "../components/CommissionerOnly";
import { PlayerSearch } from "../components/PlayerSearch";
import "../commissioner.css";

const SLOT_ORDER = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P", "SP", "RP", "BN", "IL"];
const PITCHER = new Set(["P", "SP", "RP", "CL"]);
const SUB: React.CSSProperties = { fontSize: 15, color: "var(--am-text-muted)" };
const OK: React.CSSProperties = { margin: 0, fontSize: 15, color: "var(--am-positive)" };
const BAD: React.CSSProperties = { margin: 0, fontSize: 15, color: "var(--am-negative)" };

/** Blank or missing is NaN, never 0. */
function numRule(raw: string | null | undefined): number {
  return raw === undefined || raw === null || String(raw).trim() === "" ? NaN : Number(raw);
}

function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] || full;
}

const slotOf = (r: RosterItem) => r.assignedPosition || r.player.posPrimary;
const isIl = (r: RosterItem) => r.assignedPosition === "IL";
const slotRank = (r: RosterItem) => {
  const i = SLOT_ORDER.indexOf(slotOf(r));
  return i === -1 ? SLOT_ORDER.length : i;
};

type Kind = "menu" | "il" | "drop" | "activate";
interface Panel { rosterId: number; kind: Kind }
interface Check { key: string; res: PreviewResult }

function TeamBody({ leagueId, teamId }: { leagueId: number; teamId: number }) {
  const base = `/commissioner/${leagueId}`;
  const { toast } = useToast();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [version, setVersion] = useState(0);
  const overview = useLoad(() => getCommissionerOverview(leagueId), [leagueId]);
  const rostersLoad = useLoad(() => getCommissionerRosters(leagueId), [leagueId, version]);
  const check = useLoad(() => getRosterCheck(leagueId), [leagueId, version]);
  const ghosts = useLoad(() => getGhostIlSummary(leagueId), [leagueId, version]);
  const rules = useLoad(() => getCommissionerRules(leagueId), [leagueId]);

  // Keep the last good roster on screen while a reload is in flight.
  const lastRosters = useRef<RosterItem[] | null>(null);
  if (rostersLoad.state === "ready") lastRosters.current = rostersLoad.data;
  const rosterRows = lastRosters.current;

  const [savedOnce, setSavedOnce] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [pick, setPick] = useState<{ id: number; name: string } | null>(null);
  const [verdict, setVerdict] = useState<Check | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const savingRef = useRef(false);
  const pickKey = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  if (!rosterRows) {
    const back = <Link to={`${base}/rosters`} style={LINK}>‹ Rosters</Link>;
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        {back}
        <Glass padded={false}>{rostersLoad.state === "error" ? <CardError>Couldn’t load this roster.</CardError> : <Skeleton />}</Glass>
      </div>
    );
  }

  const team = rosterRows.filter((r) => r.teamId === teamId).sort((a, b) => slotRank(a) - slotRank(b));
  const teamName = overview.state === "ready" ? overview.data.teams?.find((t) => t.id === teamId)?.name ?? "Team" : "Team";
  const cap = check.state === "ready" ? check.data.cap : null;
  const active = team.filter((r) => !isIl(r)).length;
  const ilUsed = team.filter(isIl).length;
  const ghostIds = new Set(
    ghosts.state === "ready" ? (ghosts.data.teams.find((t) => t.teamId === teamId)?.ghosts ?? []).map((g) => g.playerId) : [],
  );
  const ruleCost = (key: string, fallback: number) => {
    if (rules.state !== "ready") return fallback;
    const n = numRule(rules.data.find((r) => r.key === key)?.value);
    return Number.isFinite(n) && n >= 0 ? n : fallback; // $0 is a valid fee
  };
  const slotCount = (() => {
    if (rules.state !== "ready") return 2;
    const n = numRule(rules.data.find((r) => r.key === "slot_count" && r.category === "il")?.value);
    return Number.isFinite(n) && n >= 0 ? n : 2;
  })();
  const slot = ilUsed + 1;
  const slotsFull = slot > slotCount;
  const fee = slot === 1 ? ruleCost("il_slot_1_cost", 10) : ruleCost("il_slot_2_cost", 15);

  const target = panel ? team.find((r) => r.id === panel.rosterId) ?? null : null;

  function close() {
    pickKey.current = null;
    setPanel(null);
    setPick(null);
    setVerdict(null);
    setSheetOpen(false);
    setFailure(null);
  }
  function open(rosterId: number, kind: Kind) {
    pickKey.current = null;
    setPanel({ rosterId, kind });
    setPick(null);
    setVerdict(null);
    setFailure(null);
  }

  /** Run the preview for the chosen id; apply it only if that choice is still current. */
  function choose(id: number, name: string) {
    if (!panel || !target) return;
    const key = `${panel.kind}:${target.player.id}:${id}`;
    pickKey.current = key;
    setPick({ id, name });
    setVerdict(null);
    setFailure(null);
    const t = target.player.id;
    const run =
      panel.kind === "il" ? previewCommissionerIlStash(leagueId, teamId, t, id)
      : panel.kind === "drop" ? previewOneOffSwap(leagueId, teamId, id, t)
      : previewCommissionerIlActivate(leagueId, teamId, t, id);
    run.then(
      (res) => {
        if (!alive.current || pickKey.current !== key) return; // selection changed since
        setVerdict({ key, res });
      },
      () => {
        if (!alive.current || pickKey.current !== key) return;
        setVerdict({ key, res: { ok: false, error: "Couldn’t check this move. Try again." } });
      },
    );
  }

  const okNow = !!panel && !!target && !!pick && verdict?.key === `${panel.kind}:${target.player.id}:${pick.id}` && verdict.res.ok;

  async function confirm() {
    if (savingRef.current || !panel || !target || !pick || !okNow) return;
    savingRef.current = true;
    setSaving(true);
    const t = target.player.id;
    const id = pick.id;
    try {
      if (panel.kind === "il") await commissionerIlStash(leagueId, teamId, t, id);
      else if (panel.kind === "drop") await oneOffSwap(leagueId, teamId, id, t);
      else await commissionerIlActivate(leagueId, teamId, t, id);
      if (!alive.current) return;
      toast(
        panel.kind === "il" ? `${lastName(target.player.name)} moved to IL`
        : panel.kind === "drop" ? `Dropped ${lastName(target.player.name)}, added ${lastName(pick.name)}`
        : `${lastName(target.player.name)} activated`,
        "success",
      );
      close();
      setSavedOnce(true);
      setVersion((v) => v + 1);
    } catch (e) {
      if (!alive.current) return;
      setSheetOpen(false);
      setFailure(e instanceof Error ? e.message : "Save failed");
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  }

  const activeChoices = team.filter((r) => !isIl(r));

  function panelView(): React.ReactNode {
    if (!panel || !target) return null;
    const last = lastName(target.player.name);
    if (panel.kind === "menu") {
      return (
        <div data-testid="team-action-panel" style={{ display: "grid", gap: 8, padding: 16, background: "var(--am-surface-alt)", borderBottom: "1px solid var(--am-border)" }}>
          <b style={{ fontSize: 17, color: "var(--am-text)" }}>{`Actions on ${last}`}</b>
          <button type="button" style={{ ...SECONDARY, textAlign: "left" }} onClick={() => open(panel.rosterId, "il")}>Move to IL ›</button>
          <button type="button" style={{ ...SECONDARY, textAlign: "left" }} onClick={() => open(panel.rosterId, "drop")}>Drop ›</button>
          <button type="button" style={SECONDARY} onClick={close}>Cancel</button>
        </div>
      );
    }
    const pickLast = pick ? lastName(pick.name) : "";
    const verdictMsg = verdict && okNow === false && !verdict.res.ok ? verdict.res.error || "This move was rejected." : null;
    const shownOk = okNow;
    const heading = panel.kind === "il" ? `${last}: move to IL` : panel.kind === "drop" ? `${last}: drop` : `${last}: activate from IL`;
    const label =
      panel.kind === "il" ? `Move ${last} to IL`
      : panel.kind === "drop" ? `Drop ${last}, add ${pickLast || "…"}`
      : `Activate ${last}`;
    return (
      <div data-testid="team-action-panel" style={{ display: "grid", gap: 12, padding: 16, background: "var(--am-surface-alt)", borderBottom: "1px solid var(--am-border)" }}>
        <b style={{ fontSize: 17, color: "var(--am-text)" }}>{heading}</b>
        {panel.kind === "il" && !slotsFull && <p style={{ margin: 0, ...SUB }}>{`IL slot ${slot} of ${slotCount} · fee $${fee} per period`}</p>}
        {panel.kind === "il" && slotsFull && (
          <>
            <p style={{ margin: 0, fontSize: 15, color: "var(--am-warning)" }}>{`All ${slotCount} IL slots are full. Activate or drop an IL player first.`}</p>
            <button type="button" style={SECONDARY} onClick={close}>Cancel</button>
          </>
        )}
        {panel.kind === "il" && slotsFull ? null : panel.kind === "activate" ? (
          <div style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0, ...SUB }}>Choose who to drop to make room.</p>
            {activeChoices.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-label={`Drop ${lastName(r.player.name)}`}
                aria-pressed={pick?.id === r.player.id}
                onClick={() => choose(r.player.id, r.player.name)}
                style={{ ...ROW, justifyContent: "flex-start", width: "100%", minHeight: 56, boxSizing: "border-box", border: pick?.id === r.player.id ? "1px solid var(--am-accent)" : "1px solid var(--am-border)", borderRadius: 6, background: "var(--am-surface)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
              >
                <PlayerFace mlbId={r.player.mlbId ?? null} name={r.player.name} size={40} />
                <b style={{ fontSize: 17 }}>{`${slotOf(r)} · ${lastName(r.player.name)}`}</b>
              </button>
            ))}
          </div>
        ) : (
          <PlayerSearch
            key={panel.kind + panel.rosterId}
            leagueId={leagueId}
            placeholder={panel.kind === "il" ? "Add a replacement: search NL free agents" : "Add a free agent: search NL free agents"}
            onPick={(fa: FreeAgent) => choose(fa.playerId, fa.name)}
          />
        )}
        {panel.kind === "il" && slotsFull ? null : <>
        {pick && panel.kind !== "activate" && <p style={{ margin: 0, ...SUB }}>{`Adding ${pick.name}`}</p>}
        {shownOk && (
          <p style={OK}>
            {cap !== null ? `✓ Roster stays at ${active} / ${cap}` : "✓ This move checks out"}
          </p>
        )}
        {verdictMsg && <p role="alert" style={BAD}>{verdictMsg}</p>}
        {failure && <p role="alert" style={BAD}>{failure}</p>}
        <button type="button" style={{ ...PRIMARY, opacity: okNow && !saving ? 1 : 0.5 }} disabled={!okNow || saving} onClick={() => setSheetOpen(true)}>
          {label}
        </button>
        <button type="button" style={SECONDARY} onClick={close}>Cancel</button>
        </>}
      </div>
    );
  }

  const sheetCopy = (() => {
    if (!panel || !target || !pick) return null;
    const last = lastName(target.player.name);
    if (panel.kind === "il") return { title: `Move ${last} to IL?`, body: `${pick.name} joins ${teamName} in his place. IL fee $${fee} per period.`, confirm: "Move to IL" };
    if (panel.kind === "drop") return { title: `Drop ${last}?`, body: `${pick.name} is added to ${teamName}. Owners see it in Activity.`, confirm: "Drop and add" };
    return { title: `Activate ${last}?`, body: `${pick.name} is dropped to make room.`, confirm: "Activate" };
  })();

  const status = (r: RosterItem) => (isIl(r) ? (ghostIds.has(r.player.id) ? "Back from MLB IL" : "IL") : "Active");

  const actionButton = (r: RosterItem) => {
    const last = lastName(r.player.name);
    const il = isIl(r);
    return (
      <button
        type="button"
        aria-label={il ? `Open activate for ${last}` : `Actions for ${last}`}
        aria-expanded={panel?.rosterId === r.id}
        onClick={() => (panel?.rosterId === r.id ? close() : open(r.id, il ? "activate" : "menu"))}
        style={{ ...(il && ghostIds.has(r.player.id) ? PRIMARY : SECONDARY), width: "auto", minHeight: 44, padding: "0 14px", fontSize: 15 }}
      >
        {il ? "Activate" : "Actions"}
      </button>
    );
  };

  const groups: Array<[string, RosterItem[]]> = [
    ["Hitters", team.filter((r) => !isIl(r) && !PITCHER.has(r.player.posPrimary) && !PITCHER.has(slotOf(r)))],
    ["Pitchers", team.filter((r) => !isIl(r) && (PITCHER.has(r.player.posPrimary) || PITCHER.has(slotOf(r))))],
    ["IL", team.filter(isIl)],
  ];

  const faceRow = (r: RosterItem) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
      <PlayerFace mlbId={r.player.mlbId ?? null} name={r.player.name} size={40} />
      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <b style={{ fontSize: 17 }}>{`${slotOf(r)} · ${lastName(r.player.name)}`}</b>
        {isIl(r) && <small style={{ fontSize: 13, color: ghostIds.has(r.player.id) ? "var(--am-warning)" : "var(--am-text-muted)" }}>{status(r)}</small>}
      </span>
    </div>
  );

  const ghostLines = team.filter((r) => ghostIds.has(r.player.id));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 16 }}>
      <header>
        <Link to={`${base}/rosters`} style={LINK}>‹ Rosters</Link>
        <h1 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "var(--am-text)" }}>
          {desktop && cap !== null ? `${teamName} · ${active} / ${cap}` : teamName}
        </h1>
      </header>

      {savedOnce && rostersLoad.state === "error" && (
        <p role="status" style={{ margin: 0, ...SUB }}>Saved. Couldn’t refresh the roster — reload the page.</p>
      )}

      {ghostLines.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "8px 16px", border: "1px solid var(--am-warning)", borderRadius: 6, background: "var(--am-surface)", fontSize: 15, color: "var(--am-text)" }}>
          <span>{`${lastName(r.player.name)} is back from the MLB IL but still in your IL slot.`}</span>
          <button type="button" onClick={() => open(r.id, "activate")} style={{ ...LINK, background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 15 }}>
            Activate ›
          </button>
        </div>
      ))}

      {team.length === 0 && <p style={{ margin: 0, ...SUB }}>No players on this roster.</p>}

      {desktop ? (
        <div className="tr-cols">
          <Glass padded={false}>
            <table className="tr-table">
              <thead><tr><th>Slot</th><th>Player</th><th>MLB</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {team.map((r) => (
                  <tr key={r.id} data-testid="team-roster-row" data-player={r.player.name} data-open={panel?.rosterId === r.id}>
                    <td>{slotOf(r)}</td>
                    <td><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><PlayerFace mlbId={r.player.mlbId ?? null} name={r.player.name} size={30} />{r.player.name}</span></td>
                    <td>—</td>
                    <td style={ghostIds.has(r.player.id) ? { color: "var(--am-warning)" } : undefined}>{status(r)}</td>
                    <td>{actionButton(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Glass>
          <Glass padded={false}>{panel && target ? panelView() : <p style={{ margin: 0, padding: 16, ...SUB }}>Pick a player’s action to fix his slot.</p>}</Glass>
        </div>
      ) : (
        groups.filter(([, rows]) => rows.length > 0).map(([title, rows]) => (
          <div key={title} style={{ display: "grid", gap: 8 }}>
            <SectionLabel>{title}</SectionLabel>
            <Glass padded={false}>
              {rows.map((r) => (
                <React.Fragment key={r.id}>
                  <div data-testid="team-roster-row" data-player={r.player.name} style={{ ...ROW, minHeight: 56 }}>
                    {faceRow(r)}
                    {actionButton(r)}
                  </div>
                  {panel?.rosterId === r.id && panelView()}
                </React.Fragment>
              ))}
            </Glass>
          </div>
        ))
      )}

      {sheetCopy && (
        <ConfirmSheet
          open={sheetOpen}
          title={sheetCopy.title}
          body={sheetCopy.body}
          confirmLabel={sheetCopy.confirm}
          busy={saving}
          onConfirm={confirm}
          onCancel={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

export default function TeamRosterPage() {
  const params = useParams();
  const leagueId = Number(params.leagueId);
  const teamId = Number(params.teamId);
  return (
    <CommissionerOnly leagueId={leagueId}>
      <TeamBody key={`${leagueId}.${teamId}`} leagueId={leagueId} teamId={teamId} />
    </CommissionerOnly>
  );
}
