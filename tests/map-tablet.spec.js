import { expect, test } from '@playwright/test';

test('portrait tablet opens with the photo below the header', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const box = async selector => page.locator(selector).boundingBox();
  const hero = await box('.hero-stage'), header = await box('#siteHeader'), copy = await box('.hero-content');
  expect(Math.abs(hero.y - header.height)).toBeLessThan(2);
  expect(hero.width).toBeGreaterThan(650);
  expect(copy.y).toBeCloseTo(hero.y + hero.height, 0);
  await expect(page.locator('.hero-scroll')).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 810 });
  expect((await box('.hero-content')).x).toBeGreaterThan((await box('.hero-stage')).width);
});

test('nearby place labels stay readable on resize and crowded points retain a working link', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(/\/catalog\.js\?/, async route => {
    const response = await route.fetch();
    const fixture = `window.AISTOVA_SERIES.push({ id: 'qa-kyiv', title: 'Kyiv', titleRu: 'Киев', lat: 51.867, lon: 35.35, sizes: [[400,600]] });
      if (location.search.includes('dense')) for (let i=0;i<6;i++) window.AISTOVA_SERIES.push({ id:'qa-near-'+i, title:'Nearby place '+i, titleRu:'Место '+i, lat:51.867,lon:35.35,sizes:[[400,600]] });`;
    await route.fulfill({ response, body: await response.text() + '\n' + fixture });
  });
  await page.route(/\/img\/qa-[^/]+\/.+\.jpg/, route => route.fulfill({path:'img/edinburgh/01.jpg'}));
  await page.goto('./');
  await page.evaluate(() => document.fonts.ready);
  for (const [width,height] of [[1440,810],[820,1180],[390,844],[320,700]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => {
      const visible = Array.from(document.querySelectorAll('.map-label,.map-home em')).filter(n => n.offsetWidth && getComputedStyle(n).visibility === 'visible');
      const stage = document.querySelector('.map-stage').getBoundingClientRect();
      const boxes = visible.map(n => n.getBoundingClientRect());
      return boxes.every((a,i) => a.left >= stage.left && a.right <= stage.right && a.top >= stage.top && a.bottom <= stage.bottom &&
        boxes.slice(i+1).every(b => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)) &&
        Array.from(document.querySelectorAll('.map-point')).every(p => getComputedStyle(p.querySelector('.map-label')).visibility === 'visible' ||
          Array.from(document.querySelectorAll('.map-key a')).some(a => a.href === p.href && a.offsetWidth));
    })).toBe(true);
  }
  await page.goto('./?dense');
  const fallback = page.locator('.map-key a:visible').first();
  await expect(fallback).toBeVisible();
  const name = await fallback.textContent();
  await fallback.click();
  await expect(page.locator('.series-hero h1')).toHaveText(name);
  await page.goBack();
  await expect(fallback).toBeFocused();
});
