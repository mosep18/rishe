# Rishe 1.6.0 — Release Test Report

**Assessment date:** 2026-10-24  
**Source:** uploaded Rishe 1.5.1 source-audit archive (application code reports version 1.5.0)  
**Release scope:** local-first vocabulary learning features, existing application integration, and PWA shell wiring.

## Summary

- Automated test suite: **Passed — 22/22 tests**.
- JavaScript syntax checks: **Passed**.
- Python compilation checks for the existing data tools: **Passed**.
- JSON parsing for dictionary, manifest, and validation report: **Passed**.
- Local HTTP smoke test of Service Worker shell assets: **Passed — 19/19 returned HTTP 200**.
- Dictionary structural validation: **Passed with caveats — 0 structural errors, 16 editorial/source warnings**.
- Real browser-rendered workflow, mobile layout, installation, and offline interaction testing: **Not verified**. Headless Chromium attempts timed out without returning a DOM in this environment; this is recorded as unverified rather than a pass.

## Test results

| Category | Status | Evidence / details |
|---|---|---|
| Spaced-repetition engine | **Passed** | Node tests cover new-word introduction, recall-rating transitions, interval growth/cap, relearning behavior, due filtering, and deterministic scheduling. |
| Daily plan | **Passed** | Tests cover goal limits, backlog-aware new-word limits, due-review prioritization, stable selection, and exclusion of invalid/dangling records. |
| Statistics | **Passed** | Tests cover introduced words, review-event counts, due/state counts, success-rate behavior, legacy-practice events, and empty states. |
| Collections | **Passed** | Tests cover creation, rename/delete, duplicate membership, membership validation, storage persistence, and scheduled-vs-collection practice behavior. |
| Persistence / migration / recovery | **Passed** | Tests cover reload persistence, older schema handling, malformed stored JSON recovery, export/import validation, and import/merge history behavior. Import transaction rollback/recovery is wired in the app, but interruption recovery in an actual browser was not manually exercised. |
| Existing app integration | **Passed (static/integration checks)** | Tests assert version consistency, route/UI action wiring, Service Worker shell file existence, and preservation of the existing dictionary schema. This is not a substitute for full interaction/regression testing in a browser. |
| JavaScript syntax | **Passed** | `npm run check` completed for `app.js`, `learning.js`, `config.js`, and `sw.js`. |
| Unit/integration suite | **Passed** | `npm test`: 22 tests, 22 passed, 0 failed. |
| Python tooling syntax | **Passed** | `python -m py_compile tools/build_data.py tools/validate_data.py`. |
| JSON assets | **Passed** | Parsed `data.json`, `manifest.webmanifest`, and `tools/reports/validation_report.json` successfully. |
| HTTP Service Worker shell smoke test | **Passed** | Local Python HTTP server returned 200 for all 19 entries listed in `sw.js` (`./` plus the app-shell assets). This verifies resource paths/availability over HTTP only; it does not test browser cache lifecycle or offline requests. |
| Vocabulary data validation | **Passed with warnings** | `python tools/validate_data.py data.json`: 0 structural errors and 16 editorial/source warnings. See `validation_report.md` and `validation_report.json` for details. |
| Dictionary integrity | **Passed** | `data.json` was not changed. SHA-256: `0ca2dc033d61ee06312015ced4ac6e51f4a01a9600b341b1d81a6d1d68032a58`. |
| Browser-level UI | **Not run / blocked** | Headless Chromium timed out without returning a DOM in this environment. New user-facing flows therefore need manual browser verification. |
| Responsive/mobile and accessibility | **Requires manual verification** | CSS and semantic controls were added/updated, but no real browser/device or assistive-technology pass was completed. |
| PWA installation, SW upgrade and offline behavior | **Requires manual verification** | Shell assets are present and versioned; actual install, upgrade from a populated 1.5.x browser profile, offline launch, and update activation were not verified in a browser. |
| GitHub Pages routing/deployment | **Requires manual verification** | Project paths and existing router were preserved, but deployment to a remote GitHub Pages site was not performed. |
| CoffeeBede support destination | **Requires manual verification** | Existing support feature/route was preserved; the external destination was not browser-click-tested in this run. |

## Implemented behavior summarized

- Separate learning records from dictionary data, keyed by stable normalized word/family identifiers rather than array positions.
- Recall ratings: **Again**, **Hard**, **Good**, and **Easy**. The implemented scheduler is a documented, simplified SM-2-inspired policy, not a claim of official SM-2 compliance. It uses an initial 10-minute introduction step, a 15-minute Again interval, short initial Hard/Good intervals, state promotion after successful reviews, rating-dependent interval growth, and a 180-day cap.
- Daily plan with configurable new-word goal, due-review priority, deterministic new-word selection, and a lower new-word allowance during large review backlogs.
- Learning dashboard with progress and recent-activity summaries derived from saved learning/review records.
- Personal collections with create/rename/delete/add/remove and separate collection practice vs scheduled reviews.
- Versioned local learning storage, migration support, corruption warning/recovery behavior, and local JSON export/import with merge/replace flow.
- Integration into the existing app and legacy practice, plus a Rishe-owned versioned Service Worker cache that includes `learning.js`.

## Known data caveats

The dictionary was intentionally left unchanged. Its existing validator emits 16 editorial/source warnings, including four excess duplicate word records, nine very large families, 115 family records with no etymology text, and no records marked reviewed by the current validator. These are existing data-quality findings, not defects introduced by this release. Review `validation_report.md` before treating dictionary content as fully editorially verified.

## Manual acceptance checklist before publishing

1. Open the project over `localhost` and confirm search, family and affix pages, saved words, theme toggle, support/about pages, and all new learning screens.
2. Introduce a word, reveal the answer, rate it once, reload, and verify the next due time and daily goal.
3. Exercise Again/Hard/Good/Easy, a due-review session, mixed session, skip, exit, and partial-session restart behavior.
4. Create and delete a collection, practice it without rescheduling, and use scheduled review within the collection.
5. Export data, import with merge and replace, test malformed/oversized files, and verify the existing saved-word list and theme are retained or intentionally restored.
6. Test with an existing browser profile containing Rishe 1.5.x saved words/settings; verify the upgrade does not erase them.
7. Install the PWA, let the new Service Worker activate, then launch once offline and complete a review.
8. Test narrow mobile viewport, keyboard-only navigation, visible focus, RTL Persian rendering, and screen-reader labels.
9. Deploy to the intended GitHub Pages path and confirm routing plus the CoffeeBede destination.

## Release/deployment state

No Git commit, remote push, GitHub Pages deployment, or production browser acceptance test was performed as part of this work. The delivered archive is the locally built source release candidate, with unverified checks identified above.
