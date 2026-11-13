"""On-disk cache for verified classifications.

Design rules that matter:

* The key includes the source-text hash, the provider, the model and the prompt
  version. If any of those change the entry is simply not found, so an edited
  review can never reuse the analysis of its old text.
* Invalid model output is never written here, so a cache hit is always a
  previously *verified* classification.
* The cache is derived data. It can be deleted at any time and rebuilt.
"""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from . import PROMPT_VERSION


def make_key(review, provider_name, model, prompt_version=PROMPT_VERSION):
    """Stable cache key for one review under one configuration."""
    material = "|".join(
        (
            prompt_version or "",
            provider_name or "",
            model or "",
            review.text_hash,
        )
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


class AnalysisCache:
    """A JSON-backed, string-keyed store of verified classifications."""

    def __init__(self, path=None, entries=None):
        self.path = Path(path) if path else None
        self.entries = dict(entries or {})
        self.hits = 0
        self.misses = 0

    def load(self):
        """Read the cache file if it exists. A corrupt cache is discarded."""
        if self.path is None or not self.path.exists():
            return self
        try:
            with open(self.path, "r", encoding="utf-8") as stream:
                data = json.load(stream)
            if isinstance(data, dict) and isinstance(data.get("entries"), dict):
                self.entries = data["entries"]
        except (json.JSONDecodeError, OSError):
            self.entries = {}
        return self

    def save(self):
        """Persist verified entries only."""
        if self.path is None:
            return self
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "schema_version": 1,
            "prompt_version": PROMPT_VERSION,
            "entries": self.entries,
        }
        with open(self.path, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, indent=2)
            stream.write("\n")
        return self

    def get(self, key):
        entry = self.entries.get(key)
        if not entry:
            self.misses += 1
            return None
        self.hits += 1
        return entry

    def put(self, key, classification_dict, provider=None, model=None):
        self.entries[key] = {
            "classification": dict(classification_dict),
            "provider": provider,
            "model": model,
            "stored_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        return self.entries[key]

    def drop(self, key):
        return self.entries.pop(key, None) is not None

    def keys_for_review(self, review):
        """Every cached key whose stored source hash matches this review."""
        matches = []
        for key, entry in self.entries.items():
            stored = (entry or {}).get("classification", {})
            if stored.get("source_hash") == review.text_hash:
                matches.append(key)
        return matches

    def __len__(self):
        return len(self.entries)

    def stats(self):
        return {"entries": len(self.entries), "hits": self.hits, "misses": self.misses}


def cache_from_file(path):
    """Convenience: build and load a cache in one call."""
    return AnalysisCache(path).load()
