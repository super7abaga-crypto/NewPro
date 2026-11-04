import unittest

from game import (
    create_player,
    move_player,
    collect_item,
    light_lighthouse
)


class TestMysteryIsland(unittest.TestCase):

    def setUp(self):
        self.player = create_player("Myles")

    def test_initial_player_state(self):
        self.assertEqual(self.player["name"], "Myles")
        self.assertEqual(self.player["energy"], 5)
        self.assertEqual(self.player["location"], "Beach")
        self.assertEqual(self.player["inventory"], [])
        self.assertFalse(self.player["game_over"])
        self.assertFalse(self.player["won"])

    def test_invalid_destination(self):
        result, message = move_player(self.player, "Airport")

        self.assertFalse(result)
        self.assertEqual(self.player["location"], "Beach")
        self.assertEqual(self.player["energy"], 5)

    def test_successful_movement(self):
        result, message = move_player(self.player, "Jungle")

        self.assertTrue(result)
        self.assertEqual(self.player["location"], "Jungle")
        self.assertEqual(self.player["energy"], 4)

    def test_non_adjacent_movement(self):
        result, message = move_player(self.player, "Cave")

        self.assertFalse(result)
        self.assertEqual(self.player["location"], "Beach")
        self.assertEqual(self.player["energy"], 5)

    def test_collect_rope_once(self):
        result, message = collect_item(self.player, "Rope")

        self.assertTrue(result)
        self.assertIn("Rope", self.player["inventory"])

        result, message = collect_item(self.player, "Rope")

        self.assertFalse(result)
        self.assertEqual(self.player["inventory"].count("Rope"), 1)

    def test_cannot_collect_rope_outside_beach(self):
        self.player["location"] = "Jungle"

        result, message = collect_item(self.player, "Rope")

        self.assertFalse(result)
        self.assertNotIn("Rope", self.player["inventory"])

    def test_bridge_requires_rope(self):
        self.player["location"] = "Cave"

        result, message = move_player(self.player, "Old Bridge")

        self.assertFalse(result)
        self.assertEqual(self.player["location"], "Cave")
        self.assertEqual(self.player["energy"], 5)

    def test_lighthouse_requires_lantern(self):
        self.player["location"] = "Lighthouse"

        result, message = light_lighthouse(self.player)

        self.assertFalse(result)
        self.assertFalse(self.player["won"])

    def test_successful_lighthouse_completion(self):
        self.player["location"] = "Lighthouse"
        self.player["inventory"].append("Lantern")

        result, message = light_lighthouse(self.player)

        self.assertTrue(result)
        self.assertTrue(self.player["won"])
        self.assertTrue(self.player["game_over"])

    def test_energy_exhaustion(self):
        self.player["energy"] = 1

        result, message = move_player(self.player, "Jungle")

        self.assertTrue(result)
        self.assertEqual(self.player["energy"], 0)
        self.assertTrue(self.player["game_over"])

    def test_cannot_move_after_game_over(self):
        self.player["game_over"] = True

        result, message = move_player(self.player, "Jungle")

        self.assertFalse(result)
        self.assertEqual(self.player["location"], "Beach")
        self.assertEqual(self.player["energy"], 5)

    def test_new_player_starts_with_fresh_inventory(self):
        collect_item(self.player, "Rope")

        new_player = create_player("New Player")

        self.assertEqual(new_player["inventory"], [])
        self.assertEqual(new_player["energy"], 5)


if __name__ == "__main__":
    unittest.main()