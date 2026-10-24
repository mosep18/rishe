# Rishe 1.6.2 — Release Test Report

**Date:** 2026-10-24  
**Release status:** Packaged candidate; not committed or deployed remotely.

## A. Source comparison and import

- Source: `tools/aviation_source/aviation_text_4000.txt`.
- Tokenization: 3,985 normalized token occurrences and 1,448 unique lexical tokens. Possessive `-s` is normalized to the base headword; the established phrase `en route` is retained as the single searchable expression `en-route`; hyphenated technical terms remain intact.
- Coverage after import: **1,448/1,448 unique source tokens represented**, with zero unmatched tokens.
- Added **854 previously missing source tokens** and **32 additional root/component records** (886 new word records total).
- New word records are organized as **529 standalone/unique records** and **357 root-family records**. The import added 626 family records; the dictionary now contains 11,629 word records and 4,399 family records.
- **861** imported entries have a source-text sentence example containing the exact headword. **25** additional root/component entries do not have examples because the component itself does not occur as an independent term in the source; the app does not borrow an unrelated family example.
- All imported records are marked `Draft`. Their Persian meanings, parts of speech, and family/root relationships require human editorial review. No imported record has an empty Persian meaning, but populated translations are provisional and should not be interpreted as verified.
- Original 10,743 word records from 1.6.1 were preserved; new records are appended. The four duplicate-form excess records reported by the baseline validator remain unchanged.
- Rebuilding the imported database from the 1.6.1 baseline and the supplied text produced a byte-identical `data.json` (`02f13b270d2a569b78579984b7b8a417b1c018167666b6f4d84db5ca28c163a0`).

The import summary is in `tools/reports/aviation_coverage_report_1.6.2.json`.

## B. Automated tests

| Category | Status | Result |
|---|---|---|
| Full Node test suite | **Passed** | 31 tests passed, 0 failed |
| Version metadata | **Passed** | `index.html`, `app.js`, `package.json`, manifest and Service Worker identify 1.6.2 |
| Service Worker shell paths | **Passed** | All 19 referenced shell resources exist |
| Full unique-token coverage | **Passed** | No source token left unmatched after normalization |
| Source import counts | **Passed** | 854 direct tokens + 32 root/component records = 886 |
| Unique/root family placement | **Passed** | 529 standalone/unique; 357 root-family records |
| Source examples | **Passed** | Every displayed imported example contains its exact headword; 861 source examples and 25 root/component entries without examples |
| Learning engine regression suite | **Passed** | Existing scheduling, daily-plan, persistence, collections and import/export tests pass |
| JavaScript syntax check (`npm run check`) | **Passed** | `app.js`, `learning.js`, `config.js` and `sw.js` parse successfully |
| Vocabulary structural validation | **Passed with warnings** | 0 structural errors; 205 editorial/data-quality warnings |
| Local HTTP app-shell check | **Passed** | 19 of 19 Service Worker shell assets returned HTTP 200 |

## C. Validation warnings and editorial limitations

The data validator reports 205 warnings, including missing CEFR estimates and family/metadata checks associated with Draft content. These are not structural errors. The final dictionary contains 11,629 word records, 4 excess duplicate word records (unchanged from 1.6.1), and 10 families with more than 25 members. Family size and semantic root relationships should be reviewed before declaring any new content verified.

The source's lexical coverage check proves that all normalized tokens are represented as dictionary headwords. It does not prove that every automatic Persian gloss, part-of-speech label, or derivational relationship is linguistically correct. All 886 imported records remain Draft for that reason.

## D. Manual verification still required

**Requires manual verification:** open the application in a regular browser and inspect search results, word-family/unique-word navigation, right-to-left Persian rendering, hyphenated headword highlighting (including `en-route`), and representative imported definitions. Test GitHub Pages base paths and a real installed PWA upgrade before publishing. This environment's checks cover static integration, automated tests, and local HTTP responses; they do not certify visual behavior on all browsers or devices.

## E. Release state

Version strings, documentation, the Service Worker cache version, the data importer, the source text, the import report, and automated coverage tests have been updated for Rishe 1.6.2. The project has not been committed, pushed, or deployed to GitHub Pages.
