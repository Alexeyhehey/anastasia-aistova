// Основная логика сайта: контент, тема, обложки серий, подборка,
// страница серии, лайтбокс, кинематографичные переходы.
// Весь редактируемый текст и ссылки лежат в content.js (window.CONTENT).
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const arrow = '<svg viewBox="0 0 32 16" aria-hidden="true"><path d="M0 8h30M23 1l7 7-7 7"/></svg>';
  const escape = window.escapePortfolioText;
  const pad = (value) => String(value).padStart(2, '0');
  const plural = (n) => n % 10 === 1 && n % 100 !== 11 ? 'кадр' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'кадра' : 'кадров';

  const C = window.CONTENT;

  /* ---------------- Данные ---------------- */

  const SERIES = window.AISTOVA_SERIES.filter(s => s.published !== false).map((cfg) => {
    const frames = (cfg.sizes || window.DIMS[cfg.id]).map(([w, h], index) => ({
      src: `img/${cfg.id}/${pad(index + 1)}.jpg`, w, h, index
    }));
    const cover = frames[(cfg.cover || 1) - 1] || frames[0];
    const ordered = [cover, ...frames.filter(frame => frame !== cover)];
    return { ...cfg, frames: ordered, sourceFrames: frames, cover, alternate: ordered[Math.min(5, ordered.length - 1)] };
  });

  const SELECTED = {
    id: 'selected',
    title: C.selected.label || 'SELECTED',
    frames: C.selected.order.flatMap((entry, index) => {
      if (entry && !SERIES.some(s => s.id === entry[0] && s.selected?.includes(entry[1]))) return [];
      const [w, h] = window.DIMS.selected[index];
      return [{ src: `img/selected/${pad(index + 1)}.jpg`, w, h }];
    }).concat(SERIES.flatMap(series => (series.selected || [])
      .filter(n => !C.selected.order.some(entry => entry && entry[0] === series.id && entry[1] === n))
      .map(n => series.sourceFrames[n - 1]).filter(Boolean)
    )).map((frame, index) => ({ ...frame, index }))
  };

  const home = $('#home');
  const seriesPage = $('#series');
  const curtain = $('#routeCurtain');
  let activeSeriesId = null;
  let lightboxFrames = [];
  let lightboxSeries = null;
  let currentFrame = 0;
  let focusBeforeLightbox = null;
  let pendingReturn = null;      // серия, к чьей обложке летим обратно
  let lightboxBacks = 0;         // свои history.back() после закрытия просмотра кнопкой

  $('#year').textContent = new Date().getFullYear();

  /* ---------------- Контент из content.js ---------------- */

  const getByPath = (path) => path.split('.').reduce((obj, key) => (obj == null ? obj : obj[key]), C);

  function hydrateContent() {
    $$('[data-c]').forEach((el) => {
      const value = getByPath(el.dataset.c);
      if (value != null) el.textContent = value;
    });

    $('#mainNav').innerHTML = C.nav.map((item) => `<a href="${item.href}">${item.label}</a>`).join('');

    $('#heroNameLine1').textContent = C.site.nameLatin[0];
    $('#heroNameLine2').textContent = C.site.nameLatin[1];
    const introWords = $$('.intro-word');
    if (introWords[0]) introWords[0].textContent = C.site.nameLatin[0];
    if (introWords[1]) introWords[1].textContent = C.site.nameLatin[1];

    $('.brand-name').textContent = C.site.name;
    $('.brand').setAttribute('aria-label', `AA · ${C.site.name} — к началу страницы`);
    [['contactTelegram', 'telegram'], ['footerTelegram', 'telegram'],
     ['contactInstagram', 'instagram'], ['footerInstagram', 'instagram']]
      .forEach(([id, key]) => { const link = document.getElementById(id); if (link) link.href = C.site[key]; });

    $('#aboutCopy').innerHTML = C.about.paragraphs.map((text) => `<p>${text}</p>`).join('');

    $('#formatList').innerHTML = C.services.formats.map((format) => `
      <article class="format" data-reveal>
        <div class="format-title"><span>${format.kicker}</span><h3>${format.title}</h3></div>
        <div class="format-description">
          <p>${format.text}</p>
          <p class="format-includes">Что включено</p>
          <ul>${format.includes.map((item) => `<li>${item}</li>`).join('')}</ul>
          <p class="price">${format.price || C.services.price}</p>
          <a class="btn" href="#contact"><span>${C.services.cta}</span>${arrow}</a>
        </div>
      </article>`).join('');

    $('#commonDetails').innerHTML = C.services.details
      .map(([title, text]) => `<p><span>${title}</span>${text}</p>`).join('');
  }

  /* ---------------- Тема ---------------- */

  /* ---------------- Обложки серий (горизонтальный ряд) ---------------- */

  function renderSeriesRow() {
    $('#seriesRow').innerHTML = SERIES.map((series) => `
      <a class="series-card" data-series="${series.id}" href="#/${series.id}" data-reveal>
        <div class="series-card-cover">
          <img class="cover-main" src="${series.cover.src}" width="${series.cover.w}" height="${series.cover.h}" alt="" loading="lazy">
          <img class="cover-alt" src="${series.alternate.src}" width="${series.alternate.w}" height="${series.alternate.h}" alt="" loading="lazy" aria-hidden="true">
        </div>
        <span class="series-card-title">${escape(series.title)}</span>
        <span class="series-card-meta"><span>Авторская серия</span><span>${series.frames.length} ${plural(series.frames.length)}</span></span>
      </a>
    `).join('');
  }

  function initRowControls() {
    const track = $('#seriesRow');
    const controls = $('.row-controls');
    const previous = $('#seriesPrev');
    const next = $('#seriesNext');
    const progress = $('#seriesProgress');
    let scheduled = false;
    function update() {
      scheduled = false;
      if (!track.clientWidth) return;
      const max = track.scrollWidth - track.clientWidth;
      controls.classList.toggle('is-hidden', max <= 4);   // всё помещается — стрелки не нужны
      previous.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max - 2;
      const visibleRatio = Math.min(1, track.clientWidth / track.scrollWidth);
      const travelled = max > 0 ? track.scrollLeft / max : 0;
      progress.style.transform = `scaleX(${visibleRatio + (1 - visibleRatio) * travelled})`;
    }
    track.addEventListener('scroll', () => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    previous.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * .72, behavior: reducedMotion ? 'auto' : 'smooth' }));
    next.addEventListener('click', () => track.scrollBy({ left: track.clientWidth * .72, behavior: reducedMotion ? 'auto' : 'smooth' }));
    if ('ResizeObserver' in window) new ResizeObserver(update).observe(track);
    else window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* ---------------- Подборка ---------------- */

  function spreadClasses(frames) {
    // Пары портретов чередуются с одиночными разворотами. Порядок совпадает с лайтбоксом.
    let paired = false;
    return frames.map((frame, index, frames) => {
      if (paired) { paired = false; return ''; }
      const next = frames[index + 1];
      if (frame.w > frame.h || !next || next.w > next.h || index % 7 === 5) return 'is-solo';
      paired = true;
      return 'is-offset';
    });
  }

  function deskClasses(frames) {
    // ПК: в ряду 12 колонок, вертикальный кадр занимает 4, горизонтальный 8 — кадр целиком помещается в экран.
    // Порядок кадров не меняется: неполный ряд встаёт по центру, второй кадр тройки или пары чуть опущен.
    const classes = frames.map(() => '');
    let row = [];
    let used = 0;
    const close = () => {
      if (used === 8) classes[row[0]] = 'at-3';
      if (used === 4) classes[row[0]] = 'at-5';
      if (row.length === 3 || (row.length === 2 && used === 8)) classes[row[1]] = 'is-low';
      row = [];
      used = 0;
    };
    frames.forEach((frame, index) => {
      const span = frame.w > frame.h ? 8 : 4;
      if (used + span > 12) close();
      row.push(index);
      used += span;
    });
    close();
    return classes;
  }

  function renderSelected() {
    const layouts = spreadClasses(SELECTED.frames);
    const desk = deskClasses(SELECTED.frames);
    $('#selectedGrid').innerHTML = SELECTED.frames.map((frame) => `
      <button type="button" class="selected-item ${layouts[frame.index]} ${desk[frame.index]} ${frame.w > frame.h ? 'selected-item--wide' : ''}" data-s="${frame.index}" data-reveal aria-label="Открыть кадр ${frame.index + 1} из ${SELECTED.frames.length}">
        <img src="${frame.src}" width="${frame.w}" height="${frame.h}" alt="Подборка работ, кадр ${frame.index + 1}" loading="lazy">
      </button>
    `).join('');

    $('#selectedGrid').addEventListener('click', (event) => {
      const button = event.target.closest('[data-s]');
      if (button) openLightbox(SELECTED, Number(button.dataset.s), button);
    });
  }

  /* ---------------- Появление блоков ---------------- */

  let revealObserver;
  function observeReveals(root = document) {
    const elements = $$('[data-reveal]:not(.is-visible)', root);
    if (reducedMotion || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        });
      }, { threshold: .06, rootMargin: '0px 0px -6% 0px' });
    }
    elements.forEach((element) => {
      if (element.getBoundingClientRect().top < innerHeight * .96) element.classList.add('is-visible');
      else {
        element.classList.add('will-reveal');
        revealObserver.observe(element);
      }
    });
  }

  /* ---------------- Шапка и параллакс первого экрана ---------------- */

  function initHeaderAndParallax() {
    const parallaxLayout = matchMedia('(min-width: 1101px), (min-width: 801px) and (orientation: landscape)');
    const header = $('#siteHeader');
    const stage = $('#heroStage');
    let scheduled = false;
    function update() {
      scheduled = false;
      header.classList.toggle('is-scrolled', scrollY > 24);
      if (!reducedMotion && parallaxLayout.matches && !document.body.classList.contains('is-series') && scrollY < innerHeight * 1.2) {
        stage.style.transform = `translate3d(0, ${scrollY * .07}px, 0)`;
      } else {
        stage.style.transform = '';
      }
    }
    window.addEventListener('scroll', () => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* ---------------- Страница серии ---------------- */

  function renderSeries(series) {
    const layouts = ['is-solo frame--opener', ...spreadClasses(series.frames.slice(1))];
    const desk = deskClasses(series.frames);
    const next = SERIES[(SERIES.indexOf(series) + 1) % SERIES.length];
    seriesPage.innerHTML = `
      <section class="series-hero">
        <a class="series-back" href="#works">← Все серии</a>
        <p class="series-route-label">Авторская фотосерия</p>
        <h1>${escape(series.title)}</h1>
        <p class="series-route-note">Название — ассоциация, а не место съёмки.</p>
        <span class="series-route-count">${series.frames.length} ${plural(series.frames.length)}</span>
      </section>
      <div class="frames">${series.frames.map((frame, index) => `
        <button type="button" class="frame ${layouts[index]} ${desk[index]} ${frame.w > frame.h ? 'frame--wide' : ''}" data-k="${index}" data-reveal aria-label="Открыть кадр ${index + 1} из ${series.frames.length}">
          <img src="${frame.src}" width="${frame.w}" height="${frame.h}" alt="Серия «${escape(series.titleRu)}», кадр ${index + 1}" loading="lazy">
        </button>`).join('')}
      </div>
      <div class="series-next">
        <a class="btn" href="#contact"><span>Обсудить съёмку</span>${arrow}</a>
        <a ${SERIES.length === 1 ? "hidden" : ""} class="next-series" href="#/${next.id}"><small>Следующая серия</small><span>${escape(next.title)} ↗︎</span></a>
      </div>
    `;
  }

  /* ---------------- Маршрутизация ---------------- */

  // Сохраняем точку входа в записи главной до того, как сменится hash.
  home.addEventListener('click', (event) => {
    const link = event.target.closest('.series-card, .map-point, .map-key a');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    history.replaceState({ ...history.state, portfolioReturn: {
      hash: link.hash,
      fromCard: link.classList.contains('series-card'),
      fromKey: !!link.closest('.map-key'),
      top: link.getBoundingClientRect().top,
      rowLeft: $('#seriesRow').scrollLeft,
      width: innerWidth,
    } }, '');
  }, true);

  function route() {
    const id = location.hash.startsWith('#/') ? location.hash.slice(2) : null;
    const series = SERIES.find((item) => item.id === id);
    const previousId = activeSeriesId;
    if (lightboxOpen()) closeLightbox(false, true);

    if (series) {
      activeSeriesId = series.id;
      renderSeries(series);
      home.hidden = true;
      seriesPage.hidden = false;
      document.body.classList.add('is-series');
      document.title = `${series.titleRu} — ${C.site.name}`;
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      observeReveals(seriesPage);
    } else {
      if (id) history.replaceState(null, '', location.pathname + location.search);
      activeSeriesId = null;
      seriesPage.hidden = true;
      home.hidden = false;
      document.body.classList.remove('is-series');
      document.title = `${C.site.name} — фотограф`;
      const saved = previousId && history.state?.portfolioReturn;
      const returnLink = saved && $$(saved.fromCard ? '.series-card' : saved.fromKey && !$('#mapKey').hidden ? '.map-key a' : '.map-point', home)
        .find(link => link.hash === saved.hash);
      if (returnLink && !pendingReturn) {
        if (innerWidth === saved.width) {
          $('#seriesRow').scrollTo({ left: saved.rowLeft, behavior: 'instant' });
          window.scrollBy({ top: returnLink.getBoundingClientRect().top - saved.top, behavior: 'instant' });
        } else {
          returnLink.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
        }
        returnLink.focus({ preventScroll: true });
      } else if (previousId && location.hash && !location.hash.startsWith('#/')) {
        const target = document.getElementById(location.hash.slice(1));
        if (target) {
          // возврат со страницы серии: целевая секция проявляется сразу, без «вспышки» reveal-анимации
          const section = target.closest('section') || target;
          $$('[data-reveal]:not(.is-visible)', section).forEach((el) => el.classList.add('is-visible'));
          requestAnimationFrame(() => {
            if (pendingReturn) {
              const card = $(`.series-card[data-series="${pendingReturn.series.id}"]`);
              card.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
              finishFlyBack();
            } else {
              target.scrollIntoView({ behavior: 'instant' });
            }
          });
        } else if (pendingReturn) {
          finishFlyBack(null);
        }
      } else if (pendingReturn) {
        finishFlyBack(null);
      }
    }
    if (previousId !== activeSeriesId && previousId !== null && !reducedMotion && !pendingReturn) {
      curtain.classList.remove('is-active');
      void curtain.offsetWidth;
      curtain.classList.add('is-active');
      setTimeout(() => curtain.classList.remove('is-active'), 520);
    }
  }

  /* ---------------- Кинематографичный переход обложки ---------------- */
  // Клик по обложке: кадр вырастает из карточки на весь экран,
  // под ним открывается страница серии; «← Все серии» — обратный полёт.

  function flyToSeries(card, series) {
    if (reducedMotion) { location.hash = `#/${series.id}`; return; }
    const img = card.querySelector('.cover-main');
    const from = img.getBoundingClientRect();
    const clone = img.cloneNode();
    clone.className = 'zoom-clone';
    clone.alt = '';
    Object.assign(clone.style, {
      top: from.top + 'px', left: from.left + 'px', width: from.width + 'px', height: from.height + 'px'
    });
    document.body.append(clone);
    window.addEventListener('hashchange', () => {
      const first = $('.frame img', seriesPage);
      if (!first || activeSeriesId !== series.id) { clone.remove(); return; }
      const to = first.getBoundingClientRect();
      const animation = clone.animate([
        { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' },
        { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px' }
      ], { duration: 650, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
      first.parentElement.classList.add('is-visible');
      animation.finished.finally(() => clone.remove());
    }, { once: true });
    location.hash = '#/' + series.id;
  }

  function flyBack(series) {
    pendingReturn = { series, clone: null };
    if (reducedMotion) { location.hash = '#works'; return; }
    const clone = document.createElement('img');
    clone.className = 'zoom-clone';
    clone.src = series.cover.src;
    clone.alt = '';
    Object.assign(clone.style, { top: '0px', left: '0px', width: '100vw', height: '100dvh' });
    document.body.append(clone);
    document.body.classList.add('is-locked');
    pendingReturn.clone = clone;
    location.hash = '#works';
  }

  function finishFlyBack() {
    const pending = pendingReturn;
    if (!pending) return;
    pendingReturn = null;
    const { series, clone } = pending;
    const target = $(`.series-card[data-series="${series.id}"] .cover-main`);
    if (!clone || !target) {
      if (clone) clone.remove();
      document.body.classList.remove('is-locked');
      return;
    }
    const rect = target.getBoundingClientRect();
    requestAnimationFrame(() => {
      Object.assign(clone.style, {
        top: `${rect.top}px`, left: `${rect.left}px`,
        width: `${rect.width}px`, height: `${rect.height}px`
      });
      let ended = false;
      const cleanup = () => {
        if (ended) return;
        ended = true;
        clone.style.opacity = '0';
        setTimeout(() => { clone.remove(); document.body.classList.remove('is-locked'); }, 430);
      };
      clone.addEventListener('transitionend', cleanup, { once: true });
      setTimeout(cleanup, 900);
    });
  }

  /* ---------------- Лайтбокс ---------------- */

  const lb = $('#lb');
  const lbImage = $('#lbImage');
  const lightboxBackground = [$('#siteHeader'), home, seriesPage, $('.site-footer')];
  function lightboxOpen() { return !lb.hidden; }

  function showFrame(index) {
    if (!lightboxFrames.length) return;
    currentFrame = (index + lightboxFrames.length) % lightboxFrames.length;
    const frame = lightboxFrames[currentFrame];
    lbImage.classList.add('is-loading');
    lbImage.src = frame.src;
    lbImage.alt = lightboxSeries.id === 'selected'
      ? `Подборка работ, кадр ${currentFrame + 1}`
      : `Серия «${lightboxSeries.titleRu}», кадр ${currentFrame + 1}`;
    $('#lbCounter').textContent = `${pad(currentFrame + 1)} / ${pad(lightboxFrames.length)}`;
    $('#lbCaption').textContent = `${lightboxSeries.title} · кадр ${pad(currentFrame + 1)}`;
    [currentFrame - 1, currentFrame + 1].forEach((nextIndex) => {
      const preload = new Image();
      preload.src = lightboxFrames[(nextIndex + lightboxFrames.length) % lightboxFrames.length].src;
    });
  }

  function openLightbox(series, index, trigger) {
    lightboxSeries = series;
    lightboxFrames = series.frames;
    focusBeforeLightbox = trigger || document.activeElement;
    $('#lbSeries').textContent = series.title;
    lb.hidden = false;
    lightboxBackground.forEach(element => { element.inert = true; });
    document.body.classList.add('is-locked');
    showFrame(index);
    $('.lightbox-close', lb).focus({ preventScroll: true });
    // Просмотр — отдельная запись истории: «Назад» закрывает кадр, а не уводит со страницы.
    if (!history.state?.lightbox) history.pushState({ ...history.state, lightbox: series.id }, '');
  }

  function closeLightbox(restoreFocus = true, fromHistory = false) {
    if (!lightboxOpen()) return;
    lb.hidden = true;
    lightboxBackground.forEach(element => { element.inert = false; });
    document.body.classList.remove('is-locked');
    if (restoreFocus && focusBeforeLightbox?.isConnected) focusBeforeLightbox.focus({ preventScroll: true, focusVisible: false });
    if (!fromHistory && history.state?.lightbox) { lightboxBacks += 1; history.back(); }
  }

  function syncLightboxWithHistory() {
    const entry = history.state?.lightbox;
    if (lightboxBacks) {
      // Запись просмотра снята после закрытия кнопкой. Если кадр уже открыли снова — возвращаем её.
      lightboxBacks -= 1;
      if (lightboxOpen() && !entry) history.pushState({ ...history.state, lightbox: lightboxSeries.id }, '');
      return;
    }
    if (lightboxOpen()) {
      if (!entry) closeLightbox(true, true);
    } else if (entry && entry === lightboxSeries?.id && entry === (activeSeriesId || 'selected')) {
      openLightbox(lightboxSeries, currentFrame, focusBeforeLightbox);   // «Вперёд» возвращает тот же кадр
    }
  }

  function initLightbox() {
    lbImage.addEventListener('load', () => lbImage.classList.remove('is-loading'));

    // клики по обложкам серий — кинематографичный переход
    $('#seriesRow').addEventListener('click', (event) => {
      const card = event.target.closest('.series-card');
      if (!card || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const series = SERIES.find((item) => item.id === card.dataset.series);
      if (series) flyToSeries(card, series);
    });

    seriesPage.addEventListener('click', (event) => {
      const back = event.target.closest('.series-back');
      if (back) {
        event.preventDefault();
        const series = SERIES.find((item) => item.id === activeSeriesId);
        if (series) flyBack(series);
        return;
      }
      const button = event.target.closest('[data-k]');
      if (!button) return;
      const series = SERIES.find((item) => item.id === activeSeriesId);
      if (series) openLightbox(series, Number(button.dataset.k), button);
    });

    $('.lightbox-close', lb).addEventListener('click', () => closeLightbox());
    $('.lightbox-prev', lb).addEventListener('click', () => showFrame(currentFrame - 1));
    $('.lightbox-next', lb).addEventListener('click', () => showFrame(currentFrame + 1));
    lb.addEventListener('click', (event) => { if (event.target === lb) closeLightbox(); });

    document.addEventListener('keydown', (event) => {
      if (!lightboxOpen()) return;
      if (event.key === 'Escape') closeLightbox();
      if (event.key === 'ArrowRight') showFrame(currentFrame + 1);
      if (event.key === 'ArrowLeft') showFrame(currentFrame - 1);
      if (event.key === 'Tab') {
        const controls = $$('button', lb);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!lb.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });

    let touchStart = null;
    $('.lightbox-figure', lb).addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch') touchStart = { x: event.clientX, y: event.clientY };
    });
    $('.lightbox-figure', lb).addEventListener('pointerup', (event) => {
      if (!touchStart) return;
      const dx = event.clientX - touchStart.x;
      const dy = event.clientY - touchStart.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) showFrame(currentFrame + (dx < 0 ? 1 : -1));
      touchStart = null;
    });
    $('.lightbox-figure', lb).addEventListener('pointercancel', () => { touchStart = null; });

    // После перезагрузки просмотр закрыт: убираем его отметку из текущей записи истории.
    if (history.state?.lightbox) {
      const { lightbox, ...rest } = history.state;
      history.replaceState(rest, '');
    }
    window.addEventListener('popstate', syncLightboxWithHistory);
  }

  /* ---------------- Заставка ---------------- */

  function initIntro() {
    const intro = new window.CinematicIntro({
      element: $('#intro'),
      reducedMotion
    });
    intro.start();
  }

  /* ---------------- Сборка ---------------- */

  hydrateContent();
  if (!SERIES.length) {
    $('.series-row-wrap').hidden = true;
    $('.map').hidden = true;
    $('.works-section .section-lead').textContent = 'Ниже — подборка отдельных работ.';
  }
  renderSeriesRow();
  initRowControls();
  renderSelected();
  observeReveals();
  initHeaderAndParallax();
  initLightbox();
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('hashchange', route);
  route();
  initIntro();
})();
