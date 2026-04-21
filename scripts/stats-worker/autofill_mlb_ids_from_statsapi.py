# autofill_mlb_ids_from_statsapi.py
"""
Auto-fill mlb_id in roster_ogba_2025.csv using MLB-StatsAPI lookup_player.

Flow:
- Reads roster_ogba_2025.csv
- For each row with empty mlb_id:
    1) Try statsapi.lookup_player(full_name_from_sheet)
    2) If no result AND name looks like "X. Lastname" or "X Lastname":
       - parse first initial + last name
       - call statsapi.lookup_player(lastname)
       - filter results whose fullName starts with that initial
    3) If we have candidates, pick one with a simple heuristic.
- Writes updated roster_ogba_2025.csv (after making a .backup copy)
"""

import csv
import os
import shutil
from typing import List, Dict, Any, Optional

import requests
import statsapi

ROSTER_CSV = "roster_ogba_2025.csv"
BACKUP_CSV = "roster_ogba_2025.backup.csv"


def load_roster(path: str):
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = reader.fieldnames or []
    return rows, fieldnames


def save_roster(path: str, fieldnames: List[str], rows: List[Dict[str, Any]]) -> None:
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)


def statsapi_lookup_safe(query: str) -> List[Dict[str, Any]]:
    """Wrap statsapi.lookup_player so network issues don't crash the script."""
    try:
        return statsapi.lookup_player(query)
    except requests.exceptions.RequestException as e:
        print(f"  !! Network error while looking up '{query}': {e}")
        return []
    except Exception as e:
        print(f"  !! Unexpected error while looking up '{query}': {e}")
        return []


def choose_candidate(players: List[Dict[str, Any]]) -> Optional[int]:
    """
    Very simple heuristic:
    - If no players -> None
    - If 1 player -> use it
    - If multiple -> prefer ones with a currentTeam, if that makes it unique
    """
    if not players:
        return None

    if len(players) == 1:
        return players[0].get("id")

    # Prefer players with a current MLB team
    with_team = [p for p in players if p.get("currentTeam")]
    if len(with_team) == 1:
        return with_team[0].get("id")

    # Still ambiguous -> let user decide later
    return None


def smart_lookup(name: str) -> List[Dict[str, Any]]:
    """
    1) Try lookup_player(name) directly.
    2) If nothing, and name looks like 'X. Lastname' or 'X Lastname', try:
       - lookup_player(Lastname)
       - filter by first initial of fullName
    """
    name = name.strip()
    if not name:
        return []

    # First try: exact / full
    players = statsapi_lookup_safe(name)
    if players:
        return players

    # Fallback: parse initial + last name
    parts = name.replace(",,", ",").strip().split()
    if len(parts) >= 2:
        first_token = parts[0]
        # examples: "J.", "J", "N,."
        initial_char = first_token[0].upper() if first_token else ""
        last_part = " ".join(parts[1:])  # e.g. "Naylor", "Acuña Jr.", "Castellanos"

        if initial_char.isalpha():
            last_players = statsapi_lookup_safe(last_part)
            if not last_players:
                return []

            # Filter by first initial of fullName
            filtered = []
            for p in last_players:
                full = (p.get("fullName") or "").strip()
                if full and full[0].upper() == initial_char:
                    filtered.append(p)

            if filtered:
                return filtered

            # If nothing matched initial, fall back to all last-name matches
            return last_players

    return []


def autofill_mlb_ids():
    if not os.path.exists(ROSTER_CSV):
        raise FileNotFoundError(f"{ROSTER_CSV} not found in current directory.")

    # Backup
    shutil.copyfile(ROSTER_CSV, BACKUP_CSV)
    print(f"Backup written to {BACKUP_CSV}")

    rows, fieldnames = load_roster(ROSTER_CSV)

    updated = 0
    ambiguous = 0
    missing = 0

    for r in rows:
        if r.get("mlb_id"):
            continue  # already filled (or manually set)

        raw_name = (r.get("player_name") or "").strip()
        if not raw_name:
            continue

        print(f"\nLooking up: {raw_name} (OGBA team {r.get('ogba_team_code')})")

        players = smart_lookup(raw_name)

        if not players:
            print("  -> No players found.")
            missing += 1
            continue

        # Pretty-print options
        for p in players:
            full_name = p.get("fullName")
            pid = p.get("id")
            pos = p.get("primaryPosition", {}).get("abbreviation", "?")
            team = p.get("currentTeam") or {}
            team_abbr = team.get("abbreviation", "??")
            team_name = team.get("name", "Unknown")
            print(f"  ID: {pid:>7}  {full_name:25s}  {team_abbr:3s} ({team_name})  POS: {pos}")

        chosen_id = choose_candidate(players)

        if chosen_id is None:
            print("  -> Ambiguous, leaving mlb_id blank for manual fix.")
            ambiguous += 1
            continue

        r["mlb_id"] = str(chosen_id)
        updated += 1
        print(f"  -> Chosen ID: {chosen_id}")

    save_roster(ROSTER_CSV, fieldnames, rows)

    print("\nDone.")
    print(f"  Updated rows:   {updated}")
    print(f"  Ambiguous rows: {ambiguous}")
    print(f"  Missing rows:   {missing}")
    print(f"  Backup remains at: {BACKUP_CSV}")


if __name__ == "__main__":
    autofill_mlb_ids()
