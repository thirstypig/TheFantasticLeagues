# test_statsapi.py
import statsapi


def main() -> None:
    """
    Simple smoke test that just prints the league leaders table
    as a plain string. No parsing, just verifying that MLB-StatsAPI
    can reach the MLB Stats endpoint.
    """
    leaders_str = statsapi.league_leaders("homeRuns", season=2024, limit=10)
    print("Top 10 HR leaders – 2024 regular season")
    print("---------------------------------------")
    print(leaders_str)


if __name__ == "__main__":
    main()
