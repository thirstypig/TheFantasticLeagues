/**
 * Navigation model for the four-tab shell. Pure functions, no React: both the
 * desktop and mobile shells render from this so they cannot drift apart.
 */

export type PrimaryTabKey = "today" | "myTeam" | "players" | "league";
export type NavLink = { to: string; label: string };
export type NavSection = { title: string; links: NavLink[] };

export function buildPrimaryTabs(args: {
  myTeamCode: string | null | undefined;
}): { key: PrimaryTabKey; label: string; to: string }[] {
  const { myTeamCode } = args;
  return [
    { key: "today", label: "Today", to: "/" },
    { key: "myTeam", label: "My Team", to: myTeamCode ? `/teams/${myTeamCode}` : "/teams" },
    { key: "players", label: "Players", to: "/players" },
    { key: "league", label: "League", to: "/league" },
  ];
}

const LEAGUE_PREFIXES = [
  "/league",
  "/more",
  "/season",
  "/activity",
  "/trades",
  "/transactions",
  "/teams",
  "/rules",
  "/payouts",
  "/archive",
  "/matchup",
  "/commissioner",
  "/auction",
  "/draft",
  "/leagues/",
  "/period",
];

function isUnder(pathname: string, prefix: string): boolean {
  if (prefix.endsWith("/")) return pathname.startsWith(prefix);
  return pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}-`);
}

/** Which primary tab is active for a path, or null when the page belongs to no tab. */
export function activeTabFor(
  pathname: string,
  myTeamCode: string | null | undefined,
): PrimaryTabKey | null {
  if (pathname === "/") return "today";
  if (pathname === "/my-team") return "myTeam";
  // No team: the My Team tab itself points at /teams, so it owns that path.
  if (!myTeamCode && pathname === "/teams") return "myTeam";
  if (myTeamCode) {
    const own = `/teams/${myTeamCode}`;
    if (pathname === own || pathname.startsWith(`${own}/`)) return "myTeam";
  }
  if (pathname === "/players" || pathname.startsWith("/players/")) return "players";
  if (LEAGUE_PREFIXES.some((p) => isUnder(pathname, p))) return "league";
  return null;
}

export function buildLeagueSections(args: {
  leagueId: number | null;
  draftMode: "AUCTION" | "DRAFT" | null | undefined;
  seasonStatus: string | null | undefined;
  canAuction: boolean;
  canViewAuctionResults: boolean;
  canKeepers: boolean;
  isH2H: boolean;
  canAccessCommissioner: boolean;
}): NavSection[] {
  const {
    leagueId, draftMode, seasonStatus, canAuction, canViewAuctionResults,
    canKeepers, isH2H, canAccessCommissioner,
  } = args;

  const leagueLinks: NavLink[] = [
    { to: "/season", label: "Standings" },
    { to: "/teams", label: "Teams" },
    { to: "/activity", label: "Activity" },
  ];
  if (isH2H) leagueLinks.push({ to: "/matchup", label: "Matchup" });

  const draftLinks: NavLink[] = [];
  if (draftMode === "AUCTION" && canAuction) {
    draftLinks.push({ to: "/auction", label: "Auction" });
  }
  if (draftMode === "AUCTION" && canViewAuctionResults) {
    draftLinks.push({ to: "/auction-results", label: "Auction results" });
    draftLinks.push({ to: "/auction-values", label: "Auction values" });
  }
  if (draftMode === "DRAFT") {
    if (seasonStatus === "DRAFT") {
      draftLinks.push({ to: "/draft", label: "Snake draft" });
    } else if (seasonStatus === "IN_SEASON" || seasonStatus === "COMPLETED") {
      draftLinks.push({ to: "/draft-results", label: "Draft results" });
    }
  }
  if (canKeepers && leagueId) {
    draftLinks.push({ to: `/leagues/${leagueId}/keepers`, label: "Keepers" });
  }

  const sections: NavSection[] = [{ title: "League", links: leagueLinks }];
  if (draftLinks.length > 0) sections.push({ title: "Draft", links: draftLinks });
  sections.push({
    title: "Rules & money",
    links: [
      { to: "/rules", label: "Rules" },
      { to: "/payouts", label: "Payouts" },
      { to: "/archive", label: "Archive" },
    ],
  });
  if (canAccessCommissioner && leagueId) {
    sections.push({
      title: "Commissioner",
      links: [{ to: `/commissioner/${leagueId}`, label: "Commissioner" }],
    });
  }
  return sections;
}

/** Pages still routed but hidden from owners; linked only from the admin entry. */
export const ADMIN_LINKS: NavLink[] = [
  { to: "/ai", label: "AI" },
  { to: "/analytics", label: "Analytics" },
  { to: "/weekly-report", label: "Weekly Report" },
  { to: "/board", label: "Board" },
  { to: "/draft-report", label: "Draft Report" },
  { to: "/community", label: "Community" },
  { to: "/nba", label: "NBA" },
  { to: "/nfl", label: "NFL" },
  { to: "/concepts", label: "Concepts" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/todo", label: "Todo" },
  { to: "/docs", label: "Docs" },
  { to: "/tech", label: "Under the Hood" },
  { to: "/status", label: "Status" },
  { to: "/changelog", label: "Changelog" },
  { to: "/admin/users", label: "Admin Users" },
  { to: "/admin/reports", label: "Admin Reports" },
];

export function ACCOUNT_LINKS(isAdmin: boolean): NavLink[] {
  const links: NavLink[] = [
    { to: "/profile", label: "Profile" },
    { to: "/guide", label: "Help & Guide" },
    { to: "/about", label: "About" },
  ];
  if (isAdmin) {
    links.push({ to: "/admin", label: "Admin" });
    links.push({ to: "/admin/style-bible", label: "Style Bible" });
  }
  return links;
}
