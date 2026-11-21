import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

test('publish photographs, edit their selection, hide and restore a shoot', async ({ page }) => {
  const prefix = 'window.AISTOVA_SERIES = ';
  let catalog = readFileSync('catalog.js', 'utf8'), head = '0'.repeat(40), tree, staged, sequence = 0;
  const initialCount = JSON.parse(catalog.trim().slice(prefix.length, -1)).length;
  const blobs = new Map();
  const sha = () => (++sequence).toString(16).padStart(40,'0');
  await page.route('https://api.github.com/repos/Alexeyhehey/anastasia-aistova/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname.split('/anastasia-aistova')[1];
    const body = req.postDataJSON();
    expect(req.headers().authorization).toBe('Bearer test-only');
    let response, status = 200;
    if (path === '/git/ref/heads/main') response = { object: { sha: head } };
    else if (path === '/contents/catalog.js') response = { content: Buffer.from(catalog).toString('base64') };
    else if (path.startsWith('/git/commits/')) response = { tree: { sha: head } };
    else if (path === '/git/blobs') {
      const bytes = Buffer.from(body.content, 'base64');
      expect(bytes.readUInt16BE()).toBe(0xffd8);
      response = { sha: createHash('sha1').update(bytes).digest('hex') }; blobs.set(response.sha, bytes);
    } else if (path === '/git/trees') {
      expect(body.base_tree).toBe(head);
      for (const file of body.tree.filter(f => f.path !== 'catalog.js')) expect(blobs.has(file.sha)).toBeTruthy();
      tree = body.tree; response = { sha: sha() };
    } else if (path === '/git/commits') {
      expect(body.parents).toEqual([head]); staged = sha(); response = { sha: staged };
    } else if (path === '/git/refs/heads/main') {
      expect(body).toEqual({ sha: staged, force: false });
      catalog = tree.find(f => f.path === 'catalog.js').content; head = staged; response = {};
    } else throw Error(path);
    await route.fulfill({ status, json: response });
  });
  await page.route(/raw\.githubusercontent\.com\/Alexeyhehey\/anastasia-aistova\//, route => route.fulfill({ path: resolve('img/selected/01.jpg') }));
  await page.route(/\/catalog\.js\?v=/, route => route.fulfill({ contentType: 'application/javascript', body: catalog }));
  await page.route(/\/img\/tokyo-[\w-]+\/\d+\.jpg/, route => route.fulfill({path:resolve('img/selected/01.jpg')}));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./add-series.html');
  await page.locator('summary').click(); await page.locator('#token').fill('test-only'); await page.locator('#auth button').click();
  await expect(page.locator('.entry')).toHaveCount(initialCount);
  await page.locator('#create').click(); await page.locator('#title').fill('Tokyo');
  await page.locator('#mapPicker').click({position:{x:160,y:50}});
  await expect(page.locator('#lat')).not.toHaveValue('');
  await page.locator('#photos').setInputFiles(['01','02'].map(n => resolve('img/selected', n + '.jpg')));
  await page.locator('#list input[type=radio]').nth(1).check();
  await page.locator('#list input[type=checkbox]').nth(0).check();
  await page.locator('#save').click(); await expect(page.locator('.entry')).toHaveCount(initialCount + 1);
  const shoot = JSON.parse(catalog.trim().slice(prefix.length,-1)).at(-1);
  expect(shoot.selected).toEqual([1]); expect(shoot.cover).toBe(2); expect(shoot.sizes).toHaveLength(2);
  const managerURL = page.url();
  await page.goto('./');
  await expect(page.locator('.selected-item')).toHaveCount(16);
  const map = page.locator('.map-point').last(); await expect(map).toHaveAttribute('href','#/' + shoot.id); await map.locator('.map-dot').click();
  await expect(page.locator('.frame')).toHaveCount(2); await expect(page.locator('.frame').first().locator('img')).toHaveAttribute('src', 'img/' + shoot.id + '/02.jpg');
  await page.goto(managerURL);
  await page.locator('summary').click(); await page.locator('#token').fill('test-only'); await page.locator('#auth button').click();
  const row = page.locator('.entry').filter({hasText:'Tokyo'});
  await row.getByText('Изменить').click(); await page.locator('#list input[type=checkbox]').nth(1).check();
  await page.locator('#save').click(); await expect(page.locator('#editor')).toBeHidden();
  expect(JSON.parse(catalog.trim().slice(prefix.length,-1)).at(-1).selected).toEqual([1,2]);
  page.on('dialog', d => d.accept());
  await row.getByText('Снять с сайта').click(); await expect(row).toContainText('Снята с сайта');
  const hiddenCatalog = catalog;
  await row.getByText('Вернуть на сайт').click(); await expect(row).toContainText('На сайте');
  const restored = catalog;
  catalog = hiddenCatalog; await page.goto('./#/' + shoot.id); await expect(page.locator('.map-point')).toHaveCount(3);
  await expect(page.locator('.selected-item')).toHaveCount(15); await expect(page.locator('#series')).toBeHidden();
  catalog = restored; await page.reload(); await expect(page.locator('.map-point')).toHaveCount(4); await expect(page.locator('.selected-item')).toHaveCount(17);
});
