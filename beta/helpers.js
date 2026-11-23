// Общие помощники сайта. Тексты лежат в content.js, серии — в catalog.js: оба файла переписывает студия.
window.escapePortfolioText = value => String(value).replace(/[&<>"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
})[char]);

// Кадр серии по его месту в галерее. files — имена файлов по порядку (число = старый номер NN.jpg).
window.seriesFile = (series, number) => series.files ? series.files[number - 1] : number;
window.seriesPhoto = (series, number) => {
  const file = window.seriesFile(series, number);
  return (series.betaMedia ? 'img/' : '../img/') + series.id + '/' + (typeof file === 'number' ? String(file).padStart(2, '0') : file) + '.jpg';
};
// Личные фото (первый экран, «обо мне»), которые заменили в студии.
window.sitePhoto = path => '../img/' + path;

// Крупные надписи уменьшаются сами, если слово не помещается в свою колонку: тексты и названия меняет заказчица.
(() => {
  const SELECTOR = '.hero-name-line, .series-hero h1, .series-card-title, .next-series span, .section-intro h2, .selected-head h2, .about-grid h2, .formats-heading h2, .format-title h3, .contact-giant, .nav';
  const range = document.createRange();
  // Сколько места есть внутри полей и сколько занимает сама надпись.
  const room = node => { const style = getComputedStyle(node); return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight); };
  const need = node => { range.selectNodeContents(node); return range.getBoundingClientRect().width; };
  const overflows = node => need(node) > room(node) + 1;
  function fit() {
    const nodes = [...document.querySelectorAll(SELECTOR)];
    // Без плавных переходов: иначе размер меняется не сразу, и замер врёт.
    for (const node of nodes) { node.style.transition = 'none'; node.style.fontSize = ''; node.classList.remove('is-tight'); node.style.overflowWrap = 'normal'; }
    for (const node of nodes) {
      if (!node.clientWidth) continue;
      const full = parseFloat(getComputedStyle(node).fontSize), least = Math.min(full, Math.max(full * .55, 9));
      let size = full;
      for (let step = 0; step < 6 && size > least && overflows(node); step++) {
        size = Math.max(least, Math.floor(size * room(node) / need(node) * 9.8) / 10);
        node.style.fontSize = size + 'px';
      }
      // Меньше уже нечитаемо: надпись возвращается к полному размеру и переносится (меню — прокручивается).
      if (overflows(node)) { if (!node.matches('.nav')) node.style.fontSize = ''; node.classList.add('is-tight'); }
    }
    for (const node of nodes) node.style.overflowWrap = '';
    document.body.offsetWidth;
    for (const node of nodes) node.style.transition = '';
  }
  window.fitHeadings = fit;
  document.addEventListener('DOMContentLoaded', () => {
    const page = document.getElementById('series');
    let width = '', queued = false;
    fit();
    document.fonts?.ready.then(fit);
    if (page) new MutationObserver(fit).observe(page, { childList: true });
    const watch = () => {
      const next = document.documentElement.clientWidth + ':' + (page ? page.clientWidth : 0);
      if (next === width || queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; width = next; fit(); });
    };
    if ('ResizeObserver' in window) { const observer = new ResizeObserver(watch); observer.observe(document.documentElement); if (page) observer.observe(page); }
    else window.addEventListener('resize', watch, { passive: true });
  });
})();
