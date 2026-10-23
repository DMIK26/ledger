# Architecture

## Stack (decided, do not re-litigate)

| Area | Choice |
|---|---|
| Language / UI | TypeScript (strict) and React 19 |
| Build | Vite with `base: '/ledger/'`; `vite-plugin-pwa` (Workbox, `registerType: 'prompt'`) |
| State | Zustand store plus a command bus (every change is undoable and audited) |
| Storage | IndexedDB through `idb`, versioned migrations. `localStorage` only holds boot flags (`ledger.boot`: theme, privacy) so the first paint is right |
| Charts | Custom SVG with `d3-scale` and `d3-shape` (add in Drop 3). Not Chart.js: slices and bars must be real DOM for highlighting, focus, doodle anchors, hatch patterns and PNG export |
| Routing | Hash router (`#/transactions`); GitHub Pages cannot rewrite URLs |
| Motion | CSS transforms and opacity, Web Animations API, a small spring helper, View Transitions as an enhancement. No animation library |
| Fonts | Self-hosted `@fontsource-variable/newsreader` (use `opsz.css`) and `albert-sans`; add `caveat` in Drop 6 |
| Tests | Vitest + jsdom + fake-indexeddb + fast-check; Testing Library; Playwright (desktop Chrome and Pixel 7); axe in Drop 7 |
| Lint | ESLint flat config. A rule bans `Intl.NumberFormat`, `.toFixed` and `.toLocaleString` outside `src/domain/money.ts` |
| CI/CD | GitHub Actions: `ci.yml` (lint, typecheck, test, build) and `deploy.yml` (build and deploy to GitHub Pages) |
| Security | No runtime network calls, no analytics. Strict CSP meta injected at build time (`script-src 'self'`) |

## Layout

```
src/
  domain/   pure logic, no React, no storage: money, dates, categories, categoriser, parser, numberWords
            (later: aggregates, insights, budgets, recurring, reports)
  data/     IndexedDB (db, migrations), commands, bus (undo/redo/audit/trash), store (Zustand),
            backup, legacyImport
  design/   tokens.css (themes), base.css (layout and components)
  app/      shell: router, Layout, pages, Money component, QuickAdd, Toast, icons, files (export),
            settings/ (category manager, CSV import, activity)
  kit/      entityBus (linked highlight), view (pins, month), HoverCard, Shell (month switcher,
            pin bar, undo history, nav peeks), roving keys, spring, haptics, marquee, transitions
  charts/   donut, bars, heatmap, sparkline, waterfall, brush        (Drop 3 onward)
  doodle/   art and faces, Companion (the pencil), DoodleLayer (strokes, notes, annotations,
            drawing surface), Studio (toolbar, notes list, save doodle), anchors, state
  pwa/      register (updates), install, back (Android back closes sheets), viewport (keyboard)
  test/     setup.ts
e2e/        Playwright specs
docs/       this folder
```

## Data model (`src/domain/types.ts`)

Transaction (id, date, amountMinor, currency, merchant, categoryId, method, notes, tags, raw, source, unsure,
createdAt, updatedAt), Category, MerchantRule, Settings, AuditEvent, TrashItem. Stores created in migration
v1: transactions (indexes by-date, by-category), categories, rules, settings (key/value), audit (auto id),
trash (index by-deleted), budgets, recurring, notes, sketches, receipts (blobs).

The settings store (key/value) also holds lists changed through Commands: `savedViews`,
`recurringIgnored`, `sampleData`, since Drop 8 `favourites` and `noSpendDays`, and since Drop 10
`closedMonths`. Month boundaries all
go through `monthKey` / `monthBounds` in `src/domain/dates.ts`, which follow the month start day
(Settings, set once at start-up like privacy in `money.ts`); never slice a date to get its month.

Schema v2 (Drop 9) adds `accounts`, `flows` (income, transfers, fees, cash-check adjustments), `people`,
`udhaar` and `loans`. Spending stays in `transactions`; money in, transfers, fees, udhaar and loans never
reach spending totals. Rows in these stores change through `putRow` / `removeRow` Commands.

Schema v3 (Drop 10) adds `goals` (contributions and snoozed months live inside each goal), `wishlist` and
`assets` (dated values inside each asset), also through `putRow` / `removeRow`. Categories carry an
optional `budgetKind` (fixed, flexible, non-monthly; `budgetKindOf` in `src/domain/plan.ts` gives the
default) and `rollover`. Planning logic (forecast, safe to spend, rollover, pacing, at risk, month review)
is pure in `src/domain/plan.ts`; goals, wishlist and net worth have their own modules.

Drop 11 adds no stores. A split lives on its entry (`Transaction.split`: whole bill, parts, who paid, the
ids of the udhaar rows it created); the entry's `amountMinor` is your share, so every total stays
spending-only. Audit events carry `entities` (such as `tx:<id>`) for an entry's history; `Command`
has the same optional field and `composite` merges its children's. Screen-wide UI that several pages
open (palette, recap, Customise) lives in a small Zustand store, `src/kit/ui.ts`. The palette, the
recap viewer, Calendar, Review, the split editor and the sketchbook load on first use.

Schema v4 (Drop 12) adds `projects` (trips, projects and festival funds), through `putRow` /
`removeRow`. Entries gain optional `subcategoryId`, `projectId`, `forWhom`, `taxSection` and
`warrantyMonths`; categories gain `subcategories` and `need`. An entry always keeps its category, so a
subcategory never changes a total. Your rules (`customRules`), saved reports (`savedReports`) and put-away
nudges (`nudgesDismissed`) are settings lists. Pure logic: `search`, `rules`, `subcategories`, `nudges`,
`merchant`, `projects`, `tax`, `needs`, `warranties`, `forWhom` in `src/domain`.

Pages other than the Dashboard load on demand (Transactions too since Drop 13) (`src/app/pages/lazy.tsx`, which also
has the merchant page); tests swap in `lazy.eager.tsx` through an alias in `vite.config.ts`. The Add
sheet's forms, the lock screen and the close-the-month card load the same way from `src/app/deferred.tsx`
(tests: `deferred.eager.tsx`), and the search words load on first search.

Drop 13 needs no schema change. **Spaces**: rows that belong to a ledger (entries, flows, accounts, people,
udhaar, loans, goals, wishlist, assets, budgets, recurring, projects) carry an optional `space`; missing
means Personal, `'shop'` the Shop. Settings `spacesOn`, `shopName`, `space` (Personal, Shop or Both).
`src/data/commands.ts` keeps a module-level write space (like privacy in `money.ts`) and stamps new rows;
the store keeps every row in `everything` and shows the view's rows in the usual lists, so pages need no
changes. Shop budget ids start `shop|`. A backup holds every space; restoring one with Shop rows turns
Spaces on. Pure logic in `src/domain/spaces.ts` (profit and loss too).

**Interface language** (`src/domain/i18n.ts`): `tl(text, ...parts)` returns the text in the chosen
language with `{0}`, `{1}` filled; `tr(text, ...nodes)` (`src/app/tr.tsx`) does the same with React
parts such as `<Money>`; `msg(text)` marks text kept in a list made at start-up, translated where it is
shown. The English text is the key; `src/i18n/te.json` and `hi.json` hold the words and load on first
use (`src/i18n/load.ts`, precached), before anything re-renders; the Layout is keyed by language so
everything redraws. Built-in category names are shown translated and stored English
(`shownCategory` / `storedCategory`); payment methods are shown with `methodLabel`. Dates use
`monthName`, `monthShort`, `dayName`, `dayShort`. `src/i18n/coverage.test.ts` fails if any `tl`, `tr` or
`msg` text lacks a Telugu or Hindi translation or a translation drops a placeholder. New interface text
must go through `tl`/`tr`, never a bare string; `t` is not used because it names entries everywhere.

**Backups** (`src/domain/backupCrypto.ts`): an optional password encrypts the backup with AES-GCM; the
key comes from PBKDF2-SHA-256, 600,000 rounds, random salt and IV; the password is never stored.
`src/app/folderBackup.ts` writes the weekly folder backup through the File System Access API; the folder
handle is kept in the settings store under `backupFolderHandle` (not backed up).

**Passkey unlock** (`src/domain/passkey.ts`, `src/app/passkeyUnlock.ts`): WebAuthn with a platform
authenticator and user verification. Ledger stores the credential id and public key (settings key
`lockPasskey`, never backed up) and checks each assertion itself (challenge, origin, RP id hash, user
present and verified flags, ES256 or RS256 signature). Removing the PIN removes it.

**App badge** (`src/domain/badge.ts`, `src/app/appBadge.ts`): `navigator.setAppBadge` with the number of
recurring and card payments due in the next seven days, from every space.

**Sizes**: `scripts/budget.mjs` checks start-up JavaScript (160 KB gzipped), all other JavaScript (300),
the two language chunks (80 gzipped, 320 offline), CSS (16) and the rest of the precache (1,300 KB), and
fails on a file listed twice. Transactions and the sketch tools load on first use, and the charts use
`src/charts/scale.ts` instead of d3-scale (kept as a dev dependency for its parity test).

New schema work is a **new entry** appended to `MIGRATIONS` in `src/data/migrations.ts`; never edit an old
step. `DB_VERSION` is `MIGRATIONS.length`.

## Command pipeline

UI calls a store action, which builds a `Command { label, apply, revert }` and runs it on the `CommandBus`:
apply, write an audit event (capped at 500), push on the undo stack (20), clear redo, refresh the store.
`undo`/`redo` replay `revert`/`apply` and are audited too. Deleting moves an entry to Trash (30 days;
`purgeTrash` runs at startup). Composite commands group several steps into one undo.

## Conventions

- Money: integer minor units. Text only through `fmtMoney` / `<Money>`. Never `toFixed` on an amount.
- Dates: local `YYYY-MM-DD`; helpers in `src/domain/dates.ts`; never `toISOString()` for a calendar date.
- Pure functions take `today` as a parameter so tests are deterministic.
- IDs from `crypto.randomUUID()` (fallback in the store).
- Components stay small; derived data comes from `domain/` functions, not inline in JSX.
- Every user-visible string is sentence case, plain and short.
- Privacy: any new surface that shows an amount (tooltip, aria-label, title, toast, note) goes through `fmtMoney`.
- Accessibility: real labels, 44px targets, visible focus, `prefers-reduced-motion`, aria-live for toasts.

## Hosting facts

GitHub Pages serves the project at `/ledger/`, so every URL is relative or uses Vite's base. Pages for a
Free-plan account requires a **public** repository. The origin `dmik26.github.io` is shared by every project in
the account, so storage keys and cache names start with `ledger`.
