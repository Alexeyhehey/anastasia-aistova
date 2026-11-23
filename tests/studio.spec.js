import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const CATALOG = 'window.AISTOVA_SERIES = ', CONTENT = 'window.CONTENT = ';
const body = (text, head) => JSON.parse(text.trim().slice(head.length, -1));
const photo = n => resolve('img/selected', n + '.jpg');
const DIMS = JSON.parse(readFileSync('img/dims.js', 'utf8').trim().replace(/^window\.DIMS\s*=\s*/, '').replace(/;$/, ''));

// GitHub заменён заглушкой: студия проходит весь путь публикации, но в настоящий репозиторий ничего не пишет.
async function fakeGitHub(page, folder) {
  const catalogPath = folder + 'catalog.js', contentPath = folder + 'content.js';
  const seed = body(readFileSync(catalogPath, 'utf8'), CATALOG).filter(s => ['edinburgh', 'martinique', 'ladoga'].includes(s.id));
  const repo = {
    files: { [catalogPath]: CATALOG + JSON.stringify(seed) + ';', [contentPath]: readFileSync(contentPath, 'utf8') },
    head: '0'.repeat(40), added: new Set(), deleted: new Set(), messages: [],
    get catalog() { return body(this.files[catalogPath], CATALOG); },
    get content() { return body(this.files[contentPath], CONTENT); }
  };
  let tree, staged, message, sequence = 0;
  const blobs = new Map();
  const sha = () => (++sequence).toString(16).padStart(40, '0');
  await page.route('https://api.github.com/repos/Alexeyhehey/anastasia-aistova/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname.split('/anastasia-aistova')[1];
    const data = req.postDataJSON();
    expect(req.headers().authorization).toBe('Bearer test-only');
    let response;
    if (path === '/git/ref/heads/main') response = { object: { sha: repo.head } };
    else if (path.startsWith('/contents/')) response = { content: Buffer.from(repo.files[path.slice(10)]).toString('base64') };
    else if (path.startsWith('/git/commits/')) response = { tree: { sha: repo.head } };
    else if (path === '/git/blobs') {
      const bytes = Buffer.from(data.content, 'base64');
      expect(bytes.readUInt16BE()).toBe(0xffd8);
      response = { sha: createHash('sha1').update(bytes).digest('hex') }; blobs.set(response.sha, bytes);
    } else if (path === '/git/trees') {
      expect(data.base_tree).toBe(repo.head);
      for (const file of data.tree.filter(f => !('content' in f))) {
        expect(file.path).toMatch(/^(beta\/)?img\/[a-z0-9-]+\/u[a-z0-9]+\.jpg$/);   // студия трогает только свои файлы
        if (file.sha !== null) expect(blobs.has(file.sha)).toBeTruthy();
      }
      tree = data.tree; response = { sha: sha() };
    } else if (path === '/git/commits') {
      expect(data.parents).toEqual([repo.head]); staged = sha(); message = data.message; response = { sha: staged };
    } else if (path === '/git/refs/heads/main') {
      expect(data).toEqual({ sha: staged, force: false });
      for (const file of tree) {
        if ('content' in file) repo.files[file.path] = file.content;
        else if (file.sha === null) { repo.deleted.add(file.path); repo.added.delete(file.path); }
        else repo.added.add(file.path);
      }
      repo.head = staged; repo.messages.push(message); response = {};
    } else throw Error(path);
    await route.fulfill({ json: response });
  });
  await page.route(/raw\.githubusercontent\.com\/Alexeyhehey\/anastasia-aistova\//, route => route.fulfill({ path: photo('01') }));
  await page.route(/\/catalog\.js\?v=/, route => route.fulfill({ contentType: 'application/javascript', body: repo.files[catalogPath] }));
  await page.route(/\/content\.js\?v=/, route => route.fulfill({ contentType: 'application/javascript', body: repo.files[contentPath] }));
  await page.route(/\/img\/(tokyo-[\w-]+|me)\/u\w+\.jpg/, route => route.fulfill({ path: photo('01') }));
  return repo;
}
async function signIn(page, folder) {
  await page.goto('./' + folder + 'add-series.html');
  await page.locator('#token').fill('test-only'); await page.locator('#auth button').click();
  await expect(page.locator('#shoots')).toBeVisible();
}

for (const folder of ['', 'beta/']) {
  const name = folder || 'live/';

  test(name + ' studio: publish, edit photos, hide, reorder and delete a shoot', async ({ page }) => {
    const repo = await fakeGitHub(page, folder);
    const count = repo.catalog.length;
    page.on('dialog', dialog => dialog.accept());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./' + folder); await expect(page.locator('.selected-item').first()).toBeAttached(); await expect(page.locator('.map-point').first()).toBeAttached();
    const baseSelected = await page.locator('.selected-item').count(), basePoints = await page.locator('.map-point').count();

    await signIn(page, folder);
    await expect(page.locator('.entry')).toHaveCount(count);
    await page.locator('#create').click(); await page.locator('#title').fill('Tokyo');
    await page.locator('#mapPicker').click({ position: { x: 160, y: 50 } });
    await expect(page.locator('#lat')).not.toHaveValue(''); await expect(page.locator('#pin')).toBeVisible();
    await page.locator('#photos').setInputFiles([photo('01'), photo('02')]);
    await page.locator('#list input[type=radio]').nth(1).check();
    await page.locator('#list input[type=checkbox]').nth(0).check();
    await page.locator('#save').click(); await expect(page.locator('.entry')).toHaveCount(count + 1);
    let shoot = repo.catalog.at(-1);
    expect(shoot.selected).toEqual([1]); expect(shoot.cover).toBe(2); expect(shoot.sizes).toHaveLength(2);
    expect(shoot.files).toHaveLength(2); expect(!!shoot.betaMedia).toBe(folder === 'beta/');
    expect([...repo.added].sort()).toEqual(shoot.files.map(f => folder + 'img/' + shoot.id + '/' + f + '.jpg').sort());
    expect(repo.messages.at(-1)).toBe((folder ? '[beta] ' : '') + 'Add Tokyo');

    // На сайте: новая точка, кадр в подборке, серия открывается с обложки.
    await page.goto('./' + folder);
    await expect(page.locator('.selected-item')).toHaveCount(baseSelected + 1);
    const point = page.locator('.map-point').last(); await expect(point).toHaveAttribute('href', '#/' + shoot.id); await point.locator('.map-dot').click();
    await expect(page.locator('.frame')).toHaveCount(2);
    await expect(page.locator('.frame').first().locator('img')).toHaveAttribute('src', 'img/' + shoot.id + '/' + shoot.files[1] + '.jpg');

    // Ключ запомнен на устройстве: второй раз вводить его не нужно.
    await page.goto('./' + folder + 'add-series.html');
    const row = page.locator('.entry').filter({ hasText: 'Tokyo' });
    await row.getByText('Изменить').click(); await page.locator('#list input[type=checkbox]').nth(1).check();
    await page.locator('#save').click(); await expect(page.locator('#editor')).toBeHidden();
    expect(repo.catalog.at(-1).selected).toEqual([1, 2]);

    // Перестановка: обложка и отметки едут вместе с кадром, файлы не переименовываются.
    await row.getByText('Изменить').click();
    await page.locator('#list article').nth(1).getByTitle('Раньше').click();
    await page.locator('#save').click(); await expect(page.locator('#editor')).toBeHidden();
    const moved = repo.catalog.at(-1);
    expect(moved.files).toEqual([shoot.files[1], shoot.files[0]]); expect(moved.cover).toBe(1); expect(moved.selected).toEqual([2, 1]);   // очерёдность подборки едет вместе с кадрами

    // Добавляем кадр в готовую серию и убираем один старый: лишний файл уходит из репозитория.
    await row.getByText('Изменить').click();
    await page.locator('#photos').setInputFiles([photo('03')]);
    await expect(page.locator('#list article')).toHaveCount(3);
    await page.locator('#list article').nth(1).getByTitle('Убрать кадр').click();
    await page.locator('#save').click(); await expect(page.locator('#editor')).toBeHidden();
    shoot = repo.catalog.at(-1);
    expect(shoot.files).toHaveLength(2); expect(shoot.files[0]).toBe(moved.files[0]); expect(shoot.sizes).toHaveLength(2); expect(shoot.selected).toEqual([1]);
    expect([...repo.deleted]).toEqual([folder + 'img/' + shoot.id + '/' + moved.files[1] + '.jpg']);
    await expect(row).toContainText('2 кадра');

    // Старая серия: правка названия не трогает её кадры.
    const before = repo.catalog.find(s => s.id === 'ladoga');
    await page.locator('.entry').filter({ hasText: 'Ladoga' }).getByText('Изменить').click();
    await expect(page.locator('#list article')).toHaveCount(DIMS.ladoga.length);
    await page.locator('#russian').fill('Ладожское озеро');
    await page.locator('#save').click(); await expect(page.locator('#editor')).toBeHidden();
    const after = repo.catalog.find(s => s.id === 'ladoga');
    expect(after.titleRu).toBe('Ладожское озеро'); expect(after.files).toBeUndefined(); expect(after.selected).toEqual(before.selected);

    await row.getByText('Снять с сайта').click(); await expect(row).toContainText('Снята с сайта');
    const hidden = { ...repo.files };
    await row.getByText('Вернуть на сайт').click(); await expect(row).toContainText('На сайте');
    const restored = { ...repo.files };
    repo.files = hidden; await page.goto('./' + folder + '#/' + shoot.id); await expect(page.locator('.map-point')).toHaveCount(basePoints);
    await expect(page.locator('.selected-item')).toHaveCount(baseSelected); await expect(page.locator('#series')).toBeHidden();
    repo.files = restored; await page.reload(); await expect(page.locator('.map-point')).toHaveCount(basePoints + 1); await expect(page.locator('.selected-item')).toHaveCount(baseSelected + 1);

    // Порядок серий.
    await page.goto('./' + folder + 'add-series.html');
    const first = repo.catalog[0].id;
    await page.locator('.entry').first().getByTitle('Ниже').click();
    await page.locator('#saveOrder').click(); await expect(page.locator('#saveOrder')).toBeHidden();
    expect(repo.catalog[1].id).toBe(first); expect(repo.catalog).toHaveLength(count + 1);

    // Удаление навсегда: серия уходит из каталога вместе со своими файлами.
    await row.getByText('Изменить').click(); await page.locator('#remove').click();
    await expect(page.locator('.entry')).toHaveCount(count);
    expect(repo.catalog.some(s => s.id === shoot.id)).toBeFalsy(); expect(repo.added.size).toBe(0);

    // Выход стирает ключ с устройства.
    await page.locator('#logout').click(); await expect(page.locator('#login')).toBeVisible();
    await page.reload(); await expect(page.locator('#login')).toBeVisible(); await expect(page.locator('#shoots')).toBeHidden();
  });

  test(name + ' studio: texts, contacts and personal photos reach the site', async ({ page }) => {
    const repo = await fakeGitHub(page, folder);
    const original = repo.content;
    page.on('dialog', dialog => dialog.accept());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(page, folder);

    await page.locator('#tabs').getByText('Тексты').click();
    await page.locator('summary', { hasText: 'Обо мне' }).click();
    await page.getByLabel('Приветствие').fill('Привет <b>& добро пожаловать</b>');
    const about = page.locator('details', { hasText: 'Абзацы рассказа о себе' });
    await about.getByText('+ Добавить').first().click();
    await about.locator('textarea').last().fill('Новый абзац из студии.');
    await page.locator('summary', { hasText: 'Имя и контакты' }).click();
    await page.getByLabel('Ссылка на Telegram').fill('t.me/без-https');
    await page.locator('#saveTexts').click();
    await expect(page.locator('#status')).toContainText('https://');          // неверную ссылку студия не пропускает
    expect(repo.content).toEqual(original);
    await page.getByLabel('Ссылка на Telegram').fill('https://t.me/new_contact');
    await page.locator('#saveTexts').click(); await expect(page.locator('#status')).toContainText('Сохранено');
    const saved = repo.content;
    expect(saved.about.title).toBe('Привет <b>& добро пожаловать</b>');
    expect(saved.about.paragraphs).toEqual([...original.about.paragraphs, 'Новый абзац из студии.']);
    expect(saved.site.telegram).toBe('https://t.me/new_contact');
    expect(saved.selected.order).toEqual(original.selected.order); expect(saved.nav).toEqual(original.nav); expect(saved.services.details).toEqual(original.services.details);

    await page.locator('#tabs').getByText('Мои фото').click();
    await page.locator('.slot').nth(2).locator('input[type=file]').setInputFiles(photo('02'));
    await page.locator('#saveMe').click(); await expect(page.locator('#status')).toContainText('Сохранено');
    const media = repo.content.media;
    expect(media.portrait).toMatch(/^me\/u[a-z0-9]+\.jpg$/); expect(media.hero).toBe(''); expect(media.cutout).toBe('');
    expect([...repo.added]).toEqual(['img/' + media.portrait]);

    // Сайт показывает новые тексты как текст (без разметки), новую ссылку и новое фото.
    await page.goto('./' + folder);
    await expect(page.locator('#about h2, #about .about-title').filter({ hasText: 'добро пожаловать' }).first()).toContainText('Привет <b>& добро пожаловать</b>');
    await expect(page.locator('#aboutCopy p')).toHaveCount(original.about.paragraphs.length + 1);
    await expect(page.locator('#contactTelegram')).toHaveAttribute('href', 'https://t.me/new_contact');
    await expect(page.locator('.about-portrait img')).toHaveAttribute('src', (folder ? '../' : '') + 'img/' + media.portrait);

    // Замена главного фото без силуэта убирает старый силуэт; «Вернуть исходное» возвращает всё как было.
    await page.goto('./' + folder + 'add-series.html');
    await page.locator('#tabs').getByText('Мои фото').click();
    await page.locator('.slot').nth(0).locator('input[type=file]').setInputFiles(photo('03'));
    await page.locator('#saveMe').click(); await expect(page.locator('#status')).toContainText('Сохранено');
    expect(repo.content.media.hero).toMatch(/^me\/u/); expect(repo.content.media.cutout).toBe('none');
    await page.goto('./' + folder); await expect(page.locator('#heroImage')).toHaveAttribute('src', /img\/me\/u/); await expect(page.locator('.hero-cutout')).toHaveCount(0);
    await page.goto('./' + folder + 'add-series.html');
    await page.locator('#tabs').getByText('Мои фото').click();
    await page.locator('.slot').nth(0).getByText('Вернуть исходное').click();
    await page.locator('#saveMe').click(); await expect(page.locator('#status')).toContainText('Сохранено');
    expect(repo.content.media.hero).toBe(''); expect(repo.content.media.cutout).toBe('');
    expect([...repo.added]).toEqual(['img/' + media.portrait]);             // файл заменённого главного фото удалён
  });
}
