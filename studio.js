// Студия портфолио. Один и тот же файл лежит в корне сайта и в beta/:
// по адресу страницы студия понимает, какой сайт она редактирует.
// Каждое сохранение — один коммит в ветку main: каталог, тексты и фотографии меняются вместе.

const REPO = 'Alexeyhehey/anastasia-aistova';
const API = 'https://api.github.com/repos/' + REPO;
const BETA = location.pathname.includes('/beta/');
const ROOT = BETA ? 'beta/' : '';
const KEY = 'aistova-studio-key';
const HEAD_CATALOG = 'window.AISTOVA_SERIES = ', HEAD_CONTENT = 'window.CONTENT = ';
const SAVED = 'Сохранено. Сайт обновится через 1–2 минуты.';

const $ = id => document.getElementById(id);
const h = (tag, props = {}, ...children) => { const node = Object.assign(document.createElement(tag), props); node.append(...children); return node; };
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const plural = (n, one, few, many) => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
const unique = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let token = '', state = null, busy = false, current = 'login', timer;
const dirty = { order: false, editor: false, texts: false, me: false };

/* ---------- Сообщения и занятость ---------- */

function say(text, kind) {
  clearTimeout(timer);
  $('status').textContent = text;
  $('status').classList.toggle('is-error', kind === 'error');
  if (text && !kind) timer = setTimeout(() => { $('status').textContent = ''; }, 7000);
}
async function run(task) {
  if (busy) return;
  busy = true; document.body.classList.add('is-busy'); $('tabs').inert = true;
  try { await task(); }
  catch (error) {
    if (error.status === 401) signOut();
    say(error.message || 'Не получилось. Попробуйте ещё раз.', 'error');
  }
  finally { busy = false; document.body.classList.remove('is-busy'); $('tabs').inert = false; }
}

/* ---------- GitHub ---------- */

async function api(path, method = 'GET', body) {
  let response;
  try {
    response = await fetch(API + path, {
      method, cache: 'no-store', redirect: 'error', credentials: 'omit',
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch { throw Error('Нет связи с интернетом. Проверьте соединение и повторите.'); }
  if (!response.ok) {
    const reason = ({
      401: 'Ключ доступа не подошёл или устарел. Введите действующий ключ.',
      403: 'У этого ключа нет права менять сайт (нужно Contents → Read and write) или GitHub временно ограничил запросы.',
      404: 'GitHub не нашёл сайт. Проверьте, что ключ выдан для репозитория anastasia-aistova.',
      409: 'Сайт только что изменили с другого устройства. Повторите действие.',
      422: 'GitHub отклонил изменение. Обновите страницу и повторите.'
    })[response.status];
    throw Object.assign(Error(reason || 'GitHub ответил ошибкой ' + response.status + '. Попробуйте чуть позже.'), { status: response.status });
  }
  return response.json();
}
function parse(file, head) {
  const text = new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0))).trim();
  if (!text.startsWith(head) || !text.endsWith(';')) throw Error('Файлы сайта изменили вручную, студия не может их прочитать. Напишите разработчику.');
  return JSON.parse(text.slice(head.length, -1));
}
async function load() {
  const head = (await api('/git/ref/heads/main')).object.sha;
  const [catalog, content] = await Promise.all([
    api('/contents/' + ROOT + 'catalog.js?ref=' + head),
    api('/contents/' + ROOT + 'content.js?ref=' + head)
  ]);
  return { head, catalog: parse(catalog, HEAD_CATALOG), content: parse(content, HEAD_CONTENT) };
}
const folderOf = series => (series.betaMedia ? 'beta/img/' : 'img/') + series.id + '/';
const fileName = file => (typeof file === 'number' ? String(file).padStart(2, '0') : file) + '.jpg';
// Файлы, которые создала студия: только их она и удаляет, когда они больше не нужны.
function owned(site) {
  const paths = new Set();
  for (const series of site.catalog) for (const file of series.files || []) if (typeof file === 'string') paths.add(folderOf(series) + fileName(file));
  for (const path of Object.values(site.content.media || {})) if (/^me\/u[a-z0-9]+\.(jpg|png|webp)$/.test(path)) paths.add('img/' + path);
  return paths;
}
async function upload(base64) { return (await api('/git/blobs', 'POST', { content: base64, encoding: 'base64' })).sha; }

// apply(site) вносит правку в самую свежую версию сайта, поэтому чужие изменения не теряются.
async function commit(message, apply, files = []) {
  if (files.some(file => !/^(beta\/)?img\/[a-z0-9-]+\/[a-z0-9-]+\.(jpg|png|webp)$/.test(file.path))) throw Error('Недопустимое имя файла фотографии.');
  for (let attempt = 0; ; attempt++) {
    const latest = await load();
    const next = clone({ catalog: latest.catalog, content: latest.content });
    apply(next);
    const tree = files.map(({ path, sha }) => ({ path, sha, type: 'blob', mode: '100644' }));
    const kept = owned(next);
    for (const path of owned(latest)) if (!kept.has(path)) tree.push({ path, sha: null, type: 'blob', mode: '100644' });
    if (!same(next.catalog, latest.catalog)) tree.push({ path: ROOT + 'catalog.js', type: 'blob', mode: '100644', content: HEAD_CATALOG + JSON.stringify(next.catalog, null, 2) + ';\n' });
    if (!same(next.content, latest.content)) tree.push({ path: ROOT + 'content.js', type: 'blob', mode: '100644', content: HEAD_CONTENT + JSON.stringify(next.content, null, 2) + ';\n' });
    if (!tree.length) { state = latest; return; }
    const parent = await api('/git/commits/' + latest.head);
    const nextTree = await api('/git/trees', 'POST', { base_tree: parent.tree.sha, tree });
    const made = await api('/git/commits', 'POST', { message: (BETA ? '[beta] ' : '') + message, tree: nextTree.sha, parents: [latest.head] });
    try { await api('/git/refs/heads/main', 'PATCH', { sha: made.sha, force: false }); }
    catch (error) { if ((error.status === 422 || error.status === 409) && attempt < 2) continue; throw error; }
    state = { head: made.sha, ...next };
    return;
  }
}

/* ---------- Вход ---------- */

const keep = {
  read() { try { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; } catch { return ''; } },
  write(value, remember) { this.clear(); try { (remember ? localStorage : sessionStorage).setItem(KEY, value); } catch { /* приватный режим: ключ живёт до закрытия вкладки */ } },
  clear() { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch { /* нечего чистить */ } }
};
function signOut() {
  token = ''; state = null; keep.clear();
  for (const key in dirty) dirty[key] = false;
  show('login');
}
function loadDims() {
  if (window.DIMS) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = h('script', { src: (BETA ? '../' : '') + 'img/dims.js?t=' + Date.now(), onload: resolve, onerror: () => reject(Error('Не удалось загрузить список фотографий. Обновите страницу.')) });
    document.head.append(script);
  });
}
async function connect(remember) {
  say('Открываем студию…', 'progress');
  await loadDims();
  state = await load();
  if (remember !== undefined) keep.write(token, remember);
  $('token').value = '';
  show('shoots'); say('');
}
$('auth').onsubmit = event => {
  event.preventDefault();
  token = $('token').value.trim();
  if (!token) return say('Вставьте ключ доступа.', 'error');
  run(() => connect($('remember').checked));
};
$('logout').onclick = () => { if (leave() && confirm('Выйти из студии на этом устройстве? Чтобы войти снова, понадобится ключ.')) { signOut(); say(''); } };

/* ---------- Экраны ---------- */

function show(name) {
  current = name;
  for (const id of ['login', 'shoots', 'editor', 'texts', 'me']) $(id).hidden = id !== name;
  $('tabs').hidden = name === 'login' || name === 'editor';
  $('logout').hidden = name === 'login';
  for (const tab of $('tabs').children) tab.setAttribute('aria-pressed', tab.dataset.tab === name);
  if (name === 'shoots') showEntries();
  if (name === 'texts' && !dirty.texts) showTexts();
  if (name === 'me' && !dirty.me) showSlots();
  scrollTo(0, 0);
}
function leave() {
  const key = current === 'shoots' ? 'order' : current;
  if (!dirty[key]) return true;
  if (!confirm('Есть несохранённые изменения. Уйти без сохранения?')) return false;
  dirty[key] = false;
  if (key === 'order') order = null;
  return true;
}
for (const tab of $('tabs').children) tab.onclick = () => { if (tab.dataset.tab !== current && leave()) { say(''); show(tab.dataset.tab); } };
addEventListener('beforeunload', event => { if (Object.values(dirty).some(Boolean)) event.preventDefault(); });

/* ---------- Список съёмок ---------- */

let order = null;   // новый порядок серий (список id), пока его не сохранили
const filesOf = series => series.files || (series.sizes || window.DIMS[series.id] || []).map((_, i) => i + 1);
const sizesOf = series => series.sizes || window.DIMS[series.id] || [];
const raw = path => 'https://raw.githubusercontent.com/' + REPO + '/' + state.head + '/' + path;
const photoURL = (series, file) => raw(folderOf(series) + fileName(file));

function showEntries() {
  const list = order ? order.map(id => state.catalog.find(s => s.id === id)).filter(Boolean) : state.catalog;
  $('saveOrder').hidden = !dirty.order;
  if (!list.length) return $('entries').replaceChildren(h('p', { className: 'note', textContent: 'Пока нет ни одной съёмки. Нажмите «Добавить съёмку».' }));
  $('entries').replaceChildren(...list.map((series, i) => {
    const visible = series.published !== false, files = filesOf(series);
    const move = step => () => {
      order = list.map(s => s.id);
      [order[i], order[i + step]] = [order[i + step], order[i]];
      dirty.order = true; showEntries();
    };
    const actions = h('div', { className: 'actions' },
      h('button', { type: 'button', textContent: 'Изменить', onclick: () => { if (leave()) openEditor(series); } }),
      h('button', { type: 'button', className: 'icon', textContent: '↑', title: 'Выше', ariaLabel: 'Поднять выше', disabled: i === 0, onclick: move(-1) }),
      h('button', { type: 'button', className: 'icon', textContent: '↓', title: 'Ниже', ariaLabel: 'Опустить ниже', disabled: i === list.length - 1, onclick: move(1) }),
      h('button', { type: 'button', textContent: visible ? 'Снять с сайта' : 'Вернуть на сайт', onclick: () => toggle(series, visible) }));
    const cover = h('img', { alt: '', loading: 'lazy' });
    if (files.length) cover.src = photoURL(series, files[(series.cover || 1) - 1] ?? files[0]);
    return h('div', { className: 'entry' + (visible ? '' : ' is-hidden') }, cover,
      h('div', {}, h('strong', { textContent: series.title }),
        h('small', { textContent: (visible ? 'На сайте' : 'Снята с сайта') + ' · ' + plural(files.length, 'кадр', 'кадра', 'кадров') + (series.titleRu && series.titleRu !== series.title ? ' · ' + series.titleRu : '') })),
      actions);
  }));
}
function toggle(series, visible) {
  if (visible && !confirm('Снять «' + series.title + '» с сайта? Серия и её точка на карте исчезнут, но останутся в студии — их можно вернуть.')) return;
  run(async () => {
    say('Сохраняем…', 'progress');
    await commit((visible ? 'Unpublish ' : 'Restore ') + series.title, site => {
      const row = site.catalog.find(s => s.id === series.id);
      if (row) row.published = !visible;
    });
    showEntries(); say(SAVED);
  });
}
$('saveOrder').onclick = () => run(async () => {
  say('Сохраняем порядок…', 'progress');
  const wanted = order;
  await commit('Reorder series', site => {
    const place = s => { const i = wanted.indexOf(s.id); return i < 0 ? wanted.length : i; };
    site.catalog.sort((a, b) => place(a) - place(b));
  });
  order = null; dirty.order = false; showEntries(); say(SAVED);
});
$('create').onclick = () => { if (leave()) openEditor(null); };

/* ---------- Редактор съёмки ---------- */

let editing = null, draftId = null, photos = [];

function updatePin() {
  const lat = $('lat').valueAsNumber, lon = $('lon').valueAsNumber;
  const ok = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  $('pin').hidden = !ok;
  if (ok) { $('pin').style.left = (lon + 180) / 360 * 100 + '%'; $('pin').style.top = (90 - lat) / 180 * 100 + '%'; }
}
function setPoint(lat, lon) {
  $('lat').value = Number(lat).toFixed(3); $('lon').value = Number(lon).toFixed(3);
  dirty.editor = true; updatePin();
}
function renderPhotos() {
  if (photos.length && !photos.some(p => p.cover.checked)) photos[0].cover.checked = true;
  for (const [i, photo] of photos.entries()) {
    photo.label.textContent = 'Кадр ' + (i + 1) + (photo.file ? ' · новый' : '');
    photo.left.disabled = i === 0; photo.right.disabled = i === photos.length - 1;
    photo.node.classList.toggle('is-cover', photo.cover.checked);
  }
  $('list').replaceChildren(...photos.map(p => p.node));
}
function addPhoto(data) {
  const photo = { ...data };
  const step = delta => () => {
    const i = photos.indexOf(photo);
    photos.splice(i, 1); photos.splice(i + delta, 0, photo);
    dirty.editor = true; renderPhotos();
    (delta < 0 ? (photo.left.disabled ? photo.right : photo.left) : (photo.right.disabled ? photo.left : photo.right)).focus();
  };
  photo.cover = h('input', { type: 'radio', name: 'cover', checked: !!data.isCover, onchange: () => { dirty.editor = true; renderPhotos(); } });
  photo.pick = h('input', { type: 'checkbox', checked: !!data.isSelected, onchange: () => { dirty.editor = true; } });
  photo.label = h('span', { className: 'num' });
  photo.left = h('button', { type: 'button', textContent: '◀', title: 'Раньше', ariaLabel: 'Передвинуть раньше', onclick: step(-1) });
  photo.right = h('button', { type: 'button', textContent: '▶', title: 'Позже', ariaLabel: 'Передвинуть позже', onclick: step(1) });
  const remove = h('button', { type: 'button', textContent: '✕', title: 'Убрать кадр', ariaLabel: 'Убрать кадр', onclick: () => {
    photos.splice(photos.indexOf(photo), 1);
    if (photo.file) URL.revokeObjectURL(photo.url);
    dirty.editor = true; renderPhotos();
  } });
  photo.node = h('article', {}, h('img', { src: photo.url, alt: '', loading: 'lazy' }), photo.label,
    h('label', {}, photo.cover, 'Обложка'), h('label', {}, photo.pick, 'В подборку'),
    h('div', { className: 'moves' }, photo.left, photo.right, remove));
  photos.push(photo);
}
function closeEditor() {
  for (const photo of photos) if (photo.file) URL.revokeObjectURL(photo.url);
  photos = []; editing = null; draftId = null; dirty.editor = false;
  $('editor').reset(); $('list').replaceChildren(); $('places').replaceChildren();
}
function openEditor(series) {
  if (busy) return;
  closeEditor();
  editing = series;
  $('editorTitle').textContent = series ? series.title : 'Новая съёмка';
  $('save').textContent = series ? 'Сохранить изменения' : 'Опубликовать съёмку';
  $('title').value = series?.title || ''; $('russian').value = series?.titleRu || '';
  $('lat').value = series?.lat ?? ''; $('lon').value = series?.lon ?? '';
  $('remove').hidden = !series;
  $('dots').replaceChildren(...state.catalog.filter(s => s.id !== series?.id).map(s =>
    h('i', { title: s.title, style: 'left:' + (s.lon + 180) / 360 * 100 + '%;top:' + (90 - s.lat) / 180 * 100 + '%' })));
  if (series) {
    const sizes = sizesOf(series);
    filesOf(series).forEach((file, i) => addPhoto({ name: file, size: sizes[i], url: photoURL(series, file),
      isCover: i + 1 === (series.cover || 1), isSelected: !!series.selected?.includes(i + 1),
      rank: series.selected?.includes(i + 1) ? series.selected.indexOf(i + 1) : undefined }));
  }
  renderPhotos(); updatePin(); say(''); show('editor');
}
$('cancel').onclick = () => { if (leave()) { closeEditor(); say(''); show('shoots'); } };
$('editor').oninput = () => { dirty.editor = true; };
for (const id of ['lat', 'lon']) $(id).addEventListener('input', updatePin);
$('mapPicker').onclick = event => {
  const box = event.currentTarget.getBoundingClientRect();
  setPoint(90 - 180 * (event.clientY - box.top) / box.height, 360 * (event.clientX - box.left) / box.width - 180);
};
$('photos').onchange = () => {
  const collator = new Intl.Collator('ru', { numeric: true });
  for (const file of [...$('photos').files].sort((a, b) => collator.compare(a.name, b.name))) addPhoto({ file, url: URL.createObjectURL(file) });
  $('photos').value = ''; dirty.editor = true; renderPhotos();
};

// Поиск места по названию (OpenStreetMap). Если сервис молчит, точку всегда можно поставить на карте.
async function findPlace() {
  const query = $('place').value.trim();
  if (!query) return;
  $('places').replaceChildren(h('p', { className: 'note', textContent: 'Ищем…' }));
  try {
    const response = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=ru&q=' + encodeURIComponent(query), { credentials: 'omit', referrerPolicy: 'no-referrer' });
    const found = response.ok ? await response.json() : [];
    if (!found.length) return $('places').replaceChildren(h('p', { className: 'note', textContent: 'Ничего не нашлось. Попробуйте другое название или нажмите на карту.' }));
    $('places').replaceChildren(...found.map(place => h('button', { type: 'button', textContent: place.display_name, onclick: () => {
      setPoint(place.lat, place.lon); $('places').replaceChildren();
      say('Точка поставлена: ' + place.display_name.split(',')[0] + '.');
    } })));
  } catch { $('places').replaceChildren(h('p', { className: 'note', textContent: 'Поиск сейчас недоступен. Поставьте точку нажатием на карту.' })); }
}
$('find').onclick = findPlace;
$('place').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); findPlace(); } };

async function readImage(file) {
  const url = URL.createObjectURL(file), image = new Image();
  image.src = url;
  try { await image.decode(); }
  catch { throw Error('Не удалось прочитать «' + file.name + '». Подойдут фотографии JPEG, PNG и WebP.'); }
  finally { URL.revokeObjectURL(url); }
  return image;
}
function encode(canvas, type, quality) {
  const data = canvas.toDataURL(type, quality), real = data.slice(5, data.indexOf(';'));
  if (!data.includes(',') || data.length < 64) throw Error('Не удалось подготовить фотографию. Попробуйте другой файл.');
  return { base64: data.split(',')[1], type: real };
}
async function prepareFrame(file) {
  const image = await readImage(file);
  const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = h('canvas', { width: Math.max(1, Math.round(image.naturalWidth * scale)), height: Math.max(1, Math.round(image.naturalHeight * scale)) });
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { base64: encode(canvas, 'image/jpeg', .92).base64, size: [canvas.width, canvas.height] };
}
$('editor').onsubmit = event => {
  event.preventDefault();
  run(async () => {
    const title = $('title').value.trim(), titleRu = $('russian').value.trim() || title;
    const lat = $('lat').valueAsNumber, lon = $('lon').valueAsNumber;
    if (!title) { $('title').focus(); throw Error('Введите название съёмки.'); }
    if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) { $('mapPicker').scrollIntoView({ block: 'center' }); throw Error('Поставьте точку на карте: нажмите на карту или найдите место по названию.'); }
    if (!photos.length) throw Error('Добавьте хотя бы одну фотографию.');
    const slug = title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'shoot';
    draftId ||= editing?.id || slug + '-' + unique().slice(1);
    const id = draftId, base = editing || (BETA ? { betaMedia: true } : {});
    const fresh = photos.filter(p => p.file);
    for (const [i, photo] of fresh.entries()) {
      if (photo.sha) continue;
      say('Загружаем фото ' + (i + 1) + ' из ' + fresh.length + '…', 'progress');
      const { base64, size } = await prepareFrame(photo.file);
      photo.sha = await upload(base64); photo.size = size; photo.name = unique();
    }
    const files = photos.map(p => p.name), sizes = photos.map(p => p.size);
    // Кадры подборки сохраняют прежнюю очерёдность, новые отметки встают в конец.
    const picked = photos.flatMap((p, i) => p.pick.checked ? [{ at: i + 1, rank: p.rank ?? Infinity }] : []).sort((a, b) => a.rank - b.rank || a.at - b.at).map(p => p.at);
    const row = { id, title, titleRu, lat, lon, cover: photos.findIndex(p => p.cover.checked) + 1, selected: picked };
    // Серия со старыми номерами кадров и без перестановок остаётся в каталоге как была.
    const untouched = editing && !editing.files && same(files, filesOf(editing));
    if (!untouched) Object.assign(row, { files, sizes });
    say('Публикуем…', 'progress');
    await commit((editing ? 'Update ' : 'Add ') + title, site => {
      const i = site.catalog.findIndex(s => s.id === id);
      if (i < 0) site.catalog.push({ ...base, ...row }); else site.catalog[i] = { ...site.catalog[i], ...row };
    }, fresh.map(p => ({ path: folderOf({ ...base, id }) + fileName(p.name), sha: p.sha })));
    closeEditor(); show('shoots'); say(SAVED);
  });
};
$('remove').onclick = () => {
  const series = editing;
  if (!series || !confirm('Удалить съёмку «' + series.title + '» навсегда?\n\nИсчезнут серия, её точка на карте и загруженные через студию фотографии. Вернуть её будет нельзя.\n\nЕсли нужно только спрятать серию — нажмите «Отмена» и выберите «Снять с сайта».')) return;
  run(async () => {
    say('Удаляем…', 'progress');
    await commit('Delete ' + series.title, site => { site.catalog = site.catalog.filter(s => s.id !== series.id); });
    closeEditor(); show('shoots'); say('Съёмка удалена. Сайт обновится через 1–2 минуты.');
  });
};

/* ---------- Тексты и контакты ---------- */

const GROUPS = { site: 'Имя и контакты', hero: 'Первый экран', portfolio: 'Портфолио и карта', selected: 'Подборка работ', about: 'Обо мне', services: 'Услуги и цены', contacts: 'Низ страницы', nav: 'Меню сайта' };
const LABELS = {
  'site.name': 'Имя', 'site.nameLatin': 'Имя на первом экране (две строки)', 'site.tagline': 'Чем вы занимаетесь', 'site.city': 'Город',
  'site.geoShort': 'Где снимаете (короткая строка)', 'site.telegram': 'Ссылка на Telegram', 'site.telegramLabel': 'Надпись ссылки Telegram',
  'site.instagram': 'Ссылка на Instagram', 'site.instagramLabel': 'Надпись ссылки Instagram',
  'hero.intro': 'Вступительный текст', 'hero.ctaWorks': 'Кнопка «к съёмкам»', 'hero.ctaContact': 'Кнопка «связаться»',
  'portfolio.label': 'Крупный заголовок', 'portfolio.subtitle': 'Подзаголовок', 'portfolio.lead': 'Вступление', 'portfolio.mapNote': 'Пояснение к карте', 'portfolio.hint': 'Подсказка у карты',
  'selected.label': 'Крупный заголовок', 'selected.title': 'Подзаголовок',
  'about.label': 'Крупный заголовок', 'about.title': 'Приветствие', 'about.paragraphs': 'Абзацы рассказа о себе',
  'services.label': 'Крупный заголовок', 'services.title': 'Подзаголовок', 'services.lead': 'Вступление', 'services.formats': 'Форматы съёмки',
  'services.formats.kicker': 'Надпись над названием', 'services.formats.title': 'Название формата', 'services.formats.price': 'Строка о цене (можно оставить пустой)',
  'services.formats.text': 'Описание', 'services.formats.includes': 'Что входит', 'services.price': 'Общая строка о цене', 'services.cta': 'Кнопка',
  'services.details': 'Подробности (заголовок и текст)', 'services.details.0': 'Заголовок', 'services.details.1': 'Текст',
  'contacts.label': 'Крупный заголовок', 'contacts.invite': 'Приглашение написать', 'nav': 'Пункты меню', 'nav.label': 'Название пункта'
};
const HIDDEN = new Set(['selected.order', 'media', 'nav.href']);
const FIXED = new Set(['site.nameLatin', 'nav']);          // списки, в которых нельзя добавлять и убирать строки
const LONG = new Set(['hero.intro', 'portfolio.lead', 'portfolio.mapNote', 'about.paragraphs', 'services.lead', 'services.formats.text', 'services.details.1', 'contacts.invite', 'site.geoShort']);
const LINKS = new Set(['site.telegram', 'site.instagram']);
let draft = null;

const touchTexts = () => { dirty.texts = true; };
function grow(area) { area.style.height = 'auto'; area.style.height = area.scrollHeight + 2 + 'px'; }
function textField(owner, key, name, caption) {
  const long = LONG.has(name);
  const input = h(long ? 'textarea' : 'input', { value: owner[key] ?? '' });
  if (long) { input.rows = 3; input.addEventListener('input', () => grow(input)); } else input.type = LINKS.has(name) ? 'url' : 'text';
  if (LINKS.has(name)) { input.inputMode = 'url'; input.dataset.link = caption; }
  input.addEventListener('input', () => { owner[key] = input.value; touchTexts(); });
  return h('label', {}, caption, input);
}
function blank(sample) {
  if (Array.isArray(sample)) return sample.every(item => typeof item === 'string') ? sample.map(() => '') : [];
  if (sample && typeof sample === 'object') return Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, blank(v)]));
  return '';
}
function listField(list, name) {
  const box = h('div', {}), fixed = FIXED.has(name);
  const sample = list.find(item => item && typeof item === 'object');
  if (sample && !Array.isArray(sample)) {   // у всех строк списка один и тот же набор полей
    const union = Object.assign({}, ...list);
    list.forEach((item, i) => { list[i] = Object.fromEntries(Object.keys(union).map(k => [k, item[k] ?? (Array.isArray(union[k]) ? [] : '')])); });
  }
  const draw = () => {
    box.replaceChildren(...list.map((item, i) => {
      const body = typeof item === 'string' ? textField(list, i, name, fixed ? 'Строка ' + (i + 1) : '')
        : Array.isArray(item) ? h('div', {}, ...item.map((_, j) => textField(item, j, name + '.' + j, LABELS[name + '.' + j] || '')))
        : fields(item, name);
      if (fixed) return h('div', { className: 'item' }, body);
      return h('div', { className: 'item' }, h('div', { className: 'rowhead' }, h('span', { textContent: '№ ' + (i + 1) }),
        h('button', { type: 'button', textContent: 'Убрать', onclick: () => { list.splice(i, 1); touchTexts(); draw(); } })), body);
    }));
    if (!fixed) box.append(h('button', { type: 'button', className: 'add', textContent: '+ Добавить', onclick: () => {
      list.push(list.length ? blank(list[0]) : ''); touchTexts(); draw();
      box.querySelector('.item:last-of-type input, .item:last-of-type textarea')?.focus();
    } }));
    for (const area of box.querySelectorAll('textarea')) grow(area);
  };
  draw();
  return box;
}
function fields(owner, path) {
  const box = h('div', {});
  for (const key of Object.keys(owner)) {
    const name = path ? path + '.' + key : key, value = owner[key];
    if (HIDDEN.has(name)) continue;
    if (typeof value === 'string') box.append(textField(owner, key, name, LABELS[name] || key));
    else if (Array.isArray(value)) box.append(h('div', { className: 'sub', textContent: LABELS[name] || key }), listField(value, name));
    else if (value && typeof value === 'object') box.append(h('div', { className: 'sub', textContent: LABELS[name] || key }), fields(value, name));
  }
  return box;
}
function showTexts() {
  draft = clone(state.content);
  $('textForm').replaceChildren(...Object.keys(draft).filter(key => !HIDDEN.has(key)).map(key => {
    const body = Array.isArray(draft[key]) ? listField(draft[key], key) : fields(draft[key], key);
    const group = h('details', { className: 'group' }, h('summary', { textContent: GROUPS[key] || key }), body);
    group.addEventListener('toggle', () => { for (const area of group.querySelectorAll('textarea')) grow(area); });
    return group;
  }));
}
$('saveTexts').onclick = () => run(async () => {
  for (const input of $('textForm').querySelectorAll('[data-link]')) {
    if (!/^https:\/\/[^\s"'<>]+$/.test(input.value.trim())) {
      input.closest('details').open = true; input.focus();
      throw Error('«' + input.dataset.link + '» должна начинаться с https:// и не содержать пробелов.');
    }
  }
  const texts = clone(draft);
  say('Сохраняем тексты…', 'progress');
  await commit('Update texts', site => {
    // Порядок подборки и личные фото живут в других разделах студии — их не трогаем.
    const { media } = site.content, order = site.content.selected?.order;
    site.content = clone(texts);
    if (media) site.content.media = media;
    if (order) site.content.selected.order = order;
  });
  dirty.texts = false; showTexts(); say(SAVED);
});

/* ---------- Мои фото ---------- */

const SLOTS = [
  { key: 'hero', title: 'Главное фото', hint: 'Первое, что видит гость сайта. Квадратный кадр.', w: 1280, h: 1280, file: 'me/01.jpg' },
  { key: 'cutout', title: 'Силуэт без фона', hint: 'По желанию. Тот же главный кадр, но с прозрачным фоном (PNG или WebP): имя на первом экране проходит за фигурой. Если заменить главное фото без силуэта, сайт покажет имя поверх фото.', w: 1280, h: 1280, file: 'me/01-cutout.webp', alpha: true },
  { key: 'portrait', title: 'Портрет', hint: 'Маленький квадратный портрет в разделе «Обо мне».', w: 640, h: 640, file: 'me/portrait.jpg' },
  { key: 'about1', title: 'Обо мне — первое фото', hint: 'Вертикальный кадр 3:4.', w: 960, h: 1280, file: 'me/02.jpg' },
  { key: 'about2', title: 'Обо мне — второе фото', hint: 'Вертикальный кадр 3:4.', w: 960, h: 1280, file: 'me/03.jpg' }
];
let pending = {};   // key → { file, url, focus } или { reset: true }

function showSlots() {
  for (const change of Object.values(pending)) if (change.url) URL.revokeObjectURL(change.url);
  pending = {};
  const media = state.content.media || {};
  $('slots').replaceChildren(...SLOTS.map(slot => {
    const saved = media[slot.key] || '';
    const image = h('img', { alt: '' });
    const frame = h('div', { className: 'frame', style: 'aspect-ratio:' + slot.w + '/' + slot.h }, image);
    const note = h('p', { className: 'note' });
    const range = h('input', { type: 'range', min: 0, max: 100, value: 50, ariaLabel: 'Сдвиг кадра' });
    const rangeBox = h('label', { hidden: true }, 'Сдвиг кадра', range);
    const node = h('div', { className: 'slot' }, frame);
    const paint = () => {
      const change = pending[slot.key], path = change?.reset ? '' : saved;
      node.classList.toggle('is-new', !!change);
      rangeBox.hidden = !change?.file;
      image.hidden = !change?.file && path === 'none';
      image.style.objectPosition = change?.file ? change.focus + '% ' + change.focus + '%' : '';
      if (change?.file) image.src = change.url; else if (path !== 'none') image.src = raw('img/' + (path || slot.file));
      note.textContent = change?.file ? 'Новое фото выбрано — не забудьте сохранить.' : change?.reset ? 'Вернётся исходное фото — не забудьте сохранить.'
        : path === 'none' ? 'Сейчас силуэта нет.' : path ? 'Сейчас стоит ваше фото.' : 'Сейчас стоит исходное фото.';
      back.hidden = !saved || !!change?.reset;
    };
    const input = h('input', { type: 'file', accept: slot.alpha ? 'image/png,image/webp' : 'image/jpeg,image/png,image/webp', onchange: () => {
      const file = input.files[0];
      if (!file) return;
      if (pending[slot.key]?.url) URL.revokeObjectURL(pending[slot.key].url);
      pending[slot.key] = { file, url: URL.createObjectURL(file), focus: 50 };
      range.value = 50; input.value = ''; dirty.me = true; paint();
    } });
    range.oninput = () => { pending[slot.key].focus = Number(range.value); paint(); };
    const back = h('button', { type: 'button', textContent: 'Вернуть исходное', onclick: () => {
      if (pending[slot.key]?.url) URL.revokeObjectURL(pending[slot.key].url);
      pending[slot.key] = { reset: true }; dirty.me = true; paint();
    } });
    node.append(h('div', {}, h('h2', { textContent: slot.title }), h('p', { className: 'note', textContent: slot.hint }), note,
      h('label', { className: 'picker' }, 'Выбрать фото', input), back, rangeBox));
    paint();
    return node;
  }));
}
async function prepareSlot(slot, change) {
  const image = await readImage(change.file);
  const scale = Math.max(slot.w / image.naturalWidth, slot.h / image.naturalHeight);
  const sw = slot.w / scale, sh = slot.h / scale, f = change.focus / 100;
  const canvas = h('canvas', { width: slot.w, height: slot.h });
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!slot.alpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, slot.w, slot.h); }
  ctx.drawImage(image, (image.naturalWidth - sw) * f, (image.naturalHeight - sh) * f, sw, sh, 0, 0, slot.w, slot.h);
  if (!slot.alpha) return { ...encode(canvas, 'image/jpeg', .9), ext: 'jpg' };
  const webp = encode(canvas, 'image/webp', .9);   // Safari не умеет WebP из холста и отдаёт PNG
  return webp.type === 'image/webp' ? { ...webp, ext: 'webp' } : { ...encode(canvas, 'image/png'), ext: 'png' };
}
$('saveMe').onclick = () => run(async () => {
  const changes = Object.entries(pending);
  if (!changes.length) return say('Сначала выберите новое фото.', 'error');
  const files = [], values = {};
  for (const [i, [key, change]] of changes.entries()) {
    if (change.reset) { values[key] = ''; continue; }
    say('Загружаем фото ' + (i + 1) + ' из ' + changes.length + '…', 'progress');
    if (!change.sha) {
      const ready = await prepareSlot(SLOTS.find(slot => slot.key === key), change);
      change.sha = await upload(ready.base64); change.path = 'me/' + unique() + '.' + ready.ext;
    }
    files.push({ path: 'img/' + change.path, sha: change.sha }); values[key] = change.path;
  }
  // Силуэт вырезан из главного фото: с новым главным кадром старый силуэт не совпадёт.
  if ('hero' in values && !('cutout' in values)) values.cutout = values.hero ? 'none' : '';
  say('Сохраняем…', 'progress');
  await commit('Update personal photos', site => { site.content.media = { hero: '', cutout: '', portrait: '', about1: '', about2: '', ...site.content.media, ...values }; }, files);
  dirty.me = false; showSlots(); say(SAVED);
});

/* ---------- Запуск ---------- */

if (BETA) { $('betaTag').hidden = false; document.title = 'Бета · ' + document.title; }
const fromLink = location.hash.match(/^#key=([\w-]+)$/);   // ссылка-приглашение: ключ сразу стираем из адреса
if (fromLink) history.replaceState(null, '', location.pathname);
token = fromLink ? fromLink[1] : keep.read();
if (token) run(() => connect(fromLink ? true : undefined));
