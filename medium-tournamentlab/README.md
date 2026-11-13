# TournamentLab — Esports League Manager

A fair, testable round-robin league engine for the terminal, written in pure
Python (standard library only). Register 4–8 teams, generate the schedule,
enter results, and get a league table that is always recomputed from the
matches that actually happened.

## Setup

Python 3.8+. No dependencies.

```bash
cd medium-tournamentlab
python main.py                 # uses data/season.json by default for save/load
python main.py my_season.json  # or choose your own default file
```

Run the tests:

```bash
python -m unittest discover -s tests -v
```

90 tests across teams, fixtures, results, standings, storage and the CLI.

## Features

1. Register 4–8 teams with trimmed display names; uniqueness is
   case-insensitive (`' red comets '` is rejected if `Red Comets` exists).
2. Single round-robin schedule: every pair meets once, N·(N−1)/2 fixtures
   (4 teams → 6, 6 teams → 15, 8 teams → 28). Fixture ids `M001…` are
   deterministic and the schedule can only be generated once per season.
3. Fixtures are listed with id, both team names, and `pending`/`played` status.
4. Results accept non-negative whole numbers only, once per fixture.
5. The table is derived from match records: played, wins, draws, losses,
   goals for, goals against, goal difference, points.
6. 3 points for a win, 1 each for a draw, 0 for a loss.
7. Ranking: points ↓, goal difference ↓, goals for ↓, normalised team name ↑.
8. Save/load JSON (`schema_version: 1`) with full integrity validation on load.
9. "Simulate demo results" runs only on an explicit `yes` and a seed, and never
   touches a fixture that already has a result.
10. A champion is named only when every fixture has been played; until then the
    table is labelled `STANDINGS IN PROGRESS`.

## Menu

```
 1) Register a team        7) Show champion
 2) List teams             8) Save season to JSON
 3) Generate the schedule  9) Load season from JSON
 4) List fixtures         10) Simulate demo results (explicit, seeded)
 5) Record a result       11) Quit
 6) Show standings
```

## Sample session (real output)

```
Choice > 1
Team name (2-30 characters): Red Comets
Registered TM001  Red Comets.
... (Blue Wolves, Green Vipers, Gold Bears)
Choice > 1
Team name (2-30 characters):  red comets
Refused: 'red comets' is already registered.
Choice > 3
Generated 6 fixtures for 4 teams.
Choice > 4
  M001  Red Comets vs Blue Wolves
  M002  Red Comets vs Green Vipers
  M003  Red Comets vs Gold Bears
  M004  Blue Wolves vs Green Vipers
  M005  Blue Wolves vs Gold Bears
  M006  Green Vipers vs Gold Bears
Choice > 5
Fixture id (e.g. M001): M001
Home goals: 3
Away goals: 1
Saved M001: 3-1.
Choice > 6
#  Team                   P   W   D   L   GF   GA   GD   Pts
-------------------------------------------------------------
1  Red Comets             2   1   1   0   3    1    +2   4
2  Green Vipers           1   0   1   0   0    0    +0   1
3  Gold Bears             0   0   0   0   0    0    +0   0
4  Blue Wolves            1   0   0   1   1    3    -2   0

STANDINGS IN PROGRESS
Choice > 10
This overwrites 4 pending fixture(s) with demo scores. Type 'yes' to continue: yes
Seed [1234]: 42
Simulated 4 result(s) with seed 42.
Choice > 7
CHAMPION: Gold Bears -- 5 points, goal difference +4, goals for 5.
```

`data/season.json` in this repo is exactly the saved result of that session, so
loading it reproduces the table above.

## Project layout

```
main.py                      entry point
tournament/
  models.py                  constants, record shapes, exception types
  teams.py                   registration, name rules, free ids
  fixtures.py                round-robin generation, lookups
  results.py                 score parsing, atomic result entry, simulation
  standings.py               table computation, ranking keys, champion
  storage.py                 JSON save/load + schema and integrity validation
  cli.py                     menu (thin: it only delegates)
tests/                       unittest suite (90 tests)
docs/design-decisions.md     the reasoning behind each rule
data/season.json             demo season saved from a real session
```

## Design in one paragraph

The league table is never stored. `teams` and `fixtures` are the only state, and
`compute_standings(teams, fixtures)` rebuilds the table from played results every
time it is needed, so the table cannot drift away from the matches. Teams carry a
stable `id` so renaming a team never orphans a fixture. Every operation
validates first and mutates second, which is why a rejected score entry leaves
byte-identical state. Loading a file validates it completely into a temporary
structure and only then replaces the live season, so a corrupt file cannot
damage a league in progress.

## Known limits

* No result editing after entry. The rules require one-shot results; adding an
  audited "edit" operation is future work, not a hidden feature.
* One season per save file: no multi-season history or promotion/relegation.
* No home/away double round-robin, no head-to-head tie-break (deliberately not
  invented; the documented order stops at team name).
* The CLI is line-based and needs `input()`/`print()`-compatible streams; it is
  not a curses UI.
* `simulate` is a demo aid. It writes real results, so it always asks first.
