import { expect, test, type Page } from '@playwright/test';

const TODAY = new Date('2026-10-19T10:00:00'); // Monday 19 Oct 2026

const quick = async (page: Page, text: string) => {
  const input = page.getByLabel('Quick add');
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  await page.goto('./#/');
});

test('check-in: a missed day can be marked no spend or filled in, and the habit line counts both', async ({
  page,
}) => {
  await quick(page, 'chai 20 cash 15th oct');
  const card = page.getByTestId('checkin');
  await expect(card.getByRole('heading')).toHaveText('Nothing logged on 3 days this week');
  await card.getByRole('button', { name: 'No spend on Fri 16 Oct' }).click();
  await card.getByRole('button', { name: 'Add an entry for Sat 17 Oct' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add expense' });
  await expect(sheet.getByLabel('Date')).toHaveValue('2026-10-17');
  await sheet.getByLabel('Amount').fill('120');
  await sheet.getByLabel('What for').fill('Auto');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByRole('heading')).toHaveText('Nothing logged on Sun 18 Oct');
  await card.getByRole('button', { name: 'No spend on Sun 18 Oct' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('habit-line')).toHaveText(
    'Logged 4 of the last 4 days. 4 days in a row.',
  );
});

test('keypad: a sum and one tap on a category, then the repeat chip and maths in quick add', async ({
  page,
}) => {
  await page.goto('./#/?action=add');
  const sheet = page.getByRole('dialog', { name: 'Add expense' });
  await sheet.getByRole('button', { name: 'Keypad' }).click();
  const pad = sheet.getByRole('group', { name: /Amount keypad/ });
  for (const k of ['1', '2', '0']) await pad.getByRole('button', { name: k, exact: true }).click();
  await pad.getByRole('button', { name: 'Times' }).click();
  await pad.getByRole('button', { name: '3', exact: true }).click();
  await expect(sheet.getByTestId('keypad-amount')).toHaveText('₹360.00');
  await sheet.getByRole('button', { name: /to Groceries$/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('month-total')).toHaveText('₹360.00');

  await quick(page, 'auto 40+30 cash');
  await expect(page.getByTestId('month-total')).toHaveText('₹430.00');
});

test('several lines save as one undoable step', async ({ page }) => {
  await page.goto('./#/?action=add');
  const sheet = page.getByRole('dialog', { name: 'Add expense' });
  await sheet.getByRole('button', { name: 'Several' }).click();
  await sheet
    .getByLabel('One entry per line')
    .fill('chai 20 cash\nपेट्रोल ५०० कल\nలంచ్ 180 upi\nmystery');
  await expect(sheet.getByRole('button', { name: 'Save 3 entries' })).toBeEnabled();
  await sheet.getByRole('button', { name: 'Save 3 entries' }).click();
  await expect(page.getByTestId('month-total')).toHaveText('₹700.00');
  await page.keyboard.press('Control+z');
  await expect(page.getByText('Nothing logged yet')).toBeVisible();
});

test('a month that starts on the 25th moves the Dashboard to the 25th-to-24th cycle', async ({
  page,
}) => {
  await quick(page, 'rent 9000 18th oct');
  await quick(page, 'chai 20 cash');
  await expect(page.getByTestId('month-total')).toHaveText('₹9,020.00');
  await page.goto('./#/settings');
  await page.getByLabel('Months start on the').selectOption('25');
  await expect(page.getByTestId('month-start-help')).toContainText(
    'October 2026 runs 25 Sep to 24 Oct',
  );
  await page.goto('./#/');
  await expect(page.getByTestId('month-switcher')).toContainText('25 Sep to 24 Oct');
  await expect(page.getByTestId('month-total')).toHaveText('₹9,020.00');
  await page.goto('./#/settings');
  await page.getByLabel('Months start on the').selectOption('19');
  await page.goto('./#/');
  // Today (19 Oct) starts November's cycle; the rent on the 18th was October's.
  await expect(page.getByTestId('month-switcher')).toContainText('November 2026');
  await expect(page.getByTestId('month-switcher')).toContainText('19 Oct to 18 Nov');
  await expect(page.getByTestId('month-total')).toHaveText('₹20.00');
});
