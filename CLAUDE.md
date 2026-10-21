# Ledger: working agreement

Ledger is a private, offline-first expense tracker (React 19, TypeScript, Vite, IndexedDB) published to GitHub
Pages at https://dmik26.github.io/ledger/ and installed on iPhone and Android as a PWA.

**Start every session** by reading `docs/HANDOFF.md` (current status and next steps), then
`docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md` and `docs/PLAN.md`.

## The owner

Dhaarmik (GitHub: dmik26). He is a final-year student who is learning React, works on a MacBook (zsh) and
publishes with GitHub Desktop. He wants you to **decide**, not present option lists; give firm recommendations,
keep replies short, and explain publishing steps click by click. He expects an Anthropic-style look (warm,
flat, editorial) but not Anthropic's logos. Say plainly what you did, what you could not verify, and what is next.

## Commands

```
npm install
npm run dev          # http://localhost:5173/ledger/
npm run lint && npm run typecheck && npm test && npm run build     # the green bar; run after every change
npm run e2e          # Playwright (builds, previews on :4173). Needs: npx playwright install chromium
```

## Non-negotiables

1. Amounts are integer minor units. Text only via `fmtMoney` / `<Money>` in `src/domain/money.ts`
   (ESLint enforces it). Privacy mode must hide every amount everywhere, including aria-labels, tooltips,
   toasts and the document title.
2. Dates are local `YYYY-MM-DD`. Never `toISOString()` for a calendar date.
3. Every data change is a `Command` run on the `CommandBus` (undoable, audited). Schema changes are a new
   entry appended to `MIGRATIONS`; never edit an old one; never drop user data.
4. Pure logic lives in `src/domain` with tests. The agreed quick-add table in `parser.test.ts` must stay green.
5. No runtime network calls, analytics or third-party scripts. Fonts are self-hosted.
6. URLs are relative or use Vite's base (`/ledger/`). Storage keys and cache names start with `ledger`.
7. Sentence-case copy, no all-caps labels, no emoji, no gradients, no shadows. Respect reduced motion.
8. Add nothing that is not in `docs/REQUIREMENTS.md` without asking.

## Safety

Work only inside this folder. Never ask for, store or paste GitHub tokens or passwords; Dhaarmik commits and
pushes with GitHub Desktop (see `docs/PUBLISHING.md`). Do not delete the old GitHub repository; he does that
himself at publish time. Do not commit `node_modules`, `dist` or personal data.
