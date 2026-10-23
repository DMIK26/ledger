import { expect, test, type Page } from '@playwright/test';

const TODAY = new Date('2026-10-22T10:00:00'); // Thursday 22 Oct 2026

const quick = async (page: Page, text: string) => {
  const input = page.getByLabel('Quick add');
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
});

test('search in plain words, from the list and from the palette, and open a merchant', async ({
  page,
}) => {
  await page.goto('./#/transactions');
  await quick(page, 'zomato 600 12th sep upi');
  await quick(page, 'swiggy 400 13th sep upi');
  await quick(page, 'dmart 900 14th sep upi');
  await quick(page, 'swiggy 700 1st oct upi');

  await page.getByLabel('Search entries').fill('food last month over 500 upi');
  await expect(page.getByTestId('tx-row')).toHaveCount(1);
  await expect(page.getByTestId('tx-row')).toContainText('Zomato');
  await expect(page.getByTestId('search-chips')).toContainText('Over ₹500.00');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByTestId('tx-row')).toHaveCount(4);

  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: 'Search pages, actions and merchants' });
  await box.fill('swig');
  await page.getByRole('option', { name: /Swiggy, 2 entries/ }).click();
  await expect(page).toHaveURL(/#\/merchant\?key=swiggy/);
  await expect(page.getByTestId('merchant-total')).toHaveText('₹1,100.00');
  await expect(
    page.getByRole('list', { name: 'Entries from Swiggy' }).getByTestId('tx-row'),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Pin to every page' }).click();
  await expect(page.getByRole('button', { name: 'Pinned to every page' })).toBeVisible();

  await page.keyboard.press('Control+k');
  await box.fill('swiggy over 500');
  await page.getByRole('option', { name: /Search entries for “swiggy over 500”/ }).click();
  await expect(page).toHaveURL(/q=swiggy%20over%20500/);
  await expect(page.getByTestId('tx-row')).toHaveCount(1);
});

test('a rule tested on past entries changes them and files new ones', async ({ page }) => {
  await page.goto('./#/transactions');
  await quick(page, 'amazon 1200 15th oct card');
  await quick(page, 'amazon pay 300 16th oct upi');
  await page.goto('./#/settings?view=rules');
  await page.getByRole('button', { name: 'Add a rule' }).click();
  await page.getByLabel('These words').fill('amazon');
  await page.getByLabel('Category').selectOption('business');
  await page.getByLabel('Add a tag').fill('office');
  await expect(page.getByTestId('rule-test')).toContainText(
    'Matches 2 past entries; 2 would change.',
  );
  await page.getByRole('button', { name: 'Save rule' }).click();
  await expect(page.getByTestId('custom-rule')).toContainText(
    'Merchant contains “amazon”: Business, tag office',
  );

  await page.goto('./#/transactions');
  await quick(page, 'amazon 99');
  const rows = page.getByTestId('tx-row');
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) {
    await expect(row).toContainText('Business');
    await expect(row).toContainText('office');
  }
});

test('a trip collects what is logged in its dates; bulk adds the rest', async ({ page }) => {
  await page.goto('./#/budgets?view=trips');
  await page.getByRole('button', { name: 'Add one' }).click();
  await page.getByLabel('Name').fill('Goa');
  await page.getByLabel('First day (optional)').fill('2026-10-15');
  await page.getByLabel('Last day (optional)').fill('2026-10-25');
  await page.getByLabel('Budget (optional)').fill('20000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('project-card')).toBeVisible();

  await page.goto('./#/transactions');
  await quick(page, 'shacks 1500 17th oct upi');
  await quick(page, 'hotel 5000 16th oct card');
  await quick(page, 'taxi to airport 800 14th oct cash');
  await page.getByRole('checkbox', { name: /Select Taxi/i }).check();
  await page.getByLabel('Add selected to a trip or project').selectOption({ label: 'Goa' });

  await page.goto('./#/budgets?view=trips');
  const card = page.getByTestId('project-card');
  await expect(card.getByTestId('project-spent')).toHaveText('₹7,300.00');
  await expect(card).toContainText('₹12,700.00 left of ₹20,000.00');
  await card.getByRole('button', { name: 'Show entries' }).click();
  await expect(card.getByTestId('tx-row')).toHaveCount(3);
});

test('nudges, subcategories and the tax summary', async ({ page }) => {
  await page.goto('./#/');
  await quick(page, 'zomato 420 19th oct upi');
  // Quick add spots the repeat too; a second Enter saves it anyway.
  const input = page.getByLabel('Quick add');
  await input.fill('zomato 420 20th oct upi');
  await input.press('Enter');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  const nudges = page.getByTestId('nudges');
  await expect(nudges.getByTestId('nudge-duplicate')).toContainText('One may be a repeat');
  await nudges.getByRole('button', { name: 'Delete the later one' }).click();
  await expect(page.getByTestId('nudges')).toHaveCount(0);

  await page.goto('./#/settings');
  const food = page.getByTestId('cat-food');
  await food.getByRole('button', { name: 'Subcategories' }).click();
  await food.getByLabel('New subcategory of Food & Dining').fill('Coffee');
  await food.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(food.getByRole('button', { name: /Subcategories \(1\): Coffee/ })).toBeVisible();
  await page.goto('./#/transactions');
  await quick(page, 'coffee 180 21st oct upi');
  await expect(page.getByTestId('tx-row').filter({ hasText: 'Coffee' }).first()).toContainText(
    'Food & Dining · Coffee',
  );

  await page.goto('./#/?action=add');
  const add = page.getByRole('dialog', { name: 'Add expense' });
  await add.getByLabel('Amount').fill('25000');
  await add.getByLabel('What for').fill('Star Health');
  await add.getByText('Who it was for, tax and warranty').click();
  await add.getByLabel('Tax deduction').selectOption('80D');
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(add).toBeHidden();

  await page.goto('./#/reports');
  await page.getByRole('button', { name: 'Subcategories' }).click();
  await expect(page.getByTestId('report-sub-row').first()).toContainText('Coffee');
  const tax = page.getByTestId('tax-summary');
  await expect(tax.getByTestId('tax-80D')).toContainText('₹25,000.00');
  const download = page.waitForEvent('download');
  await tax.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toBe('ledger-tax-2026-04-01-to-2027-03-31.csv');
});
