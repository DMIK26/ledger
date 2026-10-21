import { expect, test, type Page } from '@playwright/test';

// Mon 19 Oct 2026, noon local time: the date the agreed quick-add table is written against.
const TODAY = new Date(2026, 9, 19, 12, 0, 0);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('adds an entry, keeps it after reload and hides every amount in privacy mode', async ({
  page,
}, info) => {
  const errors = collectErrors(page);
  await page.clock.setFixedTime(TODAY);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

  if (info.project.name === 'phone') {
    await expect(page.locator('.tabbar')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeHidden();
  } else {
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.tabbar')).toBeHidden();
  }

  const input = page.getByLabel('Quick add');
  await input.fill('shawarma 500 on 18th oct upi');
  await expect(page.getByTestId('chip-amount')).toHaveText('₹500.00');
  await expect(page.getByTestId('chip-date')).toContainText('Yesterday');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('tx-row').first()).toContainText('Shawarma');
  await expect(page.getByTestId('tx-row').first()).toContainText('18 Oct 2026');

  await page.reload();
  await expect(page.getByTestId('tx-row').first()).toContainText('Shawarma');
  await expect(page.getByTestId('month-total')).toContainText('₹500.00');

  await page.getByRole('button', { name: 'Privacy mode' }).click();
  await expect(page.getByRole('button', { name: 'Privacy mode' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const path of ['#/', '#/transactions', '#/settings']) {
    await page.goto(`./${path}`);
    await expect(page.locator('.amt').first()).toBeVisible();
    const leak = await page.evaluate(() => {
      const attrs = [...document.querySelectorAll('*')]
        .flatMap((el) => [...el.attributes].map((a) => a.value))
        .join(' ');
      return `${document.body.innerText} ${attrs} ${document.title}`;
    });
    expect(leak).not.toContain('500.00');
    expect(leak).not.toContain('1,234.56');
  }

  expect(errors).toEqual([]);
});

test('the add shortcut opens the add sheet with the description focused', async ({ page }) => {
  await page.goto('./#/transactions?action=add');
  const sheet = page.getByRole('dialog', { name: 'Add expense' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel('Describe it')).toBeFocused();
});

test('serves the manifest and a CSP meta tag', async ({ page, request }) => {
  const res = await request.get('manifest.webmanifest');
  expect(res.ok()).toBe(true);
  expect((await res.json()) as { name: string }).toMatchObject({ name: 'Ledger' });
  await page.goto('./');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
});
