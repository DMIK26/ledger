# Ledger

A private, offline-first expense tracker. Your data stays on your device (IndexedDB); there is no account, no
cloud and no analytics. It installs on iPhone and Android as a PWA and is published free on GitHub Pages at
https://dmik26.github.io/ledger/.

**Status:** Drop 1 of 7 is built and tested, ready to publish. Next: Drop 2. See `docs/HANDOFF.md`.

What works now: Dashboard (quick add, this month's total, recent entries), Transactions (quick add, full list,
delete with undo, one total row), Settings (theme, privacy mode, currency, financial year, backup export and
import, storage, version and update check), offline use and install as an app. Budgets, Reports and Recurring
show which drop delivers them.

## Quick start

```
npm install
npm run dev
```

Open http://localhost:5173/ledger/ . Run `npm run lint && npm run typecheck && npm test && npm run build`
before every commit. `npm run e2e` runs the Playwright smoke test (desktop and Pixel 7).

## Documents

- `CLAUDE.md`: how to work on this project
- `docs/REQUIREMENTS.md`: everything the app must do
- `docs/ARCHITECTURE.md`: stack, layout, conventions
- `docs/PLAN.md`: the seven build drops
- `docs/HANDOFF.md`: current status and next steps
- `docs/PUBLISHING.md`: publishing to GitHub Pages, click by click
- `docs/COWORK.md`: running the project in Claude Cowork

Released under the MIT License.
