"""Provider adapters.

One job: take a system instruction plus a user payload and return the model's
raw text. Everything about *what* that text must contain lives in classify.py.

Two adapters ship:

* ``HTTPProvider`` -- a real HTTPS client (urllib, standard library) that speaks
  the wire format of an OpenAI-compatible API, Anthropic's Messages API or
  Gemini's generateContent API. Timeout, bounded retries on 429/5xx, and no
  credential ever appears in an exception message or a log line.
* ``OfflineProvider`` -- a deterministic keyword classifier used for the demo and
  for tests. It is *not* an AI model and every report labels it as such, because
  pretending a rule engine is a model would be dishonest evidence.

The API key is read from the environment (``VIBECHECK_API_KEY``) and never
hardcoded, printed, or written to disk.
"""

import json
import os
import re
import time
import urllib.error
import urllib.request

from .models import ProviderConfigError, ProviderError

DEFAULT_TIMEOUT = 30
DEFAULT_RETRIES = 2
RETRY_STATUSES = (429, 500, 502, 503, 504)
MAX_BACKOFF_SECONDS = 8

PROVIDER_STYLES = ("openai", "anthropic", "gemini", "openai_compatible")

DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "openai_compatible": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta",
}

DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "openai_compatible": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-latest",
    "gemini": "gemini-1.5-flash",
}


class HTTPProvider:
    """A real model provider over HTTPS."""

    def __init__(self, style, api_key, model=None, base_url=None,
                 timeout=DEFAULT_TIMEOUT, retries=DEFAULT_RETRIES,
                 sleep_fn=time.sleep, transport=None):
        if style not in PROVIDER_STYLES:
            raise ProviderConfigError(
                f"Unknown provider style {style!r}. Choose one of {', '.join(PROVIDER_STYLES)}."
            )
        if not api_key or not str(api_key).strip():
            raise ProviderConfigError(
                "No API key configured. Set VIBECHECK_API_KEY in the environment."
            )
        self.style = style
        self.model = model or DEFAULT_MODELS[style]
        self.base_url = (base_url or DEFAULT_BASE_URLS[style]).rstrip("/")
        self.timeout = timeout
        self.retries = max(0, int(retries))
        self.sleep_fn = sleep_fn
        self.transport = transport or _urllib_transport
        self._api_key = str(api_key).strip()

    # ------------------------------------------------------------------ naming
    @property
    def provider_name(self):
        return f"https:{self.style}"

    def describe(self):
        """Safe description for reports: never includes the key."""
        return f"{self.provider_name} model={self.model}"

    # ------------------------------------------------------------------ calls
    def call(self, prompt, system=None):
        """Send one request and return the model's text reply.

        Retries only documented transient failures (429 and 5xx), with bounded
        exponential backoff. A 400/401/403 is a configuration or request problem:
        retrying it would just burn the user's quota.
        """
        url, headers, body = self._build_request(prompt, system)
        last_error = None
        for attempt in range(self.retries + 1):
            try:
                status, raw = self.transport(url, headers, body, self.timeout)
            except ProviderError as error:
                last_error = error
                if not error.transient:
                    raise
            else:
                if status in RETRY_STATUSES:
                    last_error = ProviderError(
                        f"Provider returned HTTP {status}.", transient=True, status=status
                    )
                elif status >= 400:
                    raise ProviderError(
                        f"Provider rejected the request with HTTP {status}. "
                        f"Check the API key, model name and request body.",
                        transient=False,
                        status=status,
                    )
                else:
                    return self._parse_response(raw)
            if attempt < self.retries:
                self.sleep_fn(min(2 ** attempt, MAX_BACKOFF_SECONDS))
        raise last_error or ProviderError("Provider call failed.", transient=True)

    # --------------------------------------------------------------- internals
    def _build_request(self, prompt, system):
        if self.style in ("openai", "openai_compatible"):
            url = f"{self.base_url}/chat/completions"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._api_key}",
            }
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})
            body = {"model": self.model, "messages": messages, "temperature": 0}
            return url, headers, body

        if self.style == "anthropic":
            url = f"{self.base_url}/messages"
            headers = {
                "Content-Type": "application/json",
                "x-api-key": self._api_key,
                "anthropic-version": "2023-06-01",
            }
            body = {
                "model": self.model,
                "max_tokens": 512,
                "temperature": 0,
                "messages": [{"role": "user", "content": prompt}],
            }
            if system:
                body["system"] = system
            return url, headers, body

        # gemini
        url = f"{self.base_url}/models/{self.model}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self._api_key,
        }
        parts = []
        if system:
            parts.append({"text": system})
        parts.append({"text": prompt})
        body = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"temperature": 0},
        }
        return url, headers, body

    def _parse_response(self, raw):
        """Extract the text from a provider-specific response body."""
        text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else str(raw)
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            raise ProviderError(
                "Provider returned a non-JSON response body.", transient=True
            ) from None

        if self.style in ("openai", "openai_compatible"):
            try:
                return data["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError):
                raise ProviderError(
                    "OpenAI-compatible response had no choices[0].message.content.",
                    transient=True,
                ) from None

        if self.style == "anthropic":
            blocks = data.get("content")
            if isinstance(blocks, list):
                texts = [block.get("text", "") for block in blocks if isinstance(block, dict)]
                joined = "".join(texts).strip()
                if joined:
                    return joined
            raise ProviderError("Anthropic response had no text content.", transient=True)

        try:
            candidates = data["candidates"]
            parts = candidates[0]["content"]["parts"]
            return "".join(part.get("text", "") for part in parts)
        except (KeyError, IndexError, TypeError):
            raise ProviderError("Gemini response had no candidates[0].content.parts.",
                                transient=True) from None


def _urllib_transport(url, headers, body, timeout):
    """POST JSON with urllib. Raises ProviderError for transport failures."""
    payload = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:300]
        return error.code, json.dumps({"error": detail}).encode("utf-8")
    except urllib.error.URLError as error:
        raise ProviderError(f"Network error: {error.reason}", transient=True) from None
    except TimeoutError:
        raise ProviderError("Provider request timed out.", transient=True) from None


class OfflineProvider:
    """Deterministic keyword classifier. NOT an AI model -- labelled as such."""

    provider_name = "offline:heuristic"
    model = "keyword-rules-v1"

    def describe(self):
        return "offline:heuristic model=keyword-rules-v1 (no network, not an AI model)"

    def call(self, prompt, system=None):
        """Answer a classification or Q&A prompt with deterministic rules."""
        if "<question>" in prompt:
            return self._answer_question(prompt)
        text = _extract_review_text(prompt)
        lowered = text.casefold()

        positive = _count_any(lowered, POSITIVE_WORDS)
        negative = _count_any(lowered, NEGATIVE_WORDS)
        if positive and negative:
            sentiment = "mixed"
        elif positive > negative:
            sentiment = "positive"
        elif negative > positive:
            sentiment = "negative"
        else:
            sentiment = "neutral"

        topics = [topic for topic, words in TOPIC_WORDS.items() if _count_any(lowered, words)]
        topics = topics[:3] or ["other"]

        quote = _best_quote(text, positive, negative)
        review_id = _extract_review_id(prompt)
        reason = (
            f"Heuristic match: {positive} positive and {negative} negative cue(s) "
            f"across {', '.join(topics)}."
        )[:160]

        return json.dumps(
            {
                "review_id": review_id,
                "sentiment": sentiment,
                "topics": topics,
                "evidence_quote": quote,
                "short_reason": reason,
            }
        )


    def _answer_question(self, prompt):
        """Quote the retrieved records back as a grounded, cited answer."""
        records = RECORD_RE.findall(prompt)
        if not records:
            return json.dumps(
                {
                    "answer": "The supplied records do not mention this.",
                    "cited_ids": [],
                    "insufficient_evidence": True,
                }
            )
        cited = []
        quotes = []
        for record_id, text in records[:2]:
            snippet = " ".join(text.split())
            if len(snippet) > 120:
                snippet = snippet[:119].rstrip() + "."
            quotes.append(f"{snippet} [{record_id}]")
            cited.append(record_id)
        return json.dumps(
            {
                "answer": "The reviews say: " + " ".join(quotes),
                "cited_ids": cited,
                "insufficient_evidence": False,
            }
        )


RECORD_RE = re.compile(r'<record id="([^"]+)"[^>]*>(.*?)</record>', re.S)

POSITIVE_WORDS = (
    "loved", "love", "amazing", "great", "fantastic", "brilliant", "excellent",
    "friendly", "helpful", "delicious", "best", "perfect", "enjoyed", "wonderful",
    "smooth", "quick", "clean", "worth",
)
NEGATIVE_WORDS = (
    "terrible", "awful", "poor", "bad", "hate", "hated", "slow", "long", "rude",
    "dirty", "expensive", "overpriced", "crowded", "confusing", "broken",
    "disappointing", "worst", "noisy", "queued", "waited", "muddy", "ran out",
)
TOPIC_WORDS = {
    "sound": ("sound", "audio", "speaker", "stage", "band", "dj", "music"),
    "food": ("food", "meal", "burger", "taco", "drink", "vendor", "menu", "eat"),
    "queue": ("queue", "queueing", "line", "waited", "wait", "entry", "gate"),
    "staff": ("staff", "crew", "security", "volunteer", "team", "organiser"),
    "pricing": ("price", "pricing", "expensive", "cost", "ticket", "refund", "worth"),
    "safety": ("safety", "unsafe", "dangerous", "crowd", "medical", "first aid"),
    "venue": ("venue", "field", "toilet", "toilets", "site", "ground", "layout"),
}


def _count_any(text, words):
    return sum(1 for word in words if word in text)


def _best_quote(text, positive, negative):
    """Return a real substring of the review, preferring the longest clause."""
    clauses = [clause.strip() for clause in text.replace(";", ",").split(",") if clause.strip()]
    if not clauses:
        return text[:QUOTE_LIMIT] if text else "n/a"
    clauses.sort(key=len, reverse=True)
    quote = clauses[0]
    if len(quote) > 200:
        quote = quote[:200].rsplit(" ", 1)[0]
    return quote or text[:200]


QUOTE_LIMIT = 200


def _extract_review_text(prompt):
    """Pull the review out of the wrapping tags classify.py uses."""
    start = prompt.find("<review>")
    end = prompt.find("</review>", start + 1)
    if start != -1 and end != -1:
        return prompt[start + len("<review>"):end].strip()
    return prompt


def _extract_review_id(prompt):
    marker = "review_id:"
    index = prompt.find(marker)
    if index == -1:
        return "UNKNOWN"
    tail = prompt[index + len(marker):]
    return tail.strip().split()[0].strip(",;\"'") if tail.strip() else "UNKNOWN"


def build_provider_from_env(env=None, **kwargs):
    """Build a provider from environment variables, or None if unconfigured.

    Recognised variables: VIBECHECK_PROVIDER (openai|openai_compatible|
    anthropic|gemini), VIBECHECK_API_KEY, VIBECHECK_MODEL, VIBECHECK_BASE_URL,
    VIBECHECK_TIMEOUT, VIBECHECK_RETRIES.
    """
    env = os.environ if env is None else env
    style = (env.get("VIBECHECK_PROVIDER") or "").strip().lower()
    key = (env.get("VIBECHECK_API_KEY") or "").strip()
    if not style and not key:
        return None
    if not style:
        style = "openai"
    if not key:
        raise ProviderConfigError(
            "VIBECHECK_PROVIDER is set but VIBECHECK_API_KEY is empty."
        )
    model = (env.get("VIBECHECK_MODEL") or "").strip() or None
    base_url = (env.get("VIBECHECK_BASE_URL") or "").strip() or None
    timeout = _as_int(env.get("VIBECHECK_TIMEOUT"), DEFAULT_TIMEOUT)
    retries = _as_int(env.get("VIBECHECK_RETRIES"), DEFAULT_RETRIES)
    return HTTPProvider(
        style=style,
        api_key=key,
        model=model,
        base_url=base_url,
        timeout=timeout,
        retries=retries,
        **kwargs,
    )


def _as_int(value, fallback):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return fallback
