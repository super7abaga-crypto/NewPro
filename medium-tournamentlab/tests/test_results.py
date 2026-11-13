"""Result entry: validation, one-shot entry, atomicity, simulation."""

import unittest

from helpers import standard_season, tl


class TestScoreValidation(unittest.TestCase):
    def test_accepts_non_negative_integers_and_numeric_strings(self):
        self.assertEqual(tl.results.parse_score(0), 0)
        self.assertEqual(tl.results.parse_score(3), 3)
        self.assertEqual(tl.results.parse_score(" 4 "), 4)

    def test_rejects_negative_numbers(self):
        with self.assertRaises(tl.ValidationError):
            tl.results.parse_score(-1)
        with self.assertRaises(tl.ValidationError):
            tl.results.parse_score("-2")

    def test_rejects_booleans_even_though_bool_is_an_int(self):
        self.assertIsInstance(True, int)  # the trap this test protects
        with self.assertRaises(tl.ValidationError):
            tl.results.parse_score(True)
        with self.assertRaises(tl.ValidationError):
            tl.results.parse_score(False)

    def test_rejects_words_floats_blanks_and_none(self):
        for bad in ("two", "", "   ", 2.5, None, [1]):
            with self.assertRaises(tl.ValidationError):
                tl.results.parse_score(bad)


class TestRecordResult(unittest.TestCase):
    def setUp(self):
        self.season = standard_season()
        tl.generate_fixtures(self.season)

    def test_valid_result_updates_both_scores_and_status(self):
        fixture = tl.record_result(self.season, "M001", 2, 1)
        self.assertEqual((fixture["home_score"], fixture["away_score"]), (2, 1))
        self.assertEqual(fixture["status"], "played")

    def test_unknown_fixture_is_rejected(self):
        with self.assertRaises(tl.FixtureNotFoundError):
            tl.record_result(self.season, "M999", 1, 0)
        with self.assertRaises(tl.FixtureNotFoundError):
            tl.record_result(self.season, "", 1, 0)

    def test_second_submission_is_rejected_and_changes_nothing(self):
        tl.record_result(self.season, "M001", 2, 1)
        with self.assertRaises(tl.FixtureAlreadyPlayedError):
            tl.record_result(self.season, "M001", 5, 5)
        fixture = tl.fixtures.find_fixture(self.season, "M001")
        self.assertEqual((fixture["home_score"], fixture["away_score"]), (2, 1))

    def test_invalid_score_leaves_the_fixture_pending(self):
        with self.assertRaises(tl.ValidationError):
            tl.record_result(self.season, "M001", 2, "x")
        fixture = tl.fixtures.find_fixture(self.season, "M001")
        self.assertEqual(fixture["status"], "pending")
        self.assertIsNone(fixture["home_score"])
        self.assertIsNone(fixture["away_score"])

    def test_a_rejected_result_cannot_leave_one_score_behind(self):
        with self.assertRaises(tl.ValidationError):
            tl.record_result(self.season, "M001", 3, -1)
        fixture = tl.fixtures.find_fixture(self.season, "M001")
        self.assertIsNone(fixture["home_score"])
        self.assertIsNone(fixture["away_score"])

    def test_bool_score_is_rejected_through_the_public_path(self):
        with self.assertRaises(tl.ValidationError):
            tl.record_result(self.season, "M001", True, 0)
        self.assertEqual(tl.fixtures.find_fixture(self.season, "M001")["status"], "pending")


class TestSimulation(unittest.TestCase):
    def test_simulation_is_reproducible_for_the_same_seed(self):
        first = standard_season()
        tl.generate_fixtures(first)
        second = standard_season()
        tl.generate_fixtures(second)
        tl.simulate_results(first, seed=7)
        tl.simulate_results(second, seed=7)
        self.assertEqual(first["fixtures"], second["fixtures"])

    def test_different_seeds_produce_a_different_scoreline(self):
        first = standard_season()
        tl.generate_fixtures(first)
        second = standard_season()
        tl.generate_fixtures(second)
        tl.simulate_results(first, seed=1)
        tl.simulate_results(second, seed=2)
        self.assertNotEqual(first["fixtures"], second["fixtures"])

    def test_simulation_does_not_touch_played_fixtures(self):
        season = standard_season()
        tl.generate_fixtures(season)
        tl.record_result(season, "M001", 9, 0)
        tl.simulate_results(season, seed=3)
        fixture = tl.fixtures.find_fixture(season, "M001")
        self.assertEqual((fixture["home_score"], fixture["away_score"]), (9, 0))


if __name__ == "__main__":
    unittest.main()
