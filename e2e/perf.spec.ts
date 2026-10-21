import { expect, test, type Page } from '@playwright/test';

const TODAY = new Date(2026, 9, 19, 12, 0, 0); // Mon 19 Oct 2026
const N = 5000;

/** Writes 5,000 entries over the last two years straight into IndexedDB, then reloads. */
async function seed5000(page: Page) {
  await page.goto('./#/');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.evaluate(async (n) => {
    const cats = [
      'food',
      'groceries',
      'transport',
      'shopping',
      'housing',
      'health',
      'entertainment',
      'education',
      'business',
      'other',
    ];
    const merchants = [
      'Swiggy',
      'Zomato',
      'BigBasket',
      'Uber',
      'Ola',
      'Amazon',
      'Rent',
      'Apollo',
      'PVR',
      'Udemy',
      'Chai',
      'Metro',
    ];
    const methods = ['UPI', 'Cash', 'Card', 'Bank transfer'];
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('ledger-db');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    const start = new Date(2024, 9, 20).getTime();
    for (let i = 0; i < n; i += 1) {
      const d = new Date(start + Math.floor((i / n) * 730) * 86_400_000);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      store.put({
        id: `perf-${i}`,
        date,
        amountMinor: 1000 + ((i * 7919) % 250000),
        currency: 'INR',
        merchant: merchants[i % merchants.length],
        categoryId: cats[i % cats.length],
        method: methods[i % methods.length],
        notes: '',
        tags: i % 9 === 0 ? ['work'] : [],
        source: 'import',
        createdAt: i,
        updatedAt: i,
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, N);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
});

test('5,000 entries: pages open fast and stay responsive', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'One measurement is enough');
  test.setTimeout(120_000);
  await seed5000(page);

  const timeTo = async (hash: string, ready: () => Promise<unknown>) => {
    const t0 = Date.now();
    await page.goto(`./${hash}`);
    await page.reload();
    await ready();
    return Date.now() - t0;
  };

  const dashboard = await timeTo('#/', () => page.getByTestId('month-total').waitFor());
  const transactions = await timeTo('#/transactions', () =>
    page.getByTestId('tx-footer').waitFor(),
  );
  const reports = await timeTo('#/reports', () => page.getByTestId('report-total').waitFor());

  // Typing a quick entry and saving it with 5,000 others in the store.
  await page.goto('./#/transactions');
  await page.getByTestId('tx-footer').waitFor();
  await expect(page.getByTestId('tx-footer')).toContainText('5000 transactions');
  const input = page.getByLabel('Quick add');
  const t1 = Date.now();
  await input.fill('chai 20 cash');
  await input.press('Enter');
  await expect(page.getByTestId('tx-footer')).toContainText('5001 transactions');
  const save = Date.now() - t1;

  // Pinning a category re-filters everything.
  const t2 = Date.now();
  await page
    .getByTestId('tx-row')
    .first()
    .getByRole('button', { name: /Food & Dining|Other/ })
    .click();
  await page.getByTestId('pin-bar').waitFor();
  const pin = Date.now() - t2;

  console.log(
    `5,000 entries: dashboard ${dashboard}ms, transactions ${transactions}ms, reports ${reports}ms, save ${save}ms, pin ${pin}ms`,
  );
  // Generous limits for shared CI machines; a laptop is several times faster.
  expect(dashboard).toBeLessThan(4000);
  expect(transactions).toBeLessThan(4000);
  expect(reports).toBeLessThan(4000);
  expect(save).toBeLessThan(1500);
  expect(pin).toBeLessThan(1500);
});
