import { expect, test } from '@playwright/test';

/**
 * Regression test for the Dashboard flicker: hovering a bar previews that month in the donut. The
 * donut's legend used to change length with the previewed month, so the page changed height, the bar
 * moved away from a mouse that was not moving, the preview ended, the height changed back, and the
 * loop repeated dozens of times a second.
 */
test('hovering the six-month bars with a still mouse does not loop or move the page', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', 'Hover is a mouse case');
  // A fixed day, so the six bars are always May to October.
  await page.clock.setFixedTime(new Date('2026-10-22T10:00:00'));
  for (const width of [1000, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./#/');
    await page.evaluate(() => indexedDB.deleteDatabase('ledger-db'));
    await page.reload();
    await page.getByRole('button', { name: 'Load sample data' }).click();
    await expect(page.getByTestId('sample-banner')).toBeVisible();
    // The cards that load on first use, so the page height is final before the hover.
    await expect(page.getByRole('heading', { name: 'Sketchbook' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Worth a look' })).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { changes: number };
      w.changes = 0;
      let last = '';
      setInterval(() => {
        const text =
          document.querySelector('.chart-card .muted.small[aria-live]')?.textContent ?? '';
        if (text !== last) {
          w.changes += 1;
          last = text;
        }
      }, 16);
    });
    for (const month of ['2026-05', '2026-09']) {
      const hit = page.getByTestId(`bar-${month}`).locator('.bar-hit');
      await hit.scrollIntoViewIfNeeded();
      await page.mouse.move(5, 5);
      // Cards below load on first use; measure once the page has stopped growing.
      let height = -1;
      await expect
        .poll(async () => {
          const before = height;
          height = await page.evaluate(() => document.documentElement.scrollHeight);
          return height === before;
        })
        .toBe(true);
      const box = (await hit.boundingBox())!;
      await page.evaluate(() => ((window as unknown as { changes: number }).changes = 0));
      // Near the bottom edge, where any shift of the bars would leave the pointer.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
      await page.waitForTimeout(1200);
      const changes = await page.evaluate(() => (window as unknown as { changes: number }).changes);
      expect(changes, `${month} at ${width}px`).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
      // Total mode: hovering a month must not highlight one category and fade the donut.
      expect(await page.evaluate(() => document.documentElement.dataset.highlight ?? null)).toBe(
        null,
      );
    }
  }
});
