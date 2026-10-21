import { expect, test, type Page } from '@playwright/test';

const TODAY = new Date(2026, 9, 19, 12, 0, 0); // Mon 19 Oct 2026

// A 40x30 clay PNG, enough for the receipt pipeline (decode, resize, JPEG).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAAK0lEQVR4nO3NMQ0AAAgDsLlEClpxgww4mvRvputExGKxWCwWi8VisVj8N158P786wYvBDwAAAABJRU5ErkJggg==',
  'base64',
);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function quickAdd(page: Page, text: string) {
  const input = page.getByLabel('Quick add');
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
});

test('add through the sheet with a receipt, edit inline, delete, undo', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/transactions');

  // Add through the sheet.
  if (await page.locator('.topbar-add').isVisible()) await page.locator('.topbar-add').click();
  else await page.getByRole('button', { name: 'Add expense' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add expense' });
  await sheet.getByLabel('Describe it').fill('uber 240 yesterday card');
  await expect(sheet.getByLabel('What for')).toHaveValue('Uber');
  await sheet.getByLabel('Tags').fill('work');
  await sheet
    .locator('input[type=file]')
    .setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: PNG });
  await expect(sheet.getByRole('img', { name: 'Receipt' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  const row = page.getByTestId('tx-row').filter({ hasText: 'Uber' });
  await expect(row).toContainText('18 Oct 2026');
  await expect(row).toContainText('₹240.00');
  await expect(row).toContainText('work');

  // The receipt opens.
  await row.getByRole('button', { name: /^Receipt for Uber/ }).click();
  await expect(page.getByRole('dialog', { name: /Receipt: Uber/ }).getByRole('img')).toBeVisible();
  await page
    .getByRole('dialog', { name: /Receipt: Uber/ })
    .getByRole('button', { name: 'Close' })
    .click();

  // Edit inline.
  await row.getByRole('button', { name: /^Edit Uber/ }).click();
  const form = page.getByTestId('tx-edit');
  await form.getByLabel('Amount').fill('260');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('tx-row').filter({ hasText: 'Uber' })).toContainText('₹260.00');

  // Delete, then undo from the toast.
  await page.getByRole('button', { name: /^Delete Uber/ }).click();
  await expect(page.getByTestId('tx-row')).toHaveCount(0);
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('tx-row').filter({ hasText: 'Uber' })).toContainText('₹260.00');

  // Survives a reload.
  await page.reload();
  await expect(page.getByTestId('tx-row').filter({ hasText: 'Uber' })).toContainText('₹260.00');
  expect(errors).toEqual([]);
});

test('filters, faceted counts, no matches and clear', async ({ page }) => {
  await page.goto('./#/transactions');
  await quickAdd(page, 'shawarma 500 on 18th oct upi');
  await quickAdd(page, 'uber 240 yesterday card');
  await quickAdd(page, 'rent 8000 1/10');
  await expect(page.getByTestId('tx-row')).toHaveCount(3);

  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByRole('button', { name: /^Transport & Travel/ }).click();
  await expect(page.getByTestId('tx-row')).toHaveCount(1);
  await expect(page.getByTestId('tx-footer')).toContainText('1 transaction');
  await expect(page.getByTestId('tx-footer')).toContainText('₹240.00');

  await page.getByLabel('Amount at least').fill('1000');
  await expect(page.getByRole('heading', { name: 'No matches' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await expect(page.getByTestId('tx-row')).toHaveCount(3);
  await expect(page.getByTestId('tx-footer')).toContainText('3 transactions');
});

test('privacy hides every amount on every page', async ({ page }) => {
  await page.goto('./#/transactions');
  await quickAdd(page, 'shawarma 1234.56 on 18th oct upi');
  await quickAdd(page, 'gone 7654.32 upi');
  await page.getByRole('button', { name: /^Delete gone/i }).click();
  await page.getByRole('button', { name: 'Privacy mode' }).click();

  const routes = [
    '#/',
    '#/transactions',
    '#/transactions?view=trash',
    '#/budgets',
    '#/reports',
    '#/recurring',
    '#/settings',
    '#/transactions?action=add',
  ];
  for (const r of routes) {
    await page.goto(`./${r}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (r === '#/transactions') await page.getByRole('button', { name: /^Edit Shawarma/ }).click();
    const all = await page.evaluate(() => {
      const attrs = [...document.querySelectorAll('*')]
        .flatMap((el) => [...el.attributes].map((a) => a.value))
        .join(' ');
      return `${document.body.innerText} ${attrs} ${document.title}`;
    });
    for (const real of ['1,234.56', '1234.56', '7,654.32']) expect(all, r).not.toContain(real);
  }
});

test('screen lock asks for the PIN on the next open', async ({ page }) => {
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Set a PIN' }).click();
  await page.getByLabel('New PIN').fill('2468');
  await page.getByLabel('Repeat the PIN').fill('2468');
  await page.getByRole('button', { name: 'Turn on lock' }).click();
  await expect(page.getByRole('button', { name: 'Lock now' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ledger is locked' })).toBeVisible();
  await page.getByLabel('Enter your PIN').fill('2468');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
});
