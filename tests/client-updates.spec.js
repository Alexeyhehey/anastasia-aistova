import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

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
  await page.goto('./');
  await expect(page.locator('#intro')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#intro')).toBeHidden();
  await page.goto('./?direct#/edinburgh');
  await expect(page.locator('.series-hero h1')).toHaveText('Edinburgh');
  await expect(page.locator('#intro')).toBeHidden();
});

test('prepare a shoot and open its map point, complete gallery and selected frame', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The owner tool uses the desktop Chromium directory picker.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./add-series.html');
  // A private browser directory provides real file handles without opening a native picker.
  await page.evaluate(() => { window.showDirectoryPicker = () => navigator.storage.getDirectory(); });
  await page.locator('#title').fill('Tokyo');
  await page.locator('#russian').fill('Токио');
  await page.locator('#slug').fill('tokyo');
  await page.locator('#lat').fill('35.68');
  await page.locator('#lon').fill('139.69');
  await page.locator('#photos').setInputFiles(['01','02'].map(n => resolve('img/selected', n+'.jpg')));
  await page.locator('#list input').nth(1).check();
  await page.getByRole('button',{ name: 'Подготовить папку и запись' }).click();
  await expect(page.locator('#result')).toBeVisible();
  const series = JSON.parse((await page.locator('#snippet').inputValue()).trim().slice(0,-1));
  expect(series.selected).toEqual([2]);
  expect(series.sizes).toHaveLength(2);
  const files = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('tokyo');
    const sizes = [];
    for (const name of ['01.jpg','02.jpg']) sizes.push((await (await dir.getFileHandle(name)).getFile()).size);
    return sizes;
  });
  expect(files.every(size => size > 0)).toBeTruthy();
  await page.route('**/content.js',async route => {
    const response = await route.fetch();
    await route.fulfill({response, body: await response.text() + '\nwindow.CONTENT.series.push('+JSON.stringify(series)+');'});
  });
  await page.route('**/img/tokyo/*.jpg',route => route.fulfill({path:resolve('img/selected',route.request().url().split('/').pop())}));
  await page.goto('./');
  await expect(page.locator('.selected-item').last().locator('img')).toHaveAttribute('src','img/tokyo/02.jpg');
  await page.locator('.map-point[href="#/tokyo"] .map-dot').click();
  await expect(page.locator('.series-hero h1')).toHaveText('Tokyo');
  await expect(page.locator('.frame')).toHaveCount(2);
});
