// Commissioner Owners and invites screen (Style Bible screen 21). Who owns which
// team, the league invite link, pending invites, and adding someone by email.
// The owner picker lists league members only; it never asks for all users.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../../api/base";
import { ConfirmSheet } from "../../../components/shared/ConfirmSheet";
import {
  assignTeamOwner, cancelInvite, getCommissionerOverview, getInvites, getLeagueInviteCode,
  inviteMember, regenerateLeagueInviteCode, removeTeamOwner,
  type CommissionerOverviewResponse, type CommissionerUser, type PendingInvite,
} from "../api";
import { CardError, LINK, MUTED, PRIMARY, SECONDARY, Skeleton } from "../components/cardParts";
import { CommissionerOnly } from "../components/CommissionerOnly";
import "../commissioner.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_OWNERS = 2;

/** "2026-03-02T12:00:00.000Z" -> "Mar 2" (the stored calendar day, no timezone drift). */
function shortDate(iso: string): string {
  const [, mm, dd] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[mm - 1]} ${dd}`;
}

const who = (u: CommissionerUser) => u.name || u.email;

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.serverMessage || err.detail || err.message;
  return err instanceof Error ? err.message : fallback;
}

const CARD: React.CSSProperties = {
  background: "var(--am-surface)", border: "1px solid var(--am-border)", borderRadius: 6, overflow: "hidden",
};
const H2: React.CSSProperties = {
  margin: "16px 0 8px", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em",
  textTransform: "uppercase", color: "var(--am-text-muted)",
};
const FIELD: React.CSSProperties = {
  minHeight: 44, width: "100%", boxSizing: "border-box", padding: "0 12px", borderRadius: 6,
  background: "var(--am-field)", border: "1px solid var(--am-field-line)", color: "var(--am-text)", fontSize: 17,
};
const LABEL: React.CSSProperties = { display: "block", fontSize: 13, color: "var(--am-text-muted)", marginBottom: 4 };
const SMALL_BTN: React.CSSProperties = { ...SECONDARY, width: "auto", minHeight: 44, padding: "0 16px" };

type Data = { overview: CommissionerOverviewResponse; invites: PendingInvite[]; code: string | null };
type Pending =
  | { kind: "regen" }
  | { kind: "owner"; teamId: number; user: CommissionerUser }
  | { kind: "invite"; invite: PendingInvite };

function OwnersPageBody() {
  const leagueId = Number(useParams().leagueId);
  const base = `/commissioner/${leagueId}`;
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [pick, setPick] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"OWNER" | "COMMISSIONER">("OWNER");
  const urlRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    const [overview, invites, code] = await Promise.all([
      getCommissionerOverview(leagueId), getInvites(leagueId), getLeagueInviteCode(leagueId),
    ]);
    setData({ overview, invites: invites.filter((i) => i.status === "PENDING"), code });
  }, [leagueId]);

  useEffect(() => {
    let live = true;
    setData(null);
    setFailed(false);
    load().catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [load]);

  async function run(action: () => Promise<unknown>, okText: string | null, fallback: string, reload = true) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (okText) setMessage({ kind: "ok", text: okText });
      if (reload) await load();
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err, fallback) });
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  function confirm() {
    if (!pending) return;
    if (pending.kind === "regen") {
      void run(async () => {
        const code = await regenerateLeagueInviteCode(leagueId);
        setData((d) => (d ? { ...d, code } : d));
      }, "New invite link ready.", "Couldn’t make a new link.", false);
    } else if (pending.kind === "owner") {
      void run(() => removeTeamOwner(leagueId, pending.teamId, pending.user.id), null, "Couldn’t remove the owner.");
    } else {
      void run(() => cancelInvite(leagueId, pending.invite.id), null, "Couldn’t cancel the invite.");
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMessage({ kind: "ok", text: "Link copied." });
    } catch {
      const el = urlRef.current;
      const sel = window.getSelection();
      if (el && sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      setMessage({ kind: "error", text: "Couldn’t copy. The link is selected, so copy it by hand." });
    }
  }

  const back = <Link to={base} style={LINK}>‹ Commissioner</Link>;
  if (failed) return <div style={{ padding: 16 }}>{back}<CardError>Couldn’t load owners and invites.</CardError></div>;
  if (!data) return <div style={{ padding: 16 }}>{back}<Skeleton /></div>;

  const teams = data.overview.teams ?? [];
  const members = data.overview.memberships ?? [];
  const joinUrl = data.code ? `${window.location.origin}/join/${data.code}` : null;

  const sheet = (() => {
    if (!pending) return { title: "", body: "", confirmLabel: "" };
    if (pending.kind === "regen") {
      return { title: "Make a new invite link?", body: "The old link stops working.", confirmLabel: "Make new link" };
    }
    if (pending.kind === "owner") {
      return { title: `Remove ${who(pending.user)}?`, body: "They stay in the league but no longer own this team.", confirmLabel: "Remove owner" };
    }
    return { title: `Cancel the invite for ${pending.invite.email}?`, body: "The invite stops working.", confirmLabel: "Cancel invite" };
  })();

  // Anyone who owns any team here (ownership rows or the legacy ownerUserId) is
  // not offered again: the server doesn't stop one user owning two teams.
  const ownsSomeTeam = new Set<number>();
  for (const t of teams) {
    for (const o of t.ownerships ?? []) ownsSomeTeam.add(o.userId);
    if (t.ownerUserId != null) ownsSomeTeam.add(t.ownerUserId);
  }

  const teamRow = (team: NonNullable<typeof teams>[number]) => {
    const rowOwners = (team.ownerships ?? []).map((o) => o.user);
    // Legacy-only owner: no ownership rows, but Team.ownerUserId still grants access.
    let legacyOwner: CommissionerUser | null = null;
    if (rowOwners.length === 0 && (team.ownerUser || team.ownerUserId != null)) {
      const member = members.find((mem) => mem.userId === team.ownerUserId)?.user;
      legacyOwner = team.ownerUser ?? member
        ?? { id: team.ownerUserId as number, email: "", name: team.owner || "Owner" };
    }
    const owners = legacyOwner ? [legacyOwner] : rowOwners;
    const isOpen = open === team.id;
    const choices = members.filter((mem) => !ownsSomeTeam.has(mem.userId));
    return (
      <div key={team.id} data-testid="team-row" style={{ borderBottom: "1px solid var(--am-border)", padding: "10px 16px", minHeight: 56 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: "var(--am-text)" }}>{team.name}</div>
            {owners.map((o) => (
              <div key={o.id} style={{ fontSize: 13, color: "var(--am-text-muted)" }}>{o.name ? o.name : o.email}</div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
            {owners.length > 0
              ? <span style={{ fontSize: 13, color: "var(--am-positive)" }}>Joined</span>
              : <span role="alert" style={{ fontSize: 13, color: "var(--am-negative)" }}>No owner</span>}
            <button
              type="button"
              style={SMALL_BTN}
              aria-expanded={isOpen}
              aria-label={`Manage ${team.name}`}
              onClick={() => { setOpen(isOpen ? null : team.id); setPick(""); }}
            >
              Manage
            </button>
          </div>
        </div>
        {isOpen && (
          <div style={{ paddingTop: 8 }}>
            {owners.map((o) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 }}>
                <span style={{ fontSize: 15, color: "var(--am-text)" }}>{who(o)}</span>
                {legacyOwner ? (
                  <span style={{ fontSize: 13, color: "var(--am-text-muted)", textAlign: "right" }}>
                    Owner set on the team record — change it from the old Owners page.
                  </span>
                ) : (
                  <button
                    type="button"
                    style={{ ...SMALL_BTN, color: "var(--am-negative)" }}
                    aria-label={`Remove ${who(o)}`}
                    onClick={() => setPending({ kind: "owner", teamId: team.id, user: o })}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {owners.length < MAX_OWNERS && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, paddingTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor={`add-owner-${team.id}`} style={LABEL}>Add owner</label>
                  <select id={`add-owner-${team.id}`} style={FIELD} value={pick} onChange={(e) => setPick(e.target.value)}>
                    <option value="">Choose a member</option>
                    {choices.map((mem) => <option key={mem.userId} value={mem.userId}>{who(mem.user)}</option>)}
                  </select>
                </div>
                <button
                  type="button"
                  style={{ ...PRIMARY, width: "auto", opacity: !pick || busy ? 0.5 : 1 }}
                  disabled={!pick || busy}
                  onClick={() => { const uid = Number(pick); setPick(""); void run(() => assignTeamOwner(leagueId, team.id, uid), null, "Couldn’t add the owner."); }}
                >
                  Add owner
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const addSomeone = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await inviteMember(leagueId, addr, role);
      setMessage({ kind: "ok", text: res.status === "added" ? `${addr} was added to the league.` : `Invite sent to ${addr}.` });
      setEmail("");
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err, "Couldn’t add that person.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "0 16px 32px", maxWidth: 1100, margin: "0 auto" }}>
      {back}
      <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: "var(--am-text)" }}>Owners and invites</h1>
      {message && (
        <div role={message.kind === "error" ? "alert" : "status"} style={{ fontSize: 13, margin: "8px 0", color: message.kind === "error" ? "var(--am-negative)" : "var(--am-positive)" }}>
          {message.text}
        </div>
      )}
      <div className="owners-cols">
        <section>
          <h2 style={H2}>Teams</h2>
          <div style={CARD}>{teams.map(teamRow)}</div>
        </section>
        <div>
          <section>
            <h2 style={H2}>Invite link</h2>
            <div style={{ ...CARD, padding: 16 }}>
              {joinUrl ? (
                <>
                  <code ref={urlRef} style={{ display: "block", fontSize: 15, wordBreak: "break-all", userSelect: "all", color: "var(--am-text)" }}>{joinUrl}</code>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button type="button" style={SMALL_BTN} onClick={() => void copy(joinUrl)}>Copy</button>
                    <button type="button" style={SMALL_BTN} onClick={() => setPending({ kind: "regen" })}>New link</button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ ...MUTED, margin: "0 0 12px" }}>No invite link yet.</p>
                  <button type="button" style={SMALL_BTN} disabled={busy} onClick={() => void run(async () => {
                    const code = await regenerateLeagueInviteCode(leagueId);
                    setData((d) => (d ? { ...d, code } : d));
                  }, "Invite link ready.", "Couldn’t make a link.", false)}>Make a link</button>
                </>
              )}
            </div>
          </section>
          <section>
            <h2 style={H2}>Pending invites</h2>
            <div style={CARD}>
              {data.invites.length === 0 && <p style={{ ...MUTED, margin: 0, padding: 16 }}>No pending invites.</p>}
              {data.invites.map((inv) => (
                <div key={inv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 56, padding: "10px 16px", borderBottom: "1px solid var(--am-border)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17, color: "var(--am-text)", wordBreak: "break-all" }}>{inv.email}</div>
                    <div style={{ fontSize: 13, color: "var(--am-text-muted)" }}>{`Invited ${shortDate(inv.createdAt)}`}</div>
                  </div>
                  <button type="button" style={SMALL_BTN} aria-label={`Cancel invite for ${inv.email}`} onClick={() => setPending({ kind: "invite", invite: inv })}>
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 style={H2}>Add someone</h2>
            <form onSubmit={addSomeone} style={{ ...CARD, padding: 16, display: "grid", gap: 12 }}>
              <div>
                <label htmlFor="add-email" style={LABEL}>Email</label>
                <input id="add-email" type="email" style={FIELD} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label htmlFor="add-role" style={LABEL}>Role</label>
                <select id="add-role" style={FIELD} value={role} onChange={(e) => setRole(e.target.value as "OWNER" | "COMMISSIONER")}>
                  <option value="OWNER">Owner</option>
                  <option value="COMMISSIONER">Commissioner</option>
                </select>
              </div>
              <button type="submit" style={{ ...PRIMARY, opacity: !email.trim() || busy ? 0.5 : 1 }} disabled={!email.trim() || busy}>Add</button>
            </form>
          </section>
        </div>
      </div>
      <ConfirmSheet
        open={pending !== null}
        title={sheet.title}
        body={sheet.body}
        confirmLabel={sheet.confirmLabel}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

export default function OwnersPage() {
  const leagueId = Number(useParams().leagueId);
  return <CommissionerOnly leagueId={leagueId}><OwnersPageBody /></CommissionerOnly>;
}
