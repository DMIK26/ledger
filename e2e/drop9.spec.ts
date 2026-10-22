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

test('money in, accounts and a credit card: balances, cash flow and the card due on the Dashboard', async ({
  page,
}) => {
  const input = page.getByLabel('Quick add');
  await input.fill('salary 40k upi');
  await expect(page.getByTestId('chip-income')).toHaveText('Money in');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  // Money in is not spending.
  await expect(page.getByText('Nothing logged yet')).toBeVisible();
  await quick(page, 'chai 20 upi');

  await page.goto('./#/money');
  await expect(page.getByTestId('cashflow-in')).toHaveText('₹40,000.00');
  await expect(page.getByTestId('cashflow-out')).toHaveText('₹20.00');
  await expect(page.getByTestId('cashflow-left')).toHaveText('₹39,980.00');

  await page.getByRole('button', { name: 'Add account' }).click();
  await page.getByLabel('Name').fill('HDFC');
  await page.getByLabel('Balance on that date').fill('10000');
  await page.getByRole('button', { name: 'Add account' }).last().click();
  const hdfc = page.getByTestId('account-row').filter({ hasText: 'HDFC' });
  await expect(hdfc).toContainText('₹9,980.00'); // the chai paid by UPI comes out of it

  await page.getByRole('button', { name: 'Add account' }).click();
  await page.getByLabel('Type').selectOption('card');
  await page.getByLabel('Name').fill('SBI card');
  await page.getByLabel('Balance date').fill('2026-10-01');
  await page.getByLabel('Statement day').selectOption('5');
  await page.getByLabel('Payment due day').selectOption('25');
  await page.getByRole('button', { name: 'Add account' }).last().click();

  await page.goto('./#/');
  await quick(page, 'shoes 3000 card 3rd oct');
  const due = page.getByTestId('card-due');
  await expect(due).toContainText('SBI card');
  await expect(due).toContainText('Due 25 Oct 2026, in 6 days');
  await expect(due).toContainText('₹3,000.00');

  await page.goto('./#/money');
  await page.getByRole('button', { name: /^SBI card/ }).click();
  await page.getByRole('button', { name: 'Pay this card' }).click();
  await page.getByLabel('Pay from').selectOption({ label: 'HDFC' });
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Record payment' }).click();
  const card = page.getByTestId('account-row').filter({ hasText: 'SBI card' });
  await expect(card).toContainText('Owed ₹2,000.00');
  await expect(card.locator('.card-facts')).toContainText('Due 25 Oct 2026₹2,000.00, in 6 days');
  await expect(hdfc).toContainText('₹8,980.00');
});

test('udhaar settles up, and a loan shows what is left and what paying more saves', async ({
  page,
}) => {
  await page.goto('./#/money?view=udhaar');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await page.getByLabel('Person').fill('Rahul');
  await page.getByLabel('Amount').fill('500');
  await page.getByLabel('Note', { exact: true }).fill('Movie tickets');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('owed-to-you')).toHaveText('₹500.00');
  await page.getByRole('button', { name: /^Rahul/ }).click();
  await page.getByRole('button', { name: 'Settle up' }).click();
  await expect(page.getByLabel('What happened')).toHaveValue('got-back');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('owed-to-you')).toHaveText('₹0.00');
  await expect(page.getByTestId('person-row')).toContainText('Settled');

  await page.getByRole('button', { name: 'Loans' }).click();
  await page.getByRole('button', { name: 'Add loan' }).click();
  await page.getByLabel('Name').fill('Bike loan');
  await page.getByLabel('Amount borrowed').fill('100000');
  await page.getByLabel('Interest, % a year').fill('12');
  await page.getByLabel('Months').fill('12');
  await page.getByLabel('First EMI date').fill('2026-01-05');
  await expect(page.getByTestId('loan-emi')).toContainText('₹8,884.88');
  await page.getByRole('button', { name: 'Add loan' }).last().click();
  const loan = page.getByTestId('loan');
  await expect(loan).toContainText('10 of 12 EMIs paid');
  await expect(loan.getByTestId('loan-left')).toHaveText('₹17,506.69');
  await loan.getByLabel('Pay more each month').fill('500000');
  await expect(loan.getByTestId('loan-prepay')).toContainText('sooner');
});

test('foreign currency and a cash check', async ({ page }) => {
  await page.goto('./#/?action=add');
  const sheet = page.getByRole('dialog', { name: 'Add expense' });
  await sheet.getByLabel('Paid in another currency').check();
  await sheet.getByLabel('Amount in USD').fill('50');
  await sheet.getByLabel('Rate, rupees for 1 USD').fill('83.25');
  await expect(sheet.getByTestId('fx-result')).toHaveText('= ₹4,162.50 at ₹83.25');
  await sheet.getByLabel('What for').fill('Hotel');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await page.goto('./#/transactions');
  const row = page.getByTestId('tx-row').filter({ hasText: 'Hotel' });
  await expect(row).toContainText('₹4,162.50');
  await expect(row).toContainText('$50.00');

  await page.goto('./#/money');
  await page.getByRole('button', { name: 'Add account' }).click();
  await page.getByLabel('Type').selectOption('cash');
  await page.getByLabel('Name').fill('Wallet');
  await page.getByLabel('Balance on that date').fill('910');
  await page.getByRole('button', { name: 'Add account' }).last().click();
  await page.getByRole('button', { name: /^Wallet/ }).click();
  await page.getByRole('button', { name: 'Check cash' }).click();
  await page.getByLabel('Cash you have now').fill('840');
  await expect(page.getByTestId('cash-check-result')).toContainText('You have ₹70.00 less');
  await page.getByRole('button', { name: 'Record ₹70.00 as spending' }).click();
  await expect(page.getByTestId('account-row').filter({ hasText: 'Wallet' })).toContainText(
    '₹840.00',
  );
  await page.goto('./#/transactions');
  await expect(page.getByTestId('tx-row').filter({ hasText: 'Cash not logged' })).toContainText(
    '₹70.00',
  );
});
