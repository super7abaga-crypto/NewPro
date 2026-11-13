# TournamentLab — design decisions

Every rule below exists because of a specific failure mode. This file records
the decision, the alternative I rejected, and the test that protects it.

## 1. Results are the source of truth; the table is derived

**Decision:** the season stores only `teams` and `fixtures`. Standings are
computed on demand by `standings.compute_standings(teams, fixtures)`.

**Rejected:** storing a `table` object next to the fixtures and incrementing it
when a result is entered.

**Why:** two writable copies of the same facts drift. One failed increment (say a
crash between writing the match and writing the table) leaves a league that
disagrees with its own results and nobody can tell which is right. Deriving
means there is exactly one truth.

**Protected by:** `test_pending_fixtures_contribute_nothing`,
`test_standings_are_not_stored_on_the_fixture_records`, and the save/load round
trip in `test_save_then_load_preserves_teams_fixtures_and_standings`.

## 2. Teams have ids; names are just labels

**Decision:** `TM001` is the identity. Names are display strings, unique
case-insensitively after trimming and collapsing whitespace.

**Why:** a fixture that referenced team names would break the moment someone
fixes a typo. Separating identity from label makes renaming free.

**Protected by:** `test_ids_are_stable_and_never_reused`.

## 3. Fixtures are generated exactly once

**Decision:** `generate_fixtures` refuses to run when the season already has
fixtures; a `regenerate=True` escape hatch exists for an explicitly empty
schedule.

**Why:** generating twice creates the same pairing twice, which awards six
points for one match and silently corrupts the table. The most common real bug in
student leagues is exactly this.

**Protected by:** `test_second_generation_is_refused`,
`test_every_pair_meets_exactly_once`.

## 4. Pairs are unordered

**Decision:** a pairing is keyed by `frozenset({home_id, away_id})`.

**Why:** `M001 Red vs Blue` and `M007 Blue vs Red` are the same match. Keying on
a tuple would let the reversed duplicate through. The home/away order still
exists on the record (it determines which score is `home_score`), it is just not
part of the identity of the pairing.

**Protected by:** `test_repeated_pairing_is_rejected`,
`test_pair_key_rejects_a_team_playing_itself`.

## 5. `bool` is not a score

**Decision:** `parse_score` rejects `True`/`False` explicitly before the `int`
check.

**Why:** `isinstance(True, int)` is `True` in Python, so `True` would quietly
become a 1-0 score. That is a data bug that only shows up months later in a
league table nobody can explain.

**Protected by:** `test_rejects_booleans_even_though_bool_is_an_int`,
`test_bool_score_is_rejected_through_the_public_path`.

## 6. Validate, then mutate

**Decision:** `record_result` calls `validate_result` (which converts and checks
both scores) before it writes anything.

**Why:** partial writes are the nastiest state to reason about. A rejected entry
must leave the record byte-identical, which is a testable claim, not a promise.

**Protected by:** `test_invalid_score_leaves_the_fixture_pending`,
`test_a_rejected_result_cannot_leave_one_score_behind`.

## 7. Ranking is a fixed, documented total order

**Decision:** points ↓, goal difference ↓, goals for ↓, `name.casefold()` ↑.

**Rejected:** head-to-head mini-tables, fair-play points, random ordering.

**Why:** a tie-break that is not total makes the table non-deterministic between
runs, which destroys reproducibility (and makes tests flaky). Head-to-head was
left out because it is a different competition format that must be designed, not
guessed.

**Protected by:** `test_equal_points_are_split_by_goal_difference`,
`test_equal_points_and_difference_are_split_by_goals_for`,
`test_identical_records_are_split_alphabetically_case_insensitively`,
`test_sort_key_is_a_multi_key_tuple`.

## 8. Loading validates the whole file before replacing state

**Decision:** `load_season` parses, then runs `validate_season`, then builds a
fresh dict. The CLI assigns `self.season` only after that returns.

**Why:** valid JSON is not valid data. A file can parse and still contain a
fixture between a team that does not exist, a played match with `null` scores, or
the same pairing twice. Replacing live state with that would be memory
corruption by another name.

**Protected by:** the twelve rejection tests in `tests/test_storage.py` and
`test_cli_keeps_the_current_season_when_a_load_fails`.

## 9. Saves are atomic

**Decision:** write to a `NamedTemporaryFile` in the target directory, then
`os.replace`.

**Why:** an interrupted write (Ctrl-C, full disk) must not leave a truncated
season where a real one was. `os.replace` is atomic on POSIX and Windows.

**Protected by:** `test_saving_does_not_leave_temporary_files_behind`.

## 10. Team count: generation needs 4, loading allows fewer

**Decision:** `MIN_TEAMS = 4` is enforced by *fixture generation*; the loader
accepts an in-progress season with any number of teams up to `MAX_TEAMS = 8`.

**Why:** you must be able to save a league you are still building. Locking the
loader to 4+ teams would make it impossible to persist a half-registered season.

**Protected by:** `test_missing_teams_blocks_generation`,
`test_ninth_team_is_rejected`.

## 11. Simulation is explicit and seeded

**Decision:** `simulate_results(season, seed)` only runs after a literal `yes`,
reports the number of records changed, and skips played fixtures.

**Why:** a demo helper that silently rewrites real records destroys trust in the
data. A seed makes the demo reproducible, so a screenshot and a test agree.

**Protected by:** `test_simulation_requires_explicit_yes`,
`test_simulation_is_reproducible_for_the_same_seed`,
`test_simulation_does_not_touch_played_fixtures`.

## 12. The CLI owns no rules

**Decision:** every menu option is one call into a module function, wrapped in a
single `try/except TournamentError` that prints `Refused: <reason>`.

**Why:** it keeps the terminal disposable. The CLI can be thrown away and the
engine still works, and the CLI itself is testable by injecting `input_fn` and
`output_fn`.

**Protected by:** the whole of `tests/test_cli.py`.
