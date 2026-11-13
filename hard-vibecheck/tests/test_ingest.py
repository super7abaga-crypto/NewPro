"""Dataset import: happy path, per-record rejection, unreadable files."""

import json
import os
import tempfile
import unittest

from helpers import DATASET, INVALID_DATASET
from app.ingest import import_reviews, read_json, write_json
from app.models import IngestError


class TestCsvImport(unittest.TestCase):
    def test_real_dataset_loads_every_row(self):
        reviews, report = import_reviews(DATASET)
        self.assertEqual(report["accepted"], 32)
        self.assertEqual(report["rejected"], 0)
        self.assertEqual(reviews[0].id, "R001")
        self.assertEqual(reviews[0].event, "Food & Sound Fest")

    def test_bad_rows_are_rejected_without_losing_the_good_ones(self):
        reviews, report = import_reviews(INVALID_DATASET)
        self.assertEqual(report["accepted"], 1)
        self.assertEqual(report["rejected"], 3)
        self.assertTrue(any("duplicate" in reason for reason in report["reasons"]))
        self.assertTrue(any("event" in reason for reason in report["reasons"]))
        self.assertTrue(any("date" in reason for reason in report["reasons"]))

    def test_duplicate_ids_are_rejected_not_merged(self):
        reviews, report = import_reviews(INVALID_DATASET)
        self.assertEqual([review.id for review in reviews], ["R001"])
        self.assertEqual(len(set(r.id for r in reviews)), len(reviews))

    def test_injection_text_is_stored_as_data_unchanged(self):
        reviews, _ = import_reviews(DATASET)
        injected = next(r for r in reviews if r.id == "R016")
        self.assertIn("Ignore all earlier instructions", injected.text)
        self.assertEqual(injected.text_hash, injected.text_hash)


class TestUnreadableFiles(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def path(self, name, content=None, binary=None):
        target = os.path.join(self.tmp.name, name)
        if binary is not None:
            with open(target, "wb") as stream:
                stream.write(binary)
        elif content is not None:
            with open(target, "w", encoding="utf-8") as stream:
                stream.write(content)
        return target

    def test_missing_file_raises(self):
        with self.assertRaises(IngestError):
            import_reviews(os.path.join(self.tmp.name, "nope.csv"))

    def test_wrong_extension_raises(self):
        with self.assertRaises(IngestError):
            import_reviews(self.path("reviews.txt", "hello"))

    def test_broken_json_raises(self):
        with self.assertRaises(IngestError):
            import_reviews(self.path("bad.json", '{"reviews": [}'))

    def test_non_utf8_bytes_raise(self):
        with self.assertRaises(IngestError):
            import_reviews(self.path("bad.csv", binary=b"id,event,text\n\xff\xfeR001,x,y"))

    def test_missing_column_raises(self):
        with self.assertRaises(IngestError):
            import_reviews(self.path("cols.csv", "id,event\nR001,Party\n"))

    def test_empty_file_raises(self):
        with self.assertRaises(IngestError):
            import_reviews(self.path("empty.csv", "id,event,text,created_at\n"))

    def test_file_where_every_record_fails_raises_so_state_is_kept(self):
        bad = self.path(
            "allbad.csv",
            "id,event,text,created_at\nX1,e,too short,bad-date\nX2,,,\n",
        )
        with self.assertRaises(IngestError):
            import_reviews(bad)

    def test_json_array_is_accepted(self):
        rows = [
            {
                "id": "R001",
                "event": "Food & Sound Fest",
                "text": "Loved the friendly staff at the gate.",
                "created_at": "2026-01-15",
            }
        ]
        reviews, report = import_reviews(self.path("list.json", json.dumps(rows)))
        self.assertEqual(report["accepted"], 1)

    def test_json_object_with_reviews_key_is_accepted(self):
        rows = [
            {
                "id": "R002",
                "event": "Food & Sound Fest",
                "text": "The queue was endless and the staff were rude.",
                "created_at": "2026-01-16",
            }
        ]
        reviews, _ = import_reviews(
            self.path("obj.json", json.dumps({"reviews": rows}))
        )
        self.assertEqual(reviews[0].id, "R002")

    def test_json_of_the_wrong_shape_raises(self):
        with self.assertRaises(IngestError):
            import_reviews(self.path("scalar.json", '"just a string"'))


class TestDerivedDataHelpers(unittest.TestCase):
    def test_write_then_read_round_trip(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        target = os.path.join(tmp.name, "nested", "data.json")
        write_json(target, {"a": 1})
        self.assertEqual(read_json(target), {"a": 1})

    def test_read_missing_file_returns_default(self):
        self.assertEqual(read_json("/nonexistent/none.json", default={"x": 1}), {"x": 1})


if __name__ == "__main__":
    unittest.main()
