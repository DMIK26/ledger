import { readFileSync } from 'node:fs';
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

test('a Shop ledger beside Personal, with profit and loss, and privacy hides it all', async ({
  page,
}) => {
  await page.goto('./#/transactions');
  await quick(page, 'groceries 900 20th oct upi');
  await page.goto('./#/settings');
  // The box follows the saved setting, so it ticks a moment after the click.
  await page.getByLabel('Keep a Shop ledger as well').click();
  await expect(page.getByLabel('Keep a Shop ledger as well')).toBeChecked();
  const name = page.getByLabel('The shop’s name');
  await name.fill('Rajendra Traders');
  await name.press('Enter');
  const switcher = page.getByRole('group', { name: 'Ledger' });
  await switcher.getByRole('button', { name: 'Rajendra Traders' }).click();

  await page.goto('./#/transactions');
  await expect(page.getByTestId('tx-row')).toHaveCount(0);
  await quick(page, 'cement bags 6000 18th oct upi');
  await quick(page, 'received 10000 from sales 19th oct upi');
  await expect(page.getByTestId('tx-row')).toHaveCount(1);
  await expect(page.getByTestId('tx-row')).toContainText('Cement Bags');

  await page.goto('./#/reports');
  const pl = page.getByTestId('profit-loss');
  await expect(pl).toContainText('Rajendra Traders: profit and loss');
  await expect(pl.getByTestId('pl-profit')).toContainText('₹4,000.00');
  await expect(pl.getByTestId('pl-profit')).toContainText('40% of sales');

  await switcher.getByRole('button', { name: 'Both' }).click();
  await page.goto('./#/transactions');
  await expect(page.getByTestId('tx-row')).toHaveCount(2);
  await switcher.getByRole('button', { name: 'Personal' }).click();
  await expect(page.getByTestId('tx-row')).toHaveCount(1);
  await expect(page.getByTestId('tx-row')).toContainText('Groceries');

  await switcher.getByRole('button', { name: 'Both' }).click();
  await page.getByRole('button', { name: 'Privacy mode' }).click();
  for (const r of ['#/', '#/transactions', '#/reports', '#/money', '#/budgets']) {
    await page.goto(`./${r}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.page-loading')).toHaveCount(0);
    const all = await page.evaluate(() => {
      const attrs = [...document.querySelectorAll('*')]
        .flatMap((el) => [...el.attributes].map((a) => a.value))
        .join(' ');
      return `${document.body.innerText} ${attrs} ${document.title}`;
    });
    for (const real of ['6,000.00', '10,000.00', '4,000.00', '900.00'])
      expect(all, r).not.toContain(real);
  }
});

test('a password-protected backup opens only with its password', async ({ page }) => {
  await page.goto('./#/transactions');
  await quick(page, 'shawarma 450 21st oct upi');
  await page.goto('./#/settings');
  await page.getByLabel('Protect the backup with a password').check();
  await page.getByLabel('Password', { exact: true }).fill('mango lassi');
  await page.getByLabel('Type it again').fill('mango lassi');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export protected backup' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('ledger-backup-2026-10-22.json');
  const path = await file.path();
  const text = readFileSync(path, 'utf8');
  expect(text).not.toContain('Shawarma');
  expect(JSON.parse(text).protected.kdf).toBe('PBKDF2-SHA-256');

  await page.getByLabel('Restore from backup').setInputFiles(path);
  const ask = page.getByTestId('backup-password');
  await ask.getByLabel('Its password').fill('wrong password');
  await ask.getByRole('button', { name: 'Open backup' }).click();
  await expect(page.getByRole('alert')).toContainText('That password does not open this backup.');
  await ask.getByLabel('Its password').fill('mango lassi');
  await ask.getByRole('button', { name: 'Open backup' }).click();
  await expect(page.getByTestId('restore-preview')).toContainText('This backup has 1 entry');
});

test('Telugu and Hindi follow every screen and stay after a reload', async ({ page }) => {
  await page.goto('./#/transactions');
  await quick(page, 'swiggy 350 20th oct upi');
  await page.goto('./#/settings');
  await page.getByTestId('language-te').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'te');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('సెట్టింగ్‌లు');
  await page.goto('./#/transactions');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('లావాదేవీలు');
  const row = page.getByTestId('tx-row');
  await expect(row).toContainText('₹350.00');
  await expect(row).toContainText('20 అక్టో 2026');
  await expect(row).toContainText('భోజనం, హోటళ్లు');

  await page.goto('./#/settings');
  await page.getByTestId('language-hi').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('सेटिंग्स');
  await page.goto('./#/reports');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('रिपोर्ट');

  await page.goto('./#/settings');
  await page.getByTestId('language-en').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
});

test('Face ID or fingerprint unlocks with a passkey; the PIN still works', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', 'One virtual authenticator is enough');
  // A platform authenticator that verifies the user, as Face ID or a fingerprint would.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Set a PIN' }).click();
  await page.getByLabel('New PIN').fill('2468');
  await page.getByLabel('Repeat the PIN').fill('2468');
  await page.getByRole('button', { name: 'Turn on lock' }).click();
  const setting = page.getByTestId('passkey-setting');
  await expect(setting).toContainText('Not yet tried on a real iPhone home-screen app.');
  await setting.getByLabel('Unlock with Face ID or fingerprint').click();
  await expect(setting.getByLabel('Unlock with Face ID or fingerprint')).toBeChecked();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ledger is locked' })).toBeVisible();
  await page.getByRole('button', { name: 'Use Face ID or fingerprint' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

  await page.reload();
  await page.getByLabel('Enter your PIN').fill('2468');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
});

test('the weekly reminder backs up with one tap', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'The reminder shows on phones');
  await page.goto('./#/');
  await quick(page, 'chai 20 cash');
  const banner = page.getByTestId('backup-reminder');
  await expect(banner).toBeVisible();
  const download = page.waitForEvent('download');
  await banner.getByRole('button', { name: 'Back up now' }).click();
  expect((await download).suggestedFilename()).toBe('ledger-backup-2026-10-22.json');
  await expect(banner).toBeHidden();
});
