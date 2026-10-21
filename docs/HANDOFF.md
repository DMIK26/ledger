# Handoff: where the build stands

Written 21 Oct 2026 when the project moved from a Claude chat to Claude Cowork. Drop 1 is partly done.
Read `CLAUDE.md`, then `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md` and `docs/PLAN.md`, then this file.

## Done and verified

`npm run typecheck`, `npm run lint` and `npm test` all pass (48 tests).

- Tooling: `package.json`, `tsconfig.json`, `vite.config.ts` (base `/ledger/`, PWA manifest, build-only CSP
  plugin, `__APP_VERSION__`), `eslint.config.js` (money-formatting ban), `.prettierrc`, `playwright.config.ts`
  (builds then previews on port 4173), `.gitignore`, `LICENSE`, `.github/workflows/ci.yml` and `deploy.yml`,
  PWA icons in `public/icons` (192, 512, maskable, apple-touch, favicon).
- `src/domain`: `types`, `dates`, `money` (with privacy mask), `categories`, `categoriser`, `numberWords`,
  `parser`. The agreed date-rule table is in `parser.test.ts`.
- `src/data`: `db`, `migrations` (v1), `commands`, `bus` (undo/redo, audit cap 500, trash purge), `store`
  (Zustand), `backup` (export, validate, import merge/replace), `legacyImport` (tolerant importer for the
  earlier app's export), with tests in `data.test.ts`.
- `src/design/tokens.css` (light, dark, system), `index.html` (meta tags, boot script), `public/boot.js`
  (pre-paint theme and iOS status-bar style), `src/vite-env.d.ts`.

## Not done: finish Drop 1

Nothing below exists yet. `src/main.tsx` is a placeholder page (it proves the build, manifest, service worker and
CSP pipeline work: `npm run build` passes and precaches 22 files). Replace it, then write these in order.

1. `src/design/base.css`: reset; `.app` grid (sidebar 232px + main) from 900px up; under 900px the sidebar is
   hidden and `.tabbar` is fixed to the bottom (safe-area padding); `.topbar` sticky with
   `padding-top: calc(16px + env(safe-area-inset-top))`; cards (1px border, 14px radius, no shadow); buttons
   (primary uses `--primary-bg/--primary-fg`, secondary has a border, ghost), 44px minimum height on touch;
   chips (8px radius, `--fill` background, small colour dot); 2px clay focus ring; tabular lining numerals on
   `.amt`; `.amt[data-masked]` gets `filter: blur(5px)` and `user-select: none`; transaction list as a CSS grid
   (desktop columns: date, merchant with raw subtitle, category chip, method, amount right-aligned, delete;
   under 720px a two-line card); toast; `dialog` bottom sheet under 900px; `@media (prefers-reduced-motion)`
   removes transitions. Body font Albert Sans 16px/1.55; page titles and big figures Newsreader (weight 400,
   `font-optical-sizing: auto`).
2. `src/app/router.ts`: `useRoute()` built on `useSyncExternalStore` over `hashchange`, returning
   `{ path, query }` (default `/`), and `navigate(path)`. Routes: `/`, `/transactions`, `/budgets`, `/reports`,
   `/recurring`, `/settings`.
3. `src/app/icons.tsx`: inline SVG icons, 20px, 1.5px stroke, `currentColor`: home, list, wallet, chart,
   repeat, gear, plus, eye, eyeOff, trash, undo, more, check.
4. `src/app/Money.tsx`: `<Money minor currency? compact? signed? />` using
   `useSyncExternalStore(subscribePrivacy, isPrivacyOn)`; renders `<span className="amt" data-masked>`.
5. `src/app/Layout.tsx`: sidebar with the wordmark "Ledger" (serif) and the six routes; top bar with the
   serif page title, an Undo button (when `canUndo`) and a privacy toggle (`aria-pressed`, calls
   `setSetting('privacy', ...)`); mobile tab bar: Dashboard, Transactions, centre Add (primary round button,
   navigates to `/transactions?action=add`), Reports, More (a `<dialog>` sheet listing Budgets, Recurring,
   Settings). A visible skip link. Shows a calm loading state until `ready`, and an error state with the
   message if the database cannot open (private browsing).
6. `src/app/QuickAdd.tsx`: text input (16px, `enterKeyHint="done"`, autofocus when `?action=add`); parses with
   `parseQuickEntry(text, { today: todayISO(), lastMethod, rules })`; shows chips for amount (`fmtMoney`), date
   ("Today", "Yesterday" or `fmtDate`, with "Upcoming" and "Saves to <Month Year>" when relevant), category
   (a `<select>` of all categories; when `parsed.unsure`, show "Pick a category" and the hint that Ledger will
   remember it), and method. Errors in a `role="alert"` list. Enter saves through `addFromParsed(parsed,
   override)`; Escape clears. Never save when `!parsed.ok`.
7. `src/app/Toast.tsx`: reads `notice` from the store; `role="status"`; Undo button when `canUndo`; auto-
   dismiss after 6 seconds; sits above the tab bar on mobile.
8. Pages in `src/app/pages/`:
   - `Dashboard.tsx`: QuickAdd; a "This month" card (serif 44px total for the real current month via
     `<Money>`, entry count); the six most recent entries; a calm empty state ("Nothing logged yet", one
     sentence, no illustration yet); a dismissible banner "Found data from the earlier Ledger on this device"
     (use `readLegacyFromStorage(localStorage)`; dismissal stored in `localStorage` key `ledger.legacyDismissed`)
     linking to Settings.
   - `Transactions.tsx`: QuickAdd plus the full list. **One** footer row ("N transactions" and the total).
     Empty state only when there are zero records. Delete button per row (calls `removeTransaction`, toast
     offers Undo).
   - `Settings.tsx`: cards for Appearance (System/Light/Dark segmented control), Privacy (toggle plus a masked
     sample), Money (currency select, financial-year start month), Data (Export backup via
     `navigator.share` with a file, falling back to a download; Import: one file input that detects a Ledger
     backup with `validateBackup` or an earlier-app export with `parseLegacy`; for legacy show a preview
     (count, date range, total, new categories, a toggle for "amounts are in paise" when `unitDetected`) and
     import through `importTransactions` so it is undoable; offer the same import for data found on this device),
     Storage (button calling `navigator.storage.persist()`, usage from `navigator.storage.estimate()`), About
     (`__APP_VERSION__`, "Check for updates", installed or not).
   - `Soon.tsx` used by Budgets, Reports and Recurring: states which drop delivers it.
9. `src/pwa/register.ts`: `initPwa()` (production only) using `registerSW` from `virtual:pwa-register`;
   exposes `usePwaState()`, `applyUpdate()` and `checkForUpdates()`; the Layout shows an "Update ready" toast
   with a Reload button and a one-time "Ready to work offline" notice.
10. `src/main.tsx`: import `@fontsource-variable/newsreader/opsz.css`, `@fontsource-variable/albert-sans`,
    `./design/tokens.css`, `./design/base.css`; call `useLedger.getState().init()`; render `<App />`; call
    `initPwa()`.
11. Tests: a QuickAdd component test (type "shawarma 500 on 18th oct upi", assert the chips, press Enter,
    assert the entry exists dated 18 Oct); `e2e/smoke.spec.ts` (loads, adds that entry, reload keeps it,
    privacy toggle masks every amount, bottom tab bar on the Pixel 7 project, no console errors, manifest
    reachable). Add a privacy leak test: with privacy on, `document.body.innerText` must not contain the
    formatted real amount.
12. Update `README.md` and tick Drop 1 in `docs/PLAN.md`.

Definition of done for Drop 1: lint, typecheck, unit tests and build pass; the e2e smoke passes; the build
output contains the CSP meta tag and a manifest; opening `npm run preview` shows no console errors.

## Open items

- The owner deleted the old GitHub repo, so its Export button is gone. His entries are still in his browser's
  localStorage for dmik26.github.io. He may give you a console dump (`{ key: "<json text>" }`) or an export file;
  `findRecordList` accepts both, and `readLegacyFromStorage` finds the data under any key name once the new
  site is live on the same address. Verify with his real file and add a trimmed copy as a test fixture.
- The legacy importer was written against guessed shapes. Ask the owner to attach the JSON he exported from the
  old app, trim it, and add it as a fixture in `data.test.ts`. Adjust `legacyImport.ts` if it differs.
- Delete the old GitHub repo only when Drop 1 is ready to publish (see `docs/PUBLISHING.md`).
- The toolchain is current as of October 2026 (Vite 8, TypeScript 6, ESLint 10, Vitest 5, React 19). If a
  breaking change appears, fix it forward rather than pinning old majors.
- Playwright 1.56.1 is pinned because the build sandbox's preinstalled Chromium matched it. If Chromium is
  missing, run `npx playwright install chromium` or rely on CI.
