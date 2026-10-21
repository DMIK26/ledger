# Handoff: where the build stands

Updated 21 Oct 2026. **Drops 1 and 2 are complete** and waiting to be committed and published (see
`docs/PUBLISHING.md`). Read `CLAUDE.md`, then `docs/REQUIREMENTS.md`,
`docs/ARCHITECTURE.md` and `docs/PLAN.md`, then this file.

## Verified

`npm run lint`, `npm run typecheck`, `npm test` (100 tests, 10 files) and `npm run build` pass.
`npm run e2e` passes on desktop Chrome and Pixel 7 (14 tests): add through the sheet with a receipt, inline
edit, delete, undo from the toast, reload, filters with No matches and Clear, privacy on every page
(including Trash and the open Add sheet and inline editor), screen lock on reopen, manifest and CSP.

## Drop 2: what was added

- Domain (pure, tested): `filters.ts` (filters, faceted counts, sort, group with subtotals, 15-row pages,
  `SavedView`), `duplicates.ts` (same merchant and amount within a day), `tags.ts`, `receipts.ts`
  (`fitWithin` 1600px), `pin.ts` (salted PBKDF2-SHA-256, 210,000 iterations, constant-time compare),
  `highlight.ts` (quick-add highlight runs), `minorToInput` in `money.ts`. `Transaction.hasReceipt` and
  `LockConfig` in `types.ts`.
- Data: new commands `restoreFromTrash`, `deleteForever`, `setReceipt`, `deleteRule`, `setViews`.
  `purgeTrash` also removes receipts. Store actions `addEntry`, `editTransaction`, `bulkDelete`,
  `bulkSetCategory`, `bulkAddTag`, `restore`, `purge`, `getReceipt`, `forgetRule`, `saveView`,
  `deleteView`, `setPin`, `removePin`, `unlock`, `lockNow`; state `trash`, `views`, `lock`, `locked`.
  No schema change: receipts go in the existing `receipts` store keyed by entry id; saved views and the
  PIN hash live in `settings` under `savedViews` and `lock`.
- UI: `QuickAdd` (mirror highlighter: amount clay, date blue, method green, recognised merchant sand;
  date chip opens a date picker; method chip is a select; duplicate warning needs a second Enter);
  `AddSheet` + `EntryForm` (Describe it fills the fields; tags; notes; receipt resized to a 1600px JPEG);
  `AmountInput` (value set as a property only, masked in privacy mode); `TxList` (select, edit inline,
  receipt, delete; tags; typed text hidden in privacy mode because it contains the amount);
  `ReceiptViewer` (blurred in privacy mode); `pages/Transactions.tsx` (toolbar, filter panel with facet
  counts, bulk bar, saved views, grouping, pager, one footer row, No matches, Trash view at
  `#/transactions?view=trash`); `LockScreen`; Settings cards Screen lock and Learned categories.
- Layout: desktop Add button in the top bar; the tab bar's centre Add opens the sheet on the current page;
  Ctrl/Cmd+Z undo and Shift+Ctrl/Cmd+Z or Ctrl+Y redo when no field has focus; with a PIN set, a plain
  cover while hidden and auto-lock after 30 seconds in the background.

## Decisions taken in Drop 2

- Quick add stays inline; the Add sheet is the detailed form. `?action=add` now opens the sheet.
- A duplicate is warned about, never blocked: Enter (or Save) a second time keeps both.
- Choosing a category for an unknown or unsure merchant (quick add, Add sheet or edit) saves a rule.
- Setting or removing the PIN is not an undoable command (it is a security setting, not ledger data).
- Receipt previews use data: URLs (already allowed by the CSP).
- Left for later drops as planned: CSV export (Drop 4), marquee select and pins (Drop 5), voice quick add
  and Android back closing sheets (Drop 7), sliding to an entry's month (needs the month switcher, Drop 5).

## Next

1. Commit and publish with GitHub Desktop.
2. Drop 3 (`docs/PLAN.md`): KPIs, donut, six-month bars with draggable budget line, Total / By category
   morph, budget card with what-if, Budgets page with allocation bar and suggestions. Add `d3-scale` and
   `d3-shape` then.

## Notes

- The legacy importer (`src/data/legacyImport.ts`) is unused by the UI; the owner has no old data.
- Playwright 1.56.1 is pinned to match the sandbox Chromium. On the Mac run `npx playwright install
  chromium` once before `npm run e2e`.
- Date inputs show in the device's locale (dd/mm/yyyy on an Indian-English phone).
