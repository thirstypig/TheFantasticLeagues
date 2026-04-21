# lookup_mlb_id.py
"""
Small helper to find MLB player IDs by name.

Usage (inside venv):

    python lookup_mlb_id.py "Juan Soto"
    python lookup_mlb_id.py "Will Smith"
"""

import argparse
from typing import Optional

import statsapi


def lookup_player(name: str, team_abbrev: Optional[str] = None) -> None:
    players = statsapi.lookup_player(name)
    if not players:
        print(f"No players found for '{name}'")
        return

    print(f"Results for '{name}' (team filter hint: {team_abbrev or 'none'})")
    print("-" * 60)

    any_printed = False

    for p in players:
        full_name = p.get("fullName")
        pid = p.get("id")
        primary_pos = p.get("primaryPosition", {}).get("abbreviation", "?")

        current_team = p.get("currentTeam") or {}
        team_name = current_team.get("name", "Unknown")
        team_abbr = current_team.get("abbreviation", "??")

        # If user passed a team, just show it as a hint marker, but don't filter out
        marker = ""
        if team_abbrev and team_abbr == team_abbrev.upper():
            marker = " *"  # star matches

        print(
            f"ID: {pid:>7}  {full_name:25s}  {team_abbr:3s} ({team_name})  "
            f"POS: {primary_pos}{marker}"
        )
        any_printed = True

    if team_abbrev and not any_printed:
        print("No matching players found (even before team filtering).")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("name", help="Player name (or part of it)")
    parser.add_argument(
        "--team",
        help="Optional team abbrev hint, e.g. LAD, NYY, ATL (used only for marking)",
        default=None,
    )
    args = parser.parse_args()

    lookup_player(args.name, args.team)


if __name__ == "__main__":
    main()
