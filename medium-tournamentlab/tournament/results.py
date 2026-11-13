"""Result entry: strict score checking and one atomic update.

Nothing here ever awards points. Points are derived in standings.py from the
match records, so a result can never disagree with the table.
"""

import random

from .fixtures import find_fixture, pending_fixtures
from .models import (
    STATUS_PENDING,
    STATUS_PLAYED,
    FixtureAlreadyPlayedError,
    FixtureNotFoundError,
    ValidationError,
)


def parse_score(value):
    """Return a non-negative int, or raise ValidationError.

    ``bool`` is rejected on purpose: isinstance(True, int) is True in Python,
    and True silently becoming a 1-0 score would be a quiet data bug.
    """
    if isinstance(value, bool):
        raise ValidationError("Scores must be whole numbers, not True/False.")
    if isinstance(value, int):
        score = value
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            raise ValidationError("Score cannot be blank.")
        try:
            score = int(text, 10)
        except ValueError:
            raise ValidationError(f"'{value}' is not a whole number.") from None
    else:
        raise ValidationError(f"'{value}' is not a whole number.")
    if score < 0:
        raise ValidationError("Scores cannot be negative.")
    return score


def validate_result(season, fixture_id, home_score, away_score):
    """Check a proposed result without changing anything.

    Returns (fixture, home, away) with scores converted to ints.
    """
    if not isinstance(fixture_id, str) or not fixture_id.strip():
        raise FixtureNotFoundError("Please give a fixture id such as M001.")
    fixture = find_fixture(season, fixture_id)
    if fixture is None:
        raise FixtureNotFoundError(f"No fixture with id '{fixture_id.strip()}'.")
    if fixture["status"] != STATUS_PENDING:
        raise FixtureAlreadyPlayedError(
            f"{fixture['id']} already has a result "
            f"({fixture['home_score']}-{fixture['away_score']}). "
            f"Results are entered once."
        )
    home = parse_score(home_score)
    away = parse_score(away_score)
    return fixture, home, away


def record_result(season, fixture_id, home_score, away_score):
    """Store one result and return the updated fixture.

    Everything is validated first, so a rejected entry leaves the season
    exactly as it was: either both scores and the status change, or nothing
    changes at all.
    """
    fixture, home, away = validate_result(season, fixture_id, home_score, away_score)
    fixture["home_score"] = home
    fixture["away_score"] = away
    fixture["status"] = STATUS_PLAYED
    return fixture


def simulate_results(season, seed=1234, max_goals=4):
    """Fill every pending fixture with reproducible, pseudo-random scores.

    This is a demo aid, not a league rule: it is only called when the user
    explicitly asks for it, and it reports how many records it changed. The
    same season plus the same seed always produce the same table.
    """
    generator = random.Random(seed)
    changed = 0
    for fixture in pending_fixtures(season):
        fixture["home_score"] = generator.randint(0, max_goals)
        fixture["away_score"] = generator.randint(0, max_goals)
        fixture["status"] = STATUS_PLAYED
        changed += 1
    return changed
