import { expect, test } from '@playwright/test';

test('a new user can load sample data, explore it and remove it without losing their own entry', async ({
  page,
}) => {
  await page.goto('./#/');
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await expect(page.getByTestId('sample-banner')).toBeVisible();
  await expect(page.getByTestId('month-total')).not.toHaveText('₹0.00');
  await expect(page.getByTestId('budget-left')).toBeVisible();

  // Add a real entry alongside the sample.
  await page.goto('./#/transactions');
  const input = page.getByLabel('Quick add');
  await input.fill('my lunch 777 cash');
  await input.press('Enter');
  await expect(input).toHaveValue('');

  await page.goto('./#/recurring');
  await expect(page.getByText('Netflix').first()).toBeVisible();

  await page.goto('./#/');
  await page
    .getByTestId('sample-banner')
    .getByRole('button', { name: 'Remove sample data' })
    .click();
  await expect(page.getByTestId('sample-banner')).toHaveCount(0);
  await page.goto('./#/transactions');
  await expect(page.getByTestId('tx-row')).toHaveCount(1);
  await expect(page.getByTestId('tx-row')).toContainText('₹777.00');

  // Settings can load it again.
  await page.goto('./#/settings');
  await page
    .locator('section[aria-labelledby="sample-title"]')
    .getByRole('button', { name: 'Load sample data' })
    .click();
  await expect(
    page
      .locator('section[aria-labelledby="sample-title"]')
      .getByRole('button', { name: 'Remove sample data' }),
  ).toBeVisible();
});
