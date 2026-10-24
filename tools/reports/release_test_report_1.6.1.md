# Rishe 1.6.1 — Release test report

Date: 2026-10-24  
Release status: **Packaged candidate; browser-level acceptance testing still required.**

## Changes covered

- Paired English–Persian labels and explanatory text across Learn, study cards, progress, collections, About Rishe, and Support development.
- Added a seven-day activity chart with separate new-word and review series.
- Added opt-in daily reminders using the browser Notification API and Service Worker notifications, with a user-selected local time, local-day de-duplication, and click-through to Learn.
- Tightened example selection: a word-level example is rendered only if the exact headword occurs as an English token; a family-level example is also allowed only if the exact headword occurs. When neither qualifies, the app does not show a potentially misleading root/related-word sentence.
- Expanded the word-record dataset from 7,162 to 10,743 records through 3,581 generated inflectional forms. The generated forms and their template examples are explicitly marked as drafts. This is a 1.5× increase in records/forms, not a 1.5× increase in independently verified lemmas.
- Added regular inflection generation, selected irregular plurals, and a stable distribution strategy that avoids increasing already-large families beyond 25 entries.

## Test results

| Test | Status | Result |
|---|---|---|
| `npm test` | **Passed** | 27/27 tests passed, 0 failed |
| `npm run check` | **Passed** | `app.js`, `learning.js`, `config.js`, and `sw.js` pass Node syntax checks |
| `python tools/validate_data.py data.json --report-dir tools/reports` | **Passed with editorial warnings** | 0 structural errors, 16 editorial warnings |
| Rebuild data using `tools/build_data.py` | **Passed** | Output hash matches committed candidate `data.json` |
| Data coverage | **Passed** | 10,743 word records; 10,739 unique forms; 3,581 generated inflections |
| Generated example check | **Passed** | Every generated form's example contains its exact generated headword as an English token |
| Service Worker shell HTTP smoke test | **Passed** | All 19 listed shell resources returned HTTP 200 from a local HTTP server |
| Full browser UI test | **Not run** | A browser automation run was not available in this verification pass |
| Mobile, keyboard, screen reader and visual contrast review | **Requires manual verification** | Not established by static or unit tests |
| Permission prompt and real OS notification delivery | **Requires manual verification** | Depends on browser, operating system, permissions and HTTPS/localhost context |
| Notifications while the app/browser is fully closed | **Not supported / not verified** | No remote Push service or background scheduling backend is included; reminders are checked while Rishe is open |
| PWA installation, offline upgrade and migration from previous installed version | **Requires manual verification** | Static cache list exists and shell resources respond, but installation/upgrade behavior was not exercised in an actual browser |

## Dictionary validation warnings

The reproducible `data.json` SHA-256 is `96786f5d388e6ca5a42b50c8829afe869bbb83cbbe865ac784822b0ff489bf0b`.

The example audit found 10 non-generated word-level example fields whose sentences do not contain the exact headword as a token. The UI suppresses those sentence fields and only shows an eligible family example if that exact headword is present; this is intentional to avoid displaying a related word’s sentence as the current word’s example.

The 16 warnings are editorial notices, not structural failures. They include four duplicate English-form records, several similar family bases that deserve human inspection, nine existing families with more than 25 members, and 53 forms appearing in both family and standalone source batches. The validator cannot establish semantic, etymological, morphological, translation, or CEFR accuracy.

The dataset has 413 source-curated word records and 10,330 draft word records. “Source-curated” is not equivalent to independent verification. All 3,581 newly generated forms are draft records, and their example sentences are template examples requiring editorial review. They should not be presented as verified educational content.

## Notification behavior and limitations

A user must explicitly enable notifications and grant permission. The reminder checks every 30 seconds while the app is open and sends at most once per local calendar day after the chosen time. If the browser suspends the tab or the app is reopened after the scheduled time, the reminder is checked at the next opportunity. The browser/OS may still suppress notifications. This implementation does not provide remote push, a server scheduler, or reliable notification delivery after the app/browser has been closed.

## Remaining acceptance work

1. Run the site in the target desktop and mobile browsers and manually check the Learn, study, progress, About, and Support screens.
2. Enable a reminder, grant permission, test the selected time and notification-click navigation, and check browser settings when permission is denied.
3. Test fresh PWA install, offline startup, upgrade from the previous release with saved words/settings, and GitHub Pages deployment under its repository path.
4. Review the generated inflections and template examples before treating them as accurate vocabulary instruction.

No Git commit, remote push, or deployment was performed as part of this release packaging.
