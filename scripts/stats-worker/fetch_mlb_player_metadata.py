#!/usr/bin/env python3
"""
Fetch MLB player metadata (team, full name, primary position, bats/throws)
for all mlb_id values in ogba_player_season_totals_2025.csv using the
public MLB Stats API, and write a metadata CSV we can join back in later.

Output: ogba_player_metadata_2025.csv
"""

import csv
import time
import requests
from pathlib import Path
from typing import Dict, Any, List

ROOT = Path(__file__).resolve().parent
INPUT_CSV = ROOT / "ogba_player_season_totals_2025.csv"
OUTPUT_CSV = ROOT / "ogba_player_metadata_2025.csv"

MLB_STATS_PEOPLE_URL = "https://statsapi.mlb.com/api/v1/people"


def read_mlb_ids() -> List[str]:
    ids: List[str] = []
    with INPUT_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            mlb_id = row.get("mlb_id")
            if not mlb_id:
                continue
            mlb_id = str(mlb_id).strip()
            if mlb_id and mlb_id not in ids:
                ids.append(mlb_id)
    return ids


def fetch_people_batch(person_ids: List[str]) -> Dict[str, Any]:
    """
    Call MLB Stats API /people endpoint for a batch of IDs.
    """
    params = {
        "personIds": ",".join(person_ids),
        # hydrate gives us current team etc.
        "hydrate": "currentTeam",
    }
    resp = requests.get(MLB_STATS_PEOPLE_URL, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    people = data.get("people", [])
    result: Dict[str, Any] = {}
    for p in people:
        pid = str(p.get("id"))
        result[pid] = p
    return result


def extract_player_record(person: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize the subset of fields we care about into a flat dict.
    """
    pid = str(person.get("id") or "")
    full_name = person.get("fullName") or ""
    primary_pos = (person.get("primaryPosition") or {}).get("abbreviation") or ""
    bats = (person.get("batSide") or {}).get("code") or ""
    throws = (person.get("pitchHand") or {}).get("code") or ""

    team = person.get("currentTeam") or {}
    mlb_team_id = team.get("id") or ""
    mlb_team_name = team.get("name") or ""
    mlb_team_abbr = team.get("abbreviation") or team.get("teamCode") or ""

    return {
        "mlb_id": pid,
        "full_name": full_name,
        "primary_pos": primary_pos,
        "bats": bats,
        "throws": throws,
        "mlb_team_id": mlb_team_id,
        "mlb_team_name": mlb_team_name,
        "mlb_team_abbr": mlb_team_abbr,
    }


def main() -> None:
    mlb_ids = read_mlb_ids()
    print(f"Found {len(mlb_ids)} unique mlb_id values in {INPUT_CSV.name}")

    results: Dict[str, Dict[str, Any]] = {}

    BATCH_SIZE = 50
    for i in range(0, len(mlb_ids), BATCH_SIZE):
        batch = mlb_ids[i : i + BATCH_SIZE]
        print(f"Fetching MLB metadata for IDs {i+1}-{i+len(batch)} / {len(mlb_ids)}")
        try:
            people = fetch_people_batch(batch)
        except Exception as e:
            print(f"⚠️ Error fetching batch {i//BATCH_SIZE}: {e}")
            continue

        for pid, person in people.items():
            results[pid] = extract_player_record(person)

        # Be a good citizen
        time.sleep(0.5)

    fieldnames = [
        "mlb_id",
        "full_name",
        "primary_pos",
        "bats",
        "throws",
        "mlb_team_id",
        "mlb_team_name",
        "mlb_team_abbr",
    ]

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for pid in sorted(results.keys(), key=int):
            writer.writerow(results[pid])

    print(f"Wrote {len(results)} player metadata rows to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
