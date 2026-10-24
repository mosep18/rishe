# Changelog

## 1.6.2 — 2026-10-24

- Compared all normalized lexical tokens in `aviation_text_4000.txt` against the complete 1.6.1 dictionary; all 1,448 unique source tokens are represented after import.
- Added 854 missing source vocabulary terms and 32 absent root/component headwords (886 new word records total), bringing the dictionary from 10,743 to 11,629 records. Of the additions, 529 are standalone/unique entries and 357 are grouped into root families.
- Preserved established hyphenated terms, normalized possessives, added exact-word source-sentence examples where possible, linked clear roots to families, and placed terms without a defensible family into standalone/unique entries.
- Marked all imported records as Draft and included an import report; Persian meanings, parts of speech, and morphological relationships still require human editorial review.
- Updated app/package/manifest/Service Worker version metadata and cache version to 1.6.2.

## 1.6.1 — 2026-10-24

- Added English–Persian paired labels and explanations across Learn, study sessions, progress, collections, About Rishe, and Support development.
- Added a responsive seven-day learning activity bar chart separating new-word introductions from scheduled reviews.
- Added opt-in local daily reminder notifications with a selectable time, user-controlled permission, once-per-local-day behavior, and notification-click navigation to Learn. Reminders are checked while Rishe remains open; no background push service is included.
- Fixed example selection: an entry no longer inherits an unrelated family-root example. A family example is shown only if the exact headword appears in the sentence.
- Expanded `data.json` from 7,162 to 10,743 word records (1.5×) with 3,581 generated inflectional forms. Generated forms and their template examples are marked Draft and require editorial review; the number of independent lexical lemmas was not increased by 1.5×.
- Updated package, app, manifest, and Service Worker version metadata and cache version.

## 1.6.0 — 2026-10-24

- Added local-first spaced repetition, daily goals, learning statistics, collections, export/import, and a versioned learning store.
- Preserved the existing dictionary data and legacy saved-word/practice stores.
