# Rishe 1.5.0 — release test report

**Result:** Structural data checks and static implementation checks pass. This package is a release candidate, not a content-verified or fully browser-certified release. Browser-level interaction, installation, and offline tests still require manual verification.

## Passed

- `python tools/build_data.py tools/source/starter.xlsx data.json tools/new_words tools/solo_words` completed successfully and rebuilt the current database.
- Repeated database rebuild produced an identical `data.json` SHA-256 hash.
- `python tools/validate_data.py data.json`: **0 blocking structural errors**, **16 editorial/source warnings**.
- `python -m py_compile tools/build_data.py tools/validate_data.py`.
- `node --check app.js`, `node --check config.js`, `node --check sw.js`.
- Parsed the generated database and the web app manifest as JSON.
- Reconciled key counts in the validation report against the generated database.
- Static checks confirmed the support entry points, the `target="_blank"` / `rel="noopener noreferrer"` external link, centralized public CoffeeBede config, and cleanup targeting for legacy `rishe-v*` caches without deleting unrelated caches.
- Local HTTP smoke test returned HTTP 200 for all **19 of 19** app-shell resources, including fonts and icons.
- Every path listed in the Service Worker precache exists in the project (**18 of 18** entries; `./` and `index.html` are equivalent app-shell paths in addition to the asset file checks).

## Warnings requiring editorial decisions

- Four duplicate English-form record excesses remain in the generated database: `educate`, `express`, `produce`, and `product`. They were not automatically deleted because a relationship may be legitimate; review the records and resolve each explicitly.
- Two similar family-base pairs (`compete` / `complete`, `simulation` / `stimulation`) warrant human inspection.
- Nine large legacy families have more than 25 members.
- The source audit reports 199 duplicated forms across source files and 53 forms present in both family and standalone source batches. Existing source collisions were not mass-deleted automatically.
- 115 new family candidates have no etymology text. This is intentional where the root/history was not defensibly established, but the families and member relations need editorial review.

## Not run / requires manual verification

- Headless Chromium smoke test: **not completed**. Chromium did not produce a DOM dump before the execution timeout and emitted environment D-Bus/zygote diagnostics. This result does not establish that the application failed, but it also does not verify browser rendering.
- Search, word-detail, family display, affix exploration, saved vocabulary, practice, and theme persistence were not tested through actual user interaction in a browser during this run.
- Mobile viewport layout, keyboard-only navigation, screen-reader behavior, contrast, and touch-target verification require manual testing.
- PWA installability, activation/update behavior in a real browser, preservation of existing localStorage data across update, and offline navigation/data fallback after disconnecting the network require manual verification.
- GitHub Pages deployment and remote commit were not performed.

## Release blockers before public launch

1. Verify that the configured CoffeeBede URL opens the intended recipient page.
2. Complete the manual browser, mobile, and offline checks listed above.
3. Review the database warnings, prioritizing high-frequency entries, Persian translation quality, CEFR estimates, and derivational relationships. Do not label Draft or source-curated content as Reviewed until it receives independent editorial review.
