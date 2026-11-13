"""Team registration: trimming, validation, unique ids and unique names."""

from .models import (
    MAX_TEAMS,
    TEAM_NAME_MAX,
    TEAM_NAME_MIN,
    DuplicateTeamError,
    NotFoundError,
    ValidationError,
    new_team,
)


def clean_name(raw_name):
    """Return a display name with outer space removed and inner runs collapsed.

    '  Red   Comets  ' becomes 'Red Comets'. That way a name that only differs
    by stray whitespace is recognised as the same name later on.
    """
    if not isinstance(raw_name, str):
        raise ValidationError("A team name must be text.")
    return " ".join(raw_name.split())


def name_key(name):
    """The comparison key used for uniqueness: casefolded, whitespace-free."""
    return clean_name(name).casefold()


def validate_team_name(raw_name):
    """Return the cleaned name, or raise ValidationError explaining the rule."""
    name = clean_name(raw_name)
    if len(name) < TEAM_NAME_MIN:
        raise ValidationError(
            f"Team name must be at least {TEAM_NAME_MIN} characters."
        )
    if len(name) > TEAM_NAME_MAX:
        raise ValidationError(
            f"Team name must be at most {TEAM_NAME_MAX} characters (got {len(name)})."
        )
    return name


def next_team_id(season):
    """Next free TMxxx id. Ids are never reused, so results stay attached."""
    used = {team["id"] for team in season["teams"]}
    number = len(season["teams"]) + 1
    while True:
        candidate = f"TM{number:03d}"
        if candidate not in used:
            return candidate
        number += 1


def register_team(season, raw_name):
    """Add a team to the season and return it.

    Raises ValidationError for a bad name, DuplicateTeamError for a name that
    already exists (case-insensitive), and ValidationError when the league is
    already full.
    """
    name = validate_team_name(raw_name)

    if len(season["teams"]) >= MAX_TEAMS:
        raise ValidationError(f"A league supports at most {MAX_TEAMS} teams.")

    existing = {name_key(team["name"]) for team in season["teams"]}
    if name_key(name) in existing:
        raise DuplicateTeamError(f"'{name}' is already registered.")

    team = new_team(next_team_id(season), name)
    season["teams"].append(team)
    return team


def find_team(season, team_id):
    """Return the team record with that id or raise NotFoundError."""
    for team in season["teams"]:
        if team["id"] == team_id:
            return team
    raise NotFoundError(f"No team with id '{team_id}'.")


def list_teams(season):
    """Teams in registration order (the order fixtures are generated from)."""
    return list(season["teams"])


def team_name(season, team_id):
    """Display name for an id, useful for reports and error messages."""
    return find_team(season, team_id)["name"]
