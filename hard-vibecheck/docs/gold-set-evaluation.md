# Gold-set evaluation — VibeCheck AI

## What was done

Twelve reviews (`R001`–`R012`) were hand-labelled by me into one of
positive, negative, neutral, mixed, using the same definition the prompt gives
the model: *mixed means the review contains both praise and complaint*.
Labels live in `data/gold_labels.json`. The hand labels were written before
noting the offline provider's output, so this is not a label-matching exercise.

The comparison is produced by `report.evaluate_against_gold` and can be
reproduced with option 8 of the CLI after analysing the dataset.

## Result

```
Gold-set check: 11/12 agree (91.7%).
Hand labels supplied: 12.
Disagreements:
  R006: hand=neutral model=negative
        "The festival was fine. Nothing special, nothing terrible."
```

Hand labels used:

| id | hand label |
| --- | --- |
| R001 | mixed |
| R002 | negative |
| R003 | positive |
| R004 | negative |
| R005 | positive |
| R006 | neutral |
| R007 | mixed |
| R008 | negative |
| R009 | mixed |
| R010 | positive |
| R011 | negative |
| R012 | positive |

## Error analysis of the one disagreement

`R006` — *"The festival was fine. Nothing special, nothing terrible."*

* A human reads "nothing terrible" as a negation: no complaint, so neutral.
* The keyword provider sees the token `terrible` in its negative list and calls
  it negative. It has no notion of negation or of "nothing X" phrasing.

This is a real limitation of the offline rule set, not a bug in the pipeline: the
validator accepted the label because the quote ("The festival was fine" or a
substring containing `terrible`) genuinely appears in the review. Structural
verification cannot catch a semantically wrong label, which is exactly why the
project separates *schema correctness* from *label quality*.

Fix in a real run: use the live model, which handles negation; keep this case in
the gold set so a regression is visible.

## What this number does and does not mean

* It means the pipeline agreed with one annotator on 11 of 12 invented reviews.
* It does **not** mean the system is 91.7% accurate in general. Twelve examples,
  one annotator, one event and a keyword provider are nowhere near a benchmark.
  Confidence intervals on n=12 are enormous, and the sample was not random.
* The other sentiment numbers in the report (positive 12, negative 8, neutral 6,
  mixed 6 of 32) are arithmetic over stored labels. They are internally
  consistent and reproducible, and they are still only as good as the labels.

## Reproducing

```bash
cd hard-vibecheck
python main.py
# 1  import data/synthetic_reviews.csv
# 4  analyse (type: yes)
# 8  gold-set evaluation
```

```bash
python -m unittest discover -s tests -v   # includes the evaluation tests
```
