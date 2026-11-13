"""TournamentLab -- a fair round-robin league engine for the terminal.

The package is split by responsibility:

    models.py     constants, record shapes and the exception types
    teams.py      registration and team lookup
    fixtures.py   round-robin generation
    results.py    score validation and result entry
    standings.py  the league table, derived from results only
    storage.py    JSON save/load plus schema and integrity validation
    cli.py        the menu, kept thin on purpose
"""

from .models import (  # noqa: F401
    MAX_TEAMS,
    MIN_TEAMS,
    POINTS_DRAW,
    POINTS_LOSS,
    POINTS_WIN,
    SCHEMA_VERSION,
    DuplicateTeamError,
    FixtureAlreadyPlayedError,
    FixtureNotFoundError,
    InvalidSeasonError,
    NotFoundError,
    TournamentError,
    ValidationError,
    new_season,
)
from . import cli, fixtures, results, standings  # noqa: F401
from .teams import find_team, list_teams, register_team  # noqa: F401
from .fixtures import generate_fixtures, pair_key  # noqa: F401
from .results import record_result, simulate_results  # noqa: F401
from .standings import (  # noqa: F401
    champion,
    compute_standings,
    format_champion,
    format_table,
    is_complete,
)
from .storage import load_season, save_season, validate_season  # noqa: F401

__all__ = [name for name in dir() if not name.startswith("_")]
__version__ = "1.0.0"
