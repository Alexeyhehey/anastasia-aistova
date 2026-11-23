import { test, expect } from '@playwright/test';

test('the beta opens with all land inside the frame and links to its marked studio', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./beta/#geography');
  await expect(page.getByRole('button', { name: 'Весь мир' })).toHaveAttribute('aria-pressed', 'true');
  for (const width of [1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await expect(page.locator('.dev-banner strong')).toHaveText('[IN DEVELOPMENT]');
    await expect(page.locator('.dev-banner a')).toBeInViewport({ ratio: 1 });
    await expect.poll(() => page.evaluate(() => {
      const svg = document.querySelector('.map-coast');
      const land = svg.querySelector('use').getBBox();
      const frame = svg.getBoundingClientRect(), transform = svg.getScreenCTM();
      const start = new DOMPoint(land.x, land.y).matrixTransform(transform);
      const end = new DOMPoint(land.x + land.width, land.y + land.height).matrixTransform(transform);
      return land.width > 350 && start.x > frame.left + 8 && end.x < frame.right - 8 &&
        start.y > frame.top + 5 && end.y < frame.bottom - 5 &&
        document.documentElement.scrollWidth === innerWidth;
    })).toBe(true);
  }
  await page.getByRole('button', { name: 'Места серий' }).click();
  await expect(page.locator('#mapStage')).not.toHaveClass(/is-world/);
  await page.locator('.dev-banner a').click();
  await expect(page.locator('header')).toContainText('[IN DEVELOPMENT]');
  await expect(page.locator('#siteLink')).toHaveAttribute('href', './');
  expect(new URL(page.url()).pathname).toBe('/beta/add-series.html');
});
