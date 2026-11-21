const byId = id => document.getElementById(id);
const collator = new Intl.Collator('ru', { numeric: true });
let photos = [];

byId('photos').addEventListener('change', () => {
  for (const photo of photos) URL.revokeObjectURL(photo.url);
  byId('list').replaceChildren();
  byId('result').hidden = true;
  photos = [...byId('photos').files].sort((a, b) => collator.compare(a.name, b.name)).map(file => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    image.alt = '';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const label = document.createElement('label');
    label.append(image, checkbox, ' В SELECTED · ', file.name);
    byId('list').append(label);
    return { file, url, image, checkbox };
  });
});

async function prepare() {
  const id = byId('slug').value;
  if (['intro', 'me', 'selected', ...window.CONTENT.series.map(s => s.id)].includes(id)) {
    throw Error('Это имя папки уже занято. Выберите другое.');
  }
  const title = byId('title').value.trim(), titleRu = byId('russian').value.trim();
  if (!title || !titleRu || /[<>&"]/.test(title + titleRu)) throw Error('Введите названия без двойных кавычек, угловых скобок и амперсанда.');
  if (!window.showDirectoryPicker) throw Error('Для сохранения папки откройте страницу в настольном Chrome или Edge.');
  const root = await window.showDirectoryPicker({ mode: 'readwrite' });
  for await (const name of root.keys()) {
    if (name.toLowerCase() === id) throw Error('В выбранном месте уже есть такая папка. Выберите другое место.');
  }
  const series = { id, title, titleRu, lat: byId('lat').valueAsNumber, lon: byId('lon').valueAsNumber, sizes: [], selected: [] };
  // Проверяем все изображения до создания файлов.
  for (const { file, image } of photos) {
    if (!/\.jpe?g$/i.test(file.name)) throw Error('Выберите только файлы JPEG.');
    await image.decode();
  }
  const dir = await root.getDirectoryHandle(id, { create: true });
  for (const [index, { image, checkbox }] of photos.entries()) {
    const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
    if (!jpg) throw Error('Не удалось подготовить JPEG. Повторите в новой папке.');
    const number = index + 1;
    const handle = await dir.getFileHandle(String(number).padStart(2, '0') + '.jpg', { create: true });
    const stream = await handle.createWritable();
    await stream.write(jpg);
    await stream.close();
    series.sizes.push([canvas.width, canvas.height]);
    if (checkbox.checked) series.selected.push(number);
    byId('status').textContent = 'Сохранено кадров: ' + number + ' / ' + photos.length;
  }
  byId('snippet').value = '    ' + JSON.stringify(series) + ',';
  byId('result').hidden = false;
  byId('status').textContent = 'Папка ' + id + ' готова. Теперь опубликуйте её и запись ниже.';
}
byId('editor').addEventListener('submit', async event => {
  event.preventDefault();
  byId('result').hidden = true;
  byId('fields').disabled = true;
  try { await prepare(); }
  catch (error) { byId('status').textContent = error.name === 'AbortError' ? 'Сохранение отменено.' : error.message; }
  finally { byId('fields').disabled = false; }
});
byId('copy').addEventListener('click', async () => {
  byId('snippet').select();
  try { await navigator.clipboard.writeText(byId('snippet').value); byId('status').textContent = 'Запись скопирована.'; }
  catch { byId('status').textContent = 'Запись выделена. Нажмите Ctrl+C или ⌘C.'; }
});
