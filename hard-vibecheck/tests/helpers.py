"""Shared test helpers: project path, fake providers, sample reviews."""

import json
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.models import Review  # noqa: E402

DATASET = os.path.join(PROJECT_ROOT, "data", "synthetic_reviews.csv")
INVALID_DATASET = os.path.join(PROJECT_ROOT, "data", "invalid_reviews.csv")
GOLD = os.path.join(PROJECT_ROOT, "data", "gold_labels.json")


def review(text="The queues were far too long at the gate.", review_id="R001"):
    return Review(
        id=review_id,
        event="Food & Sound Fest",
        text=text,
        created_at="2026-01-15",
    )


def payload(review_id="R001", sentiment="negative", topics=None,
            quote=None, reason="Long waits at the entrance."):
    """A well-formed model reply as JSON text."""
    return json.dumps(
        {
            "review_id": review_id,
            "sentiment": sentiment,
            "topics": ["queue"] if topics is None else topics,
            "evidence_quote": quote if quote is not None
            else "The queues were far too long at the gate.",
            "short_reason": reason,
        }
    )


class FakeProvider:
    """A provider that returns scripted replies and counts its calls."""

    provider_name = "fake:test"
    model = "fake-model-1"

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0
        self.prompts = []

    def describe(self):
        return f"{self.provider_name} model={self.model}"

    def call(self, prompt, system=None):
        self.prompts.append(prompt)
        self.calls += 1
        if not self.replies:
            raise AssertionError("FakeProvider ran out of scripted replies")
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


class QAProvider:
    """A provider that returns scripted Q&A JSON and records its prompts."""

    provider_name = "fake:qa"
    model = "fake-qa-model"

    def __init__(self, reply):
        self.reply = reply
        self.calls = 0
        self.prompts = []

    def describe(self):
        return f"{self.provider_name} model={self.model}"

    def call(self, prompt, system=None):
        self.calls += 1
        self.prompts.append(prompt)
        return self.reply
