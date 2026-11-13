"""Retrieval and grounded Q&A, including citation rejection."""

import json
import unittest

from helpers import DATASET, QAProvider, review
from app.ingest import import_reviews
from app.models import MAX_TOP_K
from app.provider import OfflineProvider
from app.qa import answer_question, build_qa_prompt, format_answer, parse_qa_output
from app.report import build_report
from app.retrieve import evidence_ids, search, tokenize


def dataset():
    reviews, _ = import_reviews(DATASET)
    return reviews


class TestRetrieval(unittest.TestCase):
    def test_tokenize_drops_stopwords_and_short_words(self):
        tokens = tokenize("The queue WAS so long, at Gate 3!")
        self.assertIn("queue", tokens)
        self.assertIn("long", tokens)
        self.assertIn("gate", tokens)
        self.assertNotIn("the", tokens)
        self.assertNotIn("was", tokens)

    def test_queue_question_returns_queue_reviews(self):
        results = search("Were the queues long?", dataset(), top_k=3)
        self.assertTrue(results)
        self.assertTrue(all(result["score"] > 0 for result in results))
        self.assertLessEqual(len(results), MAX_TOP_K)

    def test_off_topic_question_returns_no_evidence(self):
        results = search("What is the capital city of France?", dataset())
        self.assertEqual(results, [])

    def test_a_single_shared_word_is_reported_as_weak_evidence(self):
        # 'refund' appears once in the dataset, so this is a weak but honest match,
        # not a silent no-op: the caller still cites a real record id.
        results = search("Do you offer a refund?", dataset())
        self.assertTrue(results)
        self.assertTrue(all(result["review"].id.startswith("R") for result in results))

    def test_results_are_ordered_by_score_then_id(self):
        results = search("sound quality at the stage", dataset(), top_k=5)
        scores = [result["score"] for result in results]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_retrieval_is_deterministic(self):
        first = evidence_ids(search("food queue", dataset(), top_k=3))
        second = evidence_ids(search("food queue", dataset(), top_k=3))
        self.assertEqual(first, second)

    def test_top_k_is_clamped(self):
        results = search("queue", dataset(), top_k=99)
        self.assertLessEqual(len(results), MAX_TOP_K)


class TestQaValidation(unittest.TestCase):
    def reply(self, cited, answer="The queues were long.", insufficient=False):
        return json.dumps(
            {"answer": answer, "cited_ids": cited, "insufficient_evidence": insufficient}
        )

    def test_valid_answer_is_accepted(self):
        parsed = parse_qa_output(self.reply(["R001"]), ["R001", "R002"])
        self.assertEqual(parsed["cited_ids"], ["R001"])
        self.assertFalse(parsed["insufficient_evidence"])

    def test_citation_outside_the_supplied_evidence_is_rejected(self):
        from app.models import GroundingError

        with self.assertRaises(GroundingError):
            parse_qa_output(self.reply(["R999"]), ["R001"])

    def test_missing_keys_are_rejected(self):
        from app.models import ModelOutputError

        with self.assertRaises(ModelOutputError):
            parse_qa_output('{"answer": "hi"}', ["R001"])

    def test_non_boolean_insufficient_flag_is_rejected(self):
        from app.models import ModelOutputError

        with self.assertRaises(ModelOutputError):
            parse_qa_output(
                '{"answer": "hi", "cited_ids": [], "insufficient_evidence": "yes"}',
                ["R001"],
            )

    def test_non_json_answer_is_rejected(self):
        from app.models import ModelOutputError

        with self.assertRaises(ModelOutputError):
            parse_qa_output("I think the queues were long.", ["R001"])

    def test_prompt_lists_only_the_supplied_records(self):
        reviews = dataset()
        results = search("queue", reviews, top_k=2)
        prompt = build_qa_prompt("Were queues long?", results)
        self.assertIn('id="' + results[0]["review"].id + '"', prompt)
        self.assertIn("<question>Were queues long?</question>", prompt)
        supplied = {result["review"].id for result in results}
        for review in reviews:
            if review.id not in supplied:
                self.assertNotIn(f'id="{review.id}"', prompt)


class TestAnswerQuestion(unittest.TestCase):
    def test_question_without_evidence_abstains_without_calling_the_model(self):
        provider = QAProvider('{"answer": "x", "cited_ids": [], "insufficient_evidence": false}')
        result = answer_question(
            "What is the capital city of France?", dataset(), {}, provider
        )
        self.assertEqual(result["status"], "insufficient_evidence")
        self.assertEqual(provider.calls, 0)
        self.assertEqual(result["cited_ids"], [])

    def test_answer_cites_only_retrieved_records(self):
        reviews = dataset()
        question = "Were the queues long?"
        evidence = search(question, reviews, top_k=2)
        first_id = evidence[0]["review"].id
        provider = QAProvider(
            json.dumps(
                {
                    "answer": "Attendees waited a long time at the gate.",
                    "cited_ids": [first_id],
                    "insufficient_evidence": False,
                }
            )
        )
        result = answer_question(question, reviews, {}, provider)
        self.assertEqual(result["status"], "answered")
        self.assertEqual(result["cited_ids"], [first_id])
        self.assertEqual(provider.calls, 1)

    def test_citation_outside_retrieval_is_reported_as_rejected(self):
        reviews = dataset()
        provider = QAProvider(
            json.dumps(
                {
                    "answer": "The queue was long.",
                    "cited_ids": ["R999"],
                    "insufficient_evidence": False,
                }
            )
        )
        result = answer_question("Were the queues long?", reviews, {}, provider)
        self.assertEqual(result["status"], "rejected")
        self.assertIn("was not among the supplied records", result["problem"])

    def test_model_insufficient_flag_is_passed_through(self):
        reviews = dataset()
        provider = QAProvider(
            json.dumps(
                {
                    "answer": "The records mention queues but not their cause.",
                    "cited_ids": [],
                    "insufficient_evidence": True,
                }
            )
        )
        result = answer_question("Why were the queues long?", reviews, {}, provider)
        self.assertEqual(result["status"], "insufficient_evidence")

    def test_python_statistics_are_attached_not_model_calculated(self):
        reviews = dataset()[:4]
        classifications = {}
        from app.classify import classify_review

        offline = OfflineProvider()
        for item in reviews:
            classifications[item.id] = classify_review(item, offline)
        report = build_report(reviews, classifications)
        provider = QAProvider(
            json.dumps(
                {
                    "answer": "Most reviews are negative about queues.",
                    "cited_ids": [reviews[0].id],
                    "insufficient_evidence": False,
                }
            )
        )
        result = answer_question("What is the sentiment distribution?", reviews,
                                 classifications, provider, report=report)
        self.assertTrue(result["statistics"])
        self.assertIn("analysed reviews", result["statistics"])
        self.assertEqual(provider.calls, 0, "totals must never be sent to the model")
        self.assertEqual(result["computed_by"], "python")

    def test_offline_provider_answers_with_real_ids(self):
        reviews = dataset()
        result = answer_question("Were the food queues bad?", reviews, {}, OfflineProvider())
        self.assertEqual(result["status"], "answered")
        self.assertTrue(result["cited_ids"])
        supplied = set(result["evidence"])
        self.assertTrue(set(result["cited_ids"]).issubset(supplied))

    def test_empty_question_is_rejected(self):
        result = answer_question("   ", dataset(), {}, QAProvider("{}"))
        self.assertEqual(result["status"], "rejected")
        self.assertIn("Ask a question", result["answer"])


if __name__ == "__main__":
    unittest.main()
