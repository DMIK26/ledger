import { expect, test, type Page } from '@playwright/test';

const TODAY = new Date(2026, 9, 19, 12, 0, 0); // Mon 19 Oct 2026

async function quickAdd(page: Page, text: string) {
  const input = page.getByLabel('Quick add');
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}

async function seed(page: Page) {
  await page.goto('./#/transactions');
  for (const t of [
    'rent 8000 1/10',
    'shawarma 500 on 18th oct upi',
    'uber 240 yesterday card',
    'auto 120 on 10th oct cash',
    'rent 6000 1/9',
    'rent 6000 1/8',
    'rent 6000 1/7',
  ])
    await quickAdd(page, t);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
});

test('donut slice drills in and opens Transactions with the same category total', async ({
  page,
}) => {
  await seed(page);
  await page.goto('./#/');
  const slice = page.getByTestId('slice-transport');
  await expect(slice).toHaveAttribute('aria-label', 'Transport & Travel, ₹360.00. Show breakdown');
  await slice.click();
  await page.getByTestId('breakdown').getByRole('link', { name: 'Open in Transactions' }).click();
  await expect(page).toHaveURL(/#\/transactions\?category=transport/);
  await expect(page.getByTestId('tx-row')).toHaveCount(2);
  await expect(page.getByTestId('tx-footer')).toContainText('₹360.00');
});

test('budget line drags in ₹500 steps and the change can be undone', async ({ page }) => {
  await seed(page);
  await page.goto('./#/budgets');
  const field = page.locator('#budget-overall');
  await field.fill('10000');
  await field.press('Enter');
  await expect(page.getByTestId('overall-status')).toContainText('₹1,140.00 left');

  await page.goto('./#/');
  const line = page.getByTestId('budget-line');
  await expect(line).toHaveAttribute('aria-valuetext', '₹10,000.00');
  await line.scrollIntoViewIfNeeded();
  const box = (await line.locator('circle').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 37, { steps: 6 });
  await page.mouse.up();
  const rupees = async () =>
    Number(((await line.getAttribute('aria-valuetext')) ?? '').replace(/[^0-9.]/g, ''));
  await expect.poll(rupees).toBeGreaterThan(10_000);
  expect((await rupees()) % 500).toBe(0);
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect(line).toHaveAttribute('aria-valuetext', '₹10,000.00');
  // Saved, not just drawn: it is still there after a reload.
  await page.reload();
  await expect(page.getByTestId('budget-line')).toHaveAttribute('aria-valuetext', '₹10,000.00');
});

test('allocation divider drags budget between neighbours with the total fixed', async ({
  page,
}) => {
  await seed(page);
  await page.goto('./#/budgets');
  for (const [name, value] of [
    ['Budget for Housing & Utilities', '8000'],
    ['Budget for Food & Dining', '2000'],
  ] as const) {
    const f = page.getByLabel(name);
    await f.fill(value);
    await f.press('Enter');
  }
  const divider = page.getByTestId('divider-0');
  await divider.scrollIntoViewIfNeeded();
  await expect(divider).toHaveAttribute(
    'aria-valuetext',
    /Housing & Utilities ₹8,000.00, Food & Dining ₹2,000.00/,
  );
  const bar = (await page.locator('.alloc-bar').first().boundingBox())!;
  const d = (await divider.boundingBox())!;
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(d.x + d.width / 2 + bar.width * 0.1, d.y + d.height / 2, { steps: 6 });
  await page.mouse.up();
  // 10% of ₹10,000 moves to housing: ₹9,000 and ₹1,000.
  await expect(divider).toHaveAttribute(
    'aria-valuetext',
    /Housing & Utilities ₹9,000.00, Food & Dining ₹1,000.00/,
  );
});

test('suggested budgets show as ghosts until accepted', async ({ page }) => {
  await seed(page);
  await page.goto('./#/budgets');
  await page.getByRole('button', { name: 'Suggest budgets' }).click();
  await expect(page.getByTestId('budget-row-housing')).toContainText('Suggested ₹6,000.00');
  await page.getByTestId('proposal').getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByLabel('Budget for Housing & Utilities')).toHaveValue('6000');
  await expect(page.getByTestId('budget-row-housing')).toContainText('Over by ₹2,000.00');
});

test('the bar chart switches between total and by category', async ({ page }) => {
  await seed(page);
  await page.goto('./#/');
  const seg = page.locator('[data-testid="bar-2026-10"] .bar-seg').first();
  await expect(seg).toHaveCSS('fill', /.+/);
  const before = await seg.evaluate((el) => getComputedStyle(el).fill);
  await page.getByRole('button', { name: 'By category' }).click();
  await expect.poll(() => seg.evaluate((el) => getComputedStyle(el).fill)).not.toBe(before);
  await page.getByTestId('bar-2026-10').hover();
  await expect(page.locator('.bars-tip')).toContainText('October 2026');
});
