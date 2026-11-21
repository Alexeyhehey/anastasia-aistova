import { test, expect } from '@playwright/test';

test('the header fits a narrow phone and the theme control works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('#mainNav a')).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 360, 375, 390]) {
    await page.setViewportSize({ width, height: 812 });
    for (const element of await page.locator('.brand, #mainNav a, #themeToggle').all()) {
      await expect(element).toBeInViewport({ ratio: 1 });
      await element.click({ trial: true });
    }
  }
  await page.locator('#themeToggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'burgundy');
});

test('the first frame of the next series is already at the top', async ({ page }) => {
  await page.goto('./#/edinburgh');
  const next = page.locator('.next-series');
  await next.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(1000);
  const firstFrame = page.evaluate(() => new Promise(resolve => {
    window.addEventListener('hashchange', () => requestAnimationFrame(() => resolve(scrollY)), { once: true });
  }));
  await next.click();
  expect(await firstFrame).toBe(0);
  await expect(page.locator('.series-hero h1')).toHaveText('Martinique');
});

test('Back restores the cover after a manual scroll from the homepage', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const cover = page.locator('.series-card[data-series="martinique"]');
  await cover.click({ trial: true });
  const before = await cover.boundingBox();
  await cover.click();
  await expect(page.locator('.series-hero h1')).toHaveText('Martinique');
  await page.goBack();
  await expect(cover).toBeFocused();
  const after = await cover.boundingBox();
  expect(Math.abs(after.y - before.y)).toBeLessThan(3);
  expect(Math.abs(after.x - before.x)).toBeLessThan(3);
  await page.goForward();
  await expect(page.locator('.series-hero h1')).toHaveText('Martinique');
});
