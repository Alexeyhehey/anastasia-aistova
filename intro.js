// Заставка: настоящий счётчик загрузки → три панели серий «пум-пум-пум» → серия быстрых кадров →
// вспышка затвора → имя по буквам → занавес уходит вверх и открывает первый экран.
(() => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  class CinematicIntro {
    constructor({ element, series, shotsPerSeries = 4, reducedMotion }) {
      this.element = element;
      this.series = series;            // [{ id, title }]
      this.shots = shotsPerSeries;
      this.reducedMotion = reducedMotion;
      this.counter = element.querySelector('#introCount');
      this.line = element.querySelector('#introLine');
      this.panels = [...element.querySelectorAll('.intro-panel')];
      this.name = element.querySelector('#introName');
      this.done = false;
      this.shown = 0;                  // число на счётчике сейчас
      this.target = 0;                 // к какому числу счётчик идёт
    }

    shouldSkip() {
      if (this.reducedMotion) return true;
      if (new URLSearchParams(location.search).has('intro')) return false;   // ?intro — показать снова
      if (location.hash.startsWith('#/')) return true;                        // прямая ссылка на серию
      try { return sessionStorage.getItem('aistova-intro') === 'seen'; } catch { return false; }
    }

    async start() {
      if (this.shouldSkip()) { document.body.classList.add('is-ready'); return; }
      try { sessionStorage.setItem('aistova-intro', 'seen'); } catch {}
      this.element.hidden = false;
      document.body.classList.add('intro-pending', 'is-locked');
      this.splitName();
      this.skip = () => this.finish(true);
      this.element.addEventListener('click', this.skip);
      this.onKey = (event) => { if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') this.finish(true); };
      document.addEventListener('keydown', this.onKey);
      this.tick();

      const started = performance.now();
      await Promise.race([this.preload(), wait(3500)]);          // счётчик идёт по реальной загрузке кадров
      const minimum = 900 - (performance.now() - started);       // но не короче 0,9 с, чтобы его успели увидеть
      if (minimum > 0) await wait(minimum);
      if (!this.done) this.play();
    }

    preload() {
      const sources = this.series.flatMap((item) => Array.from({ length: this.shots }, (_, k) => `img/intro/${item.id}-${k + 1}.jpg`));
      sources.push('img/me/01.jpg');
      let loaded = 0;
      return Promise.all(sources.map((src) => new Promise((resolve) => {
        const image = new Image();
        image.onload = image.onerror = () => { loaded += 1; this.target = Math.round(loaded / sources.length * 72); resolve(); };
        image.src = src;
      })));
    }

    tick() {
      if (this.done) return;
      if (this.shown < this.target) this.shown += Math.max(1, Math.round((this.target - this.shown) / 6));
      this.counter.textContent = String(Math.min(100, this.shown)).padStart(2, '0');
      this.line.style.transform = `scaleX(${Math.min(1, this.shown / 100)})`;
      this.raf = requestAnimationFrame(() => this.tick());
    }

    splitName() {
      let index = 0;
      this.name.querySelectorAll('.intro-word').forEach((word) => {
        const letters = [...word.textContent];
        word.textContent = '';
        letters.forEach((letter) => {
          const span = document.createElement('span');
          span.textContent = letter;
          span.style.setProperty('--i', index++);
          word.append(span);
        });
      });
    }

    cut(panelIndex, shotIndex) {
      const panel = this.panels[panelIndex];
      const shots = [...panel.querySelectorAll('img')];
      const next = shots[shotIndex % shots.length];
      if (!next.complete || !next.naturalWidth) return;          // кадр не успел загрузиться — остаёмся на прежнем
      shots.forEach((shot) => shot.classList.toggle('is-on', shot === next));
      next.classList.remove('is-punch'); void next.offsetWidth; next.classList.add('is-punch');
      panel.classList.remove('is-hit'); void panel.offsetWidth; panel.classList.add('is-hit');
    }

    async play() {
      const alive = () => !this.done;
      this.element.classList.add('is-playing');

      // 1. пум — пум — пум: три панели серий открываются одна за другой
      for (let i = 0; i < this.panels.length && alive(); i++) {
        this.panels[i].classList.add('is-open');
        this.target = 78 + i * 3;
        await wait(270);
      }
      await wait(520);

      // 2. серия кадров с ускорением, как очередь затвора
      const beats = [190, 170, 150, 130, 115, 100, 90, 80, 80];
      for (let k = 0; k < beats.length && alive(); k++) {
        this.cut(k % 3, 1 + Math.floor(k / 3));
        this.target = 84 + Math.round((k + 1) / beats.length * 16);
        await wait(beats[k]);
      }
      if (!alive()) return;
      this.target = 100;
      await wait(240);

      // 3. вспышка затвора: панели закрываются, появляется имя
      this.element.classList.add('is-flash');
      this.panels.forEach((panel) => panel.classList.add('is-closed'));
      await wait(120);
      if (!alive()) return;
      this.element.classList.add('is-name');
      await wait(1500);

      // 4. занавес уходит вверх, первый экран проявляется
      if (alive()) this.finish(false);
    }

    finish(skipped) {
      if (this.done) return;
      this.done = true;
      cancelAnimationFrame(this.raf);
      this.element.removeEventListener('click', this.skip);
      document.removeEventListener('keydown', this.onKey);
      this.element.classList.add('is-leaving');
      document.body.classList.remove('intro-pending', 'is-locked');
      document.body.classList.add('is-ready', 'intro-played');
      setTimeout(() => { this.element.hidden = true; }, skipped ? 500 : 1000);
    }
  }

  window.CinematicIntro = CinematicIntro;
})();
