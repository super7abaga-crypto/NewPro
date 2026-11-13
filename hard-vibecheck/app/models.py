"""Review and classification shapes, the enums, and the error types.

The classification schema here IS the contract with the model. If the provider
could be trusted to obey it we would not need classify.py, but a model can
return valid JSON that means something else entirely, so every field is checked
in Python after the reply arrives.
"""

import hashlib
import re
from dataclasses import dataclass, field
from datetime import date

SENTIMENTS = ("positive", "negative", "neutral", "mixed")
TOPICS = ("sound", "food", "queue", "staff", "pricing", "safety", "venue", "other")

MAX_TOPICS = 3
TEXT_MIN = 5
TEXT_MAX = 500
REASON_MAX = 160
QUOTE_MAX = 300
MAX_TOP_K = 5
DATE_FORMAT = "%Y-%m-%d"


class VibeCheckError(Exception):
    """Base class for errors this application raises on purpose."""


class IngestError(VibeCheckError):
    """A dataset file could not be read at all (protects existing state)."""


class RecordError(VibeCheckError):
    """One record failed validation; the rest of the file may still be good."""


class ModelOutputError(VibeCheckError):
    """The model replied, but the reply does not satisfy the contract."""


class ProviderError(VibeCheckError):
    """The provider failed. ``transient`` decides whether a retry is sane."""

    def __init__(self, message, transient=False, status=None):
        super().__init__(message)
        self.transient = transient
        self.status = status


class ProviderConfigError(ProviderError):
    """No usable provider configuration (missing key, unknown provider)."""


class GroundingError(VibeCheckError):
    """An answer cited evidence that was never supplied."""


@dataclass(frozen=True)
class Review:
    """One piece of source data. Never modified by analysis."""

    id: str
    event: str
    text: str
    created_at: str

    def to_dict(self):
        return {
            "id": self.id,
            "event": self.event,
            "text": self.text,
            "created_at": self.created_at,
        }

    @property
    def text_hash(self):
        """sha256 of the source text: how a stale classification is spotted."""
        return hashlib.sha256(self.text.encode("utf-8")).hexdigest()

    @classmethod
    def from_dict(cls, raw, where="record"):
        """Validate and build a Review, or raise RecordError.

        This is the gate every imported row must pass: types, lengths, the id
        shape, and a real calendar date.
        """
        if not isinstance(raw, dict):
            raise RecordError(f"{where}: expected an object, got {type(raw).__name__}.")

        missing = [key for key in ("id", "event", "text", "created_at") if key not in raw]
        if missing:
            raise RecordError(f"{where}: missing field(s) {', '.join(missing)}.")

        record_id = raw["id"]
        if not isinstance(record_id, str) or not re.fullmatch(r"R\d{3,6}", record_id.strip()):
            raise RecordError(f"{where}: id must look like R001 (got {record_id!r}).")
        record_id = record_id.strip()

        event = raw["event"]
        if not isinstance(event, str) or not event.strip():
            raise RecordError(f"{where} ({record_id}): event must be non-empty text.")
        event = event.strip()

        text = raw["text"]
        if not isinstance(text, str):
            raise RecordError(f"{where} ({record_id}): text must be text.")
        text = text.strip()
        if not TEXT_MIN <= len(text) <= TEXT_MAX:
            raise RecordError(
                f"{where} ({record_id}): text must be {TEXT_MIN}-{TEXT_MAX} characters "
                f"(got {len(text)})."
            )

        created = raw["created_at"]
        if not isinstance(created, str):
            raise RecordError(f"{where} ({record_id}): created_at must be text.")
        created = created.strip()
        try:
            date.fromisoformat(created)
        except ValueError:
            raise RecordError(
                f"{where} ({record_id}): created_at must be a real date as YYYY-MM-DD."
            ) from None

        return cls(id=record_id, event=event, text=text, created_at=created)


@dataclass
class Classification:
    """A *verified* model classification. Only classify.py may create one."""

    review_id: str
    sentiment: str
    topics: list = field(default_factory=list)
    evidence_quote: str = ""
    short_reason: str = ""
    provider: str = ""
    model: str = ""
    prompt_version: str = ""
    source_hash: str = ""
    quote_match: str = "exact"
    analysed_at: str = ""

    def to_dict(self):
        return {
            "review_id": self.review_id,
            "sentiment": self.sentiment,
            "topics": list(self.topics),
            "evidence_quote": self.evidence_quote,
            "short_reason": self.short_reason,
            "provider": self.provider,
            "model": self.model,
            "prompt_version": self.prompt_version,
            "source_hash": self.source_hash,
            "quote_match": self.quote_match,
            "analysed_at": self.analysed_at,
        }

    @classmethod
    def from_dict(cls, raw):
        """Rebuild from cache/disk, re-checking the enums."""
        if not isinstance(raw, dict):
            raise ModelOutputError("Stored classification is not an object.")
        if raw.get("sentiment") not in SENTIMENTS:
            raise ModelOutputError(
                f"Stored classification has invalid sentiment {raw.get('sentiment')!r}."
            )
        topics = raw.get("topics") or []
        if not isinstance(topics, list) or any(topic not in TOPICS for topic in topics):
            raise ModelOutputError("Stored classification has invalid topics.")
        return cls(
            review_id=str(raw.get("review_id", "")),
            sentiment=raw["sentiment"],
            topics=list(topics),
            evidence_quote=str(raw.get("evidence_quote", "")),
            short_reason=str(raw.get("short_reason", "")),
            provider=str(raw.get("provider", "")),
            model=str(raw.get("model", "")),
            prompt_version=str(raw.get("prompt_version", "")),
            source_hash=str(raw.get("source_hash", "")),
            quote_match=str(raw.get("quote_match", "exact")),
            analysed_at=str(raw.get("analysed_at", "")),
        )
