# Handoff: where the build stands

Updated 21 Oct 2026. **Drop 1 is complete** and waiting to be published (see `docs/PUBLISHING.md`).
Read `CLAUDE.md`, then `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md` and `docs/PLAN.md`, then this file.

## Verified

`npm run lint`, `npm run typecheck`, `npm test` (56 tests, 6 files) and `npm run build` pass.
`npm run e2e` passes on both Playwright projects (desktop Chrome and Pixel 7, 6 tests). The build output has
the CSP meta tag and `manifest.webmanifest`, precaches 23 files, and the preview shows no console errors.

## What exists

- Domain and data layers as before: `src/domain/*`, `src/data/*` (db, migrations v1, commands, bus, store,
  backup, legacyImport). The store gained `importFromBackup(file)`: merges a Ledger backup (entries,
  categories, rules this device lacks) as one undoable command.
- `src/design/base.css`: reset, shell grid (232px sidebar from 900px, bottom tab bar below), sticky top bar
  with safe areas, cards, buttons, segmented control, switch, chips, `.amt` (tabular numerals; blurred when
  `data-masked`), transaction grid (six columns from 720px, two-line card below), toast, dialog as bottom sheet
  under 900px, reduced motion.
- `src/app`: `router.ts` (hash router, `parseHash`, `useRoute`, `navigate`), `icons.tsx`, `Money.tsx`
  (`<Money>`, `usePrivacy`), `Layout.tsx` (sidebar, top bar with Undo and privacy toggle, tab bar with centre
  Add and a More sheet, skip link, loading and storage-error states, document title without amounts),
  `QuickAdd.tsx`, `Toast.tsx` (notices with Undo, 6 s; "Update ready" with Reload; one-time "Ready to work
  offline"), `TxList.tsx`, `App.tsx`, `pages/Dashboard.tsx`, `pages/Transactions.tsx`, `pages/Settings.tsx`,
  `pages/Soon.tsx`.
- `src/pwa/register.ts`: `initPwa`, `usePwaState`, `applyUpdate`, `checkForUpdates`.
- Tests: `src/app/app.test.tsx` (router, QuickAdd saves "shawarma 500 on 18th oct upi" as 18 Oct, impossible
  date refused, unsure category, other-month note, privacy leak check over text, attributes and title) and
  `e2e/smoke.spec.ts` (add, reload keeps it, privacy on Dashboard/Transactions/Settings, layout per device,
  `?action=add` focuses input, manifest and CSP, no console errors).

## Decisions taken in Drop 1

- The owner has **no data from the earlier app**, so the legacy banner on the Dashboard and the legacy import
  in Settings were left out. `src/data/legacyImport.ts` and its tests stay in the repo, unused by the UI.
  Settings imports Ledger backups only.
- Exporting a backup while privacy mode is on asks for confirmation first (the file holds real amounts).
- The Settings privacy sample uses a fixed amount (₹1,234.56) so the mask is visible.

## Next

1. Publish Drop 1 (`docs/PUBLISHING.md`), install on the phone, check offline.
2. Drop 2 (`docs/PLAN.md`): add sheet, live token highlighting, Transactions filters/sort/paging/inline edit,
   bulk, trash, saved views, duplicates, tags, receipts, PIN lock, privacy leak test on every page.

## Notes

- Toolchain current as of October 2026 (Vite 8, TypeScript 6, ESLint 10, Vitest 5, React 19).
- Playwright 1.56.1 is pinned to match the sandbox Chromium (build 1194). On the Mac run
  `npx playwright install chromium` once before `npm run e2e`.
- Only the new Drop 1 files are Prettier-formatted; the older domain/data files were left as written.
