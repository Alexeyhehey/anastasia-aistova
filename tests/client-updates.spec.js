import { expect, test } from '@playwright/test';

test('mobile spreads, overlapping portraits and the light theme', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('aistova-theme', 'burgundy'));
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'white');
  const items = page.locator('#selectedGrid button');
  const wide = await items.first().boundingBox();
  const a = await items.nth(1).boundingBox(), b = await items.nth(2).boundingBox();
  expect(wide.width).toBeGreaterThan(a.width + b.width);
  expect(a.x + a.width).toBeLessThan(b.x);
  expect(Math.min(a.y+a.height,b.y+b.height)).toBeGreaterThan(Math.max(a.y,b.y));
  const back = await page.locator('.about-photo--first').boundingBox();
  const front = await page.locator('.about-photo--second').boundingBox();
  expect(front.y).toBeLessThan(back.y + back.height);
  expect(front.x).toBeLessThan(back.x + back.width);
});

test('a desktop revisit plays the intro and a direct series link skips it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => sessionStorage.setItem('aistova-intro','seen'));
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#intro')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#intro')).toBeHidden();
  await page.goto('./?direct#/edinburgh');
  await expect(page.locator('.series-hero h1')).toHaveText('Edinburgh');
  await expect(page.locator('#intro')).toBeHidden();
});
