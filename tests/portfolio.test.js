import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const app = readFileSync(resolve(root, 'app.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(resolve(root, 'img/dims.js'), 'utf8'), sandbox);
vm.runInNewContext(readFileSync(resolve(root, 'content.js'), 'utf8'), sandbox);
const dims = sandbox.window.DIMS;

test('static document has unique IDs and one H1', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate static IDs');
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
});

test('static fragment links resolve to existing targets', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const fragments = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
  assert.ok(fragments.length > 0);
  for (const fragment of fragments) assert.ok(ids.has(fragment), `missing target #${fragment}`);
  assert.doesNotMatch(html, /href="#"/);
});

test('all 90 series frames declared by dimensions exist on disk', () => {
  const expected = { edinburgh: 26, ladoga: 37, martinique: 27 };
  let total = 0;
  for (const [series, count] of Object.entries(expected)) {
    assert.equal(dims[series].length, count, `${series} frame count`);
    dims[series].forEach(([width, height], index) => {
      assert.ok(width > 0 && height > 0, `${series} dimensions at ${index}`);
      const filename = `${String(index + 1).padStart(2, '0')}.jpg`;
      assert.ok(existsSync(resolve(root, 'img', series, filename)), `missing ${series}/${filename}`);
      total += 1;
    });
  }
  assert.equal(total, 90);
});

test('contact links and essential application mounts are preserved', () => {
  const { site } = sandbox.window.CONTENT;
  for (const [id, url] of Object.entries({
    contactTelegram: site.telegram, footerTelegram: site.telegram,
    contactInstagram: site.instagram, footerInstagram: site.instagram,
  })) {
    const tag = html.match(new RegExp(`<a\\b[^>]*\\bid="${id}"[^>]*>`))?.[0];
    assert.ok(tag?.includes(`href="${url}"`), `fallback link for #${id}`);
  }
  for (const id of ['home', 'series', 'seriesRow', 'seriesPrev', 'seriesNext', 'seriesProgress', 'selectedGrid', 'lb', 'lbImage', 'lbCounter', 'lbCaption', 'intro', 'introCount', 'introLine', 'introName', 'routeCurtain']) {
    assert.match(html, new RegExp(`\\bid="${id}"`), `missing mount #${id}`);
  }
  for (const script of ['img/dims.js', 'intro.js', 'app.js', 'palette.js', 'catalog.js']) assert.match(html.replace(/\?v=\d+/g, ''), new RegExp(`src="${script.replaceAll('/', '\\/')}"`));
  assert.match(app, /window\.DIMS/);
});

test('intro frames referenced by the loading sequence exist on disk', () => {
  const sources = [...html.matchAll(/src="(img\/intro\/[^"]+)"/g)].map((match) => match[1]);
  assert.equal(sources.length, 12);
  for (const source of sources) assert.ok(existsSync(resolve(root, source)), `missing ${source}`);
});
