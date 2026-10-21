import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const TODAY = new Date(2026, 9, 19, 12, 0, 0); // Mon 19 Oct 2026
const PAGES = [
  '#/',
  '#/transactions',
  '#/budgets',
  '#/reports',
  '#/recurring',
  '#/settings',
  '#/transactions?action=add',
  '#/transactions?view=trash',
  '#/settings?view=activity',
];

async function seed(page: Page) {
  await page.goto('./#/transactions');
  for (const t of [
    'rent 8000 1/10',
    'swiggy 350 15th oct upi',
    'uber 240 16th oct card',
    'netflix 649 5th oct card',
    'netflix 649 5th sep card',
    'swiggy 400 12th sep upi',
  ]) {
    const input = page.getByLabel('Quick add');
    await input.fill(t);
    await input.press('Enter');
    await expect(input).toHaveValue('');
  }
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  await seed(page);
});

test('no serious or critical accessibility problems on any page', async ({ page }) => {
  for (const hash of PAGES) {
    await page.goto(`./${hash}`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const bad = result.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map(
        (v) =>
          `${hash} ${v.id}: ${v.nodes
            .map((n) => n.target.join(' '))
            .slice(0, 4)
            .join(', ')}`,
      );
    expect(bad, bad.join('\n')).toEqual([]);
  }
});

for (const width of [360, 390, 430]) {
  test(`at ${width}px: no sideways scroll, 44px controls, 16px inputs`, async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'Phone widths');
    await page.setViewportSize({ width, height: 800 });
    const all: string[] = [];
    for (const hash of PAGES) {
      await page.goto(`./${hash}`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      const report = await page.evaluate(() => {
        const problems: string[] = [];
        if (document.documentElement.scrollWidth > window.innerWidth + 1)
          problems.push(`page is ${document.documentElement.scrollWidth}px wide`);
        const name = (el: Element) =>
          (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40);
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return (
            r.width > 0 &&
            r.height > 0 &&
            s.visibility !== 'hidden' &&
            !el.closest('[aria-hidden="true"]')
          );
        };
        // Controls (not chart marks inside SVG, which have keyboard and list equivalents).
        const controls = document.querySelectorAll(
          'button, [role="button"], [role="switch"], select, input:not([type="hidden"]), textarea, .tab, .nav-link',
        );
        for (const el of controls) {
          if (!visible(el) || el.closest('svg') || el.classList.contains('visually-hidden'))
            continue;
          if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
            const hit = el.closest('label') ?? el;
            const r = hit.getBoundingClientRect();
            if (r.height < 44)
              problems.push(`small target: checkbox ${name(hit)} ${Math.round(r.height)}px`);
            continue;
          }
          const r = el.getBoundingClientRect();
          if (r.height < 43.5 || r.width < 43.5)
            problems.push(
              `small target: ${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`,
            );
          if (el.matches('input, select, textarea')) {
            const size = parseFloat(getComputedStyle(el).fontSize);
            if (size < 16) problems.push(`small text in field ${name(el)}: ${size}px`);
          }
        }
        return problems;
      });
      all.push(...report.map((r) => `${hash} ${r}`));
    }
    expect(all, `at ${width}px:\n${[...new Set(all)].join('\n')}`).toEqual([]);
  });
}

test('works offline after the first visit', async ({ page, context }, info) => {
  test.skip(info.project.name === 'phone', 'Same service worker on both');
  await page.goto('./#/');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state;
  });
  // The first load is controlled after a reload.
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.getByTestId('month-total')).toHaveText('₹9,239.00');
  await context.setOffline(false);
});

test('Android back closes the More sheet first and stays on the page', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'The More sheet is on phones');
  await page.goto('./#/reports');
  await page.getByRole('button', { name: 'More' }).click();
  const sheet = page.getByRole('dialog', { name: 'More' });
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reports');

  // Choosing a page from the sheet, then back, returns to where the sheet was opened.
  await page.getByRole('button', { name: 'More' }).click();
  await sheet.getByRole('button', { name: 'Budgets' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Budgets');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reports');
});

test('on an iPhone the Dashboard explains installing and moving data from Safari', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(TODAY);
  await page.goto('./#/');
  const banner = page.getByTestId('install-banner');
  await expect(banner).toContainText('tap Share, then Add to Home Screen');
  await expect(banner).toContainText('install first, then add entries');
  await expect(banner.getByRole('button', { name: 'Install Ledger' })).toHaveCount(0);
  const input = page.getByLabel('Quick add');
  await input.fill('chai 20 cash');
  await input.press('Enter');
  await expect(banner).toContainText('This browser already holds 1 entry');
  await banner.getByRole('button', { name: 'Not now' }).click();
  await page.reload();
  await expect(page.getByTestId('install-banner')).toHaveCount(0);
  await context.close();
});

test('dark theme keeps contrast on every page', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Colours are the same on both');
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const hash of PAGES) {
    await page.goto(`./${hash}`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    const bad = result.violations.map(
      (v) =>
        `${hash} ${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 4)
          .join(', ')}`,
    );
    expect(bad, bad.join('\n')).toEqual([]);
  }
});
