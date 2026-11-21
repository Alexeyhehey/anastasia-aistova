// One change to main makes a whole shoot visible, together with its map point.
const repo = 'https://api.github.com/repos/Alexeyhehey/anastasia-aistova';
const local = location.hostname === '127.0.0.1' && location.pathname.startsWith('/studio/');
const prefix = 'window.AISTOVA_SERIES = ';
let token = '';
export const desktop = local;
export function authorize(value) { token = value; }

async function request(path, method = 'GET', body) {
  const url = (local ? '/api' : repo) + path;
  const headers = { Accept: 'application/vnd.github+json' };
  if (local) headers['X-Studio-Session'] = location.pathname.split('/')[2];
  else if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, {
    method, headers, cache: 'no-store', redirect: 'error', credentials: 'omit',
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    const reason = ({
      401: 'Заново войдите в GitHub или проверьте ключ доступа.',
      403: 'Для записи нужен доступ к репозиторию сайта. Проверьте права аккаунта и лимит запросов GitHub.',
      404: 'GitHub не нашёл репозиторий или каталог. Проверьте доступ своего аккаунта.',
      409: 'Каталог уже изменился. Обновите список и повторите действие.',
      422: 'GitHub отклонил изменение. Обновите список и проверьте данные.'
    })[response.status];
    throw Error(reason || 'Не удалось связаться с GitHub (' + response.status + '). Проверьте соединение.');
  }
  return response.json();
}

export async function loadCatalog() {
  const ref = await request('/git/ref/heads/main');
  const head = ref.object.sha;
  const file = await request('/contents/beta/catalog.js?ref=' + head);
  const content = new TextDecoder().decode(Uint8Array.from(atob(file.content), c => c.charCodeAt(0))).trim();
  if (!content.startsWith(prefix) || !content.endsWith(';')) throw Error('Формат каталога изменился. Скачайте свежую версию студии.');
  return { head, items: JSON.parse(content.slice(prefix.length, -1)) };
}

export async function uploadPhoto(base64) {
  const blob = await request('/git/blobs', 'POST', { content: base64, encoding: 'base64' });
  return blob.sha;
}

export async function publish(snapshot, items, files, message) {
  if (files.some(file => !/^beta\/img\/[a-z0-9-]+\/\d+\.jpg$/.test(file.path))) {
    throw Error('Фотографии бета-студии должны находиться в папке beta/img.');
  }
  const latest = await loadCatalog();
  if (latest.head !== snapshot.head) {
    // Preserve unrelated edits and reconcile a previous save whose response was lost.
    const changed = items.find(s => JSON.stringify(s) !== JSON.stringify(snapshot.items.find(old => old.id === s.id)));
    if (!changed) return latest;
    const previous = snapshot.items.find(s => s.id === changed.id);
    const now = latest.items.find(s => s.id === changed.id);
    if (JSON.stringify(now) === JSON.stringify(changed)) return latest;
    if (JSON.stringify(previous) !== JSON.stringify(now)) {
      throw Error('Эту съёмку уже изменили. Закройте форму, обновите список и проверьте новую версию.');
    }
    items = now ? latest.items.map(s => s.id === changed.id ? changed : s) : [...latest.items, changed];
    snapshot = latest;
  }
  const parent = await request('/git/commits/' + snapshot.head);
  const tree = files.map(({ path, sha }) => ({ path, sha, type: 'blob', mode: '100644' }));
  tree.push({ path: 'beta/catalog.js', type: 'blob', mode: '100644', content: prefix + JSON.stringify(items, null, 2) + ';\n' });
  const nextTree = await request('/git/trees', 'POST', { base_tree: parent.tree.sha, tree });
  const commit = await request('/git/commits', 'POST', { message: '[beta] ' + message, tree: nextTree.sha, parents: [snapshot.head] });
  await request('/git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false });
  return { head: commit.sha, items };
}
