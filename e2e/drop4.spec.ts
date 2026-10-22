import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const TODAY = new Date(2026, 9, 19, 12, 0, 0); // Mon 19 Oct 2026

async function quickAdd(page: Page, text: string) {
  const input = page.getByLabel('Quick add');
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  await page.goto('./#/transactions');
  for (const t of [
    'rent 8000 1/10',
    'shawarma 500 on 18th oct upi',
    'netflix 649 5th oct card',
    'netflix 649 5th sep card',
    'netflix 649 5th aug card',
    'chai 100 31/3/2026',
    'chai 200 1/4/2026',
  ])
    await quickAdd(page, t);
});

test('reports split the financial year, and a CSV export re-imports with every row skipped', async ({
  page,
}) => {
  await page.goto('./#/reports');
  await page.getByRole('button', { name: 'Financial year' }).click();
  await expect(page.locator('.period-label')).toHaveText('FY 2026-27');
  await expect(page.getByTestId('report-total')).toHaveText('₹10,647.00');
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.locator('.period-label')).toHaveText('FY 2025-26');
  await expect(page.getByTestId('report-total')).toHaveText('₹100.00');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const file = await (await download).path();
  const text = await readFile(file, 'utf8');
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain('Date,Merchant,Amount (₹),Currency,Category,Method,Tags,Notes');
  expect(text).toContain('2026-10-01,Rent,8000.00,INR,Housing & Utilities,UPI,,');

  await page.goto('./#/settings');
  await page.locator('#csv-title').scrollIntoViewIfNeeded();
  await page.getByText('Choose a CSV file').locator('input').setInputFiles(file);
  await expect(page.getByTestId('csv-summary')).toHaveText(
    'Ready to add 0 entries. 6 already in Ledger are skipped.',
  );
  await expect(
    page.getByTestId('csv-import').getByRole('button', { name: 'Import' }),
  ).toBeDisabled();
});

test('a found subscription goes on the timeline and its pill drags by days', async ({ page }) => {
  await page.goto('./#/recurring');
  await page.getByTestId('candidate-netflix').getByRole('button', { name: 'Add' }).click();
  // Next due 5 Nov: inside the 30 days from 19 Oct.
  const pill = page.locator('[data-testid^="pill-"]').first();
  await expect(pill).toHaveAccessibleName(/5 Nov 2026/);
  const box = (await pill.boundingBox())!;
  const track = (await page.locator('.tl-track').first().boundingBox())!;
  const day = track.width / 30;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + day * 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(pill).toHaveAccessibleName(/7 Nov 2026/);
  await page.getByRole('switch', { name: 'What if I switched off Netflix' }).click();
  await expect(page.getByTestId('rec-saving')).toContainText('saves ₹7,788.00 a year');
});

test('categories reorder by dragging the handle', async ({ page }) => {
  await page.goto('./#/settings');
  const handle = page.getByRole('button', { name: /Move Other/ });
  await handle.scrollIntoViewIfNeeded();
  const first = (await page.getByTestId('cat-housing').boundingBox())!;
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, first.y + 4, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.cat-row').first()).toHaveAttribute('data-testid', 'cat-other');
  await page.reload();
  await expect(page.locator('.cat-row').first()).toHaveAttribute('data-testid', 'cat-other');
});

test('no page scrolls sideways', async ({ page }) => {
  for (const r of [
    '#/',
    '#/transactions',
    '#/budgets',
    '#/budgets?view=goals',
    '#/budgets?view=wishlist',
    '#/reports',
    '#/recurring',
    '#/settings',
    '#/money',
  ]) {
    await page.goto(`./${r}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.page-loading')).toHaveCount(0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, r).toBeLessThanOrEqual(0);
  }
});
