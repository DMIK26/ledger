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
  kit/      EntityBus, Pins, HoverCard, Drag, Breadcrumb, shortcuts   (Drop 5)
  charts/   donut, bars, heatmap, sparkline, waterfall, brush        (Drop 3 onward)
  doodle/   art, companion, sketch, anchors, notes                   (Drop 6)
  pwa/      register, install, update
  test/     setup.ts
e2e/        Playwright specs
docs/       this folder
```

## Data model (`src/domain/types.ts`)

Transaction (id, date, amountMinor, currency, merchant, categoryId, method, notes, tags, raw, source, unsure,
createdAt, updatedAt), Category, MerchantRule, Settings, AuditEvent, TrashItem. Stores created in migration
v1: transactions (indexes by-date, by-category), categories, rules, settings (key/value), audit (auto id),
trash (index by-deleted), budgets, recurring, notes, sketches, receipts (blobs).

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
