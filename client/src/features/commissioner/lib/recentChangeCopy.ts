import type { HubPeriod, RecentChange } from "../api";

function periodLabel(c: RecentChange, periods: HubPeriod[]): string {
  const raw = c.metadata?.periodId ?? c.resourceId;
  const id = raw === null || raw === undefined ? null : Number(raw);
  const found = id !== null ? periods.find((p) => p.id === id) : undefined;
  if (found) return found.name;
  return id !== null && !Number.isNaN(id) ? `#${id}` : "a period";
}

function sentenceCase(action: string): string {
  const s = action.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function words(raw: unknown): string {
  return String(raw).replace(/_/g, " ").trim();
}

const RULE_LABELS: Record<string, { label: string; values?: Record<string, string> }> = {
  trade_window: { label: "When trades are allowed", values: { meeting_day: "Meeting day only", anytime: "Anytime" } },
  owner_self_serve: { label: "Owners make their own moves", values: { true: "On", false: "Off" } },
};

function describeOneRule(key: string, value: unknown): string {
  const known = RULE_LABELS[key];
  const label = known ? known.label : (() => { const w = words(key); return w.charAt(0).toUpperCase() + w.slice(1); })();
  if (value === undefined || value === null) return label;
  const raw = String(value);
  return `${label} → ${known?.values?.[raw] ?? words(raw)}`;
}

function describeRules(metadata: RecentChange["metadata"]): string {
  const list = Array.isArray(metadata?.changes) ? (metadata!.changes as Array<Record<string, unknown>>) : [];
  const parts = list
    .filter((x) => typeof x?.key === "string" && x.key !== "")
    .map((x) => describeOneRule(x.key as string, x.value));
  if (parts.length === 0 && typeof metadata?.key === "string" && metadata.key !== "") {
    parts.push(describeOneRule(metadata.key, metadata.value));
  }
  return parts.length === 0 ? "Changed a league rule" : `Changed a league rule: ${parts.join("; ")}`;
}

/** Human copy for a commissioner audit-log row. */
export function describeChange(c: RecentChange, periods: HubPeriod[]): string {
  switch (c.action) {
    case "PERIOD_CLOSE":
      return `Closed ${periodLabel(c, periods)} (${c.metadata?.billed === true ? "fees billed" : "bill later"})`;
    case "PERIOD_START":
      return `Started ${periodLabel(c, periods)}`;
    case "IL_FEE_RECONCILE":
      return `Billed IL fees for ${periodLabel(c, periods)}`;
    case "TRADE_PROCESS":
      return `Processed trade #${c.resourceId ?? "?"}`;
    case "RULES_UPDATE":
      return describeRules(c.metadata);
    case "MEMBER_ADD":
      return "Added a member";
    case "MEMBER_REMOVE":
      return "Removed a member";
    case "INVITE_CANCEL": {
      const email = c.metadata?.email;
      return typeof email === "string" && email ? `Canceled the invite for ${email}` : "Canceled an invite";
    }
    case "INVITE_CODE_REGENERATE":
      return "Made a new invite code";
    case "TEAM_OWNER_ADD": {
      const name = c.metadata?.ownerName;
      return typeof name === "string" && name ? `Added ${name} as a team owner` : "Added a team owner";
    }
    case "TEAM_OWNER_REMOVE":
      return "Removed a team owner";
    default:
      return sentenceCase(c.action);
  }
}
