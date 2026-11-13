"""Statistics, reports and gold-set evaluation.

Every number in this module is computed in Python from stored, *verified* labels.
The model is never asked for a total. Unanalysed and rejected reviews are
reported as such and never folded into a label, and every percentage handles a
zero denominator instead of dividing by it.
"""

from .models import SENTIMENTS, TOPICS


def build_report(reviews, classifications, errors=None):
    """Return the full derived report as a plain dictionary."""
    errors = errors or {}
    analysed = {rid: c for rid, c in classifications.items() if rid}

    sentiment_counts = {sentiment: 0 for sentiment in SENTIMENTS}
    topic_counts = {topic: 0 for topic in TOPICS}
    quotes = []

    for review in reviews:
        classification = analysed.get(review.id)
        if classification is None:
            continue
        sentiment_counts[classification.sentiment] += 1
        for topic in classification.topics:
            topic_counts[topic] += 1
        quotes.append(
            {
                "review_id": review.id,
                "quote": classification.evidence_quote,
                "sentiment": classification.sentiment,
            }
        )

    total = len(reviews)
    analysed_count = sum(sentiment_counts.values())
    unanalysed = [review.id for review in reviews if review.id not in analysed]

    sentiment_block = {}
    for sentiment, count in sentiment_counts.items():
        sentiment_block[sentiment] = {
            "count": count,
            "percent_of_analysed": percentage(count, analysed_count),
            "percent_of_dataset": percentage(count, total),
        }

    by_event = {}
    for review in reviews:
        classification = analysed.get(review.id)
        bucket = by_event.setdefault(
            review.event,
            {"reviews": 0, "analysed": 0, "sentiment": {s: 0 for s in SENTIMENTS}},
        )
        bucket["reviews"] += 1
        if classification is not None:
            bucket["analysed"] += 1
            bucket["sentiment"][classification.sentiment] += 1

    return {
        "total_reviews": total,
        "analysed": analysed_count,
        "unanalysed": unanalysed,
        "invalid": sorted(errors),
        "errors": dict(errors),
        "sentiment": sentiment_block,
        "topics": dict(sorted(topic_counts.items(), key=lambda item: (-item[1], item[0]))),
        "by_event": by_event,
        "quotes": quotes,
        "labels_are_ai_derived": True,
    }


def percentage(count, denominator):
    """Percentage with one decimal, safe when there is nothing to divide by."""
    if not denominator:
        return 0.0
    return round(count * 100.0 / denominator, 1)


def format_report(report, provider_label="unknown provider"):
    """Render the report for a terminal, with provenance on the first line."""
    lines = []
    lines.append("VibeCheck AI -- festival feedback report")
    lines.append(f"Model/provider: {provider_label}")
    lines.append("Labels below are AI-derived inferences, not verified facts.")
    lines.append("")
    lines.append(
        f"Reviews: {report['total_reviews']} total, {report['analysed']} analysed, "
        f"{len(report['unanalysed'])} not analysed, {len(report['invalid'])} rejected."
    )
    if report["unanalysed"]:
        lines.append("  Not analysed: " + ", ".join(report["unanalysed"]))
    if report["invalid"]:
        lines.append("  Rejected output: " + ", ".join(report["invalid"]))

    lines.append("")
    lines.append("Sentiment (share of analysed reviews)")
    width = max(len(s) for s in SENTIMENTS) + 2
    for sentiment in SENTIMENTS:
        block = report["sentiment"][sentiment]
        bar = "#" * int(round(block["percent_of_analysed"] / 4))
        lines.append(
            f"  {sentiment.ljust(width)}{str(block['count']).rjust(3)}  "
            f"{block['percent_of_analysed']:5.1f}%  {bar}"
        )

    lines.append("")
    lines.append("Topics mentioned (one review can mention several)")
    for topic, count in report["topics"].items():
        if count:
            lines.append(f"  {topic.ljust(9)} {count}")
    if not any(report["topics"].values()):
        lines.append("  none")

    if report["by_event"]:
        lines.append("")
        lines.append("By event")
        for event, bucket in report["by_event"].items():
            parts = ", ".join(
                f"{sentiment} {bucket['sentiment'][sentiment]}"
                for sentiment in SENTIMENTS
                if bucket["sentiment"][sentiment]
            )
            lines.append(
                f"  {event}: {bucket['analysed']}/{bucket['reviews']} analysed"
                + (f" ({parts})" if parts else "")
            )
    return "\n".join(lines)


def format_sentiment_statistics(report):
    """A short, hand-checkable distribution for the Q&A demo."""
    total = report["analysed"]
    parts = [
        f"{sentiment} {report['sentiment'][sentiment]['count']}"
        for sentiment in SENTIMENTS
    ]
    return f"of {total} analysed reviews: " + ", ".join(parts)


def evaluate_against_gold(reviews, classifications, gold):
    """Compare AI labels with hand labels. Returns agreement and disagreements.

    ``gold`` maps review id -> one of SENTIMENTS. Accuracy here is evidence about
    this small sample only; it is not proof of correctness in general.
    """
    compared = 0
    agreed = 0
    disagreements = []
    missing = []

    for review in reviews:
        expected = gold.get(review.id)
        if expected is None:
            continue
        classification = classifications.get(review.id)
        if classification is None:
            missing.append(review.id)
            continue
        compared += 1
        if classification.sentiment == expected:
            agreed += 1
        else:
            disagreements.append(
                {
                    "review_id": review.id,
                    "gold": expected,
                    "model": classification.sentiment,
                    "quote": classification.evidence_quote,
                    "text": review.text,
                }
            )

    return {
        "compared": compared,
        "agreed": agreed,
        "accuracy_percent": percentage(agreed, compared),
        "disagreements": disagreements,
        "missing": missing,
        "gold_size": len(gold),
        "note": "Agreement on a small hand-labelled sample is not proof of correctness.",
    }


def format_gold_evaluation(evaluation):
    """Render a gold-set comparison."""
    lines = [
        f"Gold-set check: {evaluation['agreed']}/{evaluation['compared']} agree "
        f"({evaluation['accuracy_percent']}%).",
        f"Hand labels supplied: {evaluation['gold_size']}.",
    ]
    if evaluation["missing"]:
        lines.append("Not analysed yet: " + ", ".join(evaluation["missing"]))
    if evaluation["disagreements"]:
        lines.append("Disagreements:")
        for item in evaluation["disagreements"]:
            lines.append(
                f"  {item['review_id']}: hand={item['gold']} model={item['model']} "
                f"| {item['text'][:90]}"
            )
    lines.append(evaluation["note"])
    return "\n".join(lines)
