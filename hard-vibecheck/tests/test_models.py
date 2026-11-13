"""Review validation and the classification record."""

import unittest

from helpers import review  # noqa: F401  (importing helpers sets sys.path)
from app.models import Classification, ModelOutputError, RecordError, Review


class TestReviewValidation(unittest.TestCase):
    def good(self, **overrides):
        raw = {
            "id": "R001",
            "event": "Food & Sound Fest",
            "text": "The queues were far too long at the gate.",
            "created_at": "2026-01-15",
        }
        raw.update(overrides)
        return raw

    def test_valid_record_is_accepted_and_stripped(self):
        record = Review.from_dict(self.good(id=" R001 ", text="  short but fine  "))
        self.assertEqual(record.id, "R001")
        self.assertEqual(record.text, "short but fine")

    def test_missing_field_is_rejected(self):
        raw = self.good()
        del raw["text"]
        with self.assertRaises(RecordError):
            Review.from_dict(raw)

    def test_bad_id_shape_is_rejected(self):
        for bad in ("X001", "R1", "RABC", "", 42):
            with self.assertRaises(RecordError):
                Review.from_dict(self.good(id=bad))

    def test_text_that_is_too_short_or_too_long_is_rejected(self):
        with self.assertRaises(RecordError):
            Review.from_dict(self.good(text="ok"))
        with self.assertRaises(RecordError):
            Review.from_dict(self.good(text="x" * 501))

    def test_blank_event_is_rejected(self):
        with self.assertRaises(RecordError):
            Review.from_dict(self.good(event="   "))

    def test_impossible_date_is_rejected(self):
        for bad in ("2026-13-45", "15/01/2026", "2026-1-5", ""):
            with self.assertRaises(RecordError):
                Review.from_dict(self.good(created_at=bad))

    def test_non_object_row_is_rejected(self):
        with self.assertRaises(RecordError):
            Review.from_dict(["R001", "event"])

    def test_text_hash_changes_when_the_text_changes(self):
        first = review("The queue was slow.")
        second = review("The queue was very slow.")
        self.assertNotEqual(first.text_hash, second.text_hash)
        self.assertEqual(first.text_hash, review("The queue was slow.").text_hash)


class TestClassificationRecord(unittest.TestCase):
    def raw(self, **overrides):
        base = {
            "review_id": "R001",
            "sentiment": "mixed",
            "topics": ["queue", "sound"],
            "evidence_quote": "queues were too long",
            "short_reason": "Praise and complaint together.",
            "source_hash": "abc123",
        }
        base.update(overrides)
        return base

    def test_round_trip_through_dict(self):
        original = Classification(
            review_id="R001",
            sentiment="mixed",
            topics=["queue"],
            evidence_quote="queues were too long",
            short_reason="Mixed.",
            source_hash="abc",
        )
        restored = Classification.from_dict(original.to_dict())
        self.assertEqual(restored.sentiment, "mixed")
        self.assertEqual(restored.topics, ["queue"])

    def test_unknown_sentiment_in_stored_data_is_rejected(self):
        with self.assertRaises(ModelOutputError):
            Classification.from_dict(self.raw(sentiment="wonderful"))

    def test_unknown_topic_in_stored_data_is_rejected(self):
        with self.assertRaises(ModelOutputError):
            Classification.from_dict(self.raw(topics=["vibes"]))


if __name__ == "__main__":
    unittest.main()
