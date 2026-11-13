"""JSON persistence: round trip, tempfiles, and rejection of broken data."""

import json
import os
import tempfile
import unittest

from helpers import fixture_between, standard_season, tl


def full_season():
    season = standard_season()
    tl.generate_fixtures(season)
    tl.record_result(season, "M001", 2, 1)
    tl.record_result(season, "M002", 0, 0)
    return season


class TestRoundTrip(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = os.path.join(self.tmp.name, "season.json")

    def test_save_then_load_preserves_teams_fixtures_and_standings(self):
        season = full_season()
        tl.save_season(self.path, season)
        loaded = tl.load_season(self.path)

        self.assertEqual(loaded["teams"], season["teams"])
        self.assertEqual(loaded["fixtures"], season["fixtures"])
        self.assertEqual(
            tl.compute_standings(loaded["teams"], loaded["fixtures"]),
            tl.compute_standings(season["teams"], season["fixtures"]),
        )

    def test_saved_file_carries_a_schema_version(self):
        tl.save_season(self.path, full_season())
        with open(self.path, encoding="utf-8") as stream:
            data = json.load(stream)
        self.assertEqual(data["schema_version"], 1)

    def test_save_creates_missing_directories(self):
        nested = os.path.join(self.tmp.name, "a", "b", "season.json")
        tl.save_season(nested, full_season())
        self.assertTrue(os.path.exists(nested))

    def test_saving_does_not_leave_temporary_files_behind(self):
        tl.save_season(self.path, full_season())
        leftovers = [name for name in os.listdir(self.tmp.name) if name.endswith(".tmp")]
        self.assertEqual(leftovers, [])

    def test_missing_file_is_reported_clearly(self):
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(os.path.join(self.tmp.name, "nothing.json"))

    def test_malformed_json_is_rejected(self):
        with open(self.path, "w", encoding="utf-8") as stream:
            stream.write('{"teams": [},')
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.path)

    def test_season_load_accepts_a_loaded_season_again(self):
        tl.save_season(self.path, full_season())
        once = tl.load_season(self.path)
        tl.save_season(self.path, once)
        twice = tl.load_season(self.path)
        self.assertEqual(once, twice)


class TestValidationOnLoad(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = os.path.join(self.tmp.name, "bad.json")
        self.good = json.loads(json.dumps(tl.storage.season_to_dict(full_season())))

    def write(self, data):
        with open(self.path, "w", encoding="utf-8") as stream:
            json.dump(data, stream)
        return self.path

    def test_wrong_schema_version_is_rejected(self):
        self.good["schema_version"] = 99
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.write(self.good))

    def test_missing_key_is_rejected(self):
        del self.good["fixtures"]
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.write(self.good))

    def test_fixture_pointing_at_an_unknown_team_is_rejected(self):
        self.good["fixtures"][0]["away_id"] = "TM999"
        with self.assertRaises(tl.InvalidSeasonError) as caught:
            tl.load_season(self.write(self.good))
        self.assertIn("unknown team", str(caught.exception))

    def test_duplicate_team_name_is_rejected_case_insensitively(self):
        self.good["teams"][1]["name"] = self.good["teams"][0]["name"].upper()
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.write(self.good))

    def test_duplicate_team_id_is_rejected(self):
        self.good["teams"][1]["id"] = self.good["teams"][0]["id"]
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.write(self.good))

    def test_duplicate_fixture_id_is_rejected(self):
        self.good["fixtures"][1]["id"] = self.good["fixtures"][0]["id"]
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.write(self.good))

    def test_repeated_pairing_is_rejected(self):
        extra = dict(self.good["fixtures"][0])
        extra["id"] = "M900"
        extra["home_id"], extra["away_id"] = extra["away_id"], extra["home_id"]
        self.good["fixtures"].append(extra)
        with self.assertRaises(tl.InvalidSeasonError) as caught:
            tl.load_season(self.write(self.good))
        self.assertIn("more than once", str(caught.exception))

    def test_played_fixture_without_integer_score_is_rejected(self):
        self.good["fixtures"][0]["status"] = "played"
        self.good["fixtures"][0]["home_score"] = None
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.write(self.good))

    def test_boolean_score_is_rejected(self):
        self.good["fixtures"][0]["status"] = "played"
        self.good["fixtures"][0]["home_score"] = True
        self.good["fixtures"][0]["away_score"] = 0
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.write(self.good))

    def test_pending_fixture_carrying_scores_is_rejected(self):
        pending = next(f for f in self.good["fixtures"] if f["status"] == "pending")
        pending["home_score"] = 1
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.write(self.good))

    def test_unknown_status_is_rejected(self):
        self.good["fixtures"][0]["status"] = "postponed"
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.write(self.good))

    def test_negative_score_is_rejected(self):
        self.good["fixtures"][0]["status"] = "played"
        self.good["fixtures"][0]["home_score"] = -1
        self.good["fixtures"][0]["away_score"] = 0
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.write(self.good))

    def test_fixture_with_same_team_twice_is_rejected(self):
        self.good["fixtures"][0]["away_id"] = self.good["fixtures"][0]["home_id"]
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.write(self.good))

    def test_too_many_teams_is_rejected(self):
        for index in range(5, 10):
            self.good["teams"].append({"id": f"TM{index:03d}", "name": f"Extra {index}"})
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.write(self.good))

    def test_one_character_name_is_rejected(self):
        self.good["teams"][0]["name"] = "X"
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.write(self.good))

    def test_top_level_list_is_rejected(self):
        with self.assertRaises(tl.InvalidSeasonError):
            tl.load_season(self.write([]))


class TestStateIsSafeOnFailedLoad(unittest.TestCase):
    def test_cli_keeps_the_current_season_when_a_load_fails(self):
        season = full_season()
        before = json.loads(json.dumps(season))
        inputs = iter(["9", "missing-file.json", "11"])
        cli = tl.cli.LeagueCLI(season=season, input_fn=lambda _: next(inputs),
                               output_fn=lambda *_: None)
        cli.run()
        self.assertEqual(season, before)


if __name__ == "__main__":
    unittest.main()
