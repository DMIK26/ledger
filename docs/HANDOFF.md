# Handoff: where the build stands

Updated 23 Oct 2026. **Drops 1 to 13 are complete and published** at
https://dmik26.github.io/ledger/, tagged **v1.1.0** (v1.0.0 was tagged after Drop 7). The live site
was checked after the push: it reports 1.1.0, offers the language picker, Spaces and protected backups,
and switches to Telugu and back. No further drop is planned.
Read `CLAUDE.md`, then `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md` and `docs/PLAN.md`, then this file.

## Verified at 1.0 (Drop 7)

`npm run lint`, `npm run typecheck`, `npm test` (220 tests, 24 files) and `npm run build` pass; the build
now ends with a size check (`scripts/budget.mjs`: JavaScript 152 of 170 KB gzipped, CSS 10 of 16 KB,
offline precache 961 of 1100 KB). `npm run e2e` passes on desktop Chrome and Pixel 7 (63 passed, 13
skipped where a test only applies to one of them, with `CI=1`). Drop 7 adds: axe finds no serious or
critical problems on any page (and no contrast problems in dark mode); at 360, 390 and 430px no page
scrolls sideways, every control is at least 44px and every field uses 16px text; the app reloads offline
after one visit; with 5,000 entries the Dashboard, Transactions and Reports open in about 0.3 s and saving
or pinning takes about 0.2 s (limits in the test are 4 s and 1.5 s for slow CI machines); Android back
closes the More sheet first; an iPhone sees the install and move-your-data note.

Lighthouse 12.8 on the built app (local preview, so the network is simulated): mobile performance 88,
accessibility 100, best practices 100; desktop performance 99. SEO scores 60 only because the page asks
search engines not to index it (`noindex`), which is deliberate for a private app.

Drop 6 added: a drawing survives a reload and belongs to its page and month; a held loop snaps
to a clean circle; a note stays beside its donut slice when the window resizes; the pencil's answer
points at the right element; reduced motion turns off tracing, wobble and eye tracking; doodles off
removes the pencil and annotations; privacy hides amounts in captions and numbers in notes.
Drop 5 added: the pin-bar total equals the sum on Dashboard, Transactions, Budgets and Reports;
the marquee total equals the sum of selected rows; undo history and redo restore exactly; month
switcher, bar click and keyboard roving; hover highlight and card; heatmap brush sets a custom period.
Drop 4 added: reports
split the financial year at 1 April; a CSV export from Reports has the BOM and `Amount (₹)` header and,
imported again, adds nothing (every row skipped as a duplicate); a found subscription goes on the timeline
and its pill drags by days; the what-if yearly saving; categories reorder by dragging; no page scrolls
sideways at phone width (that test caught and fixed an overflowing Reports header).

CI (`.github/workflows/ci.yml`) runs `check` and `e2e` on every push and pull request. The Pages deploy
(`deploy.yml`) runs on its own and does not wait for CI.

## Drop 13: reach and polish, v1.1.0 (23 Oct 2026, published and tagged)

- **Spaces** (Settings > Spaces, off by default): "Keep a Shop ledger as well" and the shop's name. A
  switcher in the context bar picks Personal, the shop or Both (remembered on the device). Each ledger
  keeps its own entries, money in, accounts, budgets, recurring payments, udhaar, loans, goals, wishlist,
  assets and trips; categories, rules, settings and the lock are shared. In Both, what you add goes to
  Personal, Budgets asks you to pick a ledger and the Dashboard leaves out the budget card. Transactions
  moves selected entries to the other ledger (one undo). The default name "Shop" follows the language.
- **Profit and loss** (Reports, in the Shop or Both): sales (money in), spending by category, fees,
  profit or loss and margin, a row per month for longer periods, CSV export; Both adds Personal beside it.
- **Backups**: an optional password (typed twice, 8+ characters) encrypts the file with AES-GCM and
  PBKDF2-SHA-256 at 600,000 rounds; restoring asks for it and says plainly when it is wrong. The phone
  reminder's "Back up now" saves at once (share sheet, or a download). Where the browser can write to a
  folder (Chrome on a computer or Android), "Back up to a folder every week" writes
  `ledger-backup-YYYY-MM-DD.json` when Ledger opens after a week, or asks with one tap when the browser
  wants permission again. Folder backups are not password-protected (the password is never stored).
- **App badge** (Settings > Experience, only where `setAppBadge` exists): recurring and card payments due
  in the next seven days. On an iPhone it asks for notification permission and never sends any.
- **Face ID or fingerprint** (Settings > Screen lock, with a PIN, where a platform authenticator exists):
  a passkey made on the device; the lock screen offers "Use Face ID or fingerprint"; the PIN always
  works; removing the PIN removes the passkey. The setting says it is not yet tried on a real iPhone
  home-screen app.
- **Telugu and Hindi** (Settings > Appearance > Language): 1,626 texts translated into each, dates and
  month names follow, built-in category names and payment methods are shown translated (stored English),
  amounts keep Western digits and ₹, `<html lang>` follows (also before first paint, from `boot.js`).
  Text with no translation shows in English. Quick-add examples stay English, as the parser reads
  English, Telugu and Hindi words anyway. Devices use their own Telugu and Devanagari fonts.
- **Polish**: start-up JavaScript 153 of 160 KB (Transactions and the sketch tools now load on first
  use; the charts' scales replace d3-scale); all other JavaScript 253 of 300 KB; the two language chunks
  72 of 80 KB gzipped and 290 of 320 KB offline; CSS 14 of 16 KB; the rest of the precache 1,230 of 1,300
  KB (icons were listed twice; the accented handwriting font is no longer precached). Fixed on the way:
  the category colour button overlapped the name on phones; short month names are whole words; "1st"
  is a plain number in Telugu and Hindi. Version 1.1.0.

Verified: lint, typecheck, 501 unit tests (49 files, including the translation coverage test and a
passkey signature test), build with budgets, Playwright 115 passed and 21 skipped with `CI=1` (new
`e2e/drop13.spec.ts`: Shop ledger, profit and loss and privacy in Both; a protected backup round trip;
Telugu and Hindi across pages and a reload; passkey unlock through Chrome's virtual authenticator; the
one-tap reminder). axe runs on every page in English, Telugu and Hindi; the phone-size check runs at 360,
390 and 430px in English and at 360px in Telugu and Hindi; the privacy sweep runs in all three.

Not verified on real devices: Face ID or fingerprint in the iPhone home-screen app (and Android), the
badge on an iPhone with notifications allowed, the weekly folder backup in Chrome on Android, the share
sheet for "Back up now" on an iPhone, and how Telugu and Hindi read to a native speaker (the
translations are mine; a quick read by Dhaarmik is worth it).

## Drop 12: insight (23 Oct 2026, published)

- **Search** (Transactions, `?q=`; the palette's "Search entries for …"): `src/domain/search.ts` reads
  periods, amounts, methods, categories and subcategories, tags, people ("for amma"), trips, tax
  sections and flags; other words must appear in the merchant, notes, typed text or tags. Chips show
  what was understood. The module loads when someone first searches (start-up budget).
- **Your rules** (Settings > Rules, `?view=rules&merchant=` from a merchant page; `src/domain/rules.ts`):
  merchant contains, starts with or is; optional amount range and method; set category, subcategory,
  tag, for whom, tax section. Tested live on past entries; saving can apply it to them (one undo).
  Order: your rules, then learned categories, then subcategory names, then built-in words. Quick add
  and several at once take everything a rule sets; the form keeps its category and fills what is empty.
  Rules are the settings list `customRules`.
- **Merchant pages** (`#/merchant?key=`, lazy page): totals, average, visits, how often, the rule that
  files it, 12 months, full history. Linked from the palette (merchants now open here), Reports' top
  merchants and the merchant grouping in Transactions.
- **Nudges** (Dashboard card "Worth a look", `src/domain/nudges.ts`): repeats within a day, unusual
  amounts (twice the median of 3+ earlier entries and ₹200 more), recurring price rises, warranties
  ending within 30 days. "Fine" puts one away (settings list `nudgesDismissed`, not backed up).
- **Weekly digest**: the week recap offer is now a digest card (`dash/WeekDigest.tsx`, lazy).
- **Trips, projects and festivals** (Budgets > Trips, store `projects`, schema v4): dates, budget, and
  "collect entries in these days" so new entries join by date. `Transaction.projectId`; the form, bulk
  bar and search use it. Deleting one keeps its entries.
- **Subcategories**: `Category.subcategories` (`id` is `${categoryId}/${slug}`), `Transaction.subcategoryId`.
  Every total still counts the category, so charts and budgets roll up by themselves. Settings >
  Categories edits them; Reports' category table opens them; quick add picks one named in the entry.
- **Reports**: "Recent" ranges (last 30 days, 3, 6, 12 months, this calendar year), saved reports
  (`savedReports`), 50/30/20 (`Category.need`, defaults in `needs.ts`), spent for whom, tax summary
  for the financial year with CSV export (`tax.ts`; old-regime limits as a guide; notes the 2025 Act's
  renumbering).
- **Form** ("Who it was for, tax and warranty"): `forWhom`, `taxSection`, `warrantyMonths`; a trip
  select when trips exist. Rows show these as a muted line. Transactions > Warranties lists them.
- **Start-up size**: the Add sheet's forms, the lock screen and the close-the-month card now load on
  first use (`src/app/deferred.tsx`, swapped for `deferred.eager.tsx` in tests); CSV export moved to
  `src/domain/csvExport.ts`. Start-up JavaScript 164 of 170 KB, all JavaScript 244 of 300 KB, CSS 14 of
  16 KB, precache 1263 of 1300 KB (close; Drop 13 should trim).

Verified: lint, typecheck, 473 unit tests (44 files), build with budgets, Playwright 103 passed and 15
skipped with `CI=1` (new `e2e/drop12.spec.ts`; the axe, dark-contrast, phone-size and privacy sweeps
include Trips, Rules, Warranties, a merchant page and a search). Not verified on real phones: the tax CSV
through the share sheet, how the search box feels with the phone keyboard.

## Drop 11: interactive (22 Oct 2026, published)

- **Transactions** has List, Calendar and Review views (`?view=calendar`, `?view=review`, loaded on
  first use from `src/app/views/`). Calendar: Monday-first weeks with spending, bills, money in, card
  dues and no-spend days; arrows move a day or a week, Page Up and Page Down a month. Review: unsure
  entries one at a time; right arrow or swipe right accepts, left skips, 1 to 9 picks a category.
- **Learning rule** (`src/domain/learning.ts`): only decided entries vote; a merchant's rule changes when
  two of its last three decided entries agree; a merchant's first decision is learned straight away.
  Used by edits and Review (not bulk moves).
- **Command palette** (`src/app/Palette.tsx`, lazy): Ctrl+K or Cmd+K, or the search button in the top
  bar. Pages and views, add, undo, redo, privacy, theme, recaps, customise, and merchants (pins the
  merchant and opens Transactions).
- **Dashboard**: cards can be reordered and hidden (Customise, or a long press on a phone; settings
  `dashboardOrder` and `dashboardHidden`; quick add, check-in, close the month and the recap offer stay
  on top). New cards: Day by day (scrub with pointer or keys; the donut and a list follow the day) and
  Sketchbook (with doodles on). A recap offer appears once per new week, month or financial year.
- **Recap** (`src/app/recap/`, lazy): cards for a week, month or financial year; the month recap starts
  with a guess; "Share this card" draws a PNG (no amounts with privacy on) and uses the share sheet
  where files can be shared, else downloads it. Reports opens the month on screen; the palette opens
  last week or month.
- **Reports**: compare with the 12-month average (scaled to the period's days), a "Year to date against
  last year" shortcut, a treemap (categories, then a category's merchants) and a money-flow chart with
  a table; categories can open their merchants.
- **Splits** (Add and edit form, `src/app/split/`, editor lazy): equal, exact, percentages or shares;
  paid by you or someone else. The entry keeps your share and `split` (whole bill, parts, udhaar ids);
  others' shares become udhaar (`Split: <merchant>`), so balances and udhaar stay right; deleting,
  restoring or editing the entry updates its udhaar. A split paid by someone else moves none of your
  accounts. Money > Udhaar shows "Who pays whom" (fewest transfers) and "Mark all settled" (settings
  list `settledSplits`).
- **Rows and sheets**: swipe a row left to delete or right to edit (phones); Shift+click selects a range;
  Columns hides category, method, account or tags (`hiddenColumns`); the edit form has a History list
  from the activity log (audit events now carry `entities` such as `tx:<id>`). Add and More sheets have
  a handle with half and full snap points (drag, tap, Enter or arrow keys).
- **Wry one-liners** (Settings > Doodles, off by default, `src/domain/wry.ts`): with them on, every other
  pencil tap says a kind, amount-free line about the month.
- Opening and closing Add keeps the page's own query (`addPath`, `closeAddPath` in `router.ts`), so the
  calendar stays the calendar.
- **Size**: start-up JavaScript 166 of 170 KB (tight; Drop 13's performance pass should win some back),
  all JavaScript 217 of 300 KB, CSS 13 of 16 KB, precache 1184 of 1300 KB. No schema change.

Verified: lint, typecheck, 431 unit tests (41 files), build with budgets, Playwright 95 passed and 15
skipped with `CI=1` (new `e2e/drop11.spec.ts`; the privacy, axe, phone-size and sideways sweeps include
Calendar and Review and a split; touch gestures are driven with pointer events on the phone project). Not verified on real phones:
the share sheet for recap images (headless browsers download instead), swipe feel, long press.

## Drop 10: plan ahead (22 Oct 2026, published)

- **Dashboard**: "Safe to spend today" (budget, or money in without one, less spending before today, bills
  still to come, entries logged for later days and what goals need this month, shared over the days left
  including today, less today's spending; "How it is worked out" shows the sum). "Close October" in the
  first 7 days of a month (spent, against budget, in and out, top category, carried rollover, optional
  note pinned to the month as `month:YYYY-MM`). "Budgets to watch" lists categories over budget or
  heading over it. The budget card's "at this pace" now uses the forecast. All three show for the
  current month with nothing pinned.
- **Budgets** (`?view=` budgets, goals, wishlist): categories grouped Fixed, Flexible, Non-monthly with
  subtotals and a type picker per row (defaults: Housing fixed, Education non-monthly), "Roll over" per
  category ("plus ₹800 carried"), a Pace chart (spending added up against a straight line to the plan),
  at-risk text in rows, and "Reset plan" (clears the month's budgets as one undo, then offers
  suggestions).
- **Goals and funds**: target, date, monthly amount (missing at the start of the month over the months
  left, snoozed months skipped), on track / ahead / at risk against an even plan, a drawn jar, put aside
  (logged only, never moves account money), snooze this month, "Paid" for a fund (a yearly one restarts
  next year and keeps anything extra).
- **Wishlist**: 7 or 30 day wait; Buy (logs the expense today with the last method and marks it bought,
  one undo) or Skip; "Saved by waiting" adds up skipped prices.
- **Net worth** (Money > Overview): accounts less cards, assets you value yourself (gold, FD, mutual
  funds, stocks, PF and PPF, property, other; dated values, 0 when sold), udhaar both ways and loans left
  (a loan counts from a month before its first EMI); breakdown and month ends from the first month with
  anything in it.
- **Domain**: `plan.ts` (budget kinds, bills left, forecast, safe to spend, rollover, pacing, at risk,
  month review), `goals.ts`, `wishlist.ts`, `networth.ts`. The pace insight uses the forecast, so a fixed
  cost such as rent is no longer stretched over the month (one Drop 4 test was updated for this).
- **Data**: schema v3 adds `goals`, `wishlist`, `assets`; the settings list `closedMonths`; categories
  gain optional `budgetKind` and `rollover`; transactions gain the source `wishlist`. Backups carry all
  of it (merge adds missing rows and closed months; restore replaces the three stores).
- **Size**: start-up JavaScript 157 of 170 KB, all JavaScript 194 of 300 KB, CSS 12 of 16 KB, offline
  precache 1108 KB, under the new 1,300 KB limit.

Verified: lint, typecheck, 391 unit tests (38 files), build with budgets, Playwright 86 passed and 14
skipped with `CI=1` (new `e2e/drop10.spec.ts`; the privacy, axe, phone-size and sideways sweeps now cover
Goals and Wishlist and the Drop 10 amounts), screenshots on desktop and a Pixel 7 size. Not verified on
real phones yet.

## Drop 9: the whole money picture (22 Oct 2026, published)

- **Money page** (`#/money`, `src/app/pages/Money.tsx`, `src/app/money/*`): Overview (cash flow, money in,
  accounts with transfers, fees and cash checks), Udhaar, Loans. In the sidebar and the More sheet; the
  month switcher works there; a badge shows cards due within a week.
- **Data** (schema v2, a new migration): stores `accounts`, `flows` (income, transfer, fee, adjust),
  `people`, `udhaar`, `loans`; generic `putRow`/`removeRow` Commands, so every step undoes. Spending stays
  in `transactions` and nothing new is counted as spending anywhere. Backups carry all five; merge adds
  what is missing, a full restore replaces them like everything else.
- **Domain**: `accounts.ts` (balances from the opening date, method-to-account mapping, card statement,
  due date and lateness, cash flow, cash check, income kinds), `udhaar.ts` (balances, settle, reminder
  text), `loans.ts` (EMI, schedule, status, prepay), `fx.ts` (rates with four decimals, conversion).
- **Quick add** spots money in ("salary 40k", "got 500 from Rahul", "refund 299 credited") with a chip
  to switch it back. The Add form has "From account" (once accounts exist) and "Paid in another
  currency"; rows show the original amount. The Dashboard lists cards due within a week.
- **Size**: Budgets, Reports, Recurring, Settings and Money load on first visit (`src/app/pages/lazy.tsx`;
  tests use `lazy.eager.tsx` through an alias in `vite.config.ts`). `scripts/budget.mjs` now checks
  start-up JavaScript (152 of 170 KB), all JavaScript (182 of 300 KB), CSS 11 of 16 KB and the offline
  precache (1058 of 1100 KB, so the next drops will need that limit raised or fonts trimmed).
- e2e page sweeps (privacy, axe, phone sizes, sideways scroll) include the three Money views and wait for
  lazy pages (`.page-loading` gone).

Verified: lint, typecheck, 351 unit tests (35 files), build with budgets, Playwright 80 passed and 14
skipped with `CI=1` (new `e2e/drop9.spec.ts`), and screenshots of the Money views on a Pixel 7 size and
desktop dark. Not verified on real phones: the share sheet for udhaar reminders (falls back to copying).

## Drop 8: never miss a log (22 Oct 2026, published)

The owner approved the roadmap in `docs/REQUIREMENTS.md` section 11 (Drops 8 to 13; no automatic
capture). Drop 8 is built:

- **Check-in** (`src/domain/habit.ts`, `src/app/CheckIn.tsx`): under quick add on the Dashboard, days in the
  last week with nothing logged ("No spend, or forgot?"), each with No spend and Add (opens Add on that
  day through `?action=add&on=YYYY-MM-DD`); All no spend; Not now hides it until tomorrow. No-spend days
  live in the settings store under `noSpendDays` (a Command, so undoable) and are in backups.
- **Habit line**: "Logged 26 of the last 30 days. 12 days in a row, with a rest day." Every 7 logged days
  earn a rest day, up to 2 saved; today never counts against you.
- **Repeat** (`src/domain/repeat.ts`): under quick add, favourites first, then anything logged 3+ times in
  90 days with the same merchant, amount, category and method; one tap adds it for today. Favourites
  (up to 12) live under `favourites` in the settings store and in backups; Settings > Favourites pins,
  reorders and removes; Transactions: select one entry, Save as favourite. Select entries, Copy to today.
- **Maths** (`src/domain/calc.ts`): `+ - x * / × ÷` and `k` in quick add, the amount field ("= ₹310"
  while typing) and the keypad; paise-exact, times and divide first; dates win ("18/9" stays a date).
- **Add sheet** has Form, Keypad and Several (remembered in `settings.addMode`). Keypad: amount, then tap a
  category to save (source `keypad`); hardware keys work. Several: one entry per line, preview, one undo.
- **Telugu and Hindi** (`src/domain/indic.ts`): native digits, rupee, cash and date words in both scripts
  and Roman spellings, everyday spending words; merchant keys keep Devanagari and Telugu (Latin keys
  unchanged, so old learned rules still match).
- **Month start day** (Settings > Money, 1 to 28): `monthKey` in `src/domain/dates.ts` follows it (set
  from settings like privacy), plus `monthBounds`, `monthProgress`, `monthRangeLabel`, `shiftMonthKey`.
  KPIs, budgets, projections, insights, the pencil, Reports' month and the month switcher (which then
  shows the dates) follow it. Starts 1 to 15 are named after the starting month, 16 to 28 after the ending one.
- Moved to Drop 12: subcategories (they touch every chart and report).

Verified: lint, typecheck, 315 unit tests (32 files), build with budgets (JavaScript 162 of 170 KB,
CSS 10 of 16 KB, precache 998 of 1100 KB), Playwright 74 passed and 14 skipped with `CI=1` (new
`e2e/drop8.spec.ts`: check-in, keypad, several lines with Hindi and Telugu, month start 25 and 19), and
screenshots of the new screens on a Pixel 7 size and desktop dark. Not verified: Telugu and Hindi
rendering on real phones (the test browser here lacks a good Telugu font), and typing Indic text with
real phone keyboards.

Watch the size budget: 8 KB of JavaScript is left for Drops 9 to 13. Drop 9 should load Reports,
Recurring and Settings on demand (code splitting) before adding more.

## After 1.0: voice quick add on iPhone (22 Oct 2026)

- Safari offers the speech API inside a home-screen (installed) app but it always fails there
  (WebKit bug 225298), and the old error text blamed microphone permission. In the installed app on
  iPhone the mic button now focuses quick add and says to use the keyboard's own mic, which works.
- Safari in a tab repeats the whole phrase in each result ("chai", "chai 20", "chai 20 cash"), which
  was joined into "chai chai 20 chai 20 cash". `src/domain/transcript.ts` merges results properly and
  drops dictation's full stop.
- Safari often never ends listening: it now stops 1.5 s after the last words, never runs past 12 s,
  and the button resets even if the browser never reports the end. Typing stops listening.
- Tests: `src/domain/transcript.test.ts`, `src/app/voice.test.ts`, two more in `src/app/drop7.test.tsx`.
  Not verified on a real iPhone.

## After 1.0: Dashboard flicker fix (22 Oct 2026)

- Root cause: hovering a bar previews that month in the donut, and the donut's legend listed only
  the previewed month's categories. The card changed height under a still mouse, the bar moved away,
  the preview ended, the height changed back, and the loop ran 40 to 90 times a second (empty ring,
  jumping page, tooltips flashing). Fix: `Donut` takes `legendIds`, a fixed row set from the Dashboard
  (this month's categories, then any other category in the six bars); rows with nothing show a dash.
- Also: in Total mode, bar segments no longer highlight the category under the pointer (which faded
  the rest of the donut); they still light up when a category is hovered elsewhere.
- Tests: `src/charts/Donut.test.tsx`, `e2e/stability.spec.ts` (fails on the old code with 65 preview
  changes in 1.2 s; passes with 1).

## After 1.0: sample data (21 Oct 2026, awaiting publish)

- "Load sample data" on the empty Dashboard and Transactions pages and in Settings > Sample data:
  about three months of everyday Indian spending (`src/domain/sample.ts`, deterministic), five
  recurring payments and budgets for months that had none. Every id starts with `sample-`.
- A banner on the Dashboard while it is loaded; "Remove sample data" deletes only what the sample added
  (budgets the user changed are kept), for good rather than to Trash, as one undoable step. Real entries
  added meanwhile stay. A restored backup that contains sample entries can still be cleaned up by id.
- Tests: `src/domain/sample.test.ts`, `src/data/sample.data.test.ts`, `e2e/sample.spec.ts`.

## Drop 7: what was added

- Install help (`src/domain/platform.ts`, `src/pwa/install.ts`, `src/app/InstallBanner.tsx`): Chrome and
  Edge get an Install button only when the browser offers it (never a dead button); iPhone and iPad get
  Share then Add to Home Screen, the note that the installed app keeps its own data so install first,
  and, when the browser tab already holds entries, a link to back up and restore in the app; in-app
  browsers (Instagram, Facebook, Gmail and others) are told to open Safari or Chrome. The banner shows on
  the Dashboard until Not now; Settings > About always shows it.
- Android back (`src/pwa/back.ts`): back closes the top layer first (More sheet, notes list, receipt,
  sketch mode); the Add sheet already used the address. Choosing a page from the More sheet replaces its
  history entry, so back returns to where it was opened.
- Voice quick add (`src/app/voice.ts`): a microphone in quick add where the browser supports speech
  recognition, in Indian English; the words fill the field and the usual chips appear.
- Sheets ride above the keyboard (`src/pwa/viewport.ts`, `--kb`); gestures that start within 24px of a
  screen edge are ignored (`src/kit/edge.ts`) so system back swipes win.
- Storage: Ledger asks once, on first run, for persistent storage.
- Touch: on phones and touch screens every control is at least 44px (the visible pill stays the same size,
  the extra is transparent); History in the header is an icon on narrow phones.
- Settings > Experience: a "Click when a drag snaps" switch (off by default; the sound is generated, no
  files).
- Size: font subsets Ledger never shows (Cyrillic, Greek, Vietnamese) are not precached.
- Version 1.0.0.

## Decisions taken in Drop 7

- Voice input uses the browser's own speech service, which in Chrome sends audio to Google. The app makes
  no network call itself, and the listening message says the audio may be processed online.
- Pages are not split into separate files: it would save only about 10 KB on first load.
- Lighthouse's SEO score is left at 60: indexing a private app is the wrong thing to fix.
- Counts in the Transactions footer stay plain digits ("5000 transactions"): grouping digits would need
  number formatting outside `money.ts`.
- Not verified on real devices: the iPhone install flow and the separate storage of the installed app,
  Android's back gesture, voice input, the keyboard lift and haptics. Please try these on your phones.

## What is in 1.0

Quick add with live highlighting; a full Add sheet with receipts; Transactions with filters, grouping,
saved views, bulk edits and Trash; Dashboard KPIs, budget card, donut and six-month bars; Budgets with
suggestions and an allocation bar; Reports by month, quarter, financial year or custom range with a
heatmap, CSV and PDF; Recurring with a 30-day timeline; pins, linked highlighting, hover cards, drill-downs
and undo history everywhere; Doodle Studio (the pencil, sketches, notes and stamps); privacy mode, PIN lock,
backups, CSV import; installable and offline on iPhone and Android.

## Drop 6: what was added

- `src/domain/sketch.ts` (Ramer-Douglas-Peucker at epsilon 0.8, line/circle/box snapping, the 200KB cap,
  eraser hit test), `notes.ts` (anchors, labels, privacy masking of numbers), `companion.ts` (moods,
  props per page, questions and answers, one auto-annotation per page, the top insight as a sentence).
- `src/doodle/`: line art (ten category drawings, empty-state drawings, stamps), mood faces, the
  companion pencil, the layer over each page (saved strokes, notes, auto-annotation, the pencil's
  caption, the drawing surface), sketch toolbar, notes list, the save-time category doodle.
- Notes and drawings use the `notes` and `sketches` stores that existed since v1 (no migration). Every
  change is a command; sketch steps are labelled `Sketch: ...` so undoing them pops no toast. Backups now
  carry notes and drawings; importing or restoring adds missing ones and never removes any.
- Anchors are `data-anchor` attributes on donut slices, month bars, entry rows, heatmap days, budget
  meters and recurring rows.
- Settings > Experience: Doodles and Sketch style switches. Caveat is self-hosted for captions.

## Decisions taken in Drop 6

- Notes attach to things, not to a page and month, so a note on Food shows wherever Food's slice is.
  Drawings are per page and month, as required.
- Outside sketch mode nothing drawn can be clicked; notes are edited from the list (Shift+N).
- Sketch undo and redo use the app's undo (so History and Ctrl+Z include strokes).
- The pencil sits at the bottom of the sidebar on desktop. On phones it sits in the header and tapping it
  opens the questions as a list (there is no room for a separate Ask button).
- Desktop has a Sketch button in the top bar; phones start sketching from the pencil's list.
- Mood faces on the six bars compare each month with the current budget line.
- Doodles off keeps the user's own notes and drawings.
- Not verified on a real phone: drawing with a finger or stylus, pressure, and the long-press wake.

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

1. Try the unverified items above on a real iPhone and Android phone, and read the Telugu and Hindi
   screens once.
2. Nothing else is planned. New features need a line in `docs/REQUIREMENTS.md` first.

## Notes

- The legacy importer (`src/data/legacyImport.ts`) is unused by the UI; the owner has no old data.
- Playwright 1.56.1 is pinned to match the sandbox Chromium. On the Mac run `npx playwright install
  chromium` once before `npm run e2e`.
- Date inputs show in the device's locale (dd/mm/yyyy on an Indian-English phone).
