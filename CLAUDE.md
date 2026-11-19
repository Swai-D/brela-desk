# BRELA Desk: working rules

- **Every change to the app updates the Help.** When a feature is added, changed or removed (a page, button, wizard, question, setting, rule or error message), update or add the matching guide in `help/<category>/<slug>.md` in the same pull request, and add it to the FAQ or glossary when people are likely to ask. Use the exact labels from the screen.
- Add new app pages to `PAGE_GUIDE` in `tests/help.test.js` and to the page map in `public/assets/js/topbar.js` so the ? icon opens the right guide. `tests/help.test.js` fails when a page, built-in wizard, formula function or answer format has no guide.
- The Dashboard "Getting started" steps live in `help-centre.js` (`STEPS`); add a step when a new first-time task appears.
- English only: the team works in English.
- Run all suites with `bash tests/run.sh` before opening a pull request.
