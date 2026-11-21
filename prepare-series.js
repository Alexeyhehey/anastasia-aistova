import { desktop, authorize, loadCatalog, uploadPhoto, publish } from './studio-api.js?v=3';

const el = id => document.getElementById(id);
const number = n => String(n).padStart(2, '0');
const dimensions = s => s.sizes || window.DIMS[s.id];
const preview = (s, n) => 'https://raw.githubusercontent.com/Alexeyhehey/anastasia-aistova/' + snapshot.head + '/img/' + s.id + '/' + number(n) + '.jpg';
let snapshot, editing, draftId, photos = [], busy = false;

function message(text) { el('status').textContent = text; }
function makeButton(text, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = text;
  button.addEventListener('click', action);
  return button;
}
async function run(task) {
  if (busy) return;
  busy = true;
  el('fields').disabled = true;
  el('workspace').inert = true;
  try { await task(); }
  catch (error) { message(error.message || 'Не удалось завершить действие. Попробуйте ещё раз.'); }
  finally { busy = false; el('fields').disabled = false; el('workspace').inert = false; }
}
function showEntries() {
  el('shoots').replaceChildren();
  for (const s of snapshot.items) {
    const row = document.createElement('div');
    row.className = 'entry';
    const image = new Image();
    image.src = preview(s, s.cover || 1); image.alt = '';
    const text = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('small');
    title.textContent = s.title;
    const visible = s.published !== false;
    detail.textContent = (visible ? 'На сайте' : 'Снята с сайта') + ' · кадров ' + dimensions(s).length;
    text.append(title, detail);
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(makeButton('Изменить', () => openEditor(s)), makeButton(visible ? 'Снять с сайта' : 'Вернуть на сайт', () => run(async () => {
      if (visible && !confirm('Снять «' + s.title + '» с сайта? Точка, обложка и кадры этой серии в подборке исчезнут. Съёмку можно вернуть.')) return;
      message('Сохраняем изменение…');
      const items = snapshot.items.map(item => item.id === s.id ? { ...item, published: !visible } : item);
      snapshot = await publish(snapshot, items, [], (visible ? 'Unpublish ' : 'Restore ') + s.title);
      closeEditor(); showEntries();
      message('Сохранено. GitHub Pages обновит сайт после сборки.');
    })));
    row.append(image, text, actions);
    el('shoots').append(row);
  }
}
function clearPhotos() {
  for (const photo of photos) if (photo.file) URL.revokeObjectURL(photo.url);
  photos = [];
  el('list').replaceChildren();
}
function closeEditor() {
  clearPhotos(); el('editor').hidden = true; el('workspace').hidden = false;
  el('editor').reset(); editing = null;
}
function updatePin() {
  const lat = el('lat').valueAsNumber, lon = el('lon').valueAsNumber;
  el('pin').hidden = !Number.isFinite(lat) || !Number.isFinite(lon);
  el('pin').style.left = ((lon + 180) / 360 * 100) + '%';
  el('pin').style.top = ((90 - lat) / 180 * 100) + '%';
}
function photoList() {
  const cards = photos.map((photo, i) => {
    const card = document.createElement('article');
    const img = new Image(); img.src = photo.url; img.loading = 'lazy'; img.alt = '';
    const label = document.createElement('small');
    label.textContent = photo.file?.name || 'Кадр ' + number(i + 1);
    const cover = document.createElement('input');
    cover.type = 'radio'; cover.name = 'cover'; cover.value = i + 1;
    cover.checked = i + 1 === (editing?.cover || 1);
    const selected = document.createElement('input');
    selected.type = 'checkbox'; selected.checked = !!editing?.selected?.includes(i + 1);
    photo.selected = selected;
    const a = document.createElement('label'), b = document.createElement('label');
    a.append(cover, ' Обложка'); b.append(selected, ' В подборку'); card.append(img, label, a, b);
    return card;
  });
  el('list').replaceChildren(...cards);
}
function openEditor(s = null) {
  if (busy) return;
  closeEditor();
  editing = s;
  draftId = null;
  el('workspace').hidden = true; el('editor').hidden = false;
  el('editorTitle').textContent = s ? 'Редактирование съёмки' : 'Новая съёмка';
  el('save').textContent = s ? 'Сохранить изменения' : 'Опубликовать съёмку';
  el('title').value = s?.title || ''; el('russian').value = s?.titleRu || '';
  el('lat').value = s?.lat ?? ''; el('lon').value = s?.lon ?? '';
  el('pickerLabel').hidden = !!s;
  el('photos').required = !s;
  if (s) { photos = dimensions(s).map((_, i) => ({ url: preview(s, i + 1) })); photoList(); }
  updatePin(); message(''); el('title').focus();
}
el('create').onclick = () => openEditor();
el('cancel').onclick = () => { closeEditor(); message(''); };
el('mapPicker').onclick = event => {
  const r = event.currentTarget.getBoundingClientRect();
  el('lat').value = (90 - 180 * (event.clientY - r.top) / r.height).toFixed(3);
  el('lon').value = (360 * (event.clientX - r.left) / r.width - 180).toFixed(3);
  updatePin();
};
for (const id of ['lat', 'lon']) el(id).oninput = updatePin;
el('photos').onchange = () => {
  clearPhotos();
  const collator = new Intl.Collator('ru', { numeric: true });
  photos = [...el('photos').files].sort((a,b) => collator.compare(a.name,b.name)).map(file => ({ file, url: URL.createObjectURL(file) }));
  photoList();
};

async function prepareImage(photo) {
  const image = new Image(); image.src = photo.url;
  try { await image.decode(); } catch { throw Error('Не удалось прочитать ' + photo.file.name + '. Выберите JPEG, PNG или WebP.'); }
  const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const base64 = canvas.toDataURL('image/jpeg', .92).split(',')[1];
  if (!base64) throw Error('Не удалось подготовить ' + photo.file.name + '.');
  return { base64, size: [canvas.width, canvas.height] };
}
el('editor').onsubmit = event => {
  event.preventDefault();
  run(async () => {
    const title = el('title').value.trim(), titleRu = el('russian').value.trim() || title;
    if (!title) throw Error('Введите название съёмки.');
    if (!photos.length) throw Error('Выберите фотографии.');
    const slug = title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48) || 'shoot';
    draftId ||= editing?.id || (slug + '-' + crypto.randomUUID().slice(0,8));
    const id = draftId;
    const row = { ...editing, id, title, titleRu, lat: el('lat').valueAsNumber, lon: el('lon').valueAsNumber,
      cover: Number(el('list').querySelector('[name=cover]:checked')?.value || 1),
      selected: photos.flatMap((p,i) => p.selected.checked ? [i+1] : []) };
    const files = [];
    if (!editing) {
      row.sizes = [];
      for (const [i,p] of photos.entries()) {
        message('Готовим кадр ' + (i+1) + ' из ' + photos.length + '…');
        if (!p.blob) {
          const { base64, size } = await prepareImage(p);
          p.blob = { sha: await uploadPhoto(base64), size };
        }
        files.push({ path: 'img/' + id + '/' + number(i+1) + '.jpg', sha: p.blob.sha });
        row.sizes.push(p.blob.size);
      }
    }
    const items = editing ? snapshot.items.map(s => s.id === id ? row : s) : [...snapshot.items, row];
    message('Публикуем каталог…');
    snapshot = await publish(snapshot, items, files, (editing ? 'Update ' : 'Add ') + title);
    closeEditor(); showEntries(); message('Сохранено. GitHub Pages обновит сайт после сборки.');
  });
};
async function connect() {
  message('Загружаем каталог…');
  snapshot = await loadCatalog();
  el('login').hidden = true; el('workspace').hidden = false; el('token').value = '';
  showEntries(); message('');
}
el('auth').onsubmit = event => {
  event.preventDefault(); authorize(el('token').value.trim()); run(connect);
};
el('reload').onclick = () => run(connect);
if (desktop) { el('login').hidden = true; el('workspace').hidden = false; run(connect); }
