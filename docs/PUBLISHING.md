# Publishing to GitHub Pages

Target: https://dmik26.github.io/ledger/ . No terminal needed; everything works in GitHub Desktop and the
GitHub website. The repository must be **public** (Pages on a Free account needs it); it holds no personal data.

## Before you start

1. Open the old app (https://dmik26.github.io/ledger/ledger-app.html), go to Settings and use Export JSON.
   Keep the file somewhere safe. Your entries live in your browser, not in the repo, so deleting the repo
   does not delete them, but clearing site data for dmik26.github.io would.
2. Install GitHub Desktop and sign in as dmik26.
3. Wait to delete the old repo until the new project is ready to push (step 1 below).

## Publish (first time)

1. **Delete the old repo.** github.com/dmik26/ledger, then Settings, General, scroll to Danger Zone, Delete
   this repository, and type the name to confirm.
2. **Put the project in a folder** that is not Desktop or Documents, for example `~/Projects/ledger`.
3. **Create the repo.** In GitHub Desktop: File, Add Local Repository, choose that folder, accept "create a
   repository". Name it `ledger`. The project already contains a README, license and `.gitignore`, so leave
   those unchecked.
4. **Commit** everything with the message "Initial commit" (`node_modules` and `dist` are ignored).
5. **Publish repository**: keep the name `ledger`, **untick "Keep this code private"**, then Publish.
6. **Turn on Pages.** On github.com, open the repo, Settings, Pages. Under Build and deployment, set Source to
   **GitHub Actions**.
7. **Run the deploy.** Open the Actions tab. "Deploy to GitHub Pages" runs on every push to `main`. If it ran
   before step 6, open the run and choose Re-run all jobs. After about two minutes it turns green and the deploy
   job shows the site URL.
8. **Open** https://dmik26.github.io/ledger/ on your computer, then on your phone.
9. **Install.** iPhone: Safari, Share, Add to Home Screen. Android: Chrome menu, Install app (Samsung Internet:
   menu, Add page to, Home screen).
10. **Bring your data.** Open the installed app, go to Settings, Import, and pick the file from step 1 of
    "Before you start". On iPhone do this inside the installed app, because it keeps its own storage, separate
    from Safari.

## Every update after that

Change files, open GitHub Desktop, write a short summary, Commit to main, then Push origin. The deploy runs
by itself. Installed apps show an "Update ready" toast; tap Reload.

## If something goes wrong

- Page not found: Pages Source is not set to GitHub Actions, or the first deploy has not finished.
- Blank page: the Vite `base` in `vite.config.ts` must be `/ledger/` and match the repo name.
- Red cross in Actions: open the failed step, copy the log into Claude and ask for the fix.
- Old version still showing: close and reopen the app, or tap Reload on the update toast.
- You must keep the repository public for Pages to work on a Free plan. Making it private takes the site down.
