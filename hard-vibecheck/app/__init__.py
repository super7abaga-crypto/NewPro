"""VibeCheck AI -- evidence-grounded review intelligence for a festival.

Modules
-------
models      review and classification shapes, enums, error types
ingest      CSV/JSON import with per-record validation
provider    provider adapters (real HTTPS client + offline fallback)
classify    prompt construction, strict output validation, caching
cache       on-disk analysis cache keyed by source hash
retrieve    deterministic keyword evidence retrieval
report      statistics computed in Python from verified labels only
qa          grounded question answering with citation checks
quiz        engineering self-check (the CLI audit questions)
cli         the terminal menu
"""

__version__ = "1.0.0"
SCHEMA_VERSION = 1
PROMPT_VERSION = "classify-v1"
QA_PROMPT_VERSION = "qa-v1"
