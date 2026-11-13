"""End-to-end CLI behaviour against the real dataset and the offline provider."""

import os
import tempfile
import unittest

from helpers import DATASET, GOLD
from app.cli import VibeCheckApp
from app.provider import OfflineProvider


class ScriptedApp(VibeCheckApp):
    def __init__(self, answers, **kwargs):
        self.answers = list(answers)
        self.output = []
        kwargs.setdefault("provider", OfflineProvider())
        super().__init__(input_fn=self._answer, output_fn=self.output.append, **kwargs)

    def _answer(self, prompt=""):
        if not self.answers:
            raise EOFError
        return self.answers.pop(0)

    def text(self):
        return "\n".join(str(line) for line in self.output)


def temp_paths(tmpdir):
    return {
        "dataset": DATASET,
        "analyses": os.path.join(tmpdir, "analyses.json"),
        "cache": os.path.join(tmpdir, "cache.json"),
        "gold": GOLD,
    }


class TestImportAndAnalyse(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.paths = temp_paths(self.tmp.name)

    def test_import_then_list(self):
        app = ScriptedApp(["1", "", "2", "13"], paths=self.paths)
        app.run()
        self.assertIn("Imported 32 review(s)", app.text())
        self.assertIn("R001", app.text())
        self.assertIn("not analysed", app.text())

    def test_analyse_requires_an_explicit_yes(self):
        app = ScriptedApp(["1", "", "4", "no", "13"], paths=self.paths)
        app.run()
        self.assertIn("Cancelled", app.text())
        self.assertEqual(app.classifications, {})

    def test_analyse_verifies_and_stores_classifications(self):
        app = ScriptedApp(["1", "", "4", "yes", "13"], paths=self.paths)
        app.run()
        self.assertEqual(len(app.classifications), 32)
        self.assertEqual(app.errors, {})
        self.assertTrue(os.path.exists(self.paths["cache"]))

    def test_second_analyse_run_uses_the_cache(self):
        app = ScriptedApp(["1", "", "4", "yes", "13"], paths=self.paths)
        app.run()
        second = ScriptedApp(["1", "", "4", "yes", "13"], paths=self.paths)
        second.run()
        self.assertEqual(len(second.classifications), 32)
        self.assertIn("Cache hits 32", second.text())

    def test_report_labels_the_provider_honestly(self):
        app = ScriptedApp(["1", "", "4", "yes", "6", "13"], paths=self.paths)
        app.run()
        text = app.text()
        self.assertIn("NOT a live AI model", text)
        self.assertIn("Sentiment (share of analysed reviews)", text)
        self.assertIn("AI-derived", text)

    def test_show_one_review_with_provenance(self):
        app = ScriptedApp(["1", "", "4", "yes", "5", "R001", "13"], paths=self.paths)
        app.run()
        text = app.text()
        self.assertIn("R001", text)
        self.assertIn("provenance:", text)
        self.assertIn("evidence:", text)

    def test_unknown_review_id_is_reported(self):
        app = ScriptedApp(["1", "", "5", "R999", "13"], paths=self.paths)
        app.run()
        self.assertIn("No review with id 'R999'", app.text())

    def test_grounded_question_cites_supplied_records(self):
        app = ScriptedApp(["1", "", "4", "yes", "7", "Were the queues bad?", "13"],
                          paths=self.paths)
        app.run()
        text = app.text()
        self.assertIn("Sources:", text)
        self.assertIn("Status: answered", text)
        cited = app.output[-8:]
        self.assertTrue(any("Evidence retrieved:" in str(line) for line in cited))

    def test_question_without_evidence_abstains(self):
        app = ScriptedApp(["1", "", "7", "Who won the football league?", "13"],
                          paths=self.paths)
        app.run()
        self.assertIn("insufficient_evidence", app.text())

    def test_gold_evaluation_runs(self):
        app = ScriptedApp(["1", "", "4", "yes", "8", "13"], paths=self.paths)
        app.run()
        self.assertIn("Gold-set check", app.text())

    def test_status_shows_configuration_without_secrets(self):
        app = ScriptedApp(["3", "13"], paths=self.paths)
        app.run()
        text = app.text()
        self.assertIn("Provider:", text)
        self.assertIn("VIBECHECK_API_KEY", text)

    def test_unknown_menu_choice_is_handled(self):
        app = ScriptedApp(["42", "banana", "13"], paths=self.paths)
        app.run()
        self.assertEqual(app.text().count("Unknown choice"), 2)

    def test_eof_closes_cleanly(self):
        app = ScriptedApp([], paths=self.paths)
        app.run()
        self.assertIn("Closing VibeCheck AI", app.text())


class TestPersistence(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.paths = temp_paths(self.tmp.name)

    def test_save_then_load_round_trip(self):
        saver = ScriptedApp(["1", "", "4", "yes", "9", "13"], paths=self.paths)
        saver.run()
        self.assertTrue(os.path.exists(self.paths["analyses"]))

        loader = ScriptedApp(["1", "", "10", "6", "13"], paths=self.paths)
        loader.run()
        self.assertEqual(len(loader.classifications), 32)
        self.assertIn("Loaded 32 analysis(es)", loader.text())

    def test_stale_analysis_is_ignored_on_load(self):
        saver = ScriptedApp(["1", "", "4", "yes", "9", "13"], paths=self.paths)
        saver.run()

        # Simulate an edited review: same id, different text hash.
        from app.ingest import import_reviews

        loader = ScriptedApp(["10", "13"], paths=self.paths)
        reviews, _ = import_reviews(DATASET)
        edited = reviews[0]
        loader.reviews = [type(edited)(
            id=edited.id,
            event=edited.event,
            text="Completely rewritten review text about the sound system.",
            created_at=edited.created_at,
        )]
        loader.run()
        self.assertIn("stale", loader.text())
        self.assertEqual(loader.classifications, {})

    def test_save_with_nothing_analysed_is_a_no_op(self):
        app = ScriptedApp(["1", "", "9", "13"], paths=self.paths)
        app.run()
        self.assertIn("Nothing to save", app.text())

    def test_cache_status_is_reported(self):
        app = ScriptedApp(["1", "", "4", "yes", "11", "13"], paths=self.paths)
        app.run()
        self.assertIn("Cache:", app.text())

    def test_load_without_a_file_is_reported(self):
        app = ScriptedApp(["10", "13"], paths=self.paths)
        app.run()
        self.assertIn("No analyses file", app.text())


if __name__ == "__main__":
    unittest.main()
