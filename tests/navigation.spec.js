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
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'white');
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

for (const folder of ['', 'beta/']) {
  test(`${folder || 'site'}: Back closes the photo viewer and keeps the page`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`./${folder}#/edinburgh`);
    const frame = page.locator('#series [data-k]').nth(1);
    await frame.click();
    await expect(page.locator('#lb')).toBeVisible();
    const close = await page.locator('.lightbox-close').boundingBox();
    expect(Math.min(close.width, close.height)).toBeGreaterThanOrEqual(44);
    await page.goBack();
    await expect(page.locator('#lb')).toBeHidden();
    await expect(page.locator('.series-hero h1')).toHaveText('Edinburgh');
    await expect(frame).toBeFocused();
    await page.goForward();
    await expect(page.locator('#lb')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#lb')).toBeHidden();
    await expect.poll(() => page.evaluate(() => history.state?.lightbox ?? null)).toBeNull();
    await expect(page.locator('.series-hero h1')).toHaveText('Edinburgh');
  });
}

for (const folder of ['', 'beta/']) {
  test((folder || 'live/') + ' two quick series changes keep the full curtain and open the last series', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 810 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('./' + folder + '#/edinburgh');
    await expect(page.locator('#series .frame').first()).toBeAttached();
    const active = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      location.hash = '#/ladoga'; await wait(260);
      location.hash = '#/martinique'; await wait(400);
      return document.querySelector('#routeCurtain').classList.contains('is-active');
    });
    expect(active).toBe(true);
    await expect(page.locator('#routeCurtain')).not.toHaveClass(/is-active/);
    await expect(page.locator('#series .frame').first().locator('img')).toHaveAttribute('src', /martinique\//);
  });

  test((folder || 'live/') + ' ABOUT ME heading lands below the fixed header after leaving a series', async ({ page }) => {
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('./' + folder + '#/edinburgh');
      await expect(page.locator('#series .frame').first()).toBeAttached();
      await page.locator('.site-header a[href="#about"]').first().click();
      await expect.poll(() => page.evaluate(() => document.querySelector('#about h2').getBoundingClientRect().top - document.querySelector('.site-header').getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(8);
    }
  });
}
