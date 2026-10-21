# Handoff: where the build stands

Updated 21 Oct 2026. **Drops 1 to 4 are published** at https://dmik26.github.io/ledger/. **Drop 5 is
complete and awaiting publish.** Read `CLAUDE.md`, then `docs/REQUIREMENTS.md`,
`docs/ARCHITECTURE.md` and `docs/PLAN.md`, then this file.

## Verified

`npm run lint`, `npm run typecheck`, `npm test` (187 tests, 19 files) and `npm run build` pass.
`npm run e2e` passes on desktop Chrome and Pixel 7 (43 passed, 3 desktop-only skipped on phone, with
`CI=1`). Drop 5 adds: the pin-bar total equals the sum on Dashboard, Transactions, Budgets and Reports;
the marquee total equals the sum of selected rows; undo history and redo restore exactly; month
switcher, bar click and keyboard roving; hover highlight and card; heatmap brush sets a custom period.
Drop 4 added: reports
split the financial year at 1 April; a CSV export from Reports has the BOM and `Amount (₹)` header and,
imported again, adds nothing (every row skipped as a duplicate); a found subscription goes on the timeline
and its pill drags by days; the what-if yearly saving; categories reorder by dragging; no page scrolls
sideways at phone width (that test caught and fixed an overflowing Reports header).

CI (`.github/workflows/ci.yml`) runs `check` and `e2e` on every push and pull request. The Pages deploy
(`deploy.yml`) runs on its own and does not wait for CI.

## Drop 5: what was added

- `src/kit/`: EntityBus (one CSS rule dims everything not linked to what is hovered or focused; touch
  uses long press; Escape clears), view store (pins and viewed month), HoverCard (after 350 ms, spring
  positioned), month switcher (twelve months with mini bars and budget mood dots), pin bar, undo with a
  history of chips and redo, nav badges and peeks, roving tab stops for charts, marquee, haptic ticks on
  snaps, View Transitions where motion is on.
- Pins: category, merchant, method, tag and day; any chip or row part pins it to every page. Same kind is
  OR, different kinds are AND (`src/domain/pins.ts`). Escape removes the last pin.
- Dashboard: KPI cards open a breakdown with a breadcrumb (categories, merchants, days, compare); donut
  click drills in place; bars preview the donut on hover and switch month on click.
- Reports heatmap: brush a range to set a custom period, click a day to pin it.
- Settings: Motion (full, reduced, off) and haptics.

## Decisions taken in Drop 5

- The pin bar total is all-time for the pinned set; page totals stay in the page's period.
- The month switcher shows on Dashboard and Budgets only; other pages keep their own period controls.
- The six bars end at the viewed month. Insights show for the current month only.
- With category pins the budget card sums those categories' budgets; other pins show a note instead.
- Marquee select is mouse only; touch keeps the checkboxes. Quick add on the Dashboard follows a saved
  entry into its month and announces it.
- The context bar is sticky on desktop only, to save height on phones.
- Not verified on a real phone: long-press highlight and haptics.

## Drop 4: what was added

- Domain (pure, tested): `periods.ts` (month, financial-year quarter, financial year, custom; previous
  period; same period last year; like-for-like days while a period is running), `reports.ts` (totals,
  change, category rows with six-month sparkline series, top merchants, method split, Monday-first
  weekday averages, every day for the heatmap), `csv.ts` (reader for quotes, CRLF, BOM, `;` and tab;
  writer with BOM and CRLF; formula-injection guard), `csvImport.ts` (header guessing, Indian and other
  date formats with day/month detection, amounts like `₹1,200.50`, `(500)`, `250 Cr`; methods from
  words like GPay; duplicate skipping on same date, amount and merchant; money-in rows skipped; unknown
  category names become new categories; `exportRows`), `recurring.ts` (weekly, monthly, yearly
  detection; occurrences with the 31st clamped; yearly cost), `insights.ts` (up to four: budget pace,
  biggest category rise, payments due this week, biggest expense, biggest fall, days with nothing spent),
  category rules in `categories.ts` (defaults keep names, colour swap keeps colours unique, reorder),
  `minorToPlain` in `money.ts`, `fmtTime` in `dates.ts`.
- Data: `RecurringItem` in the existing `recurring` store; `recurringIgnored` and `lastBackupAt` in
  settings (no migration). Commands `putCategories`, `removeCategoryRow`, `putTrashItem`,
  `putRecurring`, `removeRecurring`, `setIgnoredRecurring`, `replaceEverything`. Store actions for the
  category manager (deleting moves entries, trash items, rules and budgets to the chosen category first,
  one undo step), recurring, `importCsv`, `restoreBackup` (replace, undoable) and `getActivity`.
  Backups now include recurring payments; older backups still import.
- Pages: Reports (period switcher, compare toggle, summary, category table with sparklines, top
  merchants, paid by, weekday averages, day-by-day heatmap, Export CSV, Print or save as PDF with an A4
  print stylesheet), Recurring (30-day timeline with draggable pills and arrow keys, list with
  switch-off what-if and yearly saving, found subscriptions with Add / Not recurring, add form).
- Dashboard: "Worth knowing" insights card; a weekly backup reminder on phones.
- Settings: Categories manager (drag or arrow-key reorder, recolour from the palette, add, rename and
  delete your own), Backup (export records the date; restore offers "Add what is missing" or "Replace
  everything"), Import from CSV (column matching, date order, preview, skips), History (Activity log at
  `#/settings?view=activity`, Trash link).
- Transactions: Export CSV of the filtered list.
- `src/app/files.tsx` (`shareOrDownload`, `ExportButton` with the privacy confirm), `src/app/settings/`.
  `pages/Soon.tsx` is no longer used.

## Decisions taken in Drop 4

- Quarters follow the financial year (April start: Q1 is April to June); a January start gives calendar
  quarters and plain year labels.
- While a period is running, it is compared with the same number of days of the other period.
- CSV export writes ISO dates, plain amounts with two decimals, `Amount (₹)` in the header, a BOM and
  CRLF, and prefixes text that starts with `=`, `+`, `-` or `@` with an apostrophe (removed on import).
- CSV import adds expenses only; negative or credit rows are counted and skipped. Duplicate means the
  same date, amount and merchant as an entry already in Ledger; repeats inside one file are kept.
- The ten default categories keep their names (they can be recoloured and reordered). Your own can be
  renamed and deleted; deleting always asks where entries go, and Other cannot be deleted.
- A full restore replaces entries, categories, rules, budgets and recurring payments but keeps device
  settings (theme, privacy, PIN); it is one undoable step.
- Recurring payments are planning only: nothing is logged automatically.

## Drop 3: what was added

- Domain (pure, tested): `aggregates.ts` (category totals, last N months, six-month series, KPIs including
  the change against the same point last month), `budgets.ts` (`Budget` rows per month, ₹500 snapping,
  status in words, projection, what-if, suggestions from three full months, copy last month,
  `moveAllocation` with the total fixed). `fmtMoney(..., { compact: true })` now builds its own labels
  (₹500, ₹12k, ₹2.5L, ₹1.3Cr; $2.5M) because Intl's Indian compact output differs between browsers
  (Chromium printed "₹10T").
- Data: `Budget` type; the existing `budgets` store holds rows keyed `YYYY-MM|overall` or
  `YYYY-MM|<categoryId>` (no migration). Command `setMonthBudgets` replaces a month in one undo step; store
  state `budgets` and action `setMonthBudgets(month, { overall, categories }, label)`. Backups now include
  budgets; older backups without them still import.
- Charts (`src/charts`, custom SVG with `d3-scale` and `d3-shape`): `Donut` (hover or focus a slice to
  see it in the centre, others dim to 35%; click or Enter opens Transactions filtered to that category and
  month to date; legend with full names), `MonthBars` (six months, Total / By category colour morph,
  hover or focus tooltip, compact axis, fills its card's height, draggable budget line with keyboard
  steps, keeps the dropped value until it is saved), `AllocationBar` (drag or arrow-key dividers),
  `fills.tsx` (diagonal hatch for categories past the tenth), `useSize.ts`.
- Dashboard: quick add, four KPI cards, budget card (left or "Over by", meter, projection, what-if
  slider; offers last month's budgets as Accept/Reject when this month has none), donut and six-month
  bars side by side from 1100px, recent entries.
- Budgets page (`pages/Budgets.tsx`): monthly budget, Suggest budgets and Copy last month as dashed ghost
  proposals with Accept/Reject, allocation bar, per-category rows with spent, status in words, meter and
  an amount field that saves on Enter or leaving it.
- Transactions accepts `?category=&from=&to=` and opens with those filters shown.

## Decisions taken in Drop 3

- Budgets are per month. A new month starts without budgets; the Dashboard and Budgets page offer last
  month's as a ghost to accept. Nothing is copied silently.
- "This month" on the Dashboard counts entries up to today; upcoming entries are left out of spent, the
  donut, the bars and the projection, and the donut link filters to today so totals match Transactions.
- The change KPI compares with last month up to the same day (31 March compares with all of February).
- The overall suggestion is never below the sum of the category suggestions.
- Slider and divider ARIA values are omitted in privacy mode; their text values use `fmtMoney`, and every
  component that puts `fmtMoney` in an attribute subscribes to privacy so toggling re-masks it.
- Insights ("up to four") stay in Drop 4 as planned.

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
- Forgot PIN (added at the owner's request): the lock screen's "Forgot PIN?" stores the request time in
  `settings` under `lockReset`; after 24 hours (`RESET_WAIT_MS` in `pin.ts`) the PIN is removed on the next
  open, return to the foreground or minute tick, and nothing else changes. The right PIN, or setting a new
  PIN, cancels it. Moving the phone's clock forward can shorten the wait; acceptable for a casual-viewer lock.
- Setting or removing the PIN is not an undoable command (it is a security setting, not ledger data).
- Receipt previews use data: URLs (already allowed by the CSP).
- Left for later drops as planned: CSV export (Drop 4), marquee select and pins (Drop 5), voice quick add
  and Android back closing sheets (Drop 7), sliding to an entry's month (needs the month switcher, Drop 5).

## Next

1. Publish Drop 5 (commit "Drop 5: interaction kit").
2. Drop 6 (`docs/PLAN.md`): Doodle Studio.

## Notes

- The legacy importer (`src/data/legacyImport.ts`) is unused by the UI; the owner has no old data.
- Playwright 1.56.1 is pinned to match the sandbox Chromium. On the Mac run `npx playwright install
  chromium` once before `npm run e2e`.
- Date inputs show in the device's locale (dd/mm/yyyy on an Indian-English phone).
