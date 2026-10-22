# Ledger: requirements register

Everything the owner (Dhaarmik) asked for across the design conversation, consolidated. Each section is a
contract: if code disagrees with this file, the code is wrong. Rules marked **(tested)** already have
unit tests in `src/**/*.test.ts`; keep them green.

## 1. Product

A private, offline-first personal expense tracker called **Ledger**. Single user, no accounts, no cloud,
no analytics, no runtime network calls. Data lives on the device (IndexedDB). Installable on iPhone and
any Android phone as a PWA, hosted free on GitHub Pages at https://dmik26.github.io/ledger/.
Default currency INR (₹, Indian digit grouping). Other currencies selectable (USD, EUR, GBP).
Dates are dd/mm. The financial year starts in April (configurable). Never use Anthropic names or logos;
only borrow the visual language.

## 2. Visual language (Anthropic-style: warm, editorial, flat)

- Palette: ivory `#faf9f5`, card white, fill `#f0eee6`, border `#e8e6dc`, ink `#141413`, muted text
  `#6b6a64` (AA on ivory), clay `#d97757`, accent text on light `#a9502c`, blue `#6a9bcc`, green `#788c5d`,
  sand `#d4a27f`. Dark theme: `#141413` canvas, `#1f1e1c` card, `#3a3935` border, `#faf9f5` text.
  Light, dark and system themes. See `src/design/tokens.css`.
- Type: **Newsreader** (serif) for page titles, big figures and empty-state headlines; **Albert Sans** for
  UI and body (16px base); **Caveat** only for doodle captions. Fonts are self-hosted via `@fontsource`.
- Flat: 1px borders, no shadows, no gradients, no emoji, thin line icons (1.5px stroke), 14px card radius,
  10px control radius, generous whitespace. **No all-caps labels**, no spaced-dash labels, no numbered
  eyebrows. Sentence case everywhere. Tone: plain, short, lightly wry; no exclamation marks.
- Ten category colours, all unique: `#d97757 #6a9bcc #788c5d #d4a27f #c46686 #4a6f95 #a8553a #9a8fc4 #4f8f86
  #b0aea5` (gray is Other). Past ten, repeat with a diagonal hatch.
- Quality floor: AA contrast, visible focus ring (2px clay), 44px touch targets, `prefers-reduced-motion`
  respected, responsive from 360px.

## 3. Money, dates, categories (tested)

- Amounts are integer minor units, never floats. `fmtMoney` in `src/domain/money.ts` is the **only** way an
  amount becomes text (ESLint enforces it). Privacy mode returns a fixed-shape mask, so real digits never
  reach the DOM. Exports may reveal real amounts only behind a confirm.
- Dates are local `YYYY-MM-DD` strings. Never `toISOString()` for a calendar date (UTC shifts the day in India).
- Default categories (keep these names): Housing & Utilities, Food & Dining, Groceries, Shopping &
  Essentials, Health & Wellness, Transport & Travel, Entertainment & Culture, Education, Business, Other.
  Custom categories allowed; never rename or delete a category that has entries without asking where to move them.
- Payment methods: UPI, Cash, Card, Bank transfer, Other.

## 4. Quick add (tested; the user's own rules)

`parseQuickEntry(text, { today, lastMethod, rules })` in `src/domain/parser.ts`.

- A date typed in the entry is the entry's date. No date means today.
- A bare day ("18", "18th", "on 18th") means that day of **today's real month** (not the month on screen).
  If it is after today, still save it and flag it **upcoming**.
- An earlier month only when the user names it: "5th sep", "sep 5", "18/9", "25th last month".
- Day + month without a year picks the current year unless that lands more than 7 days ahead, then last year.
- Relative: today, yesterday, day before yesterday, "3 days ago", "last friday" (the most recent one before
  today), bare weekday (most recent on or before today). Full dates: `18/09/2026`, `2026-09-18`.
- Impossible dates (31 sep) give an inline error ("September has 30 days") and save nothing.
- The merchant never contains date, amount or method words ("shawarma on 18th oct" becomes "Shawarma").
- Amounts: `₹`/`rs`/`inr` marker wins; `1,200`, `1.5k`, `2k`; number words ("two fifty" = 250, "five hundred");
  a number that belongs to a date is never the amount; with several plain numbers the largest is the amount
  and a lone leftover 1-31 is the day.
- Method typed (upi, gpay, phonepe, paytm, cash, card, neft, bank...) else the last-used method.
- Category: learned rule, then built-in keyword/brand map (India-aware), then typo-tolerant match (edit
  distance 1), then **Other, flagged unsure**. Never default to Food & Dining. Picking a category for an
  unsure entry saves a rule for that merchant (undoable). Settings lists learned rules.
- The typed text is stored as `raw`; show it as the row subtitle.
- Reference table (today = Mon 19 Oct 2026) lives in `src/domain/parser.test.ts`.
- Live feedback (Drop 2): highlight recognised words in the input (amount clay, date blue, method green,
  category sand) and show editable chips; "Saves to September 2026" when the month differs; after Enter,
  slide to that entry's month if it differs from the one on screen.

## 5. Pages

**Dashboard**: quick add; KPI cards (spent this month, change vs last month, daily average, top category);
budget card with remaining and projected month-end plus a what-if slider; donut by category; six-month bars
with a draggable budget line and a Total / By category toggle; recent transactions; up to four insights.

**Transactions**: one footer row (count and total, never two). Empty state only when there are zero records;
filters that match nothing show "No matches" with Clear filters. Filters (date range, category, method, tags,
amount), faceted counts, sort, 15-row pages, group by day/category/merchant/method, inline edit, bulk actions,
saved views, duplicate warning, receipts (IndexedDB, 1600px JPEG), tags, trash (30 days), CSV export.

**Budgets**: overall and per-category budgets; allocation bar (drag a divider to move budget between
categories, total fixed); "Suggest budgets" and "Copy last month" as ghost bars with Accept/Reject; over-budget
states use text as well as colour ("Over by ...").

**Reports**: Month / Quarter / Financial year / Custom; compare to previous period or same period last year;
category table with sparklines; top merchants; method split; weekday pattern; daily-spend heatmap; CSV
(UTF-8 with BOM so Excel shows ₹) and PDF (A4 print stylesheet).

**Recurring**: 30-day timeline with draggable pills, subscription detection, what-if switch-off with yearly saving.

**Settings**: theme, privacy, currency, FY start, category manager (drag reorder, live recolour), CSV import
with column mapping and duplicate skipping, backup/restore (JSON, share sheet), import from the previous
Ledger, activity log, trash, storage (persist + usage), experience (motion Full/Reduced/Off, sounds, haptics,
doodles), version and update check, and sample data (load about three months of made-up spending,
recurring payments and budgets to try the app; remove exactly that in one tap, undoable; owner request,
21 Oct 2026).

Legend and chart rules from the prototypes: full category names (wrap, never truncate with an ellipsis),
compact axis labels (₹10k, never "₹40,000.00"), plots fill their card, both cards equal height.

## 6. Privacy and safety

- Privacy mode masks every amount everywhere: tables, KPIs, chart axes and tooltips, hover cards, toasts,
  document title, aria-labels, notes, captions. A self-test visits every page and asserts no real amount
  string appears in `document.body.innerText`, any attribute, or the title.
- Optional screen lock (4-8 digit PIN, salted PBKDF2 via WebCrypto), auto-lock after 30s in the background,
  neutral cover in the app switcher. Copy must say plainly it keeps casual viewers out and does not encrypt data.
  "Forgot PIN?" on the lock screen removes the PIN after a 24-hour wait and keeps all data; entering the
  right PIN during the wait cancels it (owner decision, 21 Oct 2026).
- Global undo/redo (Ctrl/Cmd+Z, Shift+Z when no input is focused) over the last 20 changes; audit log of the
  last 500 events; trash for 30 days. Backup reminder every 7 days on mobile.

## 7. Interactivity (the "interaction kit")

Built once in `src/kit`, reused everywhere:
- **EntityBus**: categories, merchants, days, methods, tags, transactions are keyed entities; hover, focus
  or tap-hold highlights an entity everywhere and dims the rest to 35%. Delegated listeners, rAF batching.
- **Pins**: click pins an entity into a filter bar under the top bar; every page respects pins; Esc removes
  the last. Month stays with the month switcher.
- **Breadcrumb** drill-downs (category > merchants > transactions, KPI > breakdown), **HoverCard** (spring lag,
  focus and tap-hold), **Drag** (snap, haptic tick, spring label, arrow-key equivalent), **Expand** (shared-element),
  **Undo**, roving tabindex with arrow keys and an aria-live summary.
- Charts (custom SVG, not Chart.js): donut hover/pin/drill with centre swap; bars with hover crosshair and
  tooltip, hover-to-preview that month in the donut, click-to-pin month, draggable budget line, Total / By
  category morph. Charts update in place; they never redraw from scratch.
- Shell: month strip popover with mini bars and mood dots; nav badges and peek cards.
- Per page behaviours (brushes, facets, marquee select, rebalance, what-if, impact preview, history chips) are
  listed in `docs/PLAN.md` Drop 2 to 5.
- Motion: CSS transforms and opacity only; Web Animations plus a small spring helper (overshoot 8% max);
  View Transitions where available; nothing loops; Reduced mode means 120ms fades; every gesture has a
  button or keyboard equivalent; pause when the tab is hidden; 60fps with 5,000 records.

## 8. Doodle Studio (Drop 6)

Warm hand-drawn line art: one 2px round-capped stroke in ink, a single clay accent per drawing, optional
flat sand fill. A slight wobble (`feTurbulence` + `feDisplacementMap`, scale 1.5) only while animating.
- **Companion**: a small pencil character with a two-dot face, in the sidebar bottom on desktop and the page
  header on mobile (never over content). Different prop per page. Eyes follow the pointer or last touch.
  Click: micro-reaction plus a bubble with the top insight. Moods: relaxed under 80% of budget, worried
  80-100%, dizzy over, asleep when idle. Waves on first visit to each page. Drag it like a toy; it springs home.
  "Ask the pencil" opens a context-aware radial menu; answers are typewriter captions with an arrow at the
  relevant element.
- **Sketch layer** on every page (shortcut D): pen, highlighter, eraser (whole strokes), fading ink, undo/redo,
  clear, four colours; pressure-aware; shape snap (line, circle, rectangle) after a 400ms hold; strokes stored
  as simplified vector paths (Ramer-Douglas-Peucker, epsilon 0.8) per page and month, capped at 200KB.
- **Anchored notes and stamps** attach to entities (a bar, slice, row, day, budget bar), not pixels, and follow
  them on resize and month change. Notes panel (Shift+N) lists them.
- **Category doodles** (bowl, basket, scooter, house, bag, heart, clapper, book, briefcase, asterisk) draw
  themselves when an entry is saved; page-specific empty-state doodles; mood faces on bars and budget cards;
  auto-annotations (arrow plus Caveat caption) on each page; an app-wide "sketch style" toggle (off in print).
- Doodles never cover or intercept clicks unless Sketch mode is on. Settings > Experience can switch them off.

## 9. Mobile and PWA (Drop 7, basics in Drop 1)

- `base: '/ledger/'`, relative URLs, service worker scope `/ledger/`, `registerType: 'prompt'` with an
  "Update ready" toast; precache everything (fonts included) so it works offline after the first load.
- Head: viewport `viewport-fit=cover`; `format-detection` off (iOS must not linkify amounts); Apple web-app
  tags; two `theme-color` metas; status-bar style set from the saved theme by `public/boot.js`.
- Layout: under 900px a bottom tab bar (Dashboard, Transactions, centre Add, Reports, More); dialogs become
  bottom sheets; tables become cards; safe areas via `env(safe-area-inset-*)`; `100dvh`; sheets ride above the
  keyboard (`visualViewport`); inputs 16px+; `inputmode="decimal"`; `touch-action: manipulation`;
  `overscroll-behavior: none`; hover-only effects gated by `(hover: hover) and (pointer: fine)`.
- Android back closes the top sheet first (History API). Ignore swipes starting within 24px of either edge.
- Voice quick add via SpeechRecognition (en-IN) where available; receipts by camera or gallery.
- Install UX: Android `beforeinstallprompt` button; iOS Safari banner pointing at Share > Add to Home Screen;
  in-app browsers say "Open in Safari or Chrome". First run on iOS says the installed app keeps its own data,
  separate from Safari, so install first, then add entries.
- `navigator.storage.persist()` on first run; Settings shows usage and persistence; backups through the share
  sheet; a Safari tab that already holds data offers "Export here, import in the installed app".
- No live sync between phones in v1 (it would need a backend). Backup and restore only.

## 10. Defects from earlier prototypes. Never repeat

Empty-state card above a table that has rows; two total rows; cut-off legend names; two categories sharing a
colour; ".00" on every axis label; a dead strip under the bar chart; privacy blur missing on some amounts
(tables, KPI sub-lines, budget card, axis labels); date text left in the merchant name and the entry saved on
the wrong day; "Film" filed under Food & Dining; a "Download App" button that cannot install on a phone.

## 11. After 1.0: approved roadmap (owner approval, 22 Oct 2026)

Research and sources: the project doc `claude/feature-roadmap.md`. Owner decision: **no automatic capture
of any kind** (no bank SMS reading, message paste, share target, iPhone Shortcut, statement import, UPI
reference matching or icon shortcuts). Everything stays on the device with no network calls.

### Drop 8: never miss a log

- **Missed-day check-in** (Dashboard): days in the last 7 (not today, not before the first entry) with no
  entry and not marked are listed: "Nothing logged on Tue 20 Oct. No spend, or forgot?" Each day offers
  "No spend" (marks it, undoable) and "Add" (opens Add for that date); "All no spend" marks them all; "Not
  now" hides the card until tomorrow.
- **Repeat**: under quick add, up to six chips (pinned favourites first, then entries logged three or more
  times in 90 days with the same merchant, amount, category and method). One tap adds it for today
  (undoable). Settings > Favourites pins, unpins and reorders; a transaction can be saved as a favourite.
  Transactions gets "Copy to today" for selected entries (one undo).
- **Maths**: amounts accept `+ - x * / × ÷` ("250+120/2", "3 x 45", "2k+500"), in quick add, the amount
  field and the keypad; multiplication and division before addition and subtraction; results round to the
  paisa; dates keep priority ("18/9" is a date); a result at or below zero, or a division by zero, is an error.
- **Keypad** in the Add sheet: amount display, digits, decimal point, the four operators and delete; then
  tap a category to save (two taps for "amount, category"); optional "What for", date and method; hardware
  keys work. Privacy mode masks the display.
- **Several at once** in the Add sheet: one entry per line, a preview of what each line becomes, lines with
  problems listed and skipped, "Save N entries" as one undoable step.
- **Telugu and Hindi quick add**: Telugu and Devanagari digits; rupee words (రూ, రూపాయలు, रु, रुपये,
  rupaye); cash words (నగదు, नकद, nagadu, naqad); date words (నిన్న, మొన్న, ఈరోజు, कल, परसों, आज and
  their Roman spellings ninna, monna, eeroju, kal, parson, aaj); common spending words in both scripts and
  in Roman letters (chai, paalu, kooragayalu, sabzi, kiraya, bijli, dawai, battalu and so on) map to the
  default categories. The merchant keeps the user's own script.
- **Kind streaks**: a day counts when it has an entry or is marked no spend. The Dashboard shows "Logged
  26 of the last 30 days" and the current run; every 7 logged days earn a rest day (up to 2 saved) that
  keeps the run going. No guilt copy, no emoji.
- **Month start day** (Settings, 1 to 28, default 1): budgets, the Dashboard, the month switcher, insights
  and month reports use the chosen cycle. A cycle starting on day 1 to 15 is named after the month it
  starts in, 16 to 28 after the month it ends in (salary on 25 Oct funds "November"). The month switcher
  shows the dates when the start is not 1.
- Subcategories move to Drop 12 (they touch every chart and report).

### Drop 9: the whole money picture

- **Money page** (`#/money`, in the sidebar and the More sheet) with three views: Overview, Udhaar, Loans.
  The month switcher works on it. Spending pages stay spending-only: income, transfers, fees and udhaar
  never count as spending, in budgets, KPIs, charts or reports.
- **Income**: "Money in" entries (amount, what, date, kind: Salary, Business, Interest, Gift, Refund,
  Other, and the account it went to). Quick add recognises money in ("salary 40k", "got 500 from Rahul",
  "refund 299 credited"), shows a "Money in" chip that can be switched back to spending, and saves it as
  income. Words that only signal income (got, received, credited, earned) are dropped from the name.
- **Cash flow** (Overview): for the month on screen, In, Out (spending plus interest and fees) and Left,
  with six months of in and out bars.
- **Accounts**: bank, cash, wallet and credit card, each with an opening balance on a date (for a card,
  what is owed). Each payment method can belong to one account (default: UPI and Bank transfer to the
  first bank, Cash to cash, Card to the first card), so existing entries count without editing; the Add form
  can pick another account. Balances = opening + money in + transfers in + udhaar received - spending -
  fees - transfers out - udhaar paid, counting from the opening date. Archive instead of delete once
  anything uses an account.
- **Transfers** move money between accounts and are never spending; paying a card is a transfer to it.
- **Cash check**: on a cash account, type what is in your wallet; Ledger shows the difference and either
  records it as spending ("Cash not logged", Other) or corrects the balance only.
- **Credit cards**: statement day and due day (1 to 28) and an optional limit. Shows owed now, the last
  statement's amount, what is left to pay after payments since, the due date and "due in N days" or
  "overdue". Interest and fees are entered as fees: they raise what is owed and show in cash flow, never
  in spending (like YNAB, Oct 2026). A card due within 7 days shows on the Dashboard and as a badge.
- **Udhaar**: people and entries (I lent, I borrowed, they paid me back, I paid back), a running balance
  per person ("Rahul owes you", "You owe Priya"), settle up in one tap, optional account. "Remind" opens the
  share sheet (or copies) with a short polite message including the amount; it is off in privacy mode.
- **Loans and EMIs**: amount, yearly interest rate, months, first EMI date and an optional EMI from the
  bank. Shows the EMI, the full schedule (interest and principal each month), EMIs paid so far, what is
  left to repay, the next EMI and a slider: "pay this much more each month" shows the months saved and
  the interest saved. The schedule is a plan; EMIs paid are tracked as recurring payments as before.
- **Foreign currency**: the Add form takes an amount in another currency and a rate you type (rupees per
  unit); the entry is stored in rupees with the original amount and rate kept and shown on the row.
  Currencies: INR, USD, EUR, GBP, AED, SGD, AUD, CAD.
- **Size**: Budgets, Reports, Recurring, Settings and Money load on first visit (still cached for
  offline). The size check measures JavaScript loaded at start-up (170 KB) and all JavaScript (300 KB).
- Money stays integer paise; interest maths rounds to the paisa; privacy mode hides every new amount.

### Drop 10: plan ahead (owner approval with additions, 22 Oct 2026)

- **Safe to spend today** (Dashboard): the month's budget (or, without one, the money in this month) less
  spending before today, bills still to come this month (recurring payments due after today) and what goals
  need set aside this month, shared over the days left including today, less what was spent today. Spending
  less one day raises the next days' amount by itself. Without a budget or money in, it says how to start.
- **Budget types**: each category is fixed, flexible or non-monthly (defaults: Housing & Utilities fixed,
  Education non-monthly, the rest flexible), changed on Budgets. Budgets groups categories by type with
  subtotals.
- **Month-end forecast**: spending so far, plus flexible spending at its daily rate for the days left, plus
  bills still to come. Used by the budget card and the pace insight.
- **Pacing chart** (Budgets): spending added up day by day against a straight line to the budget, with
  categories at risk (heading over their budget at this rate) flagged on Budgets and the Dashboard.
- **Rollover** (per category, off by default): what is left of a category's budget, or what went over,
  carries into next month's budget for that category; shown as "plus ₹800 carried".
- **Plan reset** (Budgets): clears this month's budgets in one undoable step and offers suggestions.
- **Goals and funds** (Budgets > Goals): a save-up goal (keep it) or a fund for a known cost (insurance,
  school fees, Diwali; can repeat yearly) with a target and a date. Ledger shows the monthly amount needed,
  what is put aside (logged by you; it does not move account money), on track, ahead or at risk, a drawn
  jar, snooze this month, and "Paid" for a fund (a yearly one starts again for next year).
- **Wishlist** (Budgets > Wishlist): things you want, with a 7 or 30 day wait. When the wait is over: Buy
  (adds the expense) or Skip; skipped items add up as "saved by waiting".
- **Net worth** (Money > Overview): gold, FDs, mutual funds, stocks, PF, property and other assets with
  values you update; net worth = accounts (cards owed taken off) + assets + udhaar owed to you - udhaar you
  owe - loans left to repay; a breakdown and the last twelve month ends.
- **Close the month** (Dashboard, the first 7 days of a month): last month's spending against budget, in
  and out, top category, carried budget, an optional note, and "Close" (undoable).
- The offline storage budget rises to 1,300 KB. The calendar view moves to Drop 11.

### Later drops (scope agreed, details written when each starts)

- **Drop 11, interactive**: calendar view of spending, bills, salary and card due dates; command palette; swipe review mode and the two-of-three learning rule; chart
  scrubbing (pointer and keys); guess-first recap; treemap and money-flow chart; compare modes; story recap
  shared as an image with privacy respected; Splitwise-style splits; customisable dashboard; bottom sheets
  with snap points; swipe rows, range select, column choice, per-entry history; sketchbook that fills as you
  log; the pencil's optional wry one-liners.
- **Drop 12, insight**: plain-words search; rules editor tested on history; saved reports with relative
  dates; in-app nudges (unusual amount, likely duplicate, subscription price rise); merchant pages; trips,
  projects and festival funds; weekly digest; 50/30/20 view; subcategories; tax summary (80C, 80D and other
  deductions tagged and totalled for the financial year, exportable); spent for whom (per family member or
  the shop); warranties (period on an entry, receipt kept, expiring soon list).
- **Drop 13, reach and polish (v1.1.0)**: Personal and Shop spaces with a simple profit and loss; passkey
  unlock if it works in an iPhone home-screen app; one-tap backup to Files on iPhone and a weekly file
  backup on Chrome; password-protected backup files (encrypted on the device); app badge for bills due; Telugu and Hindi interface; accessibility and performance pass.
- Not doing: automatic capture, bank linking, AI chat, maps, push or email alerts, widgets, ads, analytics,
  cloud sync.
