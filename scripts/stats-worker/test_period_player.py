# test_period_player.py
"""
Quick test: fetch one player's stats in a date range using MLB-StatsAPI.

We’ll:
- use Mookie Betts (MLBAM ID 605141) as an example
- get stats from 2025-04-01 to 2025-04-30
- request NL-only (leagueId 103), though for a single player it won't change much
"""

import statsapi

SEASON = 2025
PLAYER_ID = 605141   # Mookie Betts example
START_DATE = "2025-04-01"
END_DATE = "2025-04-30"

# 103 = NL, 104 = AL
NL_LEAGUE_ID = 103


def fetch_hitting_for_player(player_id: int, start_date: str, end_date: str):
    params = {
        "group": "hitting",
        "stats": "byDateRange",
        "gameType": "R",
        "season": SEASON,
        "startDate": start_date,
        "endDate": end_date,
        "playerPool": "ALL",
        "playerId": player_id,
        "leagueIds": NL_LEAGUE_ID,  # NL only
    }

    data = statsapi.get("stats", params)
    stats_blocks = data.get("stats", [])
    if not stats_blocks:
        return None

    splits = stats_blocks[0].get("splits", [])
    if not splits:
        return None

    return splits[0].get("stat", {})


def fetch_pitching_for_player(player_id: int, start_date: str, end_date: str):
    params = {
        "group": "pitching",
        "stats": "byDateRange",
        "gameType": "R",
        "season": SEASON,
        "startDate": start_date,
        "endDate": end_date,
        "playerPool": "ALL",
        "playerId": player_id,
        "leagueIds": NL_LEAGUE_ID,  # NL only
    }

    data = statsapi.get("stats", params)
    stats_blocks = data.get("stats", [])
    if not stats_blocks:
        return None

    splits = stats_blocks[0].get("splits", [])
    if not splits:
        return None

    return splits[0].get("stat", {})


def main():
    print(f"Hitting stats for player {PLAYER_ID} between {START_DATE} and {END_DATE}")
    hitting = fetch_hitting_for_player(PLAYER_ID, START_DATE, END_DATE)
    print(hitting)

    print("\nPitching stats for same player/date range (likely empty for a hitter):")
    pitching = fetch_pitching_for_player(PLAYER_ID, START_DATE, END_DATE)
    print(pitching)


if __name__ == "__main__":
    main()
