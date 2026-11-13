"""Standings: points, goals, tie-breaks, champion detection, hand-checked totals."""

import unittest

from helpers import fixture_between, rows_by_name, standard_season, tl


def four_team_season_with(results):
    """Four-team season where ``results`` is [(home_name, away_name, hg, ag)]."""
    season = standard_season()
    tl.generate_fixtures(season)
    for home_name, away_name, home_goals, away_goals in results:
        fixture_id = fixture_between(season, home_name, away_name)
        tl.record_result(season, fixture_id, home_goals, away_goals)
    return season


class TestPointsAndGoals(unittest.TestCase):
    def test_win_draw_loss_points(self):
        self.assertEqual(tl.standings.points_for(2, 1), (3, 0))
        self.assertEqual(tl.standings.points_for(1, 2), (0, 3))
        self.assertEqual(tl.standings.points_for(1, 1), (1, 1))

    def test_table_after_three_hand_checked_matches(self):
        # Red 2-0 Blue, Blue 1-1 Green, Red 0-1 Green
        season = four_team_season_with(
            [
                ("Red Comets", "Blue Wolves", 2, 0),
                ("Blue Wolves", "Green Vipers", 1, 1),
                ("Red Comets", "Green Vipers", 0, 1),
            ]
        )
        rows = rows_by_name(tl.compute_standings(season["teams"], season["fixtures"]))

        green = rows["Green Vipers"]
        self.assertEqual((green["played"], green["wins"], green["draws"], green["losses"]),
                         (2, 1, 1, 0))
        self.assertEqual((green["goals_for"], green["goals_against"]), (2, 1))
        self.assertEqual(green["goal_difference"], 1)
        self.assertEqual(green["points"], 4)

        red = rows["Red Comets"]
        self.assertEqual((red["played"], red["wins"], red["losses"]), (2, 1, 1))
        self.assertEqual((red["goals_for"], red["goals_against"]), (2, 1))
        self.assertEqual(red["points"], 3)

        blue = rows["Blue Wolves"]
        self.assertEqual((blue["draws"], blue["losses"], blue["points"]), (1, 1, 1))
        # Blue: 0-2 loss to Red, then 1-1 with Green -> 1 for, 3 against.
        self.assertEqual((blue["goals_for"], blue["goals_against"]), (1, 3))
        self.assertEqual(blue["goal_difference"], -2)

        gold = rows["Gold Bears"]
        self.assertEqual((gold["played"], gold["points"]), (0, 0))

    def test_ranking_order_is_green_then_red_then_blue_then_gold(self):
        season = four_team_season_with(
            [
                ("Red Comets", "Blue Wolves", 2, 0),
                ("Blue Wolves", "Green Vipers", 1, 1),
                ("Red Comets", "Green Vipers", 0, 1),
            ]
        )
        rows = tl.compute_standings(season["teams"], season["fixtures"])
        self.assertEqual(
            [row["name"] for row in rows],
            ["Green Vipers", "Red Comets", "Blue Wolves", "Gold Bears"],
        )
        self.assertEqual([row["rank"] for row in rows], [1, 2, 3, 4])

    def test_goals_for_equals_goals_against_across_the_table(self):
        season = four_team_season_with(
            [
                ("Red Comets", "Blue Wolves", 3, 2),
                ("Green Vipers", "Gold Bears", 0, 0),
                ("Blue Wolves", "Green Vipers", 4, 4),
            ]
        )
        rows = tl.compute_standings(season["teams"], season["fixtures"])
        self.assertTrue(tl.standings.validate_totals(rows))
        self.assertEqual(sum(row["points"] for row in rows), 3 + 2 + 1 + 1)

    def test_pending_fixtures_contribute_nothing(self):
        season = four_team_season_with([("Red Comets", "Blue Wolves", 5, 0)])
        rows = rows_by_name(tl.compute_standings(season["teams"], season["fixtures"]))
        self.assertEqual(rows["Gold Bears"]["played"], 0)
        self.assertEqual(rows["Gold Bears"]["goals_against"], 0)

    def test_standings_are_not_stored_on_the_fixture_records(self):
        season = four_team_season_with([("Red Comets", "Blue Wolves", 1, 0)])
        for fixture in season["fixtures"]:
            self.assertNotIn("points", fixture)
            self.assertNotIn("table", fixture)


class TestTieBreaks(unittest.TestCase):
    def build(self, rows):
        """Turn crafted rows into (teams, fixtures) that produce those rows."""
        teams = [
            {"id": f"TM{index:03d}", "name": name}
            for index, (name, _, _, _) in enumerate(rows, start=1)
        ]
        return teams

    def test_equal_points_are_split_by_goal_difference(self):
        # Both teams win once; Alpha wins by 2, Beta by 1.
        season = four_team_season_with(
            [
                ("Red Comets", "Blue Wolves", 3, 0),
                ("Green Vipers", "Gold Bears", 2, 0),
            ]
        )
        rows = tl.compute_standings(season["teams"], season["fixtures"])
        self.assertEqual(rows[0]["points"], 3)
        self.assertEqual(rows[1]["points"], 3)
        self.assertEqual(rows[0]["goal_difference"], 3)
        self.assertEqual(rows[1]["goal_difference"], 2)

    def test_equal_points_and_difference_are_split_by_goals_for(self):
        season = four_team_season_with(
            [
                ("Red Comets", "Blue Wolves", 4, 2),
                ("Green Vipers", "Gold Bears", 2, 0),
            ]
        )
        rows = tl.compute_standings(season["teams"], season["fixtures"])
        self.assertEqual(rows[0]["points"], rows[1]["points"], 3)
        self.assertEqual(rows[0]["goal_difference"], rows[1]["goal_difference"], 2)
        self.assertEqual(rows[0]["goals_for"], 4)
        self.assertEqual(rows[1]["goals_for"], 2)
        self.assertEqual(rows[0]["name"], "Red Comets")

    def test_identical_records_are_split_alphabetically_case_insensitively(self):
        teams = [
            {"id": "TM001", "name": "zeta united"},
            {"id": "TM002", "name": "Alpha FC"},
            {"id": "TM003", "name": "Beta FC"},
            {"id": "TM004", "name": "Gamma FC"},
        ]
        fixtures = []
        rows = tl.compute_standings(teams, fixtures)
        # All zero: alphabetical, ignoring case, puts Alpha first.
        self.assertEqual([row["name"] for row in rows][0], "Alpha FC")
        self.assertEqual(rows[-1]["name"], "zeta united")

    def test_sort_key_is_a_multi_key_tuple(self):
        row = {
            "points": 7,
            "goal_difference": -1,
            "goals_for": 4,
            "name": "Mixed Case",
        }
        self.assertEqual(
            tl.standings.ranking_key(row),
            (-7, 1, -4, "mixed case"),
        )

    def test_equal_points_with_different_ranks(self):
        season = four_team_season_with(
            [
                ("Red Comets", "Blue Wolves", 5, 0),
                ("Green Vipers", "Gold Bears", 1, 0),
            ]
        )
        rows = tl.compute_standings(season["teams"], season["fixtures"])
        self.assertEqual(rows[0]["points"], rows[1]["points"])
        self.assertNotEqual(rows[0]["rank"], rows[1]["rank"])

    def test_compute_standings_is_stable_across_calls(self):
        season = four_team_season_with(
            [("Red Comets", "Blue Wolves", 1, 1), ("Green Vipers", "Gold Bears", 1, 1)]
        )
        first = tl.compute_standings(season["teams"], season["fixtures"])
        second = tl.compute_standings(season["teams"], season["fixtures"])
        self.assertEqual(first, second)

    def test_fixture_referencing_an_unknown_team_is_refused(self):
        teams = [{"id": "TM001", "name": "Alpha"}, {"id": "TM002", "name": "Beta"}]
        fixtures = [
            {
                "id": "M001",
                "home_id": "TM001",
                "away_id": "TM999",
                "status": "played",
                "home_score": 1,
                "away_score": 0,
            }
        ]
        with self.assertRaises(tl.ValidationError):
            tl.compute_standings(teams, fixtures)


class TestCompletenessAndChampion(unittest.TestCase):
    def test_incomplete_season_has_no_champion(self):
        season = standard_season()
        tl.generate_fixtures(season)
        tl.record_result(season, "M001", 1, 0)
        self.assertFalse(tl.is_complete(season["fixtures"]))
        self.assertIsNone(tl.champion(season["teams"], season["fixtures"]))
        self.assertIn(
            "IN PROGRESS",
            tl.format_table(
                tl.compute_standings(season["teams"], season["fixtures"]),
                tl.is_complete(season["fixtures"]),
            ),
        )

    def test_complete_season_names_the_champion(self):
        season = standard_season()
        tl.generate_fixtures(season)
        for fixture in list(season["fixtures"]):
            tl.record_result(season, fixture["id"], 0, 1)
        rows = tl.compute_standings(season["teams"], season["fixtures"])
        best = rows[0]
        self.assertTrue(tl.is_complete(season["fixtures"]))
        self.assertEqual(tl.champion(season["teams"], season["fixtures"])["name"], best["name"])
        self.assertEqual(best["points"], 9)

    def test_empty_season_is_not_complete(self):
        self.assertFalse(tl.is_complete([]))
        self.assertIsNone(tl.champion([], []))

    def test_champion_message_is_explicit(self):
        record = {
            "team_id": "TM001",
            "name": "Red Comets",
            "points": 9,
            "goal_difference": 6,
            "goals_for": 11,
        }
        message = tl.format_champion(record)
        self.assertIn("CHAMPION: Red Comets", message)
        self.assertIn("9 points", message)

    def test_format_table_shows_the_headers(self):
        season = standard_season()
        text = tl.format_table(tl.compute_standings(season["teams"], season["fixtures"]))
        for column in ("Team", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"):
            self.assertIn(column, text)


if __name__ == "__main__":
    unittest.main()
