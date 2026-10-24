# Rishe data tools — maintained with Rishe 1.6.2

The generated `data.json` is built from editable source files. Do not maintain independent edits only in `data.json`, because the next build will replace them.

## Rebuild the database

Run from the repository root:

```bash
python tools/build_data.py tools/source/starter.xlsx data.json tools/new_words tools/solo_words
python tools/build_aviation_coverage.py data.json tools/aviation_source/aviation_text_4000.txt data.json
python tools/validate_data.py data.json
```

`build_data.py` reads the curated workbook first, then text family batches in filename order, then standalone-word batches in filename order. Earlier sources take precedence: duplicate word forms are not added again from later text batches. Family and word identifiers are generated in a non-overlapping range based on IDs already present. `data.json` is deterministic for the same inputs and Python/openpyxl version.

## Family source format

```text
#base|etymology (leave blank if uncertain)|part of speech|Persian meaning|CEFR|topic
~English example sentence.|Persian translation of the example.
word|pos (v/n/adj/adv/prep)|Persian meaning
word|pos|Persian meaning
```

Each batch family starts as Draft. Keep generated or otherwise unreviewed content marked Draft until a human editor has checked the translation, word-family relationship, example, etymology, and CEFR estimate. Do not fill the etymology field with a guess. The builder detects prefix/suffix matches heuristically; that detection is not proof of a word's derivation.

The workbook remains the source of the original source-curated family set. `source-curated` means it came from the curated starter workbook, not that it has been independently validated by a professional lexicographer. The only status that counts as reviewed is the explicit `review_status: "reviewed"` status.

## Standalone-word source format

`tools/solo_words/*.txt`, one entry per line:

```text
word|pos|Persian meaning|CEFR|topic
```

Standalone records are marked Draft. Keep multiword expressions limited to established lexical terms; ordinary inflections and arbitrary explanatory phrases should not be added merely to increase counts.

## Validation and reports

`tools/validate_data.py` validates JSON structure, identifiers, reciprocal family-word references, required fields, POS and CEFR metadata, duplicates, missing example translations, draft/review status, and source-file collisions. It writes:

- `tools/reports/validation_report.md`
- `tools/reports/validation_report.json`

Warnings are not automatically corrected because repeated English forms may be legitimate polysemy or different parts of speech. The validator cannot prove that Persian meanings, etymologies, CEFR estimates, or family relationships are semantically correct. Those require independent editorial review.

## Individual corrections

Correct the source record in the workbook or its text batch, then run the rebuild and validator commands. Edit one source row rather than patching only the generated JSON. Use the generated report to compare counts, duplicate warnings, and review status before and after a change.

## Support URL

The `SUPPORT_URL` in `config.js` is set to the maintainer-supplied CoffeeBede page. Verify it opens the intended recipient before public deployment. The value is public configuration; never place payment credentials or secret tokens there.


## Rishe 1.6.1 generated inflections

`build_data.py` now appends a deterministic 50% increase in word records using regular verb forms and selected noun plurals. Generated entries point to their source headword and family, remain `Draft`, and carry individually generated template examples with `example_status: generated-draft`. These records are forms, not additional independently verified lemmas.


## Rishe 1.6.2 aviation-source import

`tools/build_aviation_coverage.py` compares every normalized token in `tools/aviation_source/aviation_text_4000.txt` with the current vocabulary records. Possessive `-s` is normalized to the lexical headword, while established hyphenated aviation terms remain intact; `en route` is stored as `en-route`. Source tokens already present anywhere in the dictionary are not duplicated. Clear roots and morphological families are linked conservatively, root/component headwords are added when needed, and tokens without a defensible root are placed in standalone/unique families. All imported records remain Draft.

The script emits `tools/reports/aviation_coverage_report_1.6.2.json`, including source coverage and any tokens left unmatched. The 1.6.2 corpus added 854 missing source tokens and 32 additional root/component records (886 records total): 529 are standalone/unique entries and 357 are grouped into root families. Meanings and family links require editorial review. The import is deterministic and safe to rerun on an already-imported dictionary.
