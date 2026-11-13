# Architecture — VibeCheck AI

## Flow

```
            +--------------+
 dataset -->| ingest.py    |--> list[Review]  (validated, source of truth)
            +--------------+
                    |
                    v
            +--------------+     prompt      +---------------+
            | classify.py  |---------------->| provider.py   |
            | (system +    |<----------------| HTTPS / rules |
            |  validator)  |   raw text      +---------------+
            +--------------+
                    | verified Classification (quote checked, enums checked)
                    v
            +--------------+     +--------------+
            | cache.py     |     | report.py    |--> statistics (Python arithmetic)
            +--------------+     +--------------+
                    |                   ^
                    v                   |
            +--------------+            |
            | retrieve.py  |--> evidence ids
            +--------------+
                    |
                    v
            +--------------+     answer must cite supplied ids
            | qa.py        |------------------------------> verified answer / abstention
            +--------------+
```

## Why the layers are separate

**Source data is never mixed with derived data.** `Review` objects come from the
file; `Classification` objects are produced by the model and stored separately
(`data/analyses.json`, `data/cache.json`). Re-importing the dataset resets
analyses. Deleting the cache loses nothing but time.

**The provider knows nothing about the contract.** It takes a prompt and returns
text. That is why a fake provider with three lines of code can drive the whole
pipeline in tests, and why swapping OpenAI for Anthropic or Gemini does not touch
`classify.py`.

**Validation lives in one place.** `classify.parse_model_output` is the only
function that may build a `Classification`. If it says no, the label does not
exist: it cannot reach the report, the cache or a saved file.

**Statistics are pure functions.** `report.build_report(reviews, classifications)`
takes data and returns data; it prints nothing and never calls a model, so every
number is reproducible in a test.

**Retrieval is deterministic.** Keyword overlap with stopword removal and a topic
boost. No network, no randomness, so "which evidence did the answer cite?" has a
stable answer that can be audited.

## Contract enforcement table

| Check | Function | Failure mode it prevents |
| --- | --- | --- |
| valid JSON object | `parse_model_output` | prose instead of JSON |
| exactly five keys | `parse_model_output` | silent schema drift |
| `review_id` matches | `parse_model_output` | a label attached to the wrong review |
| sentiment enum | `parse_model_output` | `"wonderful"` entering statistics |
| topics ≤3, unique, enum | `parse_model_output` | invented categories |
| quote is a real substring | `verify_quote` | fabricated citations |
| reason ≤160 chars | `parse_model_output` | a paragraph where a note belongs |
| citations ⊆ evidence | `parse_qa_output` | answers grounded in records nobody supplied |
| source hash matches | `cache.get` / `load_action` | stale verdicts after an edit |

## Data shapes

```python
Review(id="R001", event="Food & Sound Fest",
       text="Amazing show, but the queues were too long.",
       created_at="2026-01-15")          # text_hash -> sha256(text)

Classification(review_id="R001", sentiment="mixed", topics=["queue"],
               evidence_quote="queues were too long",
               short_reason="Praise and complaint together.",
               provider="https:openai", model="gpt-4o-mini",
               prompt_version="classify-v1", source_hash="…",
               quote_match="exact", analysed_at="2026-11-13T13:40:00+00:00")
```

Cache entry:

```json
{
  "entries": {
    "<sha256(prompt_version|provider|model|text_hash)>": {
      "classification": { "...": "..." },
      "provider": "https:openai",
      "model": "gpt-4o-mini",
      "stored_at": "2026-11-13T13:40:00+00:00"
    }
  }
}
```

## Failure handling

| Situation | Behaviour |
| --- | --- |
| Broken dataset file | `IngestError`; the loaded dataset is untouched |
| One bad record | rejected with a reason, the rest load |
| Provider 429/5xx | exponential backoff, bounded retries, then a clear error |
| Provider 400/401 | fail immediately: retrying cannot fix a bad request or key |
| Non-JSON model reply | `ModelOutputError`; one optional repair retry; never cached |
| Invented quote | `ModelOutputError`; the label is discarded |
| Q&A cites an unknown id | `GroundingError`; the answer is rejected and reported |
| No evidence retrieved | abstain without calling the model |
| Corrupt cache file | discarded silently (it is derived data) |
| Stale saved analysis | ignored on load with a reason |

## Complexity

Classification is linear in reviews with one provider call each (cache hits cost
nothing). Retrieval is O(reviews × question tokens). Reports are O(reviews).
Nothing is quadratic, nothing is hidden in a framework.
