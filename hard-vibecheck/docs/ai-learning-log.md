# AI learning log — VibeCheck AI

Three learning cycles from this build, in the required shape. Each one records
what was actually done and verified, not what would look impressive.

## Cycle 1 — Quote grounding

**Topic I did not know well:** how to prove that a "quoted" sentence really came
from a source, cheaply, in pure Python.

**Prompt I used (paraphrased):** teach me substring verification for model
evidence, with an unrelated example, and ask me to predict the output before
showing anything.

**Explanation in my own words:** if `quote in text` is `True`, the model could not
have invented those characters; it must have copied them. Anything else, including
a paraphrase or a different review's sentence, must be treated as fabricated.
Whitespace and case differences need a documented relaxation, otherwise honest
models get rejected for a double space.

**Experiment:** I stored the three sources in a scratch file and checked:
`"queues were too long" in R001 text` → True; `"the lines were extremely long"` →
False; `"the  sound was poor"` with a doubled space → False until I collapsed
whitespace on both sides, then True.

**Result and correction:** my first plan was to accept any case-insensitive
match. That would let a paraphrase through ("no queues at all" vs "queues at
all"? no, but reordered words would still fail). I kept strict exact matching as
the default and made the relaxed mode explicit (`allow_normalized_quote`),
recording `quote_match="normalized"` on the record so the relaxation is visible.

**Landing in code:** `classify.verify_quote`, `Classification.quote_match`, and
`tests/test_classify.py::TestQuoteGrounding`.

## Cycle 2 — Cache invalidation by content hash

**Topic I did not know well:** the right cache key for model output.

**Prompt:** why is a cache keyed by record id wrong for AI output, and what
should the key contain? Give me a counterexample first.

**Explanation in my own words:** an id is stable while the content it points at is
not. If an attendee edits a comment, the id stays and the cached verdict becomes a
label for text that no longer exists. Hashing the text plus the model, provider
and prompt version means any change to any of those produces a different key, so
the worst case is a cache miss, never a wrong label.

**Experiment:** in a scratch script, classified `R001`, then edited the same id's
text, then classified again with the same `FakeProvider`. With the id-only key the
second call was a cache hit and returned the stale label. With the hash key the
provider was called twice and the new label was produced.

**Result:** the hash key is in `cache.make_key`, and a defensive check in
`classify_review` compares the stored `source_hash` to the current text before
using a hit.

**Landing in code:** `cache.make_key`, `classify.classify_review`,
`tests/test_classify.py::test_changed_text_invalidates_the_cache_entry`.

## Cycle 3 — Where retries are safe (and where they are a trap)

**Topic:** retry policy for an HTTPS model API.

**Prompt:** list plausible failure classifications and tell me which are safe to
retry; do not give me code.

**Explanation in my own words:** 429 (rate limit) and 5xx (their problem) are
transient: backoff and retry a bounded number of times. 400, 401, 403 and 404 are
my problem: the request, key, permission or URL is wrong, and a retry only burns
quota and hides the real bug. A network timeout sits in between: retry once, then
report.

**Experiment:** I ran the provider against a scripted transport that returns
`[429, 200]`, `[503, 503, 200]`, `[401]` and three consecutive 500s, counting
sleep calls. 429 and 503 retried; 401 raised immediately with zero sleeps; three
500s raised after the bounded attempts.

**Correction I made after checking:** my first version retried on *any*
`urllib.error.URLError`, which would have retried a malformed URL. The transport
now converts HTTP status errors into a status the caller classifies, and only
5xx/429 set `transient=True`.

**Landing in code:** `provider.HTTPProvider.call`,
`tests/test_provider.py::TestRetryBehaviour`.

## One AI suggestion I did not take

When the report module was being written, the suggestion was to let the model
produce the sentiment distribution in its own words and parse the numbers out.
I rejected it: parsing prose for numbers cannot be verified, while
`Counter` over stored labels can be checked by hand. The statistics question is
now answered in Python without any model call
(`qa.is_statistics_question`), which is both cheaper and auditable.
