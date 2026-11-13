# Requirements — VibeCheck AI

## Problem

A festival's feedback inbox holds hundreds of short comments. Staff need to know
what attendees complained about, how the mood breaks down, and what specific
reviews support any claim. Reading them one at a time does not scale, and an
LLM that is simply asked "summarise this" produces confident numbers nobody can
audit.

## Goal

A terminal application that

1. imports reviews from a file and validates them,
2. has a language model classify each review into a fixed schema,
3. **verifies** the reply before storing it,
4. computes statistics from verified labels in Python,
5. answers questions using only retrieved reviews, citing their ids, and
   abstaining when the evidence is not there.

## Functional requirements

| # | Requirement | Where it lives | Verified by |
| --- | --- | --- | --- |
| F1 | Import CSV or JSON; reject a bad record without losing the good ones | `ingest.import_reviews` | `test_ingest.py` |
| F2 | Unique review ids, text 5–500 chars, non-empty event, real `YYYY-MM-DD` date | `models.Review.from_dict` | `test_models.py` |
| F3 | A whole-file failure must not replace the loaded dataset | `ingest` raises `IngestError`; `cli.import_action` assigns last | `test_ingest.py`, `test_cli.py` |
| F4 | Classification contract: 5 keys, enums, ≤3 unique topics, quote substring, reason ≤160 | `classify.parse_model_output` | `test_classify.py` |
| F5 | Reject wrong ids, unknown labels, extra keys, fabricated quotes | same | `test_classify.py` |
| F6 | Never cache invalid output; cache key includes source hash, provider, model, prompt version | `cache.AnalysisCache` | `test_classify.py` |
| F7 | Statistics only from verified labels; unanalysed and rejected reported separately | `report.build_report` | `test_report_quiz.py` |
| F8 | Totals computed in Python, never by the model | `report`, `qa.answer_question` | `test_qa.py` |
| F9 | Q&A cites only supplied ids; unknown citation is rejected | `qa.parse_qa_output` | `test_qa.py` |
| F10 | Abstain when retrieval finds nothing, without calling the model | `qa.answer_question` | `test_qa.py` |
| F11 | Gold-set evaluation against hand labels | `report.evaluate_against_gold` | `test_report_quiz.py` |
| F12 | Engineering self-check: ≥8 questions, ≥4 scored MCQs, ≥4 written, read-only | `quiz.py` | `test_report_quiz.py` |
| F13 | Provider adapters for OpenAI-style, Anthropic and Gemini bodies | `provider.HTTPProvider` | `test_provider.py` |
| F14 | Timeouts, bounded retries for 429/5xx, no retry for 400/401 | `provider.HTTPProvider.call` | `test_provider.py` |
| F15 | Key never printed, logged, or committed | `provider`, `.gitignore`, `.env.example` | `test_provider.py` |

## Non-functional requirements

* Python standard library only; no framework, no vector database.
* Deterministic where it matters: retrieval, statistics, caching and the offline
  provider all produce the same result for the same input.
* Every refusal carries a reason a human can act on.
* Honest evidence: an offline run is labelled offline, a 12-example agreement
  rate is labelled small-sample, and a mocked test is never called proof that
  the live network works.

## Out of scope (deliberately)

* Web UI, database, multi-user accounts.
* Fine-tuning, embeddings, vector search.
* Automatic retraining or self-scoring of the model.
* Any claim that a passing test suite proves factual correctness of labels.

## Dataset contract

32 synthetic reviews in `data/synthetic_reviews.csv`:

```csv
id,event,text,created_at
R001,Food & Sound Fest,"Amazing show, but the queues were too long. Loved the DJ set on the main stage.",2026-01-15
```

No real names, phone numbers, emails or private messages. `R016`–`R018`
deliberately contain prompt-injection and fabricated-statistic bait so the
defences can be demonstrated and tested.
