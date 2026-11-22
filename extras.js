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
  const PLACES = window.AISTOVA_SERIES.filter(s => s.published !== false).map((place) => ({
    ...place, ...(LAYOUT[place.id] || { label: '', card: '' })
  }));
  const region = {
    west: Math.min(-78, ...PLACES.map(p => p.lon - 16)),
    east: Math.max(66, ...PLACES.map(p => p.lon + 24)),
    north: Math.max(72, ...PLACES.map(p => p.lat + 10)),
    south: Math.min(4, ...PLACES.map(p => p.lat - 10))
  };
  let bounds = region;
  // Географические подписи.
  const WATERS = [
    { text: 'Атлантический океан', lat: 34, lon: -38 },
    { text: 'Европа', lat: 43, lon: 20 },
    { text: 'Норвежское море', lat: 67, lon: 2 }
  ];
  const px = (lon) => (lon - bounds.west) / (bounds.east - bounds.west);
  const py = (lat) => (bounds.north - lat) / (bounds.north - bounds.south);

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
    const coast = svg.cloneNode();
    coast.classList.add('map-coast');
    coast.setAttribute('preserveAspectRatio', 'none');
    const land = document.createElementNS(svg.namespaceURI, 'use');
    land.setAttribute('href', 'coastlines.svg#land');
    coast.append(land);
    stage.append(coast, svg);

    const latitudeTicks = [-60, -40, -20, 0, 20, 40, 60];
    const longitudeTicks = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
    latitudeTicks.forEach(lat => stage.insertAdjacentHTML('beforeend', `<span class="map-tick map-tick--lat" data-lat="${lat}">${Math.abs(lat)}°${lat < 0 ? ' ю. ш.' : lat > 0 ? ' с. ш.' : ''}</span>`));
    longitudeTicks.forEach(lon => stage.insertAdjacentHTML('beforeend', `<span class="map-tick map-tick--lon" data-lon="${lon}">${Math.abs(lon)}°${lon < 0 ? ' з. д.' : lon > 0 ? ' в. д.' : ''}</span>`));
    stage.insertAdjacentHTML('beforeend', '<span class="map-compass" aria-hidden="true">N</span>');
    WATERS.forEach((item) => stage.insertAdjacentHTML('beforeend', `<span class="map-water" aria-hidden="true" data-lat="${item.lat}" data-lon="${item.lon}">${item.text}</span>`));

    // Петербург — откуда тянутся линии
    stage.insertAdjacentHTML('beforeend', `<span class="map-home" data-lat="${HOME.lat}" data-lon="${HOME.lon}"><i></i><em>${HOME.title}</em></span>`);

    // точки серий
    PLACES.forEach((place) => {
      const count = (place.sizes || window.DIMS[place.id]).length;
      const km = niceKm(distanceKm(HOME, place));
      stage.insertAdjacentHTML('beforeend', `
        <a class="map-point ${px(place.lon) > .62 && !LAYOUT[place.id] ? 'is-up is-card-left' : ''} ${place.label} ${place.card}" href="#/${place.id}" data-lat="${place.lat}" data-lon="${place.lon}">
          <i class="map-dot"></i>
          <span class="map-label"><b>${window.escapePortfolioText(place.title)}</b><small>${coords(place)}</small></span>
          <span class="map-card"><img src="img/${place.id}/${String(place.cover || 1).padStart(2, '0')}.jpg" width="600" height="900" alt="" loading="lazy"><em>${count} ${plural(count)} · ≈ ${km} км от Петербурга</em></span>
        </a>`);
    });

    const key = document.getElementById('mapKey');
    const markers = [...stage.querySelectorAll('.map-home, .map-point')].map(point => {
      const dot = point.querySelector('i');
      const label = point.querySelector('.map-label, em');
      let link;
      if (point.matches('a')) {
        link = document.createElement('a');
        link.href = point.hash;
        link.textContent = label.querySelector('b').textContent;
        point.setAttribute('aria-label', 'Открыть серию ' + link.textContent);
        key.append(link);
      }
      return { dot, label, link };
    });
    const waters = [...stage.querySelectorAll('.map-water')];
    function overlaps(a, b) {
      const gap = 6;
      return a.left < b.right + gap && a.right > b.left - gap &&
        a.top < b.bottom + gap && a.bottom > b.top - gap;
    }

    function arrangeLabels() {
      const bounds = stage.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      for (const { label } of markers) label.style.translate = '';
      const boxes = markers.map(({ dot, label }) => ({
        dot: dot.getBoundingClientRect(), label: label.getBoundingClientRect()
      }));
      const occupied = boxes.map(box => box.dot);
      const fixed = stage.querySelectorAll('.map-tick, .map-compass');
      for (const node of fixed) if (node.offsetWidth) occupied.push(node.getBoundingClientRect());

      let needsKey = false;
      markers.forEach(({ label, link }, index) => {
        const { dot, label: base } = boxes[index];
        if (!base.width) return;
        const x = (dot.left + dot.right) / 2, y = (dot.top + dot.bottom) / 2;
        const w = base.width, h = base.height;
        // Keep the original composition when it fits. Try both sides and the diagonals before the key.
        const candidates = [[base.left, base.top],
          [x + 16, y - h / 2], [x - 16 - w, y - h / 2],
          [x - w / 2, y + 16], [x - w / 2, y - 16 - h],
          [x + 12, y + 12], [x - w - 12, y + 12],
          [x + 12, y - h - 12], [x - w - 12, y - h - 12]];
        const chosen = candidates.map(([left, top]) => ({ left, top, right: left + w, bottom: top + h }))
          .find(box => box.left >= bounds.left + 6 && box.top >= bounds.top + 6 &&
            box.right <= bounds.right - 6 && box.bottom <= bounds.bottom - 6 &&
            !occupied.some(other => overlaps(box, other)));
        label.classList.toggle('is-unplaced', !chosen);
        if (link) {
          link.hidden = !!chosen;
          if (!chosen) needsKey = true;
        }
        if (chosen) {
          occupied.push(chosen);
          label.style.translate = (chosen.left - base.left) + 'px ' + (chosen.top - base.top) + 'px';
        }
      });
      key.hidden = !needsKey;
      for (const water of waters) {
        const box = water.getBoundingClientRect();
        water.classList.toggle('is-obscured', occupied.some(other => overlaps(box, other)));
      }
    }

    const features = [...stage.querySelectorAll('[data-lat], [data-lon]')];
    const scales = [...document.querySelectorAll('.map-scale button')];
    let world = false;
    for (const button of scales) {
      button.addEventListener('click', () => {
        world = button.dataset.scale === 'world';
        stage.classList.toggle('is-world', world);
        for (const option of scales) option.setAttribute('aria-pressed', String(option === button));
        draw();
      });
    }

    function draw() {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (!w || !h) return;
      const limits = world ? { west: -200, east: 200, north: 100, south: -100 } : region;
      // Equirectangular coordinates. The regional view uses a standard parallel of 38 degrees.
      const spanX = limits.east - limits.west, spanY = limits.north - limits.south;
      const ratio = w / h / (world ? 1 : Math.cos(38 * Math.PI / 180));
      const extraX = Math.max(0, spanY * ratio - spanX) / 2;
      const extraY = Math.max(0, spanX / ratio - spanY) / 2;
      bounds = { west: limits.west - extraX, east: limits.east + extraX, north: limits.north + extraY, south: limits.south - extraY };
      coast.setAttribute('viewBox', [bounds.west + 180, 90 - bounds.north, bounds.east - bounds.west, bounds.north - bounds.south].join(' '));
      for (const feature of features) {
        const { lat, lon } = feature.dataset;
        const x = lon === undefined ? .5 : px(Number(lon));
        const y = lat === undefined ? .5 : py(Number(lat));
        if (lon !== undefined) feature.style.left = x * 100 + '%';
        if (lat !== undefined) feature.style.top = y * 100 + '%';
        feature.hidden = feature.matches('.map-tick') && (x < .04 || x > .96 || y < .04 || y > .96);
      }
      arrangeLabels();
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      let grid = '';
      for (let lon = Math.ceil(bounds.west / 15) * 15; lon < bounds.east; lon += 15) grid += `<line x1="${px(lon) * w}" y1="0" x2="${px(lon) * w}" y2="${h}"/>`;
      for (let lat = Math.max(-80, Math.ceil(bounds.south / 10) * 10); lat < Math.min(90, bounds.north); lat += 10) grid += `<line x1="0" y1="${py(lat) * h}" x2="${w}" y2="${py(lat) * h}"/>`;
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
    document.fonts?.ready.then(arrangeLabels);
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
