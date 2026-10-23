import { expect, test, type Page } from '@playwright/test';

const TODAY = new Date('2026-10-19T10:00:00'); // Monday 19 Oct 2026

const quick = async (page: Page, text: string) => {
  const input = page.getByLabel('Quick add');
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
};

/** A finger on a phone: Playwright has no swipe, so the pointer events are sent directly. */
async function touch(page: Page, selector: string, path: Array<[number, number]>, holdMs = 0) {
  const box = (await page.locator(selector).first().boundingBox())!;
  const at = ([dx, dy]: [number, number]) => ({
    pointerType: 'touch',
    pointerId: 7,
    isPrimary: true,
    bubbles: true,
    clientX: box.x + box.width / 2 + dx,
    clientY: box.y + box.height / 2 + dy,
  });
  const target = page.locator(selector).first();
  await target.dispatchEvent('pointerdown', at(path[0]!));
  if (holdMs) await page.waitForTimeout(holdMs);
  for (const p of path.slice(1)) await target.dispatchEvent('pointermove', at(p));
  await target.dispatchEvent('pointerup', at(path[path.length - 1]!));
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
});

test('the keyboard reaches everything: palette, calendar, review and the day-by-day chart', async ({
  page,
}) => {
  await page.goto('./#/');
  await quick(page, 'rent 15000 1/10');
  await quick(page, 'xyzcorp 700 18th oct upi');
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: 'Search pages, actions and merchants' });
  await expect(box).toBeFocused();
  await box.fill('calendar');
  await box.press('Enter');
  await expect(page).toHaveURL(/view=calendar/);

  const today = page.getByTestId('cal-2026-10-19');
  await today.focus();
  await page.keyboard.press('ArrowLeft');
  const day = page.getByTestId('cal-2026-10-18');
  await expect(day).toBeFocused();
  await expect(day).toHaveAccessibleName('18 Oct 2026, ₹700.00 spent');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cal-day').getByTestId('tx-row')).toHaveCount(1);

  await page.getByRole('link', { name: 'Review (1)' }).click();
  await expect(page.getByTestId('review-card')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('review-done')).toContainText('Nothing to review');

  await page.goto('./#/');
  const scrub = page.getByTestId('scrub');
  await scrub.focus();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('scrub-label')).toHaveText('By 1 Oct 2026: ₹15,000.00');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('scrub-label')).toHaveText('So far: ₹15,700.00');
});

test('split a bill, see who pays whom, and settle it', async ({ page }) => {
  await page.goto('./#/?action=add');
  const add = page.getByRole('dialog', { name: 'Add expense' });
  await add.getByLabel('Split with others').check();
  await add.getByLabel('Whole bill').fill('1200');
  await add.getByLabel('What for').fill('Dinner');
  await add.getByLabel('Person 1').fill('Rahul');
  await add.getByRole('button', { name: 'Add person' }).click();
  await add.getByLabel('Person 2').fill('Priya');
  await add.getByLabel('Who paid').selectOption({ label: 'Rahul' });
  await expect(add.getByTestId('split-summary')).toHaveText(
    'Your share, ₹400.00, is your spending; you owe it to Rahul.',
  );
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(add).toBeHidden();
  await expect(page.getByTestId('month-total')).toHaveText('₹400.00');

  await page.goto('./#/money?view=udhaar');
  await expect(page.getByTestId('you-owe')).toHaveText('₹400.00');
  const splits = page.getByTestId('splits');
  await expect(splits.getByTestId('transfer')).toHaveCount(2);
  await expect(splits).toContainText('You pay Rahul₹400.00');
  await expect(splits).toContainText('Priya pays Rahul₹400.00');
  await splits.getByRole('button', { name: 'Mark all settled' }).click();
  await expect(page.getByTestId('you-owe')).toHaveText('₹0.00');
  await expect(page.getByTestId('splits')).toHaveCount(0);
});

test('recap with a guess, shared as an image, and Reports’ new views', async ({ page }) => {
  await page.goto('./#/');
  await quick(page, 'rent 15000 1/10');
  await quick(page, 'swiggy 500 5th oct upi');
  await quick(page, 'zomato 300 6th oct upi');
  await page.clock.setFixedTime(new Date('2026-11-03T10:00:00'));
  await page.reload();
  await page.getByTestId('recap-offer').getByRole('button', { name: 'Open the recap' }).click();
  const recap = page.getByRole('dialog', { name: 'October 2026' });
  await recap.getByLabel('Your guess').fill('1500000');
  await recap.getByRole('button', { name: 'Show me' }).click();
  await expect(recap.getByTestId('recap-card')).toContainText('₹15,800.00');
  await expect(recap.getByTestId('recap-guess-result')).toContainText('Close. Off by 5%.');
  const download = page.waitForEvent('download');
  await recap.getByRole('button', { name: 'Share this card' }).click();
  expect((await download).suggestedFilename()).toBe('ledger-month-2026-10-total.png');
  await recap.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('recap-offer')).toHaveCount(0);

  await page.goto('./#/reports');
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await page.getByRole('button', { name: '12-month average' }).click();
  await expect(page.getByTestId('report-compare')).toContainText('Nothing to compare with');
  await page
    .getByRole('list', { name: 'Categories' })
    .getByRole('button', { name: /Food & Dining/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Food & Dining, by merchant' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Merchants' }).getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Back to all categories' }).click();
  await page
    .getByRole('group', { name: "Show a category's merchants" })
    .getByRole('button', { name: /Food & Dining/ })
    .click();
  await expect(
    page.getByRole('region', { name: 'Money flow as a table' }).getByRole('row'),
  ).toHaveCount(5);
});

test('customise the Dashboard and keep it after a reload', async ({ page }) => {
  await page.goto('./#/');
  await quick(page, 'chai 20 upi');
  await page.getByRole('button', { name: 'Customise the Dashboard' }).click();
  await page.getByRole('button', { name: 'Show Day by day' }).click();
  await page.getByRole('button', { name: 'Move Recent entries up' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('day-by-day')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('day-by-day')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible();
});

test('phones: swipe a row away, drag the sheet, long-press to customise', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Touch gestures are for phones');
  await page.goto('./#/transactions');
  await quick(page, 'chai 20 upi');
  await quick(page, 'samosa 30 upi');
  await expect(page.getByTestId('tx-row')).toHaveCount(2);
  await touch(page, '[data-testid="tx-row"]', [
    [0, 0],
    [-30, 0],
    [-80, 2],
    [-140, 2],
  ]);
  await expect(page.getByTestId('tx-row')).toHaveCount(1);
  await expect(page.getByRole('status').filter({ hasText: 'Deleted' })).toBeVisible();

  await page.getByRole('button', { name: 'Add expense' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add expense' });
  // The form loads on first use (Drop 12) and focuses its first field; wait for it first.
  await expect(sheet.getByLabel('Describe it')).toBeFocused();
  const handle = sheet.getByRole('button', { name: 'Make the sheet smaller' });
  await handle.focus();
  await page.keyboard.press('ArrowDown');
  await expect(sheet).toHaveAttribute('data-snap', 'half');
  await page.keyboard.press('ArrowDown');
  await expect(sheet).toBeHidden();
  await expect(page).not.toHaveURL(/action=add/);

  await page.goto('./#/');
  await touch(
    page,
    '.safe-card',
    [
      [0, 0],
      [0, 0],
    ],
    750,
  );
  await expect(page.getByRole('heading', { name: 'Customise the Dashboard' })).toBeVisible();
});
