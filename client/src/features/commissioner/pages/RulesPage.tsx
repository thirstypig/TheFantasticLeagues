// Commissioner Rules screen (Style Bible screen 2). Rules that can change
// mid-season (transactions) are switches/choices; everything else is read-only
// and marked "Locked for the season". Full pre-season editing lives on /rules.
import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../../api/base";
import { useLeague } from "../../../contexts/LeagueContext";
import { getCommissionerRules, getLockedFields, saveCommissionerRules, type CommissionerRuleRow } from "../api";
import { RuleSegmented, RuleSwitch } from "../components/rules/RuleControls";
import { CardError, LINK, Skeleton } from "../components/cardParts";
import "../rules.css";
import { CommissionerOnly } from "../components/CommissionerOnly";

type RowStatus = { kind: "saved" } | { kind: "error"; message: string };

interface RowSpec {
  id: string;
  label: string;
  subs?: string[];
  /** Ids of the LeagueRule rows this row reads; drives "locked". */
  sources: CommissionerRuleRow[];
  value?: string;
  control?: "switch" | "segmented";
  ruleId?: number;
}

const TRADE_OPTIONS = [
  { value: "meeting_day", label: "Meeting day only" },
  { value: "anytime", label: "Anytime" },
];
const PAYOUT_KEYS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"].map((n) => `payout_${n}`);

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.serverMessage || err.detail || err.message;
  return err instanceof Error ? err.message : "Could not save";
}

function RulesPageBody() {
  const params = useParams();
  const leagueId = Number(params.leagueId);
  const base = `/commissioner/${leagueId}`;
  const { leagueId: contextLeagueId, seasonStatus: contextStatus } = useLeague();
  // Season status for the URL's league. When it isn't the selected league, fetch it;
  // until that lands (or if it fails) the league counts as locked.
  const [fetchedStatus, setFetchedStatus] = useState<string | null>(null);
  const sameLeague = contextLeagueId === leagueId;
  useEffect(() => {
    if (sameLeague) return;
    let live = true;
    setFetchedStatus(null);
    getLockedFields(leagueId).then(
      (r) => live && setFetchedStatus(r.seasonStatus),
      () => live && setFetchedStatus(null),
    );
    return () => { live = false; };
  }, [leagueId, sameLeague]);
  const seasonStatus = sameLeague ? contextStatus : fetchedStatus;

  const [rules, setRules] = useState<CommissionerRuleRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [status, setStatus] = useState<Record<number, RowStatus>>({});
  const inFlight = useRef(false);

  useEffect(() => {
    let live = true;
    setRules(null);
    setFailed(false);
    getCommissionerRules(leagueId).then(
      (r) => live && setRules(r),
      () => live && setFailed(true),
    );
    return () => { live = false; };
  }, [leagueId]);

  async function save(rule: CommissionerRuleRow, next: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(rule.id);
    setStatus((s) => { const { [rule.id]: _drop, ...rest } = s; return rest; });
    try {
      await saveCommissionerRules(leagueId, [{ id: rule.id, value: next }]);
      setRules((rs) => rs && rs.map((r) => (r.id === rule.id ? { ...r, value: next } : r)));
      setStatus((s) => ({ ...s, [rule.id]: { kind: "saved" } }));
    } catch (err) {
      // The control only ever shows the stored value, so not updating it is the revert.
      setStatus((s) => ({ ...s, [rule.id]: { kind: "error", message: errorMessage(err) } }));
    } finally {
      inFlight.current = false;
      setSaving(null);
    }
  }

  const back = <Link to={base} style={LINK}>‹ Commissioner</Link>;
  if (failed) return <div style={{ padding: 16 }}>{back}<CardError>Couldn’t load the rules.</CardError></div>;
  if (!rules) return <div style={{ padding: 16 }}>{back}<Skeleton /></div>;

  // Keyed by category + key so a stray row in another category can't shadow the real rule.
  const byKey = new Map(rules.map((r) => [`${r.category}.${r.key}`, r]));
  const CATEGORY_OF: Record<string, string> = {
    stats_source: "overview", batter_count: "roster", pitcher_count: "roster",
    il_slot_1_cost: "il", il_slot_2_cost: "il", min_innings: "scoring",
    trade_window: "transactions", owner_self_serve: "transactions",
    auction_budget: "draft", bid_timer: "draft", nomination_timer: "draft",
  };
  const get = (k: string) => byKey.get(`${CATEGORY_OF[k] ?? "payouts"}.${k}`);
  const seasonLocked = seasonStatus !== "SETUP";
  const isLocked = (sources: CommissionerRuleRow[]) => seasonLocked || sources.some((r) => r.isLocked);

  const simple = (key: string, label: string, fmt: (v: string) => string, subs?: string[]): RowSpec[] => {
    const r = get(key);
    return r ? [{ id: key, label, subs, sources: [r], value: fmt(r.value) }] : [];
  };

  const batters = get("batter_count");
  const pitchers = get("pitcher_count");
  const rosterSize: RowSpec[] = batters && pitchers
    ? [{
        id: "roster_size", label: "Roster size", sources: [batters, pitchers],
        value: String(Number(batters.value) + Number(pitchers.value)),
        subs: [`${batters.value} hitters · ${pitchers.value} pitchers`],
      }]
    : [];
  const payoutRows = PAYOUT_KEYS.map(get).filter((r): r is CommissionerRuleRow => !!r);
  const trade = get("trade_window");
  const self = get("owner_self_serve");
  const control = (r: CommissionerRuleRow | undefined, label: string, kind: "switch" | "segmented"): RowSpec[] =>
    r ? [{ id: r.key, label, sources: [r], control: kind, ruleId: r.id }] : [];

  const groups: Record<string, RowSpec[]> = {
    Rosters: [...simple("stats_source", "NL players only", (v) => (v === "NL" ? "On" : "Off")), ...rosterSize],
    "IL fees": [
      ...simple("il_slot_1_cost", "IL fee, 1st player on IL", (v) => `$${v}`),
      ...simple("il_slot_2_cost", "IL fee, 2nd player on IL", (v) => `$${v}`),
    ],
    Scoring: simple("min_innings", "Minimum innings per period", (v) => `${v} IP`, [
      "The app flags teams under it at close; you decide",
    ]),
    "Trades and moves": [
      ...control(trade, "When trades are allowed", "segmented"),
      ...control(self, "Owners make their own moves", "switch"),
    ],
    Auction: [
      ...simple("auction_budget", "Budget per team", (v) => `$${v}`),
      ...simple("bid_timer", "Bid clock", (v) => `${v} sec`),
      ...simple("nomination_timer", "Nomination clock", (v) => `${v} sec`),
    ],
    Payouts: payoutRows.length
      ? [{ id: "payouts", label: "Payout split, 1st to 8th", sources: payoutRows, value: `${payoutRows.map((r) => r.value).join(" / ")} %` }]
      : [],
  };

  const renderRow = (spec: RowSpec) => {
    const rule = spec.sources[0];
    const st = spec.ruleId !== undefined ? status[spec.ruleId] : undefined;
    const busy = saving !== null;
    const locked = !spec.control && isLocked(spec.sources);
    const subs = [...(spec.subs ?? []), ...(locked ? ["Locked for the season"] : [])];
    const stacked = spec.control === "segmented";
    return (
      <div
        key={spec.id}
        data-testid="rule-row"
        style={{
          display: "flex", flexDirection: stacked ? "column" : "row", alignItems: stacked ? "stretch" : "center",
          justifyContent: "space-between", gap: 8, minHeight: 56, padding: "10px 16px",
          borderBottom: "1px solid var(--am-border)",
        }}
      >
        <div
          className={spec.id === "payouts" ? "rule-line rule-line--stack" : "rule-line"}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flex: 1 }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: "var(--am-text)" }}>{spec.label}</div>
            {subs.map((s) => (
              <div key={s} style={{ fontSize: 13, color: "var(--am-text-muted)" }}>{s}</div>
            ))}
          </div>
          {spec.control === "switch" && spec.ruleId !== undefined && (
            <RuleSwitch
              label={spec.label}
              checked={rule.value === "true"}
              disabled={busy}
              onChange={(next) => save(rule, next ? "true" : "false")}
            />
          )}
          {spec.value !== undefined && (
            <span style={{ flex: "none", fontSize: 15, fontWeight: 600, color: "var(--am-text)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {spec.value}
            </span>
          )}
        </div>
        {spec.control === "segmented" && (
          <RuleSegmented
            label={spec.label}
            options={TRADE_OPTIONS}
            value={rule.value}
            disabled={busy}
            onChange={(next) => save(rule, next)}
          />
        )}
        {st?.kind === "error" && (
          <div role="alert" style={{ fontSize: 13, color: "var(--am-negative)" }}>{st.message}</div>
        )}
        {st?.kind === "saved" && (
          <div role="status" style={{ fontSize: 13, color: "var(--am-positive)" }}>Saved</div>
        )}
      </div>
    );
  };

  const renderGroup = (name: string) => {
    const rows = groups[name];
    if (!rows.length) return null;
    return (
      <section key={name}>
        <h2 style={{ margin: "16px 0 8px", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--am-text-muted)" }}>
          {name}
        </h2>
        <div style={{ background: "var(--am-surface)", border: "1px solid var(--am-border)", borderRadius: 6, overflow: "hidden" }}>
          {rows.map(renderRow)}
        </div>
      </section>
    );
  };

  return (
    <div style={{ padding: "0 16px 32px", maxWidth: 1100, margin: "0 auto" }}>
      {back}
      <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: "var(--am-text)" }}>Rules</h1>
      <div className="rules-cols">
        <div>{["Rosters", "IL fees", "Scoring"].map(renderGroup)}</div>
        <div>{["Trades and moves", "Auction", "Payouts"].map(renderGroup)}</div>
      </div>
    </div>
  );
}

export default function RulesPage() {
  const leagueId = Number(useParams().leagueId);
  return <CommissionerOnly leagueId={leagueId}><RulesPageBody /></CommissionerOnly>;
}
