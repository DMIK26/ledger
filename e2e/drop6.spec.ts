import { expect, test, type Page } from '@playwright/test';

const TODAY = new Date(2026, 9, 19, 12, 0, 0); // Mon 19 Oct 2026

async function quickAdd(page: Page, text: string) {
  const input = page.getByLabel('Quick add');
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}

async function startSketch(page: Page) {
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('d');
  await expect(page.getByTestId('sketch-toolbar')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  // Seeded on Transactions: quick add on the Dashboard would follow the September entry there.
  await page.goto('./#/transactions');
  for (const t of ['rent 8000 1/10', 'swiggy 350 15th oct upi', 'swiggy 400 12th sep upi'])
    await quickAdd(page, t);
  await page.goto('./#/');
});

test('a drawing is kept per page and month, and survives a reload', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Drawn with a mouse; the phone uses the same layer');
  await startSketch(page);
  const area = page.locator('.sketch-capture');
  const box = (await area.boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 340, { steps: 8 });
  await page.mouse.move(box.x + 330, box.y + 310, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.ink-layer path')).toHaveCount(1);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.sketch-capture')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.ink-layer path')).toHaveCount(1);
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.locator('.ink-layer path')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.locator('.ink-layer path')).toHaveCount(1);

  // Undo removes the stroke without a toast for it.
  await startSketch(page);
  await page.getByTestId('sketch-toolbar').getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('.ink-layer path')).toHaveCount(0);
  await page.getByTestId('sketch-toolbar').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.ink-layer path')).toHaveCount(1);
});

test('holding still snaps a loop to a clean circle', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Drawn with a mouse');
  await startSketch(page);
  const box = (await page.locator('.sketch-capture').boundingBox())!;
  const cx = box.x + 300;
  const cy = box.y + 300;
  await page.mouse.move(cx + 50, cy);
  await page.mouse.down();
  for (let i = 1; i <= 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    const r = 50 + (i % 3) * 2;
    await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  await page.waitForTimeout(600); // hold still past 400ms
  await page.mouse.up();
  const d = await page.locator('.ink-layer path').first().getAttribute('d');
  // 37 points: a move, 35 curves and a final line.
  expect(d!.match(/Q/g)).toHaveLength(35);
});

test('a note stays with its slice when the window resizes', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Resizing is a desktop case');
  await startSketch(page);
  await page
    .getByTestId('sketch-toolbar')
    .getByRole('button', { name: 'Note', exact: true })
    .click();
  const slice = page.getByTestId('slice-housing');
  await slice.scrollIntoViewIfNeeded();
  const s = (await slice.boundingBox())!;
  await page.mouse.click(s.x + 8, s.y + s.height / 2);
  await page.getByRole('textbox', { name: 'Note' }).fill('rent went up');
  await page.getByRole('button', { name: 'Save note' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  const mark = page.getByTestId('note-mark');
  await expect(mark).toHaveText('rent went up');

  const near = async () => {
    const m = (await mark.boundingBox())!;
    const b = (await slice.boundingBox())!;
    return Math.abs(m.y - b.y) < 30 && m.x > b.x && m.x < b.x + b.width + 10;
  };
  expect(await near()).toBe(true);
  await page.setViewportSize({ width: 960, height: 800 });
  await expect.poll(near).toBe(true);
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect.poll(near).toBe(true);

  // Shift+N lists it.
  await page.keyboard.press('Shift+N');
  await expect(page.getByTestId('notes-list')).toContainText('On Housing & Utilities, Dashboard');
});

test('ask the pencil: the answer points at the element', async ({ page }, info) => {
  if (info.project.name === 'phone') {
    await page.getByRole('button', { name: /The pencil, relaxed\. Ask the pencil/ }).click();
  } else {
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
  }
  await page.getByRole('button', { name: 'What was the biggest one?' }).click();
  await expect(page.getByTestId('pencil-caption')).toContainText('Rent, ₹8,000.00 on 1 Oct 2026.');
});

test('reduced motion: doodles appear without tracing, wobble or eye tracking', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await quickAdd(page, 'uber 240 card');
  const burst = page.getByTestId('doodle-burst');
  await expect(burst).toBeVisible();
  await expect(burst.locator('svg')).not.toHaveClass(/doodle-draw/);
  await page.mouse.move(5, 5);
  await page.mouse.move(600, 400);
  const pupils = page.locator('.pencil .pupils').first();
  await expect(pupils).not.toHaveAttribute('transform', /translate/);
});

test('with doodles off there is no pencil, and privacy hides amounts in captions', async ({
  page,
}) => {
  await expect(page.getByTestId('auto-annotation')).toHaveText('most of it went here');
  await page.goto('./#/transactions');
  await expect(page.getByTestId('auto-annotation')).toContainText('₹8k');
  await page.getByRole('button', { name: 'Privacy mode' }).click();
  await expect(page.getByTestId('auto-annotation')).not.toContainText('₹8k');
  await page.goto('./#/settings');
  await page.getByRole('switch', { name: 'Doodles' }).click();
  await expect(page.getByTestId('companion')).toHaveCount(0);
  await page.goto('./#/');
  await expect(page.getByTestId('auto-annotation')).toHaveCount(0);
  await expect(page.getByTestId('companion')).toHaveCount(0);
});
