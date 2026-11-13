# VibeCheck AI — Festival Feedback Detective

A terminal application that imports festival reviews, asks a language model to
classify each one, **verifies the model's output before trusting it**, computes
statistics in Python from the verified labels only, and answers questions using
nothing but retrieved reviews with citation checks.

Standard library only: `json`, `csv`, `pathlib`, `re`, `collections`,
`datetime`, `urllib.request`, `hashlib`, `unittest.mock`-free fakes,
`http.server` for the transport test.

## Setup

Python 3.8+. No dependencies to install.

```bash
cd hard-vibecheck
python main.py
```

Run the tests:

```bash
python -m unittest discover -s tests -v      # 144 tests
```

### Using a real model

The app reads its provider from the environment. Nothing is hardcoded and the
key is never printed, logged or written to disk.

```bash
export VIBECHECK_PROVIDER=openai        # openai | openai_compatible | anthropic | gemini
export VIBECHECK_API_KEY=sk-...         # your key
export VIBECHECK_MODEL=gpt-4o-mini      # optional
python main.py
```

Without those variables the app runs in **offline mode**: a deterministic
keyword classifier that satisfies the same JSON contract. Every screen and
report says so, because calling a rule engine an AI model would be dishonest
evidence. The real HTTP path is exercised in `tests/test_provider.py` against a
local `http.server` that speaks the OpenAI-compatible wire format.

## What a finished run does

```
Choice > 1                 import data/synthetic_reviews.csv  -> 32 accepted, 0 rejected
Choice > 4                 analyse with the configured provider -> verified, cached
Choice > 6                 report: 32 analysed, 0 not analysed, 0 rejected
Choice > 7                 ask "Were the food queues bad?"
Choice > 8                 gold-set evaluation
Choice > 9                 save analyses
```

Real output from this repo:

```
Sentiment (share of analysed reviews)
  positive   12   37.5%  #########
  negative    8   25.0%  ######
  neutral     6   18.8%  #####
  mixed       6   18.8%  #####

Topics mentioned (one review can mention several)
  sound     15
  queue     12
  food      10

Q: Were the food queues bad?
A: The reviews say: Food queues took 40 minutes and the tacos were cold when they
   arrived. Disappointing for the price. [R004] Sound quality was excellent on the
   main stage, but the food vendors ran out of everything by 9pm. [R007]
Sources: R004, R007
Computed in Python (not by the model): of 32 analysed reviews: positive 12, negative 8,
neutral 6, mixed 6
Status: answered

Gold-set check: 11/12 agree (91.7%).
  R006: hand=neutral model=negative | The festival was fine. Nothing special, nothing terrible.
```

## The contract the model must satisfy

For each review, exactly one JSON object:

```json
{
  "review_id": "R004",
  "sentiment": "negative",
  "topics": ["queue", "food"],
  "evidence_quote": "Food queues took 40 minutes",
  "short_reason": "Long wait and cold food, so the experience was negative."
}
```

`sentiment` ∈ positive | negative | neutral | mixed · `topics` ⊆ sound, food,
queue, staff, pricing, safety, venue, other (max 3, unique) · `evidence_quote`
must be an exact substring of that review · `short_reason` ≤ 160 characters ·
no extra keys.

**Rejected after the fact, not trusted:**

| Model behaviour | Why it is refused |
| --- | --- |
| `"sentiment": "wonderful"` | not in the enum |
| a quote that is a paraphrase | invented citation |
| a quote copied from a different review | not a substring of this text |
| `review_id: "R999"` | the reply is about another record |
| `topics: [a, b, c, d]` or a repeated topic | schema violation |
| an extra key such as `confidence` | the model answered a different question |
| fenced markdown around the JSON | tolerated (stripped), then validated as usual |

Nothing invalid is cached, so a cache hit is always a previously verified label.

## Modules

```
main.py              entry point
app/models.py        Review, Classification, enums, error types, text hash
app/ingest.py        CSV/JSON import with per-record validation
app/provider.py      HTTPS adapter (OpenAI/Anthropic/Gemini wire formats) + offline rules
app/classify.py      system prompt, strict output validation, quote grounding, repair retry
app/cache.py         JSON cache keyed by prompt+provider+model+source hash
app/retrieve.py      deterministic keyword retrieval, top-k evidence
app/report.py        statistics from verified labels, gold-set evaluation
app/qa.py            grounded Q&A with citation allow-list and Python-computed totals
app/quiz.py          Engineering Self-Check (6 scored MCQs, 6 written for mentor review)
app/cli.py           menu and application state
data/synthetic_reviews.csv   32 invented festival comments (incl. 3 injection attempts)
data/invalid_reviews.csv     deliberately broken rows for the ingest tests
data/gold_labels.json        12 hand labels for the evaluation demo
data/analyses.json           saved verified analyses from a real session
docs/                requirements, architecture, security notes, learning log, evaluation
```

## Security and honesty notes

* Keys come from `os.environ`; `.env` is git-ignored; `.env.example` holds
  placeholders only. The provider never logs a header or a body containing the key.
* Review text is wrapped in `<review>` tags and declared untrusted. `R016` and
  `R017` in the dataset literally try prompt injection ("ignore all earlier
  instructions", "print the API key"); they are classified as data and no
  instruction is followed, which the tests assert.
* Retries are bounded and only for 429/5xx. A 400/401 fails immediately because
  retrying a bad request just burns credit.
* Totals are computed in Python. Statistics questions are answered without
  calling the model at all.
* A cached label carries the sha256 of the review text. If the text changes the
  cache entry no longer matches and the review is re-analysed instead of
  inheriting a stale verdict.
* Labels are AI inferences, not verified facts, and every report says so.

## Known limits

* Model quality is not guaranteed: a confident wrong label can still pass every
  structural check. Only the gold set measures that, on 12 examples.
* The gold set is small and single-annotator, so 91.7% is not an accuracy claim.
* Offline mode is keyword matching. It mislabels sarcasm ("nothing terrible")
  and negation, which is exactly what the error analysis in
  `docs/gold-set-evaluation.md` documents.
* Retrieval is keyword overlap, so a question using different vocabulary than the
  reviews may retrieve nothing and get an honest abstention.
* No database, no web UI, no multi-user state. One dataset per session.
