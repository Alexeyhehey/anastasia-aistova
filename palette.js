(() => {
  const key = 'aistova-theme';
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const normalize = value => value === 'white' || value === 'burgundy' ? 'white' : 'black';
  let current;
  let control;

  function render(value) {
    current = normalize(value);
    const white = current === 'white';
    root.dataset.theme = current;
    meta.content = white ? '#ffffff' : '#000000';
    if (control) {
      const label = white ? 'Чёрная тема' : 'Белая тема';
      control.querySelector('span').textContent = label;
      control.title = white ? 'Включить чёрную тему' : 'Включить белую тему';
      control.setAttribute('aria-label', control.title);
    }
  }

  let saved;
  try { saved = localStorage.getItem(key); } catch {}
  render(saved);
  root.classList.add('js');
  if (saved === 'burgundy') {
    try { localStorage.setItem(key, current); } catch {}
  }
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) render(event.newValue);
  });
  document.addEventListener('DOMContentLoaded', () => {
    control = document.getElementById('themeToggle');
    render(current);
    control.addEventListener('click', () => {
      render(current === 'white' ? 'black' : 'white');
      try { localStorage.setItem(key, current); } catch {}
    });
  });
})();
