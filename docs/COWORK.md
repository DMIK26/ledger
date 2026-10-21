# Running this project in Claude Cowork

## One-time setup

1. Use the Claude desktop app (macOS or Windows), updated to the latest version, on a paid plan. Open the
   Cowork tab.
2. Unzip the project into a dedicated folder such as `~/Projects/ledger`. Do **not** give Cowork your whole
   home, Desktop or Documents folder; it can read and write whatever folder you share.
3. In Cowork's left navigation open **Projects**, choose **+**, then **Use an existing folder** and pick
   `~/Projects/ledger`. Name it "Ledger", paste the instructions below, and create it. (Docs:
   https://claude.com/docs/cowork/guide/projects and
   https://support.claude.com/en/articles/14116274.) Selecting a project starts a session with the folder
   mounted and the instructions applied.

## Project instructions (paste these)

> You are the lead engineer on Ledger, a private offline-first expense tracker (React 19, TypeScript, Vite,
> IndexedDB) that publishes to GitHub Pages at https://dmik26.github.io/ledger/. At the start of every session
> read CLAUDE.md, docs/HANDOFF.md, docs/REQUIREMENTS.md, docs/ARCHITECTURE.md and docs/PLAN.md. Make
> decisions yourself and state them; do not give me lists of options. Keep replies short. Work one drop at a
> time (docs/PLAN.md) and finish it fully before starting the next. After every change run
> `npm run lint && npm run typecheck && npm test && npm run build` and report the result honestly. Never format
> money outside src/domain/money.ts. Never ask for or store GitHub tokens; I commit and push with GitHub
> Desktop. Work only inside this folder. If something cannot be verified here, say so and tell me exactly what
> to run on my Mac.

## Prompts, in order

1. "Finish Drop 1 exactly as described in docs/HANDOFF.md, then tell me what to do to publish it."
2. After you have published and installed it: "Build Drop 2." Then Drop 3, 4, 5, 6 and 7 in turn.
3. Before Drop 1 is published, attach the JSON you exported from the old app and say: "Use this to verify
   src/data/legacyImport.ts and add a trimmed copy as a test fixture."

## If the sandbox blocks npm or Playwright

Cowork runs commands in a sandbox whose network access is controlled by an allowlist. If `npm install` fails
with a 403 from a proxy, allow package managers in Claude's network settings (or ask your admin on a Team
plan). If that is not possible, run the commands yourself in Terminal and paste the output back:

```
cd ~/Projects/ledger
npm install
npm run lint && npm run typecheck && npm test && npm run build
npx playwright install chromium && npm run e2e
```

(These are the same in zsh and PowerShell.)

## Publishing

Cowork edits files in the folder; you publish. Follow `docs/PUBLISHING.md` with GitHub Desktop. After the
first publish, every update is: Commit, Push origin, and the deploy runs on its own.
