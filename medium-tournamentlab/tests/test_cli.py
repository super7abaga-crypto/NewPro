"""CLI behaviour: dispatch, friendly errors, save/load, simulation guard."""

import os
import tempfile
import unittest

from helpers import standard_season, tl


class ScriptedCLI(tl.cli.LeagueCLI):
    """LeagueCLI with scripted input and captured output."""

    def __init__(self, answers, season=None, default_path="unused.json"):
        self.answers = list(answers)
        self.output = []
        super().__init__(
            season=season,
            input_fn=self._answer,
            output_fn=self.output.append,
            default_path=default_path,
        )

    def _answer(self, prompt=""):
        if not self.answers:
            raise EOFError
        return self.answers.pop(0)

    def text(self):
        return "\n".join(str(line) for line in self.output)


class TestCLIRegistrationFlow(unittest.TestCase):
    def test_register_then_list(self):
        cli = ScriptedCLI(["1", "Red Comets", "1", "Blue Wolves", "2", "11"])
        cli.run()
        self.assertIn("Registered TM001  Red Comets", cli.text())
        self.assertIn("TM002  Blue Wolves", cli.text())

    def test_duplicate_name_shows_a_refusal_and_the_menu_survives(self):
        cli = ScriptedCLI(["1", "Red Comets", "1", "red comets", "2", "11"])
        cli.run()
        self.assertIn("Refused", cli.text())
        self.assertIn("already registered", cli.text())
        self.assertEqual(len(cli.season["teams"]), 1)

    def test_unknown_menu_choice_does_not_crash(self):
        cli = ScriptedCLI(["99", "banana", "11"])
        cli.run()
        self.assertEqual(cli.text().count("Unknown choice"), 2)

    def test_eof_exits_cleanly(self):
        cli = ScriptedCLI([])
        cli.run()
        self.assertIn("Closing the league", cli.text())


class TestCLIFullFlow(unittest.TestCase):
    def test_register_generate_record_and_show_standings(self):
        cli = ScriptedCLI(
            [
                "1", "Red Comets",
                "1", "Blue Wolves",
                "1", "Green Vipers",
                "1", "Gold Bears",
                "3",
                "4",
                "5", "M001", "3", "1",
                "6",
                "11",
            ]
        )
        cli.run()
        text = cli.text()
        self.assertIn("Generated 6 fixtures", text)
        self.assertIn("Saved M001: 3-1", text)
        self.assertIn("STANDINGS IN PROGRESS", text)
        self.assertIn("Red Comets", text)

    def test_generating_a_schedule_twice_is_refused(self):
        cli = ScriptedCLI(
            ["1", "A1", "1", "B2", "1", "C3", "1", "D4", "3", "3", "11"]
        )
        cli.run()
        self.assertIn("already has a schedule", cli.text())

    def test_bad_score_is_refused_without_changing_the_fixture(self):
        cli = ScriptedCLI(
            ["1", "A1", "1", "B2", "1", "C3", "1", "D4", "3",
             "5", "M001", "-2", "1", "11"]
        )
        cli.run()
        self.assertIn("Refused", cli.text())
        fixture = tl.fixtures.find_fixture(cli.season, "M001")
        self.assertEqual(fixture["status"], "pending")

    def test_fixture_listing_requires_a_schedule(self):
        cli = ScriptedCLI(["4", "11"])
        cli.run()
        self.assertIn("No fixtures yet", cli.text())


class TestCLISimulation(unittest.TestCase):
    def test_simulation_requires_explicit_yes(self):
        cli = ScriptedCLI(
            ["1", "A1", "1", "B2", "1", "C3", "1", "D4", "3", "10", "no", "11"]
        )
        cli.run()
        self.assertIn("Cancelled", cli.text())
        self.assertTrue(
            all(f["status"] == "pending" for f in cli.season["fixtures"])
        )

    def test_simulation_fills_pending_fixtures_when_confirmed(self):
        cli = ScriptedCLI(
            ["1", "A1", "1", "B2", "1", "C3", "1", "D4", "3", "10", "yes", "42", "6", "11"]
        )
        cli.run()
        self.assertIn("Simulated 6 result(s) with seed 42", cli.text())
        self.assertTrue(all(f["status"] == "played" for f in cli.season["fixtures"]))
        self.assertIn("FINAL TABLE", cli.text())

    def test_simulation_with_nothing_pending_is_a_no_op(self):
        cli = ScriptedCLI(["10", "11"])
        cli.run()
        self.assertIn("Nothing to simulate", cli.text())


class TestCLISaveAndLoad(unittest.TestCase):
    def test_save_then_load_restores_the_table(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = os.path.join(tmp.name, "season.json")

        season = standard_season()
        tl.generate_fixtures(season)
        tl.record_result(season, "M001", 4, 0)

        saver = ScriptedCLI(["8", path, "11"], season=season, default_path=path)
        saver.run()
        self.assertIn("Saved to", saver.text())

        loader = ScriptedCLI(["9", path, "6", "11"], default_path=path)
        loader.run()
        self.assertIn("Loaded 4 teams and 6 fixtures", loader.text())
        self.assertEqual(
            tl.compute_standings(loader.season["teams"], loader.season["fixtures"]),
            tl.compute_standings(season["teams"], season["fixtures"]),
        )

    def test_save_uses_the_default_path_when_blank(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = os.path.join(tmp.name, "default.json")
        cli = ScriptedCLI(["8", "", "11"], season=standard_season(), default_path=path)
        cli.run()
        self.assertTrue(os.path.exists(path))


class TestCLIQuit(unittest.TestCase):
    def test_quit_stops_the_menu(self):
        cli = ScriptedCLI(["11", "2"])
        cli.run()
        self.assertFalse(cli.running)
        self.assertIn("Goodbye", cli.text())


if __name__ == "__main__":
    unittest.main()
