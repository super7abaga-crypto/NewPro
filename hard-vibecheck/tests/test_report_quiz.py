"""Statistics, gold-set evaluation and the Engineering Self-Check."""

import copy
import unittest

from helpers import DATASET, GOLD
from app.classify import classify_review
from app.ingest import import_reviews, read_json
from app.models import Classification, SENTIMENTS
from app.provider import OfflineProvider
from app.quiz import (
    MCQ_QUESTIONS,
    WRITTEN_QUESTIONS,
    all_questions,
    is_acceptable_written,
    parse_mcq_answer,
    run_quiz,
    score_quiz,
)
from app.report import (
    build_report,
    evaluate_against_gold,
    format_report,
    percentage,
)


def analyse(reviews):
    offline = OfflineProvider()
    return {item.id: classify_review(item, offline) for item in reviews}


class TestReport(unittest.TestCase):
    def setUp(self):
        self.reviews, _ = import_reviews(DATASET)
        self.classifications = analyse(self.reviews)
        self.report = build_report(self.reviews, self.classifications)

    def test_every_review_is_counted_exactly_once(self):
        self.assertEqual(self.report["total_reviews"], 32)
        self.assertEqual(self.report["analysed"], 32)
        total = sum(self.report["sentiment"][s]["count"] for s in SENTIMENTS)
        self.assertEqual(total, self.report["analysed"])

    def test_percentages_add_up_to_one_hundred(self):
        total = sum(self.report["sentiment"][s]["percent_of_analysed"] for s in SENTIMENTS)
        self.assertAlmostEqual(total, 100.0, places=0)

    def test_report_labels_are_marked_ai_derived(self):
        self.assertTrue(self.report["labels_are_ai_derived"])
        self.assertIn("AI-derived", format_report(self.report, "offline"))

    def test_unanalysed_reviews_are_separate_from_labels(self):
        partial = dict(self.classifications)
        removed = next(iter(partial))
        partial.pop(removed)
        report = build_report(self.reviews, partial)
        self.assertEqual(report["analysed"], 31)
        self.assertIn(removed, report["unanalysed"])
        self.assertEqual(sum(report["sentiment"][s]["count"] for s in SENTIMENTS), 31)

    def test_rejected_outputs_are_listed_and_not_counted(self):
        partial = dict(self.classifications)
        errors = {"R005": "ModelOutputError: invented quote"}
        partial.pop("R005")
        report = build_report(self.reviews, partial, errors)
        self.assertIn("R005", report["invalid"])
        self.assertEqual(report["analysed"], 31)

    def test_zero_denominator_gives_zero_percent(self):
        report = build_report(self.reviews, {})
        self.assertEqual(report["analysed"], 0)
        for sentiment in SENTIMENTS:
            self.assertEqual(report["sentiment"][sentiment]["percent_of_analysed"], 0.0)
        self.assertEqual(percentage(3, 0), 0.0)

    def test_topic_counts_only_use_verified_labels(self):
        report = build_report(self.reviews, self.classifications)
        self.assertGreater(sum(report["topics"].values()), 0)
        self.assertTrue(all(topic in report["topics"] for topic in ("sound", "food", "queue")))

    def test_event_breakdown_covers_the_dataset(self):
        report = build_report(self.reviews, self.classifications)
        self.assertIn("Food & Sound Fest", report["by_event"])
        self.assertEqual(report["by_event"]["Food & Sound Fest"]["reviews"], 32)

    def test_quotes_in_the_report_come_from_their_own_review(self):
        by_id = {item.id: item for item in self.reviews}
        for quote in self.report["quotes"]:
            self.assertIn(quote["quote"], by_id[quote["review_id"]].text)


class TestGoldEvaluation(unittest.TestCase):
    def test_agreement_is_computed_from_the_hand_labels(self):
        reviews, _ = import_reviews(DATASET)
        classifications = analyse(reviews)
        gold = read_json(GOLD)
        evaluation = evaluate_against_gold(reviews, classifications, gold)
        self.assertEqual(evaluation["gold_size"], 12)
        self.assertEqual(evaluation["compared"], 12)
        self.assertGreaterEqual(evaluation["accuracy_percent"], 0)
        self.assertLessEqual(evaluation["accuracy_percent"], 100)

    def test_disagreements_are_listed_with_both_labels(self):
        reviews, _ = import_reviews(DATASET)
        classifications = analyse(reviews)
        gold = {reviews[0].id: "positive" if classifications[reviews[0].id].sentiment != "positive"
                else "negative"}
        evaluation = evaluate_against_gold(reviews, classifications, gold)
        self.assertEqual(evaluation["compared"], 1)
        self.assertEqual(evaluation["agreed"], 0)
        self.assertEqual(len(evaluation["disagreements"]), 1)

    def test_missing_analyses_are_reported_not_counted(self):
        reviews, _ = import_reviews(DATASET)
        evaluation = evaluate_against_gold(reviews, {}, {"R001": "mixed"})
        self.assertEqual(evaluation["compared"], 0)
        self.assertEqual(evaluation["missing"], ["R001"])


class TestQuizValidation(unittest.TestCase):
    def test_numeric_answer_is_accepted(self):
        self.assertEqual(parse_mcq_answer("2", 4), 1)

    def test_letter_answer_is_accepted(self):
        self.assertEqual(parse_mcq_answer("c", 4), 2)

    def test_out_of_range_answer_is_rejected(self):
        for bad in ("0", "5", "-1"):
            with self.assertRaises(ValueError):
                parse_mcq_answer(bad, 4)

    def test_junk_answer_is_rejected(self):
        for bad in ("", "banana", "1 2"):
            with self.assertRaises(ValueError):
                parse_mcq_answer(bad, 4)

    def test_written_answer_needs_real_words(self):
        self.assertFalse(is_acceptable_written(""))
        self.assertFalse(is_acceptable_written("ok"))
        self.assertFalse(is_acceptable_written("??? !!! 123"))
        self.assertTrue(
            is_acceptable_written("A quote that is invented would fool a careless reader.")
        )


class TestQuizScoring(unittest.TestCase):
    def scripted(self, answer_for_mcq="1", written="Because evidence must be auditable by a reader."):
        answers = []
        for _ in MCQ_QUESTIONS:
            answers.append(answer_for_mcq)
        for _ in WRITTEN_QUESTIONS:
            answers.append(written)
        return iter(answers)

    def test_all_correct_answers_score_full_marks(self):
        correct_answers = []
        for question in MCQ_QUESTIONS:
            correct_answers.append(str(question["answer"] + 1))
        rewritten = iter(correct_answers + ["A real sentence explaining the reasoning clearly here."] *
                         len(WRITTEN_QUESTIONS))
        output = []
        result = run_quiz(input_fn=lambda _: next(rewritten), output_fn=output.append)
        self.assertEqual(result["mcq_correct"], len(MCQ_QUESTIONS))
        self.assertEqual(result["score_percent"], 100.0)

    def test_wrong_answers_are_scored_as_wrong(self):
        output = []
        answers = [
            str((question["answer"] + 1) % len(question["options"]) + 1)
            for question in MCQ_QUESTIONS
        ] + ["A real sentence explaining the reasoning clearly here."] * len(WRITTEN_QUESTIONS)
        script = iter(answers)
        result = run_quiz(input_fn=lambda _: next(script), output_fn=output.append)
        self.assertEqual(result["mcq_correct"], 0)
        self.assertEqual(result["score_percent"], 0.0)

    def test_written_answers_are_pending_review_not_auto_marked(self):
        script = self.scripted()
        result = run_quiz(input_fn=lambda _: next(script), output_fn=lambda *_: None)
        self.assertEqual(result["written_submitted"], len(WRITTEN_QUESTIONS))
        self.assertIn("never auto-marked", result["note"])
        self.assertTrue(result["written_answers"])

    def test_invalid_input_is_reasked_then_recorded_as_skipped(self):
        answers = ["banana"] * (3 * len(MCQ_QUESTIONS)) + ["x"] * (3 * len(WRITTEN_QUESTIONS))
        script = iter(answers)
        result = run_quiz(input_fn=lambda _: next(script), output_fn=lambda *_: None,
                          max_attempts=3)
        self.assertEqual(result["mcq_correct"], 0)
        self.assertEqual(result["written_submitted"], 0)

    def test_quiz_question_bank_meets_the_requirement(self):
        self.assertGreaterEqual(len(all_questions()), 8)
        self.assertGreaterEqual(len(MCQ_QUESTIONS), 4)
        self.assertGreaterEqual(len(WRITTEN_QUESTIONS), 4)
        for question in MCQ_QUESTIONS:
            self.assertTrue(1 <= len(question["options"]) <= 7)
            self.assertIn(question["answer"], range(len(question["options"])))

    def test_quiz_does_not_modify_dataset_or_analyses(self):
        reviews, _ = import_reviews(DATASET)
        classifications = analyse(reviews)
        before_reviews = copy.deepcopy([item.to_dict() for item in reviews])
        before_analyses = copy.deepcopy(
            {key: value.to_dict() for key, value in classifications.items()}
        )
        script = self.scripted()
        run_quiz(input_fn=lambda _: next(script), output_fn=lambda *_: None)
        self.assertEqual([item.to_dict() for item in reviews], before_reviews)
        self.assertEqual(
            {key: value.to_dict() for key, value in classifications.items()},
            before_analyses,
        )


if __name__ == "__main__":
    unittest.main()
