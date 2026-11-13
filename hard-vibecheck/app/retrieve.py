"""Deterministic evidence retrieval.

Question answering may only use reviews that were actually retrieved, so this
module is the gatekeeper: it tokenises, matches, and returns records with ids.
No embeddings, no network, no hidden state -- the same question over the same
dataset always returns the same evidence in the same order, which is what makes
the citation check meaningful.
"""

from .models import MAX_TOP_K

STOPWORDS = frozenset(
    """a an and are as at be been but by can did do does for from had has have how
    i if in into is it its just me my not of on or our so than that the their them
    then there these they this to too was we were what when where which who why
    will with would you your about""".split()
)

TOPIC_HINTS = {
    "sound": ("sound", "audio", "music", "band", "dj", "stage"),
    "food": ("food", "eat", "meal", "burger", "drink", "vendor", "menu"),
    "queue": ("queue", "line", "wait", "waiting", "entry", "gate"),
    "staff": ("staff", "crew", "security", "volunteer", "team"),
    "pricing": ("price", "cost", "expensive", "ticket", "refund", "value"),
    "safety": ("safety", "unsafe", "dangerous", "crowd", "medical", "injury"),
    "venue": ("venue", "toilet", "site", "field", "layout", "ground"),
}


def tokenize(text):
    """Lowercase word tokens of 3+ characters with stopwords removed."""
    cleaned = []
    for character in str(text).lower():
        cleaned.append(character if character.isalnum() else " ")
    words = "".join(cleaned).split()
    return [word for word in words if len(word) >= 3 and word not in STOPWORDS]


def hint_topics(question):
    """Topics the question seems to be about, used as a soft relevance boost."""
    tokens = set(tokenize(question))
    matched = []
    for topic, words in TOPIC_HINTS.items():
        if tokens & set(words):
            matched.append(topic)
    return matched


def score_review(question_tokens, question_topics, review, classification=None):
    """Relevance score: token overlap, plus a small boost for topic matches."""
    text_tokens = set(tokenize(review.text))
    overlap = len(set(question_tokens) & text_tokens)
    score = overlap * 2
    if classification is not None and question_topics:
        topics = set(classification.topics)
        score += 2 * len(topics & set(question_topics))
        if classification.sentiment == "negative" and "complaint" in question_tokens:
            score += 2
    return score


def search(question, reviews, classifications=None, top_k=3, min_score=1):
    """Return the best evidence records for a question, best first.

    Each result is ``{"review": Review, "score": int, "classification": ...}``.
    Records that score zero are excluded, so an off-topic question returns no
    evidence at all and the caller can abstain honestly.
    """
    top_k = max(1, min(int(top_k or 1), MAX_TOP_K))
    question_tokens = tokenize(question)
    question_topics = hint_topics(question)
    classifications = classifications or {}

    scored = []
    for order, review in enumerate(reviews):
        classification = classifications.get(review.id)
        score = score_review(question_tokens, question_topics, review, classification)
        if score >= min_score:
            scored.append((score, order, review, classification))

    scored.sort(key=lambda item: (-item[0], item[2].id))
    results = [
        {"review": review, "score": score, "classification": classification}
        for score, _, review, classification in scored[:top_k]
    ]
    return results


def evidence_ids(results):
    """The ids of retrieved records, which is the allow-list for citations."""
    return [result["review"].id for result in results]


def format_evidence(results, max_text=170):
    """Human-readable evidence block with ids, for the CLI and for audits."""
    if not results:
        return "No matching reviews were found."
    lines = []
    for result in results:
        review = result["review"]
        text = review.text
        if len(text) > max_text:
            text = text[: max_text - 1].rstrip() + "…"
        label = ""
        classification = result.get("classification")
        if classification is not None:
            label = f" [AI: {classification.sentiment}]"
        lines.append(f"  {review.id}{label}  {text}")
    return "\n".join(lines)
