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
