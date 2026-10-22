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
    'shawarma 500 on 12th oct upi',
    'swiggy 350 15th oct upi',
    'uber 240 16th oct card',
    'swiggy 400 12th sep upi',
  ])
    await quickAdd(page, t);
});

test('pin totals agree on every page', async ({ page }) => {
  await page.goto('./#/');
  await page.getByTestId('slice-food').click();
  await page
    .getByTestId('breakdown')
    .getByRole('button', { name: 'Pin Food & Dining to every page' })
    .click();
  await expect(page.getByTestId('pin-bar')).toContainText('Food & Dining');
  await expect(page.getByTestId('month-total')).toHaveText('₹850.00');

  await page.goto('./#/reports');
  await expect(page.getByTestId('report-total')).toHaveText('₹850.00');
  await page.goto('./#/budgets');
  await expect(page.getByTestId('budget-row-food')).toContainText('₹850.00 spent');
  await page.goto('./#/transactions?from=2026-10-01&to=2026-10-31');
  await expect(page.getByTestId('tx-footer')).toContainText('₹850.00');
  await expect(page.getByTestId('pin-bar')).toContainText('3 entries, ₹1,250.00'); // every month

  // Esc removes the pin; the totals go back to everything.
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pin-bar')).toHaveCount(0);
  await expect(page.getByTestId('tx-footer')).toContainText('₹9,090.00');
});

test('marquee selection total equals the sum of the selected rows', async ({ page }, info) => {
  test.skip(
    info.project.name === 'phone',
    'Marquee is a mouse gesture; phones use the checkboxes.',
  );
  // Tall enough that the drag stays on screen (the browser scrolls when a drag leaves it).
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/transactions');
  const rows = page.getByTestId('tx-row');
  await expect(rows).toHaveCount(5);
  const first = (await rows.nth(0).boundingBox())!;
  const third = (await rows.nth(2).boundingBox())!;
  // Start in the empty space to the right of the amount column, drag down across three rows.
  const x = first.x + first.width - 6;
  await page.mouse.move(x, first.y + 4);
  await page.mouse.down();
  await page.mouse.move(x - 40, third.y + third.height - 4, { steps: 8 });
  await page.mouse.up();
  const amounts = await Promise.all(
    [0, 1, 2].map(async (i) =>
      Number(
        ((await rows.nth(i).locator('.tx-amount').textContent()) ?? '').replace(/[^0-9.]/g, ''),
      ),
    ),
  );
  const sum = amounts.reduce((a, b) => a + b, 0);
  const total = page.getByTestId('bulk-total');
  await expect(total).toContainText('3 selected');
  const shown = Number(
    ((await total.textContent()) ?? '')
      .split(',')
      .slice(1)
      .join('')
      .replace(/[^0-9.]/g, ''),
  );
  expect(shown).toBeCloseTo(sum, 2);
});

test('undo history goes back exactly, and redo replays it', async ({ page }) => {
  await page.goto('./#/');
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Added uber' }).click();
  await expect(page.getByTestId('month-total')).toHaveText('₹8,850.00');
  for (let i = 0; i < 2; i += 1) await page.getByRole('button', { name: /^Redo/ }).click();
  await expect(page.getByTestId('month-total')).toHaveText('₹9,090.00');
});

test('month switcher, bar click and keyboard moves around the months', async ({ page }) => {
  await page.goto('./#/');
  await page.getByTestId('month-switcher').click();
  await page
    .locator('.month-pop')
    .getByRole('button', { name: /^September 2026/ })
    .click();
  await expect(page.getByTestId('month-switcher')).toHaveText('September 2026');
  await expect(page.getByTestId('month-total')).toHaveText('₹400.00');
  // The six months end at the month on screen; clicking a bar opens that month.
  await page.getByTestId('bar-2026-08').click();
  await expect(page.getByTestId('month-switcher')).toHaveText('August 2026');
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByTestId('month-switcher')).toHaveText('October 2026');
  // Arrow keys move between slices of the donut.
  await page.getByTestId('slice-housing').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('slice-food')).toBeFocused();
});

test('hovering a category highlights it everywhere and shows a card', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Hover; phones use touch and hold.');
  await page.goto('./#/');
  await page.getByTestId('slice-food').hover();
  await expect(page.locator('html')).toHaveAttribute('data-highlight', 'category:food');
  await expect(page.getByTestId('hover-card')).toContainText('Food & Dining');
  const rent = page.getByTestId('tx-row').filter({ hasText: 'Rent' });
  await expect(rent).toHaveCSS('opacity', '0.35');
  const food = page.getByTestId('tx-row').filter({ hasText: 'Shawarma' });
  await expect(food).toHaveCSS('opacity', '1');
});

test('brushing days in the heatmap reports on just those days', async ({ page }, info) => {
  test.skip(
    info.project.name === 'phone',
    'Brushing is a mouse gesture; phones use the date fields.',
  );
  await page.goto('./#/reports');
  await page.getByRole('button', { name: /^16 Oct 2026/ }).scrollIntoViewIfNeeded();
  const a = (await page.getByRole('button', { name: /^12 Oct 2026/ }).boundingBox())!;
  const b = (await page.getByRole('button', { name: /^16 Oct 2026/ }).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('2026-10-12');
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('2026-10-16');
  await expect(page.getByTestId('report-total')).toHaveText('₹1,090.00');
});
