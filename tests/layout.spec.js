// Вёрстка выдерживает то, что заказчица может ввести в студии: длинные названия, много точек, длинные подписи.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const CATALOG = 'window.AISTOVA_SERIES = ', CONTENT = 'window.CONTENT = ';
const parse = (path, head) => JSON.parse(readFileSync(path, 'utf8').trim().slice(head.length, -1));
const EXTRA = [['Novosibirsk Akademgorodok', 54.85, 83.1], ['Saint Petersburg', 59.94, 30.31], ['Glasgow', 55.86, -4.25], ['Rio de Janeiro', -22.9, -43.2], ['Vladivostok', 43.1, 131.9]];

for (const folder of ['', 'beta/']) for (const [width, height] of [[360, 740], [820, 1180], [1440, 900]]) {
  test(`${folder || 'live/'} long names and many points fit at ${width}px`, async ({ page }) => {
    const catalog = parse(folder + 'catalog.js', CATALOG), content = parse(folder + 'content.js', CONTENT);
    EXTRA.forEach(([title, lat, lon], i) => catalog.push({ id: 'long-' + i, title, lat, lon, cover: 1, selected: [], files: ['a', 'b'], sizes: [[1333, 2000], [2000, 1333]] }));
    content.site.nameLatin = ['ALEKSANDRINA', 'KONSTANTINOPOLSKAYA'];
    content.contacts.label = 'CONTACT ME NOW';
    content.nav.forEach(item => { item.label += ' PLUS'; });
    content.services.formats[0].title = 'Свадебнаяфотосъёмкавдругомгороде';
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route(/\/catalog\.js\?v=/, route => route.fulfill({ contentType: 'application/javascript', body: CATALOG + JSON.stringify(catalog) + ';' }));
    await page.route(/\/content\.js\?v=/, route => route.fulfill({ contentType: 'application/javascript', body: CONTENT + JSON.stringify(content) + ';' }));
    await page.route(/\/img\/long-\d\/\w\.jpg/, route => route.fulfill({ path: 'img/selected/01.jpg' }));

    // Ни одна надпись не выходит за экран и за свой блок.
    const spill = () => page.evaluate(() => {
      const view = document.documentElement.clientWidth, range = document.createRange();
      const wide = [...document.querySelectorAll('.hero-name-line, .series-hero h1, .series-card-title, .format-title h3, .contact-giant, .formats-heading h2, .next-series span')]
        .filter(node => node.clientWidth && (range.selectNodeContents(node), range.getBoundingClientRect().right > node.getBoundingClientRect().right + 1)).map(node => node.textContent);
      return { wide, scroll: document.documentElement.scrollWidth - view };
    });
    for (const hash of ['', '#/long-0']) {
      await page.goto('./' + folder + hash);
      await expect(page.locator(hash ? '.series-hero h1' : '#mapStage .map-point').first()).toBeVisible();
      await expect.poll(spill).toEqual({ wide: [], scroll: 0 });
    }
    await expect(page.locator('.series-hero h1')).not.toHaveClass(/is-tight/);

    // Карта: видимые подписи не налезают друг на друга, спрятанные точки названы в списке под картой.
    await page.goto('./' + folder);
    await page.locator('#mapStage').scrollIntoViewIfNeeded();
    const map = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('#mapStage .map-label')].filter(node => getComputedStyle(node).visibility !== 'hidden').map(node => node.getBoundingClientRect());
      const clash = labels.some((a, i) => labels.some((b, j) => j > i && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
      const stage = document.querySelector('#mapStage').getBoundingClientRect();
      return { clash, outside: labels.some(box => box.left < stage.left || box.right > stage.right), points: document.querySelectorAll('#mapStage .map-point').length,
        named: labels.length + document.querySelectorAll('#mapKey a:not([hidden])').length, ticks: [...document.querySelectorAll('.map-tick--lat')].filter(node => node.offsetWidth).length };
    });
    expect(map).toMatchObject({ clash: false, outside: false, named: map.points });
    expect(map.ticks > 0).toBe(width > 800);
  });
}
