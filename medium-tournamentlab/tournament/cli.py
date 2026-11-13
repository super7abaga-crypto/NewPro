"""The terminal menu -- thin on purpose.

Every decision here delegates to teams/fixtures/results/standings/storage, so
the CLI contains almost no logic of its own and can be driven in tests by
passing a fake ``input_fn`` and a capturing ``output_fn``.
"""

from .fixtures import fixture_label, generate_fixtures
from .models import TournamentError, new_season
from .results import record_result, simulate_results
from .standings import champion, compute_standings, format_champion, format_table, is_complete
from .storage import load_season, save_season
from .teams import list_teams, register_team

MENU = """
TournamentLab -- Esports League Manager
 1) Register a team
 2) List teams
 3) Generate the schedule
 4) List fixtures
 5) Record a result
 6) Show standings
 7) Show champion
 8) Save season to JSON
 9) Load season from JSON
10) Simulate demo results (explicit, seeded)
11) Quit
"""

DEFAULT_PATH = "data/season.json"


class LeagueCLI:
    """Interactive league manager. One instance owns one in-memory season."""

    def __init__(self, season=None, input_fn=input, output_fn=print,
                 default_path=DEFAULT_PATH):
        self.season = season if season is not None else new_season()
        self.input_fn = input_fn
        self.output_fn = output_fn
        self.default_path = default_path
        self.running = True

    # ------------------------------------------------------------------ menu
    def run(self):
        """Loop until the user quits. Handles EOF and Ctrl-C gracefully."""
        self.output_fn(MENU)
        while self.running:
            try:
                choice = self.input_fn("\nChoice > ")
            except (EOFError, KeyboardInterrupt):
                self.output_fn("\nClosing the league. Remember to save first.")
                return
            self.handle(choice)

    def handle(self, choice):
        """Dispatch one menu choice. Returns False once the menu should stop."""
        text = str(choice).strip().lower()
        actions = {
            "1": self.register_team_action,
            "2": self.list_teams_action,
            "3": self.generate_schedule_action,
            "4": self.list_fixtures_action,
            "5": self.record_result_action,
            "6": self.standings_action,
            "7": self.champion_action,
            "8": self.save_action,
            "9": self.load_action,
            "10": self.simulate_action,
            "11": self.quit_action,
            "q": self.quit_action,
        }
        action = actions.get(text)
        if action is None:
            self.output_fn("Unknown choice. Enter a number from 1 to 11.")
            return self.running
        try:
            action()
        except TournamentError as error:
            self.output_fn(f"Refused: {error}")
        return self.running

    # --------------------------------------------------------------- actions
    def register_team_action(self):
        raw = self.input_fn("Team name (2-30 characters): ")
        team = register_team(self.season, raw)
        self.output_fn(f"Registered {team['id']}  {team['name']}.")

    def list_teams_action(self):
        teams = list_teams(self.season)
        if not teams:
            self.output_fn("No teams registered yet.")
            return
        for team in teams:
            self.output_fn(f"  {team['id']}  {team['name']}")

    def generate_schedule_action(self):
        fixtures = generate_fixtures(self.season)
        self.output_fn(
            f"Generated {len(fixtures)} fixtures for "
            f"{len(self.season['teams'])} teams."
        )

    def list_fixtures_action(self):
        if not self.season["fixtures"]:
            self.output_fn("No fixtures yet. Generate the schedule first (option 3).")
            return
        for fixture in self.season["fixtures"]:
            self.output_fn("  " + fixture_label(self.season, fixture))

    def record_result_action(self):
        fixture_id = self.input_fn("Fixture id (e.g. M001): ")
        home = self.input_fn("Home goals: ")
        away = self.input_fn("Away goals: ")
        fixture = record_result(self.season, fixture_id, home, away)
        self.output_fn(
            f"Saved {fixture['id']}: "
            f"{fixture['home_score']}-{fixture['away_score']}."
        )

    def standings_action(self):
        rows = compute_standings(self.season["teams"], self.season["fixtures"])
        self.output_fn(format_table(rows, is_complete(self.season["fixtures"])))

    def champion_action(self):
        row = champion(self.season["teams"], self.season["fixtures"])
        self.output_fn(format_champion(row))

    def save_action(self):
        path = self.input_fn(f"File path [{self.default_path}]: ").strip()
        path = path or self.default_path
        save_season(path, self.season)
        self.output_fn(f"Saved to {path}.")

    def load_action(self):
        path = self.input_fn(f"File path [{self.default_path}]: ").strip()
        path = path or self.default_path
        loaded = load_season(path)
        # Only now does the live season get replaced, so a bad file changes nothing.
        self.season = loaded
        self.output_fn(
            f"Loaded {len(loaded['teams'])} teams and "
            f"{len(loaded['fixtures'])} fixtures from {path}."
        )

    def simulate_action(self):
        pending = sum(1 for f in self.season["fixtures"] if f["status"] == "pending")
        if not pending:
            self.output_fn("Nothing to simulate: no pending fixtures.")
            return
        answer = self.input_fn(
            f"This overwrites {pending} pending fixture(s) with demo scores. "
            f"Type 'yes' to continue: "
        ).strip().lower()
        if answer != "yes":
            self.output_fn("Cancelled. No records changed.")
            return
        seed_text = self.input_fn("Seed [1234]: ").strip()
        seed = int(seed_text) if seed_text.isdigit() else 1234
        changed = simulate_results(self.season, seed=seed)
        self.output_fn(f"Simulated {changed} result(s) with seed {seed}.")

    def quit_action(self):
        self.running = False
        self.output_fn("Goodbye. Save your season before you close the terminal.")


def main(argv=None):
    """Entry point used by main.py."""
    import sys

    path = DEFAULT_PATH
    if argv and len(argv) > 1:
        path = argv[1]
    cli = LeagueCLI(default_path=path)
    cli.run()
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main(sys.argv))
