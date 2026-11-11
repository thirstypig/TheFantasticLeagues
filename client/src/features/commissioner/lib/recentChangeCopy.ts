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
    case "RULES_UPDATE": {
      const key = c.metadata?.key;
      if (typeof key !== "string" || key === "") return "Changed a league rule";
      const label = words(key);
      const value = c.metadata?.value;
      const shown = value === undefined || value === null ? "" : ` → ${words(value)}`;
      return `Changed a league rule: ${label.charAt(0).toUpperCase()}${label.slice(1)}${shown}`;
    }
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
