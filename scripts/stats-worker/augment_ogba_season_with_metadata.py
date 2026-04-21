#!/usr/bin/env python3
"""
Join ogba_player_season_totals_2025.csv with ogba_player_metadata_2025.csv
on mlb_id, and write a new season CSV that includes MLB team fields.

Output: ogba_player_season_totals_2025_with_meta.csv
(You can later rename or replace the original if you want.)
"""

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEASON_IN = ROOT / "ogba_player_season_totals_2025.csv"
META_IN = ROOT / "ogba_player_metadata_2025.csv"
SEASON_OUT = ROOT / "ogba_player_season_totals_2025_with_meta.csv"


def load_metadata():
    meta_by_id = {}
    with META_IN.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            mlb_id = str(row.get("mlb_id") or "").strip()
            if not mlb_id:
                continue
            meta_by_id[mlb_id] = row
    return meta_by_id


def main() -> None:
    meta_by_id = load_metadata()
    print(f"Loaded {len(meta_by_id)} metadata records")

    with SEASON_IN.open(newline="", encoding="utf-8") as f_in, \
         SEASON_OUT.open("w", newline="", encoding="utf-8") as f_out:

        season_reader = csv.DictReader(f_in)

        # Extend season headers with MLB fields
        base_fields = season_reader.fieldnames or []
        extra_fields = [
            "mlb_team_abbr",
            "mlb_team_name",
            "mlb_full_name",
            "mlb_primary_pos",
            "mlb_bats",
            "mlb_throws",
        ]
        fieldnames = base_fields + extra_fields

        writer = csv.DictWriter(f_out, fieldnames=fieldnames)
        writer.writeheader()

        count = 0
        for row in season_reader:
            mlb_id = str(row.get("mlb_id") or "").strip()
            meta = meta_by_id.get(mlb_id, {})

            row["mlb_team_abbr"] = meta.get("mlb_team_abbr", "")
            row["mlb_team_name"] = meta.get("mlb_team_name", "")
            row["mlb_full_name"] = meta.get("full_name", "")
            row["mlb_primary_pos"] = meta.get("primary_pos", "")
            row["mlb_bats"] = meta.get("bats", "")
            row["mlb_throws"] = meta.get("throws", "")

            writer.writerow(row)
            count += 1

    print(f"Wrote {count} season rows with MLB metadata to {SEASON_OUT}")


if __name__ == "__main__":
    main()
