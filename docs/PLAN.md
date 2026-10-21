# Build plan: seven drops

Each drop ends green: `npm run lint && npm run typecheck && npm test && npm run build`, plus Playwright
once there are flows to test. Each drop is committed and deployed before the next starts, so GitHub is
always the source of truth.

| Drop | Scope | Done when |
|---|---|---|
| 1. Foundation and first publish | Scaffold, tokens and themes, app shell, money/date/parser/categoriser, IndexedDB, command/undo/audit, legacy importer, CI, Pages deploy, basic PWA, quick-add preview on the Dashboard and Transactions, Settings (theme, privacy, currency, backup, import) | Live skeleton at https://dmik26.github.io/ledger/ installs on a phone, works offline, quick add saves "shawarma 500 on 18th oct upi" as 18 Oct, privacy mode hides every amount |
| 2. Capture and ledger | Add dialog / bottom sheet, quick add with live token highlighting and chips, Transactions (filters, sort, paging, inline edit, bulk, trash, saved views, duplicate warning), tags, receipts, PIN lock | e2e covers add, edit, delete, undo, filter; a privacy leak test passes on every page |
| 3. Dashboard and budgets | KPIs, donut, six-month bars with draggable budget line, Total / By category morph, budget card with what-if, Budgets with allocation bar and suggestions | Pinned-category totals match across Dashboard and Transactions; budget drag snaps to 500 |
| 4. Reports, Recurring, data tools | Reports (periods, compare, heatmap, CSV and PDF export), Recurring (timeline, detection, what-if), insights, category manager, CSV import with mapping, backup/restore polish, activity and trash screens | FY boundary tests; CSV round trip; import skips duplicates |
| 5. Interaction kit everywhere | EntityBus, pins and filter bar, HoverCard, Breadcrumb, Drag and brushes, month strip, nav peeks, linked highlight and hover-preview between charts, global undo UI, keyboard model | Pin totals agree on every page; undo/redo exact; marquee total equals sum of selected rows |
| 6. Doodle Studio | Companion, sketch layer, notes and stamps, category doodles, auto-annotations, ask-the-pencil, sketch style | Stroke simplification and shape snap tested; anchored notes survive resize and month change; Reduced motion disables wobble and tracking |
| 7. Mobile and release | Audit at 360/390/430px, install flows, update toast, offline checks, performance pass at 5,000 records, accessibility pass (axe), docs, tag v1.0.0 | Lighthouse budgets met; no horizontal overflow; every control 44px+; inputs 16px+ |

## Working rules

- Build the lowest layer first (domain, then data, then UI). Pure logic gets tests before it gets a screen.
- Do not add features that are not in `docs/REQUIREMENTS.md` without asking.
- Keep the repository deployable at every commit to `main`.
- When a drop will not fit in one session, stop at the last fully working step and say what remains.
