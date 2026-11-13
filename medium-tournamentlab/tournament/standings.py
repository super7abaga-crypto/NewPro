"""The league table, computed from results -- never stored.

Storing a separate editable table is how league apps drift out of sync: one
wrong edit and the table disagrees with the matches that actually happened.
Here the played fixtures are the single source of truth.
"""

from .models import (
    POINTS_DRAW,
    POINTS_LOSS,
    POINTS_WIN,
    STATUS_PLAYED,
    ValidationError,
)

HEADERS = (
    ("#", 2),
    ("Team", 22),
    ("P", 3),
    ("W", 3),
    ("D", 3),
    ("L", 3),
    ("GF", 4),
    ("GA", 4),
    ("GD", 4),
    ("Pts", 4),
)


def empty_row(team):
    """A zeroed table row for a team with no results yet."""
    return {
        "team_id": team["id"],
        "name": team["name"],
        "played": 0,
        "wins": 0,
        "draws": 0,
        "losses": 0,
        "goals_for": 0,
        "goals_against": 0,
        "goal_difference": 0,
        "points": 0,
    }


def points_for(home_score, away_score):
    """Return (home_points, away_points) for a finished match."""
    if home_score > away_score:
        return POINTS_WIN, POINTS_LOSS
    if home_score < away_score:
        return POINTS_LOSS, POINTS_WIN
    return POINTS_DRAW, POINTS_DRAW


def played_fixtures(fixtures):
    """Fixtures that genuinely have a result, defensively filtered."""
    good = []
    for fixture in fixtures:
        if fixture.get("status") != STATUS_PLAYED:
            continue
        home = fixture.get("home_score")
        away = fixture.get("away_score")
        if isinstance(home, bool) or isinstance(away, bool):
            continue
        if not isinstance(home, int) or not isinstance(away, int):
            continue
        if home < 0 or away < 0:
            continue
        good.append(fixture)
    return good


def compute_standings(teams, fixtures):
    """Return table rows ordered by the documented ranking rules.

    Order: points descending, goal difference descending, goals for
    descending, normalised team name ascending.
    """
    rows = {team["id"]: empty_row(team) for team in teams}

    for fixture in played_fixtures(fixtures):
        home_id = fixture["home_id"]
        away_id = fixture["away_id"]
        if home_id not in rows or away_id not in rows:
            raise ValidationError(
                f"Fixture {fixture['id']} references a team that is not in the league."
            )
        home_score = fixture["home_score"]
        away_score = fixture["away_score"]
        home_points, away_points = points_for(home_score, away_score)

        home = rows[home_id]
        away = rows[away_id]

        home["played"] += 1
        away["played"] += 1
        home["goals_for"] += home_score
        home["goals_against"] += away_score
        away["goals_for"] += away_score
        away["goals_against"] += home_score
        home["points"] += home_points
        away["points"] += away_points

        if home_score > away_score:
            home["wins"] += 1
            away["losses"] += 1
        elif home_score < away_score:
            home["losses"] += 1
            away["wins"] += 1
        else:
            home["draws"] += 1
            away["draws"] += 1

    for row in rows.values():
        row["goal_difference"] = row["goals_for"] - row["goals_against"]

    ordered = sorted(rows.values(), key=ranking_key)
    for position, row in enumerate(ordered, start=1):
        row["rank"] = position
    return ordered


def ranking_key(row):
    """Multi-key sort: biggest points first, then GD, then GF, then A-Z.

    Minus signs invert numeric fields because sorted() is ascending. Names use
    casefold() so 'red comets' and 'Red Comets' cannot sort unpredictably.
    """
    return (
        -row["points"],
        -row["goal_difference"],
        -row["goals_for"],
        row["name"].casefold(),
    )


def is_complete(fixtures):
    """True when the season has fixtures and every one of them has a result."""
    if not fixtures:
        return False
    return all(fixture["status"] == STATUS_PLAYED for fixture in fixtures)


def champion(teams, fixtures):
    """The winning team row once every fixture is played, otherwise None."""
    if not is_complete(fixtures):
        return None
    rows = compute_standings(teams, fixtures)
    return rows[0] if rows else None


def validate_totals(rows):
    """Sanity check: in a football table goals for must equal goals against."""
    goals_for = sum(row["goals_for"] for row in rows)
    goals_against = sum(row["goals_against"] for row in rows)
    return goals_for == goals_against


def format_table(rows, complete=False):
    """Render the table as plain monospace text."""
    if not rows:
        return "No teams registered yet."

    header = " ".join(title.ljust(width) for title, width in HEADERS)
    lines = [header, "-" * len(header)]
    for row in rows:
        lines.append(
            " ".join(
                (
                    str(row["rank"]).ljust(HEADERS[0][1]),
                    row["name"][: HEADERS[1][1]].ljust(HEADERS[1][1]),
                    str(row["played"]).ljust(HEADERS[2][1]),
                    str(row["wins"]).ljust(HEADERS[3][1]),
                    str(row["draws"]).ljust(HEADERS[4][1]),
                    str(row["losses"]).ljust(HEADERS[5][1]),
                    str(row["goals_for"]).ljust(HEADERS[6][1]),
                    str(row["goals_against"]).ljust(HEADERS[7][1]),
                    f"{row['goal_difference']:+d}".ljust(HEADERS[8][1]),
                    str(row["points"]).ljust(HEADERS[9][1]),
                )
            )
        )
    status = "FINAL TABLE" if complete else "STANDINGS IN PROGRESS"
    lines.append("")
    lines.append(status)
    return "\n".join(lines)


def format_champion(row):
    """The champion announcement."""
    if row is None:
        return "No champion yet: the season is still in progress."
    return (
        f"CHAMPION: {row['name']} -- {row['points']} points, "
        f"goal difference {row['goal_difference']:+d}, goals for {row['goals_for']}."
    )
