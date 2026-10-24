# Rishe 1.6.2

Rishe is a lightweight English–Persian vocabulary dictionary and local-first learning PWA built with vanilla JavaScript, CSS, JSON, and browser storage. It keeps the existing dictionary, word-family and affix explorer, saved words, legacy flashcards/quizzes, theme settings, and CoffeeBede support page while adding daily learning, spaced repetition, progress tracking, personal collections, and local data backup.

## Run locally

Serve the repository over HTTP rather than opening `index.html` through `file://` (the app fetches `data.json` and registers a Service Worker):

```bash
python -m http.server 8000
```

Open `http://localhost:8000/`. The first online load is required before the offline shell and dictionary can be used reliably. Service Workers generally require HTTPS in production or `localhost` during development.

## Learning features

- **Daily plan:** reviews due words first; new vocabulary is capped by the daily goal and deferred on heavy-review days.
- **Spaced repetition:** four recall ratings (`Again`, `Hard`, `Good`, `Easy`) update a separate user learning record for each stable word ID.
- **Learning status:** `learning`, `review`, and `relearning` are user-specific scheduler states. They do not change the dictionary's editorial `review_status` or `draft` metadata.
- **Progress:** introduced words, review events, current scheduler states, seven-day recall accuracy, and a seven-local-calendar-day activity summary.
- **Collections:** create, rename, describe, delete, and study personal word lists. Collection practice records a practice event but does not alter due dates; scheduled review within a collection does alter schedules.
- **Local backup:** the Learning page exports learning records, event history, settings, personal collections, saved words, theme, and legacy practice scores to JSON. Import supports merge or replacement and filters references not present in the current dictionary. This is a local file, not a cloud backup or synchronization service.
- **Offline:** `learning.js` is part of the versioned Service Worker app shell. Learning and stored progress require no remote backend.

The existing Saved section remains distinct from learning history: saving a word does **not** automatically introduce it to the learner's schedule or mark it as learned. Existing saved-word and theme keys remain in place.

## Scheduling rules

The scheduler is a documented, deterministic SM-2/Leitner-inspired approximation; it is **not** the official SM-2 algorithm. Review timestamps and intervals use numeric epoch milliseconds, so due intervals are elapsed-time intervals rather than locale-parsed date strings.

| Rating | Result |
|---|---|
| Again | Counts as unsuccessful, resets consecutive success, and schedules a retry in 15 minutes. An established word enters `relearning`; other words return to `learning`. |
| Hard | Counts as a successful but difficult recall. An early word gets a 1-day interval; established intervals increase by 1.2×. Two consecutive non-Again recalls can graduate a word into `review`. |
| Good | Counts as a successful recall. An early word gets 1 day after the first successful recall; a second consecutive success graduates it to `review` with at least a 3-day interval. Established intervals double, with a 3-day minimum. |
| Easy | Counts as successful and graduates the word to `review`; the initial interval is 3 days, otherwise the interval increases by 2.5×. |

Intervals are capped at 180 days. `Again` schedules 15 minutes. New words initially enter `learning` with a 10-minute first-review time. Failed recall resets the consecutive-success count. `Hard`, `Good`, and `Easy` count as successful for the displayed recall-accuracy metric; `Again` is unsuccessful.

The daily new-word limit follows the configured goal (default 10, supported range 1–100). If at least 10 reviews are due, the remaining new-word goal is halved; if at least 20 are due, no new words are introduced that day. The daily goal counts unique words introduced on the current local calendar day, whereas review due dates use elapsed milliseconds. The new-word selection is deterministic for a given local day and current learning state, and avoids reintroducing an already-recorded word.

Stable user learning IDs are derived from the normalized English form plus the normalized family base, rather than a mutable array index. That distinguishes same-spelling entries across different families without embedding full dictionary entries in storage. If a future content release renames a family base, its derived ID changes; review collections and imports will safely skip references not found in the current data.

## Data model and migration

- Public dictionary data remains in `data.json`; it is not copied to local storage.
- User learning data is stored in `localStorage` under `rishe.learning`, schema version `1`.
- Existing keys such as `rishe.favs`, `rishe.box`, `rishe.theme`, `rishe.src`, and `rishe.recent` remain separate and are not renamed.
- The first learning schema defaults missing settings and optional fields. Future unsupported schema versions and corrupt JSON are not overwritten; the app enters in-memory mode and displays a warning. A raw corrupt payload is also copied to a recovery key when storage permits it.
- Review-event history is capped at the most recent 20,000 stored events. Recall checks from the legacy flashcard/quiz rounds also affect scheduling and are included in recall-event statistics; completed legacy rounds are counted when their score screen is reached. Derived metrics are computed from stored learning records/events rather than cached as authoritative counts.
- If browser storage is blocked or full, changes may remain only in memory until the page closes. Export data regularly if local-only progress matters.

## Tests and validation

Run the learning-engine tests and JavaScript syntax checks:

```bash
npm test
npm run check
python tools/validate_data.py data.json
```

The Node tests cover scheduler transitions and interval boundaries, daily-plan selection and review-backlog behavior, statistics definitions, collections, legacy-practice integration, storage persistence/failure/corruption, and import validation. They do not substitute for testing the UI in a real browser.

## Build and validate the vocabulary database

The generated `data.json` is derived from the workbook and text source files. From the repository root:

```bash
python tools/build_data.py tools/source/starter.xlsx data.json tools/new_words tools/solo_words
python tools/build_aviation_coverage.py data.json tools/aviation_source/aviation_text_4000.txt data.json
python tools/validate_data.py data.json
```

Review `tools/reports/validation_report.md` and `.json` after each build. The validation report distinguishes family candidates from standalone records and single-token entries from multiword lexical terms. Duplicate English forms are reported for editorial decisions; they are not automatically deleted because polysemy and cross-family membership can be valid. Most added content remains Draft or source-curated and has not been independently editorially verified. Structural validation does not certify Persian translations, CEFR assignments, etymologies, or word-family relationships.

## CoffeeBede support configuration

`config.js` contains one public configuration value:

```js
window.RISHE_CONFIG = Object.freeze({
  SUPPORT_URL: 'https://www.coffeebede.com/mosep29'
});
```

This is voluntary external support and does not unlock features. Verify the URL opens the intended recipient page before publishing. Never place secrets, payment credentials, or API keys in this public client-side configuration.

## GitHub Pages release checklist

1. Review `CHANGELOG.md`, the current diff, `tools/reports/release_test_report_1.6.2.md`, and vocabulary-validation warnings.
2. Run `npm test`, `npm run check`, and `python tools/validate_data.py data.json`.
3. In a real browser, verify search, word families, affixes, saved words, legacy practice, daily learning, all four recall ratings, goal changes, progress, collection CRUD, both collection-study modes, import/export, and theme persistence.
4. Verify a narrow mobile viewport, keyboard navigation, labels/focus indicators, and contrast.
5. Visit online once, then disconnect the network and verify the cached app shell, dictionary, study flows, and learning data. Upgrade from a version with existing saved words and theme settings and confirm they remain available.
6. Verify CoffeeBede opens the intended page. Check the repository's Pages source and branch before publishing.
7. Commit and push the release through your normal Git workflow. This project package does not itself commit, push, or deploy remotely.

## Project version

Version: **1.6.2**. Release history is in `CHANGELOG.md`.


## Rishe 1.6.1 notes

The Learn area now presents paired English and Persian UI text. Progress includes a seven-day chart for new-word introductions and reviews. Personal reminders are opt-in and use browser notifications while Rishe is open. Because this release has no remote push server, it cannot promise notifications when the browser/app is fully closed.

The word-record count is 10,743 (up from 7,162 in 1.6.0) through 3,581 generated inflected forms. These are explicitly Draft, as are the template examples attached to those forms. This is a 1.5× increase in word records/forms, not a 1.5× increase in independently verified lemmas. An example is displayed only when the exact headword occurs in the sentence; otherwise the example is omitted instead of borrowing an unrelated root sentence.


## Rishe 1.6.2 aviation-text coverage

This release compares normalized lexical tokens in `tools/aviation_source/aviation_text_4000.txt` against all dictionary headwords and family entries. Terms not already represented are imported with Draft status; existing headword records are not duplicated. Hyphenated operational expressions (for example, `wind-shear` and `go-around`) remain searchable as lexical terms. Clear root and inflection relations are grouped in root families and their root headwords are added when absent; items with no defensible family are represented as standalone/unique entries. The importer writes `tools/reports/aviation_coverage_report_1.6.2.json`.

The source contributes 854 previously missing text tokens plus 32 additional root/component records (886 new records total). Of these, 529 entries are placed in standalone/unique families and 357 are grouped into root families. The resulting dictionary has 11,629 records. The imported Persian meanings, parts of speech, and root relationships are Draft and require human editorial review; structural validation does not certify their linguistic accuracy. Run the same two build steps above in order to reproduce the final database from source files.
