"""JSON persistence with schema *and* business-rule validation on load.

Valid JSON is not valid data. A file can parse perfectly and still describe a
fixture between a team that does not exist, a played match with no score, or
the same pairing twice. load_season() checks all of that before the file can
replace the season in memory, so a bad file cannot corrupt a live league.
"""

import json
import os
import tempfile

from .models import (
    MAX_TEAMS,
    SCHEMA_VERSION,
    STATUS_PENDING,
    STATUS_PLAYED,
    TEAM_NAME_MAX,
    TEAM_NAME_MIN,
    InvalidSeasonError,
)
from .teams import name_key

FIXTURE_FIELDS = ("id", "home_id", "away_id", "status", "home_score", "away_score")


def season_to_dict(season):
    """A deep-enough copy in the plain shapes JSON understands."""
    return {
        "schema_version": season.get("schema_version", SCHEMA_VERSION),
        "teams": [{"id": t["id"], "name": t["name"]} for t in season["teams"]],
        "fixtures": [
            {
                "id": f["id"],
                "home_id": f["home_id"],
                "away_id": f["away_id"],
                "status": f["status"],
                "home_score": f["home_score"],
                "away_score": f["away_score"],
            }
            for f in season["fixtures"]
        ],
    }


def save_season(path, season):
    """Write the season to ``path`` atomically and return the path.

    Writing to a temporary file in the same directory and then replacing the
    target means an interrupted save cannot leave a half-written season behind.
    """
    validate_season(season_to_dict(season))
    directory = os.path.dirname(os.path.abspath(path)) or "."
    os.makedirs(directory, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=directory, delete=False, suffix=".tmp"
    )
    try:
        with handle as stream:
            json.dump(season_to_dict(season), stream, indent=2, sort_keys=False)
            stream.write("\n")
        os.replace(handle.name, path)
    except Exception:
        if os.path.exists(handle.name):
            os.unlink(handle.name)
        raise
    return path


def load_season(path):
    """Read, parse and fully validate a season file. Returns a fresh dict."""
    try:
        with open(path, "r", encoding="utf-8") as stream:
            raw = json.load(stream)
    except FileNotFoundError:
        raise InvalidSeasonError(f"No such file: {path}") from None
    except json.JSONDecodeError as error:
        raise InvalidSeasonError(
            f"{os.path.basename(path)} is not valid JSON: {error}"
        ) from None
    except OSError as error:
        raise InvalidSeasonError(f"Could not read {path}: {error}") from None

    validate_season(raw)
    return {
        "schema_version": raw["schema_version"],
        "teams": [{"id": t["id"], "name": t["name"]} for t in raw["teams"]],
        "fixtures": [
            {field: f[field] for field in FIXTURE_FIELDS} for f in raw["fixtures"]
        ],
    }


def validate_season(data):
    """Raise InvalidSeasonError unless ``data`` is a coherent season.

    Checks, in order: shape and version, team ids and names, fixture ids and
    field types, referential integrity, status/score agreement, and uniqueness
    of both fixtures and pairings.
    """
    if not isinstance(data, dict):
        raise InvalidSeasonError("A season file must contain a JSON object.")
    for key in ("schema_version", "teams", "fixtures"):
        if key not in data:
            raise InvalidSeasonError(f"The season is missing '{key}'.")
    if data["schema_version"] != SCHEMA_VERSION:
        raise InvalidSeasonError(
            f"Unsupported schema_version {data['schema_version']!r}; "
            f"this build reads version {SCHEMA_VERSION}."
        )
    if not isinstance(data["teams"], list) or not isinstance(data["fixtures"], list):
        raise InvalidSeasonError("'teams' and 'fixtures' must both be lists.")
    if len(data["teams"]) > MAX_TEAMS:
        raise InvalidSeasonError(
            f"A league supports at most {MAX_TEAMS} teams; the file has {len(data['teams'])}."
        )

    _validate_teams(data["teams"])
    _validate_fixtures(data["fixtures"], {team["id"] for team in data["teams"]})


def _validate_teams(teams):
    ids = set()
    names = set()
    for index, team in enumerate(teams):
        where = f"team #{index + 1}"
        if not isinstance(team, dict):
            raise InvalidSeasonError(f"{where} must be an object.")
        for key in ("id", "name"):
            if key not in team:
                raise InvalidSeasonError(f"{where} is missing '{key}'.")
        if not isinstance(team["id"], str) or not team["id"].strip():
            raise InvalidSeasonError(f"{where} has an empty id.")
        if team["id"] in ids:
            raise InvalidSeasonError(f"Duplicate team id '{team['id']}'.")
        ids.add(team["id"])
        if not isinstance(team["name"], str):
            raise InvalidSeasonError(f"{where} name must be text.")
        cleaned = " ".join(team["name"].split())
        if not TEAM_NAME_MIN <= len(cleaned) <= TEAM_NAME_MAX:
            raise InvalidSeasonError(
                f"{where} name must be {TEAM_NAME_MIN}-{TEAM_NAME_MAX} characters."
            )
        key = name_key(cleaned)
        if key in names:
            raise InvalidSeasonError(
                f"Duplicate team name '{team['name']}' (names are case-insensitive)."
            )
        names.add(key)


def _validate_fixtures(fixtures, team_ids):
    ids = set()
    pairs = set()
    for index, fixture in enumerate(fixtures):
        where = f"fixture #{index + 1}"
        if not isinstance(fixture, dict):
            raise InvalidSeasonError(f"{where} must be an object.")
        for key in FIXTURE_FIELDS:
            if key not in fixture:
                raise InvalidSeasonError(f"{where} is missing '{key}'.")

        fixture_id = fixture["id"]
        if not isinstance(fixture_id, str) or not fixture_id.strip():
            raise InvalidSeasonError(f"{where} has an empty id.")
        if fixture_id in ids:
            raise InvalidSeasonError(f"Duplicate fixture id '{fixture_id}'.")
        ids.add(fixture_id)

        home_id = fixture["home_id"]
        away_id = fixture["away_id"]
        for side in (home_id, away_id):
            if not isinstance(side, str) or not side.strip():
                raise InvalidSeasonError(f"{where} ({fixture_id}) has an empty team id.")
            if side not in team_ids:
                raise InvalidSeasonError(
                    f"Fixture {fixture_id} references unknown team '{side}'."
                )
        if home_id == away_id:
            raise InvalidSeasonError(f"Fixture {fixture_id} puts a team against itself.")

        pair = frozenset((home_id, away_id))
        if pair in pairs:
            raise InvalidSeasonError(
                f"The pairing {home_id} vs {away_id} appears more than once; "
                f"a single round-robin plays each pair once."
            )
        pairs.add(pair)

        status = fixture["status"]
        if status not in (STATUS_PENDING, STATUS_PLAYED):
            raise InvalidSeasonError(
                f"Fixture {fixture_id} has unknown status '{status}'."
            )

        home_score = fixture["home_score"]
        away_score = fixture["away_score"]
        if status == STATUS_PENDING:
            if home_score is not None or away_score is not None:
                raise InvalidSeasonError(
                    f"Pending fixture {fixture_id} must not carry scores."
                )
        else:
            for label, score in (("home_score", home_score), ("away_score", away_score)):
                if isinstance(score, bool) or not isinstance(score, int):
                    raise InvalidSeasonError(
                        f"Played fixture {fixture_id} needs an integer {label}."
                    )
                if score < 0:
                    raise InvalidSeasonError(
                        f"Played fixture {fixture_id} has a negative {label}."
                    )
