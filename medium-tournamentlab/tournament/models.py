"""Shared constants, record shapes and error types for TournamentLab.

A season is one plain dictionary so it can be saved to JSON unchanged:

    {
      "schema_version": 1,
      "teams": [
        {"id": "TM001", "name": "Red Comets"}
      ],
      "fixtures": [
        {"id": "M001", "home_id": "TM001", "away_id": "TM002",
         "status": "pending", "home_score": None, "away_score": None}
      ]
    }

Teams carry a stable ``id`` so renaming a team never breaks a fixture, and
fixtures never store points: the table is always computed from results.
"""

SCHEMA_VERSION = 1

POINTS_WIN = 3
POINTS_DRAW = 1
POINTS_LOSS = 0

MIN_TEAMS = 4
MAX_TEAMS = 8

TEAM_NAME_MIN = 2
TEAM_NAME_MAX = 30

STATUS_PENDING = "pending"
STATUS_PLAYED = "played"
VALID_STATUSES = (STATUS_PENDING, STATUS_PLAYED)


class TournamentError(Exception):
    """Base class for every error this package raises on purpose."""


class ValidationError(TournamentError):
    """The caller supplied data that breaks a league rule."""


class DuplicateTeamError(ValidationError):
    """A team name is already registered (compared case-insensitively)."""


class NotFoundError(ValidationError):
    """A team or fixture id does not exist."""


class FixtureNotFoundError(NotFoundError):
    """No fixture with that id."""


class FixtureAlreadyPlayedError(ValidationError):
    """That fixture already has a result; results are entered once."""


class InvalidSeasonError(ValidationError):
    """Saved data is syntactically fine but breaks the season's invariants."""


def new_season():
    """Return an empty season dictionary."""
    return {"schema_version": SCHEMA_VERSION, "teams": [], "fixtures": []}


def new_team(team_id, name):
    """Build a team record. Validation belongs to teams.register_team()."""
    return {"id": team_id, "name": name}


def new_fixture(fixture_id, home_id, away_id):
    """Build a pending fixture record. Both scores start as None."""
    return {
        "id": fixture_id,
        "home_id": home_id,
        "away_id": away_id,
        "status": STATUS_PENDING,
        "home_score": None,
        "away_score": None,
    }
