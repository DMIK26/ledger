import { expect, test, type Page } from '@playwright/test';

const TODAY = new Date('2026-10-19T10:00:00'); // Monday 19 Oct 2026, day 19 of 31

const quick = async (page: Page, text: string) => {
  const input = page.getByLabel('Quick add');
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
};

test('budget types, pace, budgets at risk and safe to spend', async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  await page.goto('./#/');
  await quick(page, 'rent 15000 1/10');
  await quick(page, 'swiggy 2500 5th oct upi');
  await quick(page, 'chai 20 upi');

  await page.goto('./#/budgets');
  const overall = page.getByRole('textbox', { name: 'Monthly budget' });
  await overall.fill('25000');
  await overall.press('Enter');
  await page.getByLabel('Budget for Food & Dining').fill('3000');
  await page.getByLabel('Budget for Food & Dining').press('Enter');
  await expect(page.getByTestId('pace-text')).toContainText('₹17,520.00 spent by day 19');
  await expect(page.getByTestId('pace-text')).toContainText('above the straight line');
  // Rent is fixed, so it is not stretched over the month; food is heading over its budget.
  await expect(
    page.getByTestId('budget-group-fixed').getByTestId('budget-row-housing'),
  ).toBeVisible();
  await expect(page.getByTestId('risk-food')).toContainText('Heading for ₹4,111.58 of ₹3,000.00');
  await page.getByLabel('Type of Food & Dining').selectOption('fixed');
  await expect(page.getByTestId('budget-group-fixed').getByTestId('budget-row-food')).toBeVisible();
  await expect(page.getByTestId('risk-food')).toHaveCount(0);

  await page.goto('./#/');
  // (25,000 - 15,000 - 2,500) / 13 days = 576.92, rounded down; 20 already spent today.
  await expect(page.getByTestId('safe-today')).toHaveText('₹556.00');
  await quick(page, 'lunch 700 upi');
  await expect(page.getByTestId('safe-today')).toContainText('Over by ₹144.00');
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00'));
  await page.reload();
  // Overspending yesterday shrinks the days left: (25,000 - 18,220) / 12.
  await expect(page.getByTestId('safe-today')).toHaveText('₹565.00');
});

test('goals, the wishlist and net worth', async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  await page.goto('./#/budgets?view=goals');
  await page.getByRole('button', { name: 'Add goal' }).click();
  await page.getByLabel('Name').fill('Diwali');
  await page.getByLabel('Kind').selectOption('fund');
  await page.getByLabel('Amount needed').fill('6000');
  await page.getByLabel('Needed by').fill('2026-12-25');
  await page.getByLabel('Comes every year').check();
  await page.getByRole('button', { name: 'Add goal' }).last().click();
  const goal = page.getByTestId('goal');
  // October, November and December share it.
  await expect(goal.getByTestId('goal-need')).toHaveText('Put aside ₹2,000.00 this month.');
  await goal.getByRole('button', { name: 'Put aside' }).click();
  await goal.getByLabel('Amount put aside').fill('2000');
  await goal.getByRole('button', { name: 'Save' }).click();
  await expect(goal.getByTestId('goal-saved')).toContainText('₹2,000.00 of ₹6,000.00');
  await expect(goal.getByTestId('goal-state')).toHaveText('On track');

  await page.getByRole('button', { name: 'Wishlist' }).click();
  await page.getByRole('button', { name: 'Add to wishlist' }).click();
  await page.getByLabel('What').fill('Headphones');
  await page.getByLabel('Price').fill('3000');
  await page.getByRole('button', { name: 'Add to wishlist' }).last().click();
  await expect(page.getByTestId('wish-row')).toContainText(
    '7 more days to wait, until 26 Oct 2026',
  );
  await page.clock.setFixedTime(new Date('2026-10-27T10:00:00'));
  await page.reload();
  await page.getByTestId('wish-row').getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByTestId('saved-by-waiting')).toContainText('₹3,000.00 from 1 thing');

  await page.goto('./#/money');
  await page.getByRole('button', { name: 'Add account' }).click();
  await page.getByLabel('Name').fill('HDFC');
  await page.getByLabel('Balance on that date').fill('20000');
  await page.getByRole('button', { name: 'Add account' }).last().click();
  await page.getByRole('button', { name: 'Add asset' }).click();
  await page.getByLabel('Name').fill('Gold coins');
  await page.getByLabel('Kind').selectOption('gold');
  await page.getByLabel('Worth now').fill('80000');
  await page.getByRole('button', { name: 'Add asset' }).last().click();
  await expect(page.getByTestId('networth-total')).toHaveText('₹1,00,000.00');
  await expect(page.getByTestId('nw-assets')).toHaveText('₹80,000.00');
});

test('close the month in its first week', async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  await page.goto('./#/');
  await quick(page, 'rent 15000 1/10');
  await quick(page, 'swiggy 500 upi');
  await page.clock.setFixedTime(new Date('2026-11-03T10:00:00'));
  await page.reload();
  const card = page.getByTestId('month-close');
  await expect(card.getByRole('heading', { name: 'Close October 2026' })).toBeVisible();
  await expect(card.getByTestId('close-spent')).toHaveText('₹15,500.00');
  await card.getByLabel('A note for October (optional)').fill('Rent went up');
  await card.getByRole('button', { name: 'Close October' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('month-close')).toHaveCount(0);
});
