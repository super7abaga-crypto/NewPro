"""Single round-robin fixture generation.

Every unordered pair of teams meets exactly once, so N teams produce
N*(N-1)/2 fixtures: 4 teams -> 6, 6 teams -> 15, 8 teams -> 28.

The order is deterministic: teams are taken in registration order, the earlier
registered team is the home side, and ids run M001, M002, ...
"""

from .models import (
    MIN_TEAMS,
    STATUS_PENDING,
    ValidationError,
    new_fixture,
)
from .teams import list_teams


def pair_key(first_id, second_id):
    """An order-independent key for a pair of teams.

    frozenset(['TM001','TM002']) == frozenset(['TM002','TM001']), which is how
    a reversed duplicate is detected.
    """
    if first_id == second_id:
        raise ValidationError("A team cannot play itself.")
    return frozenset((first_id, second_id))


def expected_fixture_count(team_count):
    """N*(N-1)/2 -- the size of a complete single round-robin."""
    return team_count * (team_count - 1) // 2


def generate_fixtures(season, regenerate=False):
    """Create the full schedule once and return the fixture list.

    Refuses to run twice: a second generation would award points twice for the
    same pairings. Pass regenerate=True from an explicit admin command if you
    really mean to discard an empty schedule.
    """
    teams = list_teams(season)
    if len(teams) < MIN_TEAMS:
        raise ValidationError(
            f"Register at least {MIN_TEAMS} teams before generating a schedule "
            f"(you have {len(teams)})."
        )
    if season["fixtures"] and not regenerate:
        raise ValidationError(
            "This season already has a schedule. Generating another one would "
            "duplicate every pairing."
        )

    season["fixtures"] = []
    number = 1
    for index, home in enumerate(teams):
        for away in teams[index + 1:]:
            season["fixtures"].append(
                new_fixture(f"M{number:03d}", home["id"], away["id"])
            )
            number += 1
    return season["fixtures"]


def find_fixture(season, fixture_id):
    """Return the fixture record with that id or None."""
    wanted = str(fixture_id).strip().upper()
    for fixture in season["fixtures"]:
        if fixture["id"] == wanted:
            return fixture
    return None


def find_pair_fixture(season, first_id, second_id):
    """Return the fixture between two teams, or None."""
    key = pair_key(first_id, second_id)
    for fixture in season["fixtures"]:
        if frozenset((fixture["home_id"], fixture["away_id"])) == key:
            return fixture
    return None


def duplicate_pairs(fixtures):
    """Return pairs that appear more than once (should always be empty)."""
    seen = set()
    duplicates = []
    for fixture in fixtures:
        key = frozenset((fixture["home_id"], fixture["away_id"]))
        if key in seen:
            duplicates.append(tuple(sorted(key)))
        seen.add(key)
    return duplicates


def pending_fixtures(season):
    """Fixtures still waiting for a result."""
    return [f for f in season["fixtures"] if f["status"] == STATUS_PENDING]


def fixture_label(season, fixture):
    """'M001  Red Comets vs Blue Wolves  [pending]' for listings."""
    names = {team["id"]: team["name"] for team in season["teams"]}
    home = names.get(fixture["home_id"], fixture["home_id"])
    away = names.get(fixture["away_id"], fixture["away_id"])
    if fixture["status"] == STATUS_PENDING:
        score = ""
    else:
        score = f"  {fixture['home_score']}-{fixture['away_score']}"
    return f"{fixture['id']}  {home} vs {away}{score}"
