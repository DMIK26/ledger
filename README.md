# Ledger

A private, offline-first expense tracker. Your data stays on your device (IndexedDB); there is no account, no
cloud and no analytics. It installs on iPhone and Android as a PWA and is published free on GitHub Pages at
https://dmik26.github.io/ledger/.

**Status:** version 1.1.0. All thirteen drops are built and tested. See `docs/HANDOFF.md`.

What works now: quick add with live highlighting and editable chips; an Add sheet (bottom sheet on phones)
with amount, merchant, date, category, method, tags, notes and a receipt photo; Transactions with filters
(dates, category, method, tags, amount) and faceted counts, sort, grouping with subtotals, 15-row pages,
inline edit, bulk move/tag/delete, saved views, duplicate warnings and a 30-day Trash; undo and redo
(Ctrl/Cmd+Z, Shift for redo); privacy mode on every page; an optional PIN screen lock; Settings (theme,
privacy, currency, financial year, backup, screen lock, learned categories, storage, updates); offline use
and install as an app. The Dashboard has KPIs, a budget card with a what-if slider, a category donut
and six-month bars with a draggable budget line; Budgets has suggestions, copy last month and an
allocation bar. Reports cover any month, quarter, financial year or custom range with comparisons, a
heatmap, CSV export and print to PDF; Recurring shows the next 30 days of subscriptions and what switching
one off would save; Settings has a category manager, CSV import, full restore and an activity log.
Everywhere: pins that filter every page, linked highlighting, hover cards, drill-down breakdowns, a month
switcher and undo history. Doodle Studio adds a pencil companion that answers questions about the page,
a sketch layer, notes and stamps attached to bars, slices and rows, and hand-drawn category doodles. On
phones: install help for iPhone and Android, voice quick add, back closes sheets, 44px touch targets.
Since 1.0: money in, accounts, cards, udhaar, loans, plans and goals, search, rules, trips, a Shop ledger
beside Personal with profit and loss, password-protected and weekly folder backups, Face ID or fingerprint
unlock, an app badge for bills due, and the whole interface in Telugu and Hindi.

## Quick start

```
npm install
npm run dev
```

Open http://localhost:5173/ledger/ . Run `npm run lint && npm run typecheck && npm test && npm run build`
before every commit. `npm run e2e` runs the Playwright browser tests (desktop and Pixel 7); GitHub runs them on every push.

## Documents

- `CLAUDE.md`: how to work on this project
- `docs/REQUIREMENTS.md`: everything the app must do
- `docs/ARCHITECTURE.md`: stack, layout, conventions
- `docs/PLAN.md`: the seven build drops
- `docs/HANDOFF.md`: current status and next steps
- `docs/PUBLISHING.md`: publishing to GitHub Pages, click by click
- `docs/COWORK.md`: running the project in Claude Cowork

Released under the MIT License.
