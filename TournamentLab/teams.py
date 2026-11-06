
MAX_TEAMS = 10


def create_team(name, teams):
    team_id = f"TM{len(teams) + 1}"

    team = {
        "id": team_id,
        "name": name,
        "played": 0,
        "won": 0,
        "drawn": 0,
        "lost": 0,
        "gf": 0,
        "ga": 0,
        "gd": 0,
        "points": 0
    }

    return team


def register_team(name, teams):
    if not name.strip():
        raise ValueError("Team name cannot be empty.")

    if len(teams) >= MAX_TEAMS:
        raise ValueError("Tournament is limited to 10 teams.")

    for team in teams:
        if team["name"].lower() == name.strip().lower():
            raise ValueError("This team name already exists.")

    team = create_team(name.strip(), teams)
    teams.append(team)

    return team
