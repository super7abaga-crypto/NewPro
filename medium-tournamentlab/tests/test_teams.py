"""Team registration rules: trimming, length, uniqueness, capacity, ids."""

import unittest

from helpers import season_with, tl


class TestTeamRegistration(unittest.TestCase):
    def test_registers_a_team_with_a_clean_display_name(self):
        season = tl.new_season()
        team = tl.register_team(season, "  Red   Comets  ")
        self.assertEqual(team["name"], "Red Comets")
        self.assertEqual(team["id"], "TM001")
        self.assertEqual(len(season["teams"]), 1)

    def test_duplicate_name_with_different_spacing_and_case_is_rejected(self):
        season = season_with("Red Comets")
        with self.assertRaises(tl.DuplicateTeamError):
            tl.register_team(season, "  red comets ")
        with self.assertRaises(tl.DuplicateTeamError):
            tl.register_team(season, "RED COMETS")
        self.assertEqual(len(season["teams"]), 1)

    def test_names_shorter_than_two_characters_are_rejected(self):
        season = tl.new_season()
        for bad in ("", "   ", "A"):
            with self.assertRaises(tl.ValidationError):
                tl.register_team(season, bad)
        self.assertEqual(season["teams"], [])

    def test_names_longer_than_thirty_characters_are_rejected(self):
        season = tl.new_season()
        with self.assertRaises(tl.ValidationError):
            tl.register_team(season, "X" * 31)
        self.assertEqual(len(tl.register_team(season, "X" * 30)["name"]), 30)

    def test_non_text_name_is_rejected(self):
        season = tl.new_season()
        with self.assertRaises(tl.ValidationError):
            tl.register_team(season, None)

    def test_ninth_team_is_rejected(self):
        season = season_with(*[f"Team {n}" for n in range(1, 9)])
        self.assertEqual(len(season["teams"]), 8)
        with self.assertRaises(tl.ValidationError):
            tl.register_team(season, "Team 9")

    def test_ids_are_stable_and_never_reused(self):
        season = season_with("Alpha", "Beta", "Gamma")
        ids = [team["id"] for team in season["teams"]]
        self.assertEqual(ids, ["TM001", "TM002", "TM003"])
        # Renaming keeps the id, so fixtures stay attached.
        season["teams"][0]["name"] = "Alpha Renamed"
        self.assertEqual(tl.find_team(season, "TM001")["name"], "Alpha Renamed")

    def test_unknown_team_lookup_raises(self):
        season = season_with("Alpha", "Beta")
        with self.assertRaises(tl.NotFoundError):
            tl.find_team(season, "TM999")

    def test_list_teams_returns_registration_order(self):
        season = season_with("Zebra", "Ant", "Mole")
        names = [team["name"] for team in tl.list_teams(season)]
        self.assertEqual(names, ["Zebra", "Ant", "Mole"])


if __name__ == "__main__":
    unittest.main()
