"""Shared helpers for the TournamentLab test suite."""

import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import tournament as tl  # noqa: E402


def season_with(*names):
    """Build a season containing the given team names."""
    season = tl.new_season()
    for name in names:
        tl.register_team(season, name)
    return season


def standard_season():
    """Four teams: Red, Blue, Green, Gold."""
    return season_with("Red Comets", "Blue Wolves", "Green Vipers", "Gold Bears")


def record(season, fixture_id, home, away):
    """Shorthand for entering a result."""
    return tl.record_result(season, fixture_id, home, away)


def fixture_between(season, first_name, second_name):
    """Find the fixture id for a pair of team names."""
    ids = {team["name"]: team["id"] for team in season["teams"]}
    fixture = tl.fixtures.find_pair_fixture(
        season, ids[first_name], ids[second_name]
    )
    return fixture["id"]


def rows_by_name(rows):
    return {row["name"]: row for row in rows}
