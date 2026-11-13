"""Dataset import: CSV or JSON in, validated reviews out.

Two rules matter more than the parsing itself:

1. A bad *record* is rejected and reported, and the good records still load.
2. A bad *file* (unreadable, wrong shape, no usable records) raises IngestError
   so the caller can keep the dataset it already had. Existing state is never
   replaced by a half-read file.
"""

import csv
import json
from pathlib import Path

from .models import IngestError, RecordError, Review

EXPECTED_FIELDS = ("id", "event", "text", "created_at")


def import_reviews(path):
    """Load reviews from ``path``. Returns (reviews, report_dict)."""
    file_path = Path(path)
    if not file_path.exists():
        raise IngestError(f"No such file: {path}")
    if file_path.suffix.lower() not in (".csv", ".json"):
        raise IngestError("Dataset must be a .csv or .json file.")

    raw_rows = _read_rows(file_path)
    if not raw_rows:
        raise IngestError(f"{file_path.name} contains no records.")

    reviews = []
    rejected = []
    seen_ids = set()

    for index, row in enumerate(raw_rows, start=1):
        where = f"{file_path.name} row {index}"
        try:
            review = Review.from_dict(row, where=where)
        except RecordError as error:
            rejected.append(str(error))
            continue
        if review.id in seen_ids:
            rejected.append(f"{where}: duplicate id {review.id} rejected.")
            continue
        seen_ids.add(review.id)
        reviews.append(review)

    if not reviews:
        raise IngestError(
            f"{file_path.name}: every record was rejected, so the dataset was not replaced. "
            + " ".join(rejected[:3])
        )

    report = {
        "path": str(file_path),
        "accepted": len(reviews),
        "rejected": len(rejected),
        "reasons": rejected,
    }
    return reviews, report


def _read_rows(file_path):
    """Read the file into a list of raw dicts, normalising encoding problems."""
    if file_path.suffix.lower() == ".json":
        return _read_json(file_path)
    return _read_csv(file_path)


def _read_json(file_path):
    try:
        with open(file_path, "r", encoding="utf-8-sig") as stream:
            data = json.load(stream)
    except UnicodeDecodeError:
        raise IngestError(f"{file_path.name} is not UTF-8 text.") from None
    except json.JSONDecodeError as error:
        raise IngestError(f"{file_path.name} is not valid JSON: {error}") from None

    if isinstance(data, dict):
        for key in ("reviews", "records", "data"):
            if isinstance(data.get(key), list):
                return data[key]
        raise IngestError(f"{file_path.name} must contain a list of reviews.")
    if isinstance(data, list):
        return data
    raise IngestError(f"{file_path.name} must contain a list of reviews.")


def _read_csv(file_path):
    try:
        with open(file_path, "r", encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            if reader.fieldnames is None:
                return []
            header = [name.strip() for name in reader.fieldnames]
            missing = [name for name in EXPECTED_FIELDS if name not in header]
            if missing:
                raise IngestError(
                    f"{file_path.name} is missing column(s): {', '.join(missing)}."
                )
            rows = []
            for raw in reader:
                rows.append(
                    {key.strip(): (value.strip() if isinstance(value, str) else value)
                     for key, value in raw.items() if key}
                )
            return rows
    except UnicodeDecodeError:
        raise IngestError(f"{file_path.name} is not UTF-8 text.") from None
    except csv.Error as error:
        raise IngestError(f"{file_path.name} is not valid CSV: {error}") from None


def write_json(path, payload):
    """Write derived data (analyses, cache) as UTF-8 JSON."""
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as stream:
        json.dump(payload, stream, indent=2, ensure_ascii=False)
        stream.write("\n")
    return file_path


def read_json(path, default=None):
    """Read derived data, returning ``default`` when the file does not exist."""
    file_path = Path(path)
    if not file_path.exists():
        return default
    with open(file_path, "r", encoding="utf-8") as stream:
        return json.load(stream)
