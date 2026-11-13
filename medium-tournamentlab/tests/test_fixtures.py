"""Round-robin generation: pair counts, no duplicates, determinism."""

import unittest

from helpers import standard_season, tl


class TestFixtureGeneration(unittest.TestCase):
    def test_four_teams_produce_six_unique_fixtures(self):
        season = standard_season()
        fixtures = tl.generate_fixtures(season)
        self.assertEqual(len(fixtures), 6)
        self.assertEqual(tl.fixtures.expected_fixture_count(4), 6)

    def test_six_teams_produce_fifteen_fixtures(self):
        season = tl.new_season()
        for name in ("A1", "B2", "C3", "D4", "E5", "F6"):
            tl.register_team(season, name)
        fixtures = tl.generate_fixtures(season)
        self.assertEqual(len(fixtures), 15)
        self.assertEqual(len(fixtures), 6 * 5 // 2)

    def test_every_pair_meets_exactly_once(self):
        season = standard_season()
        fixtures = tl.generate_fixtures(season)
        pairs = [frozenset((f["home_id"], f["away_id"])) for f in fixtures]
        self.assertEqual(len(pairs), len(set(pairs)))
        self.assertEqual(tl.fixtures.duplicate_pairs(fixtures), [])

    def test_no_team_plays_itself(self):
        season = standard_season()
        for fixture in tl.generate_fixtures(season):
            self.assertNotEqual(fixture["home_id"], fixture["away_id"])

    def test_each_team_has_n_minus_one_fixtures(self):
        season = standard_season()
        fixtures = tl.generate_fixtures(season)
        for team in season["teams"]:
            appearances = sum(
                1
                for f in fixtures
                if team["id"] in (f["home_id"], f["away_id"])
            )
            self.assertEqual(appearances, 3)

    def test_fixture_ids_are_deterministic_and_sequential(self):
        first = tl.generate_fixtures(standard_season())
        second = tl.generate_fixtures(standard_season())
        self.assertEqual([f["id"] for f in first], [f"M{n:03d}" for n in range(1, 7)])
        self.assertEqual(first, second)

    def test_missing_teams_blocks_generation(self):
        season = tl.new_season()
        tl.register_team(season, "Alpha")
        tl.register_team(season, "Beta")
        with self.assertRaises(tl.ValidationError):
            tl.generate_fixtures(season)
        self.assertEqual(season["fixtures"], [])

    def test_second_generation_is_refused(self):
        season = standard_season()
        tl.generate_fixtures(season)
        with self.assertRaises(tl.ValidationError):
            tl.generate_fixtures(season)
        self.assertEqual(len(season["fixtures"]), 6)

    def test_new_fixtures_start_pending_without_scores(self):
        season = standard_season()
        for fixture in tl.generate_fixtures(season):
            self.assertEqual(fixture["status"], "pending")
            self.assertIsNone(fixture["home_score"])
            self.assertIsNone(fixture["away_score"])

    def test_regenerating_empty_season_is_allowed_explicitly(self):
        season = standard_season()
        tl.generate_fixtures(season)
        fixtures = tl.generate_fixtures(season, regenerate=True)
        self.assertEqual(len(fixtures), 6)

    def test_pair_key_rejects_a_team_playing_itself(self):
        with self.assertRaises(tl.ValidationError):
            tl.fixtures.pair_key("TM001", "TM001")

    def test_fixture_lookup_normalises_the_id(self):
        season = standard_season()
        tl.generate_fixtures(season)
        self.assertIsNotNone(tl.fixtures.find_fixture(season, " m002 "))
        self.assertIsNone(tl.fixtures.find_fixture(season, "M999"))


if __name__ == "__main__":
    unittest.main()
