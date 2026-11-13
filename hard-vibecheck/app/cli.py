"""The terminal application: one class, one menu, one piece of state.

The CLI is a shell. Importing, classifying, reporting, retrieval and answering
all live in their own modules, so this file can be read in a couple of minutes
and the engine can be tested without it.
"""

from pathlib import Path

from . import PROMPT_VERSION
from .classify import classify_many
from .cache import cache_from_file
from .ingest import import_reviews, read_json, write_json
from .models import Classification, ProviderConfigError, RecordError, VibeCheckError
from .provider import OfflineProvider, build_provider_from_env
from .qa import answer_question, format_answer
from .quiz import run_quiz
from .report import (
    build_report,
    evaluate_against_gold,
    format_gold_evaluation,
    format_report,
)
from .retrieve import format_evidence, search

MENU = """
VibeCheck AI -- Festival Feedback Detective
 1) Import reviews (CSV or JSON)
 2) List reviews
 3) Show provider / configuration status
 4) Analyse reviews with the configured provider
 5) Show one review with its analysis
 6) Report: validated statistics
 7) Ask a grounded question (answer must cite retrieved reviews)
 8) Gold-set evaluation against hand labels
 9) Save analyses
10) Load analyses
11) Cache status
12) Engineering self-check (12 questions)
13) Quit
"""

DEFAULT_PATHS = {
    "dataset": "data/synthetic_reviews.csv",
    "analyses": "data/analyses.json",
    "cache": "data/cache.json",
    "gold": "data/gold_labels.json",
}


class VibeCheckApp:
    """Holds the dataset, the verified analyses and the provider."""

    def __init__(self, input_fn=input, output_fn=print, provider=None, paths=None):
        self.input_fn = input_fn
        self.output_fn = output_fn
        self.paths = dict(DEFAULT_PATHS)
        if paths:
            self.paths.update(paths)

        self.reviews = []
        self.classifications = {}
        self.errors = {}
        self.running = True
        self.cache = cache_from_file(self.paths["cache"])

        self.provider = provider
        self.offline = isinstance(self.provider, OfflineProvider)
        if self.provider is None:
            try:
                self.provider = build_provider_from_env()
            except ProviderConfigError as error:
                self.output_fn(f"Provider configuration problem: {error}")
                self.provider = None
            if self.provider is None:
                self.provider = OfflineProvider()
                self.offline = True

    # ------------------------------------------------------------------ helpers
    def provider_label(self):
        """A label honest enough to paste into a report."""
        if self.provider is None:
            return "unconfigured"
        if self.offline:
            return f"{self.provider.describe()} -- NOT a live AI model"
        return self.provider.describe()

    def review_by_id(self, review_id):
        wanted = str(review_id).strip().upper()
        for review in self.reviews:
            if review.id == wanted:
                return review
        return None

    def report(self):
        return build_report(self.reviews, self.classifications, self.errors)

    # -------------------------------------------------------------------- menu
    def run(self):
        self.output_fn(MENU)
        self.output_fn(f"Provider: {self.provider_label()}")
        if self.offline:
            self.output_fn(
                "Offline mode: classifications come from deterministic keyword rules. "
                "Set VIBECHECK_PROVIDER and VIBECHECK_API_KEY to use a real model."
            )
        while self.running:
            try:
                choice = self.input_fn("\nChoice > ")
            except (EOFError, KeyboardInterrupt):
                self.output_fn("\nClosing VibeCheck AI.")
                return
            try:
                self.handle(choice)
            except VibeCheckError as error:
                self.output_fn(f"Error: {error}")

    def handle(self, choice):
        actions = {
            "1": self.import_action,
            "2": self.list_action,
            "3": self.status_action,
            "4": self.analyse_action,
            "5": self.show_action,
            "6": self.report_action,
            "7": self.ask_action,
            "8": self.gold_action,
            "9": self.save_action,
            "10": self.load_action,
            "11": self.cache_action,
            "12": self.quiz_action,
            "13": self.quit_action,
            "q": self.quit_action,
        }
        action = actions.get(str(choice).strip().lower())
        if action is None:
            self.output_fn("Unknown choice. Enter a number from 1 to 13.")
            return self.running
        action()
        return self.running

    # ----------------------------------------------------------------- actions
    def import_action(self):
        path = self.input_fn(f"Dataset path [{self.paths['dataset']}]: ").strip()
        path = path or self.paths["dataset"]
        reviews, report = import_reviews(path)
        # Only now is the live dataset replaced, so a broken file changes nothing.
        self.reviews = reviews
        self.classifications = {}
        self.errors = {}
        self.output_fn(
            f"Imported {report['accepted']} review(s) from {Path(path).name}; "
            f"{report['rejected']} rejected."
        )
        for reason in report["reasons"][:5]:
            self.output_fn(f"  rejected: {reason}")
        stale = len(self.cache)
        if stale:
            self.output_fn(f"Cache still holds {stale} earlier entr(y/ies); they are keyed by text hash.")

    def list_action(self):
        if not self.reviews:
            self.output_fn("No reviews loaded yet. Use option 1.")
            return
        self.output_fn(f"{len(self.reviews)} review(s) loaded:")
        for review in self.reviews:
            state = "analysed" if review.id in self.classifications else "not analysed"
            self.output_fn(
                f"  {review.id}  {review.created_at}  [{state}]  "
                f"{review.text[:70]}{'...' if len(review.text) > 70 else ''}"
            )

    def status_action(self):
        self.output_fn(f"Provider: {self.provider_label()}")
        self.output_fn(f"Prompt version: {PROMPT_VERSION}")
        self.output_fn(f"Reviews loaded: {len(self.reviews)}")
        self.output_fn(f"Analyses in memory: {len(self.classifications)}")
        self.output_fn(f"Rejected model outputs: {len(self.errors)}")
        self.output_fn(
            "To use a real model, set VIBECHECK_PROVIDER (openai|openai_compatible|anthropic|"
            "gemini), VIBECHECK_API_KEY and optionally VIBECHECK_MODEL. The key is read from "
            "the environment and never printed."
        )

    def analyse_action(self):
        if not self.reviews:
            self.output_fn("Import reviews first (option 1).")
            return
        pending = [review for review in self.reviews if review.id not in self.classifications]
        if not pending:
            self.output_fn("Every review already has a verified analysis.")
            return
        answer = self.input_fn(
            f"Analyse {len(pending)} review(s) with {self.provider_label()}? Type 'yes': "
        ).strip().lower()
        if answer != "yes":
            self.output_fn("Cancelled. Nothing was sent anywhere.")
            return

        before = self.cache.stats()
        results, errors = classify_many(
            pending,
            self.provider,
            cache=self.cache,
            on_progress=lambda done, total, rid: self.output_fn(f"  {done}/{total} {rid}"),
        )
        self.classifications.update(results)
        self.errors.update(errors)
        after = self.cache.stats()
        self.output_fn(
            f"Verified {len(results)} classification(s). Rejected {len(errors)}. "
            f"Cache hits {after['hits'] - before['hits']}, misses {after['misses'] - before['misses']}."
        )
        for review_id, message in list(errors.items())[:5]:
            self.output_fn(f"  rejected {review_id}: {message}")
        self.cache.save()

    def show_action(self):
        review_id = self.input_fn("Review id (e.g. R001): ").strip()
        review = self.review_by_id(review_id)
        if review is None:
            self.output_fn(f"No review with id '{review_id}'.")
            return
        self.output_fn(f"\n{review.id}  {review.event}  {review.created_at}")
        self.output_fn(f'  text: "{review.text}"')
        classification = self.classifications.get(review.id)
        if classification is None:
            self.output_fn("  No verified analysis yet (or its output was rejected).")
            if review.id in self.errors:
                self.output_fn(f"  rejection reason: {self.errors[review.id]}")
            return
        self.output_fn(f"  sentiment: {classification.sentiment}   (AI-derived inference)")
        self.output_fn(f"  topics: {', '.join(classification.topics) or 'none'}")
        self.output_fn(f'  evidence: "{classification.evidence_quote}" ({classification.quote_match})')
        self.output_fn(f"  reason: {classification.short_reason}")
        self.output_fn(
            f"  provenance: {classification.provider} / {classification.model} / "
            f"{classification.prompt_version} / hash {classification.source_hash[:12]}"
        )

    def report_action(self):
        if not self.reviews:
            self.output_fn("Import reviews first (option 1).")
            return
        self.output_fn(format_report(self.report(), self.provider_label()))

    def ask_action(self):
        if not self.reviews:
            self.output_fn("Import reviews first (option 1).")
            return
        question = self.input_fn("Question about the reviews: ").strip()
        if not question:
            self.output_fn("No question asked.")
            return
        result = answer_question(
            question,
            self.reviews,
            self.classifications,
            self.provider,
            top_k=3,
            report=self.report(),
        )
        self.output_fn("\n" + format_answer(result))
        if result["evidence"]:
            self.output_fn("Evidence retrieved:")
            self.output_fn(
                format_evidence(
                    search(question, self.reviews, self.classifications, top_k=3)
                )
            )

    def gold_action(self):
        gold = read_json(self.paths["gold"], default={})
        if not gold:
            self.output_fn(f"No gold labels found at {self.paths['gold']}.")
            return
        evaluation = evaluate_against_gold(self.reviews, self.classifications, gold)
        self.output_fn(format_gold_evaluation(evaluation))

    def save_action(self):
        if not self.classifications:
            self.output_fn("Nothing to save yet.")
            return
        payload = {
            "schema_version": 1,
            "prompt_version": PROMPT_VERSION,
            "provider": self.provider_label(),
            "analyses": {
                review_id: classification.to_dict()
                for review_id, classification in sorted(self.classifications.items())
            },
            "rejected": self.errors,
        }
        write_json(self.paths["analyses"], payload)
        self.output_fn(f"Saved {len(self.classifications)} analysis(es) to {self.paths['analyses']}.")

    def load_action(self):
        payload = read_json(self.paths["analyses"], default=None)
        if not payload:
            self.output_fn(f"No analyses file at {self.paths['analyses']}.")
            return
        stored = payload.get("analyses", {})
        loaded = {}
        problems = []
        for review_id, raw in stored.items():
            try:
                classification = Classification.from_dict(raw)
            except VibeCheckError as error:
                problems.append(f"{review_id}: {error}")
                continue
            review = self.review_by_id(review_id)
            if review is None:
                problems.append(f"{review_id}: no review with that id in the current dataset")
                continue
            if classification.source_hash != review.text_hash:
                problems.append(f"{review_id}: stored analysis is stale for the current text")
                continue
            loaded[review_id] = classification
        self.classifications.update(loaded)
        self.output_fn(
            f"Loaded {len(loaded)} analysis(es) from {payload.get('provider', 'unknown provider')}."
        )
        for problem in problems[:5]:
            self.output_fn(f"  ignored: {problem}")

    def cache_action(self):
        stats = self.cache.stats()
        self.output_fn(
            f"Cache: {stats['entries']} entr(y/ies), {stats['hits']} hit(s), "
            f"{stats['misses']} miss(es) this session."
        )
        self.output_fn(f"File: {self.paths['cache']} (derived data; safe to delete)")

    def quiz_action(self):
        run_quiz(input_fn=self.input_fn, output_fn=self.output_fn)

    def quit_action(self):
        self.running = False
        self.output_fn("Goodbye. Analyses are only saved when you choose option 9.")
