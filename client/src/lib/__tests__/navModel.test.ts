import { describe, it, expect } from "vitest";
import {
  ACCOUNT_LINKS,
  ADMIN_LINKS,
  activeTabFor,
  buildLeagueSections,
  buildPrimaryTabs,
} from "../navModel";

type SectionArgs = Parameters<typeof buildLeagueSections>[0];

const base: SectionArgs = {
  leagueId: 5,
  draftMode: "AUCTION",
  seasonStatus: "IN_SEASON",
  canAuction: false,
  canViewAuctionResults: true,
  canKeepers: false,
  isH2H: false,
  canAccessCommissioner: false,
};

const section = (args: Partial<SectionArgs>, title: string) =>
  buildLeagueSections({ ...base, ...args }).find((s) => s.title === title);
const draftTos = (args: Partial<SectionArgs>) => (section(args, "Draft")?.links ?? []).map((l) => l.to);

describe("buildPrimaryTabs", () => {
  it("returns exactly 4 tabs in spec order", () => {
    const tabs = buildPrimaryTabs({ myTeamCode: "LDY" });
    expect(tabs.map((t) => t.key)).toEqual(["today", "myTeam", "players", "league"]);
    expect(tabs.map((t) => t.label)).toEqual(["Today", "My Team", "Players", "League"]);
    expect(tabs.map((t) => t.to)).toEqual(["/", "/teams/LDY", "/players", "/league"]);
  });
  it("sends My Team to /teams when the user has no team", () => {
    expect(buildPrimaryTabs({ myTeamCode: null })[1].to).toBe("/teams");
    expect(buildPrimaryTabs({ myTeamCode: undefined })[1].to).toBe("/teams");
  });
});

describe("activeTabFor", () => {
  it("lights Today on / only", () => {
    expect(activeTabFor("/", "LDY")).toBe("today");
    expect(activeTabFor("/", null)).toBe("today");
  });
  it("treats the user's own team and its sub-pages as My Team", () => {
    expect(activeTabFor("/teams/LDY", "LDY")).toBe("myTeam");
    expect(activeTabFor("/teams/LDY/wire-list", "LDY")).toBe("myTeam");
  });
  it("treats someone else's team as League", () => {
    expect(activeTabFor("/teams/SKD", "LDY")).toBe("league");
    expect(activeTabFor("/teams/SKD/wire-list", "LDY")).toBe("league");
  });
  it("does not confuse a team code that merely starts with mine", () => {
    expect(activeTabFor("/teams/LDYX", "LDY")).toBe("league");
  });
  it("treats /teams as My Team when the user has no team (the My Team tab's own target)", () => {
    expect(activeTabFor("/teams", null)).toBe("myTeam");
    expect(activeTabFor("/teams", "LDY")).toBe("league");
    expect(activeTabFor("/teams/SKD", null)).toBe("league");
  });
  it("treats /players and /players/:mlbId as Players", () => {
    expect(activeTabFor("/players", "LDY")).toBe("players");
    expect(activeTabFor("/players/660271", "LDY")).toBe("players");
  });
  it("treats commissioner pages as League", () => {
    expect(activeTabFor("/commissioner/5/money", null)).toBe("league");
    expect(activeTabFor("/commissioner/5", "LDY")).toBe("league");
  });
  it.each([
    "/league", "/more", "/season", "/activity", "/trades", "/transactions", "/rules", "/payouts",
    "/archive", "/matchup", "/auction", "/draft", "/leagues/5/keepers", "/period/3",
  ])("treats %s as League", (p) => {
    expect(activeTabFor(p, "LDY")).toBe("league");
  });
  it("returns null for pages that belong to no tab", () => {
    for (const p of ["/profile", "/admin", "/admin/users", "/ai", "/nba", "/tech", "/guide", "/about"]) {
      expect(activeTabFor(p, "LDY")).toBeNull();
    }
  });
});

describe("buildLeagueSections", () => {
  it("orders sections League, Draft, Rules & money, Commissioner", () => {
    const titles = buildLeagueSections({ ...base, canAuction: true, canAccessCommissioner: true }).map((s) => s.title);
    expect(titles).toEqual(["League", "Draft", "Rules & money", "Commissioner"]);
  });
  it("lists Standings, Teams, Activity, Trades in League, plus Matchup only for H2H", () => {
    expect(section({}, "League")!.links.map((l) => l.to)).toEqual(["/season", "/teams", "/activity", "/trades"]);
    expect(section({ isH2H: true }, "League")!.links.map((l) => l.to)).toEqual(["/season", "/teams", "/activity", "/trades", "/matchup"]);
    const links = section({}, "League")!.links;
    expect(links[links.findIndex((l) => l.label === "Activity") + 1].label).toBe("Trades");
  });
  it("lists Rules, Payouts, Archive under Rules & money", () => {
    expect(section({}, "Rules & money")!.links.map((l) => l.to)).toEqual(["/rules", "/payouts", "/archive"]);
  });
  it("shows the Commissioner section for commissioners and admins (canAccessCommissioner true)", () => {
    const s = section({ canAccessCommissioner: true }, "Commissioner");
    expect(s?.links.map((l) => l.to)).toEqual(["/commissioner/5"]);
  });
  it("hides the Commissioner section for plain owners", () => {
    expect(section({ canAccessCommissioner: false }, "Commissioner")).toBeUndefined();
  });
  it("hides the Commissioner section when there is no league", () => {
    expect(section({ canAccessCommissioner: true, leagueId: null }, "Commissioner")).toBeUndefined();
  });
  it("IN_SEASON auction league: results and values, not Auction", () => {
    const tos = draftTos({});
    expect(tos).toContain("/auction-results");
    expect(tos).toContain("/auction-values");
    expect(tos).not.toContain("/auction");
  });
  it("DRAFT-phase auction league: Auction only, not results", () => {
    const tos = draftTos({ seasonStatus: "DRAFT", canAuction: true, canViewAuctionResults: false });
    expect(tos).toContain("/auction");
    expect(tos).not.toContain("/auction-results");
  });
  it("shows no auction items for a DRAFT-mode league", () => {
    const tos = draftTos({ draftMode: "DRAFT", canAuction: true, canViewAuctionResults: true, seasonStatus: "DRAFT" });
    expect(tos.filter((t) => t.startsWith("/auction"))).toEqual([]);
  });
  it("SETUP with canKeepers: Keepers present", () => {
    const tos = draftTos({ seasonStatus: "SETUP", canKeepers: true, canViewAuctionResults: false });
    expect(tos).toEqual(["/leagues/5/keepers"]);
  });
  it("omits Keepers when canKeepers is false (after the draft)", () => {
    expect(draftTos({ canKeepers: false })).not.toContain("/leagues/5/keepers");
  });
  it("DRAFT-mode league during DRAFT: Snake draft present, no report yet", () => {
    const tos = draftTos({ draftMode: "DRAFT", seasonStatus: "DRAFT", canViewAuctionResults: false });
    expect(tos).toContain("/draft");
    expect(tos).not.toContain("/draft-report");
    expect(tos).not.toContain("/draft-results");
  });
  it("DRAFT-mode league after the draft: Draft results (not the AI report), no Snake draft", () => {
    for (const seasonStatus of ["IN_SEASON", "COMPLETED"]) {
      const links = section({ draftMode: "DRAFT", seasonStatus, canViewAuctionResults: false }, "Draft")!.links;
      expect(links).toEqual([{ to: "/draft-results", label: "Draft results" }]);
    }
  });
  it("DRAFT-mode league in SETUP: no snake draft items", () => {
    expect(draftTos({ draftMode: "DRAFT", seasonStatus: "SETUP", canViewAuctionResults: false })).toEqual([]);
  });
  it("omits the Draft section entirely when no draft items apply", () => {
    expect(section({ canViewAuctionResults: false, draftMode: null, seasonStatus: null }, "Draft")).toBeUndefined();
  });
  it("omits Keepers when there is no league id", () => {
    expect(draftTos({ leagueId: null, seasonStatus: "SETUP", canKeepers: true, canViewAuctionResults: false })).toEqual([]);
  });
  it("never links hidden pages", () => {
    const all = buildLeagueSections({
      ...base, canAuction: true, canKeepers: true, isH2H: true, canAccessCommissioner: true,
    }).flatMap((s) => s.links.map((l) => l.to));
    const draftModeAll = buildLeagueSections({
      ...base, draftMode: "DRAFT", seasonStatus: "IN_SEASON", canKeepers: true, isH2H: true, canAccessCommissioner: true,
    }).flatMap((s) => s.links.map((l) => l.to));
    for (const hidden of ["/ai", "/board", "/nba", "/nfl", "/weekly-report", "/draft-report"]) {
      expect(draftModeAll).not.toContain(hidden);
      expect(all).not.toContain(hidden);
    }
  });
});

describe("ADMIN_LINKS", () => {
  it("holds the hidden pages including /ai, /nba, /admin/users and /admin/reports", () => {
    const tos = ADMIN_LINKS.map((l) => l.to);
    for (const t of ["/ai", "/nba", "/nfl", "/board", "/community", "/weekly-report", "/analytics", "/concepts",
      "/draft-report", "/roadmap", "/todo", "/docs", "/tech", "/status", "/changelog", "/admin/users", "/admin/reports"]) {
      expect(tos).toContain(t);
    }
    expect(ADMIN_LINKS.find((l) => l.to === "/tech")?.label).toBe("Under the Hood");
  });
  it("has no duplicate targets", () => {
    const tos = ADMIN_LINKS.map((l) => l.to);
    expect(new Set(tos).size).toBe(tos.length);
  });
});

describe("ACCOUNT_LINKS", () => {
  it("omits Admin for non-admins", () => {
    expect(ACCOUNT_LINKS(false).map((l) => l.to)).toEqual(["/profile", "/guide", "/about"]);
  });
  it("adds Admin for admins", () => {
    const links = ACCOUNT_LINKS(true);
    expect(links.map((l) => l.to)).toEqual(["/profile", "/guide", "/about", "/admin", "/admin/style-bible"]);
    expect(links).toContainEqual({ to: "/admin/style-bible", label: "Style Bible" });
    expect(ACCOUNT_LINKS(false).some((l) => l.to === "/admin/style-bible")).toBe(false);
    expect(links[1].label).toBe("Help & Guide");
  });
});
