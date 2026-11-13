"""Acceptance tests for Mystery Island: The Lost Lighthouse.

Run from the project root:
    python -m unittest discover -s tests -v
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import game  # noqa: E402


def play(player, *actions):
    """Apply a list of actions and return the player, for readable tests."""
    for action in actions:
        game.apply_action(player, action)
    return player


class TestNewGame(unittest.TestCase):
    def test_T1_new_game_starts_at_beach_with_five_energy_and_empty_pockets(self):
        player = game.new_game("Ada")
        self.assertEqual(player["name"], "Ada")
        self.assertEqual(player["location"], "Beach")
        self.assertEqual(player["energy"], 5)
        self.assertEqual(player["inventory"], [])
        self.assertFalse(player["game_over"])
        self.assertFalse(player["won"])

    def test_T1b_blank_name_falls_back_to_player(self):
        self.assertEqual(game.new_game("   ")["name"], "Player")


class TestInvalidInput(unittest.TestCase):
    def test_T2_unknown_command_leaves_state_unchanged(self):
        player = game.new_game("Ada")
        before = dict(player)
        message = game.apply_action(player, "banana")
        self.assertEqual(player, before)
        self.assertIn("don't understand", message)

    def test_T2b_blank_and_noisy_input_does_not_crash(self):
        player = game.new_game("Ada")
        for junk in ("", "   ", "1 2 3", "EXIT  NOW", "go", "take", None, 42):
            game.apply_action(player, junk)
        # 'exit now' is not a command; nothing should have ended the game.
        self.assertFalse(player["game_over"])
        self.assertEqual(player["turns"], 0)

    def test_T2c_state_is_unchanged_after_rejected_input(self):
        player = game.new_game("Ada")
        game.apply_action(player, "go north")
        snapshot = dict(player, inventory=list(player["inventory"]))
        game.apply_action(player, "go sideways")
        self.assertEqual(player, snapshot)


class TestMovementAndEnergy(unittest.TestCase):
    def test_T3_legal_move_changes_location_and_costs_exactly_one_energy(self):
        player = game.new_game("Ada")
        game.apply_action(player, "go north")
        self.assertEqual(player["location"], "Jungle")
        self.assertEqual(player["energy"], 4)
        self.assertEqual(player["turns"], 1)

    def test_T4_wrong_direction_is_rejected_without_cost(self):
        player = game.new_game("Ada")
        game.apply_action(player, "go north")
        game.apply_action(player, "go north")  # Beach -> Jungle -> Cave, energy 3
        energy = player["energy"]
        game.apply_action(player, "go west")  # Cave has no west exit
        self.assertEqual(player["location"], "Cave")
        self.assertEqual(player["energy"], energy)

    def test_moves_are_case_and_space_insensitive(self):
        player = game.new_game("Ada")
        game.apply_action(player, "  GO   NORTH  ")
        self.assertEqual(player["location"], "Jungle")


class TestInventory(unittest.TestCase):
    def test_T5_rope_can_be_collected_once_only(self):
        player = play(game.new_game("Ada"), "go north", "take rope")
        self.assertIn("rope", player["inventory"])
        game.apply_action(player, "take rope")
        self.assertEqual(player["inventory"].count("rope"), 1)

    def test_T5b_item_cannot_be_taken_from_the_wrong_location(self):
        player = game.new_game("Ada")
        message = game.apply_action(player, "take lantern")
        self.assertNotIn("lantern", player["inventory"])
        self.assertIn("no lantern here", message)

    def test_T5c_unknown_item_is_reported_not_crashed(self):
        player = game.new_game("Ada")
        self.assertIn("no 'sword'", game.apply_action(player, "take sword"))


class TestPuzzles(unittest.TestCase):
    def test_T6_bridge_cannot_be_crossed_without_rope(self):
        player = play(game.new_game("Ada"), "go north", "go north", "go east")
        self.assertEqual(player["location"], "Old Bridge")
        energy = player["energy"]
        message = game.apply_action(player, "go north")
        self.assertEqual(player["location"], "Old Bridge")
        self.assertEqual(player["energy"], energy)
        self.assertIn("rope", message)

    def test_T6b_can_cross_bridge_reports_the_rule(self):
        self.assertTrue(game.can_cross_bridge(["rope"]))
        self.assertFalse(game.can_cross_bridge([]))
        self.assertFalse(game.can_cross_bridge(["lantern"]))
        self.assertFalse(game.can_cross_bridge("rope"))  # a string is not a list

    def test_T7_beacon_cannot_be_lit_without_lantern(self):
        player = play(game.new_game("Ada"), "go north", "take rope", "go north",
                       "go east", "go north")
        self.assertEqual(player["location"], "Lighthouse")
        game.apply_action(player, "light beacon")
        self.assertFalse(player["won"])
        self.assertFalse(player["game_over"])

    def test_T8_winning_path_with_rope_and_lantern(self):
        player = play(
            game.new_game("Ada"),
            "go north",     # Jungle, energy 4
            "take rope",
            "go north",     # Cave, energy 3
            "take lantern",
            "go east",      # Old Bridge, energy 2
            "go north",     # Lighthouse, energy 1
            "light beacon",
        )
        self.assertTrue(player["won"])
        self.assertTrue(player["game_over"])
        self.assertEqual(player["energy"], 1)
        self.assertIn("beacon catches", game.outcome_text(player))

    def test_T9_energy_exhaustion_causes_loss(self):
        player = game.new_game("Ada")
        player["energy"] = 1
        game.apply_action(player, "go north")
        self.assertEqual(player["energy"], 0)
        self.assertTrue(game.is_over(player))
        self.assertTrue(game.is_lost(player))
        self.assertFalse(player["won"])
        self.assertIn("ran out of energy", game.outcome_text(player))

    def test_energy_never_goes_negative(self):
        player = game.new_game("Ada")
        player["energy"] = 1
        play(player, "go north", "go north", "go east", "go north")
        self.assertEqual(player["energy"], 0)
        self.assertGreaterEqual(player["energy"], 0)

    def test_player_cannot_move_after_game_over(self):
        player = game.new_game("Ada")
        player["energy"] = 1
        game.apply_action(player, "go north")
        location = player["location"]
        game.apply_action(player, "go north")
        self.assertEqual(player["location"], location)


class TestLosingChoices(unittest.TestCase):
    def test_calling_for_help_loses_the_game(self):
        player = play(game.new_game("Ada"), "go north", "take rope", "go north",
                      "take lantern", "go east", "go north", "call for help")
        self.assertTrue(game.is_over(player))
        self.assertFalse(player["won"])

    def test_swimming_too_tired_drowns(self):
        player = play(game.new_game("Ada"), "go north", "go north", "go east")
        self.assertEqual(player["energy"], 2)
        game.apply_action(player, "swim")
        self.assertEqual(player["energy"], 0)
        self.assertTrue(game.is_over(player))

    def test_swimming_with_energy_crosses_without_rope(self):
        player = play(game.new_game("Ada"), "go north", "take rope", "go north",
                      "take lantern", "go east", "rest")  # rest refused: not on the beach
        player["energy"] = 5
        game.apply_action(player, "swim")
        self.assertEqual(player["location"], "Lighthouse")
        self.assertEqual(player["energy"], 2)


class TestRest(unittest.TestCase):
    def test_rest_restores_two_energy_once(self):
        player = game.new_game("Ada")
        player["energy"] = 2
        game.apply_action(player, "rest")
        self.assertEqual(player["energy"], 4)
        game.apply_action(player, "rest")
        self.assertEqual(player["energy"], 4)

    def test_rest_cannot_exceed_maximum(self):
        player = game.new_game("Ada")
        game.apply_action(player, "rest")
        self.assertEqual(player["energy"], game.MAX_ENERGY)

    def test_rest_only_works_on_the_beach(self):
        player = play(game.new_game("Ada"), "go north")
        message = game.apply_action(player, "rest")
        self.assertIn("no safe place", message)
        self.assertEqual(player["energy"], 4)


class TestReplay(unittest.TestCase):
    def test_T10_replay_resets_energy_location_and_inventory(self):
        finished = play(game.new_game("Ada"), "go north", "take rope", "go north",
                        "take lantern", "go east", "go north", "light beacon")
        fresh = game.new_game("Ada")
        self.assertTrue(finished["won"])
        self.assertEqual(fresh["energy"], 5)
        self.assertEqual(fresh["location"], "Beach")
        self.assertEqual(fresh["inventory"], [])
        self.assertIsNot(fresh["inventory"], finished["inventory"])

    def test_fresh_inventory_is_a_new_object(self):
        first = game.new_game("Ada")
        first["inventory"].append("rope")
        second = game.new_game("Ada")
        self.assertEqual(second["inventory"], [])


class TestMenu(unittest.TestCase):
    def test_menu_lists_reachable_locations_and_quit(self):
        player = game.new_game("Ada")
        labels = [entry["label"] for entry in game.available_actions(player)]
        self.assertTrue(any("Jungle" in label for label in labels))
        self.assertIn("Quit", labels)

    def test_menu_offers_the_rope_where_it_lies(self):
        player = play(game.new_game("Ada"), "go north")
        actions = game.available_actions(player)
        self.assertIn("take rope", [entry["action"] for entry in actions])

    def test_menu_is_empty_after_game_over(self):
        player = game.new_game("Ada")
        game.apply_action(player, "quit")
        self.assertEqual(game.available_actions(player), [])

    def test_every_menu_key_maps_to_a_key_of_its_own(self):
        player = play(game.new_game("Ada"), "go north", "go north", "go east")
        keys = [entry["key"] for entry in game.available_actions(player)]
        self.assertEqual(keys, [str(n) for n in range(1, len(keys) + 1)])

    def test_menu_actions_do_not_mutate_the_player(self):
        player = game.new_game("Ada")
        snapshot = dict(player, inventory=list(player["inventory"]))
        game.available_actions(player)
        game.describe_location(player)
        self.assertEqual(player, snapshot)


if __name__ == "__main__":
    unittest.main(verbosity=2)
