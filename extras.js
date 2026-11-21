// Два штриха поверх основной страницы:
// 1) «Карта образов» — точки мест, в честь которых названы серии, с линиями от Петербурга;
// 2) курсор-видоискатель над фотографиями и вспышка затвора при открытии кадра.
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plural = (n) => n % 10 === 1 && n % 100 !== 11 ? 'кадр' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'кадра' : 'кадров';

  /* ---------- Карта ---------- */
  const HOME = { title: 'Петербург', lat: 59.939, lon: 30.316 };
  // расположение подписей и карточек-превью для каждой точки
  const LAYOUT = {
    edinburgh: { label: 'is-down', card: 'is-card-far' },
    martinique: { label: '', card: 'is-card-up' },
    ladoga: { label: '', card: '' }
  };
  const PLACES = window.CONTENT.series.map((place) => ({
    ...place, ...(LAYOUT[place.id] || { label: '', card: '' })
  }));
  const BOUNDS = { west: -78, east: 66, north: 72, south: 4 };
  // географические подписи для ощущения карты (без контуров суши)
  const WATERS = [
    { text: 'Атлантический океан', lat: 34, lon: -38 },
    { text: 'Европа', lat: 43, lon: 20 },
    { text: 'Норвежское море', lat: 67, lon: 2 }
  ];
  const px = (lon) => (lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west);
  const py = (lat) => (BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south);

  function degMin(value) {
    const abs = Math.abs(value);
    let deg = Math.floor(abs);
    let min = Math.round((abs - deg) * 60);
    if (min === 60) { deg += 1; min = 0; }
    return `${deg}°${String(min).padStart(2, '0')}′`;
  }
  const coords = (place) => `${degMin(place.lat)} ${place.lat >= 0 ? 'с. ш.' : 'ю. ш.'} · ${degMin(place.lon)} ${place.lon >= 0 ? 'в. д.' : 'з. д.'}`;

  function distanceKm(a, b) {            // расстояние по дуге большого круга
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }
  const niceKm = (km) => String(Math.round(km / 10) * 10).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  function initMap() {
    const stage = document.getElementById('mapStage');
    if (!stage || !window.DIMS) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    stage.append(svg);

    // подписи сетки
    [20, 40, 60].forEach((lat) => stage.insertAdjacentHTML('beforeend', `<span class="map-tick map-tick--lat" style="top:${py(lat) * 100}%">${lat}° с. ш.</span>`));
    [-60, -30, 0, 30, 60].forEach((lon) => stage.insertAdjacentHTML('beforeend', `<span class="map-tick map-tick--lon" style="left:${px(lon) * 100}%">${lon === 0 ? '0°' : `${Math.abs(lon)}° ${lon < 0 ? 'з. д.' : 'в. д.'}`}</span>`));
    stage.insertAdjacentHTML('beforeend', '<span class="map-compass" aria-hidden="true">N</span>');
    WATERS.forEach((item) => stage.insertAdjacentHTML('beforeend', `<span class="map-water" aria-hidden="true" style="left:${px(item.lon) * 100}%;top:${py(item.lat) * 100}%">${item.text}</span>`));

    // Петербург — откуда тянутся линии
    stage.insertAdjacentHTML('beforeend', `<span class="map-home" style="left:${px(HOME.lon) * 100}%;top:${py(HOME.lat) * 100}%"><i></i><em>${HOME.title}</em></span>`);

    // точки серий
    PLACES.forEach((place) => {
      const count = window.DIMS[place.id].length;
      const km = niceKm(distanceKm(HOME, place));
      stage.insertAdjacentHTML('beforeend', `
        <a class="map-point ${place.label} ${place.card}" href="#/${place.id}" style="left:${px(place.lon) * 100}%;top:${py(place.lat) * 100}%" aria-label="Открыть серию «${place.title}», ${count} ${plural(count)}">
          <i class="map-dot"></i>
          <span class="map-label"><b>${place.title}</b><small>${coords(place)}</small></span>
          <span class="map-card"><img src="img/intro/${place.id}-1.jpg" width="600" height="900" alt="" loading="lazy"><em>${count} ${plural(count)} · ≈ ${km} км от Петербурга</em></span>
        </a>`);
    });

    function draw() {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (!w || !h) return;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      let grid = '';
      for (let lon = -75; lon <= 60; lon += 15) grid += `<line x1="${px(lon) * w}" y1="0" x2="${px(lon) * w}" y2="${h}"/>`;
      for (let lat = 10; lat <= 70; lat += 10) grid += `<line x1="0" y1="${py(lat) * h}" x2="${w}" y2="${py(lat) * h}"/>`;
      const x1 = px(HOME.lon) * w;
      const y1 = py(HOME.lat) * h;
      const arcs = PLACES.map((place, index) => {
        const x2 = px(place.lon) * w;
        const y2 = py(place.lat) * h;
        const lift = Math.min(h * .3, Math.hypot(x2 - x1, y2 - y1) * .3);
        return `<path class="map-arc" style="--d:${index}" pathLength="1" d="M${x1} ${y1} Q${(x1 + x2) / 2} ${(y1 + y2) / 2 - lift} ${x2} ${y2}"/>`;
      }).join('');
      svg.innerHTML = `<g class="map-grid">${grid}</g>${arcs}`;
    }
    draw();
    if ('ResizeObserver' in window) new ResizeObserver(draw).observe(stage);
    else window.addEventListener('resize', draw, { passive: true });
  }

  /* ---------- Видоискатель и затвор ---------- */
  function initViewfinder() {
    const shutter = document.getElementById('shutter');
    if (shutter && !reduced) {
      document.addEventListener('click', (event) => {
        if (!event.target.closest || !event.target.closest('.frame, .selected-item')) return;
        shutter.classList.remove('is-fire');
        void shutter.offsetWidth;
        shutter.classList.add('is-fire');
      }, true);
    }

    const finder = document.getElementById('vf');
    if (!finder || reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    document.documentElement.classList.add('has-vf');
    const label = finder.querySelector('span');
    const targets = '.frame, .series-card-cover, .selected-item';
    let x = 0, y = 0, tx = 0, ty = 0, active = false, raf = 0;

    function loop() {
      x += (tx - x) * .24;
      y += (ty - y) * .24;
      finder.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = active || Math.abs(tx - x) + Math.abs(ty - y) > .5 ? requestAnimationFrame(loop) : 0;
    }
    function setActive(next) {
      if (next && !active) { x = tx; y = ty; }
      active = next;
      finder.classList.toggle('is-on', active);
      if (!raf) raf = requestAnimationFrame(loop);
    }
    document.addEventListener('pointermove', (event) => {
      tx = event.clientX;
      ty = event.clientY;
      const target = event.target.closest ? event.target.closest(targets) : null;
      if (target) label.textContent = target.closest('.series-card-cover') ? 'Открыть серию' : 'Смотреть';
      setActive(Boolean(target));
    }, { passive: true });
    document.addEventListener('pointerdown', () => finder.classList.add('is-press'));
    document.addEventListener('pointerup', () => finder.classList.remove('is-press'));
    window.addEventListener('scroll', () => { if (active) setActive(false); }, { passive: true });
    document.addEventListener('pointerleave', () => setActive(false));
    window.addEventListener('hashchange', () => setActive(false));
  }

  initMap();
  initViewfinder();
})();
