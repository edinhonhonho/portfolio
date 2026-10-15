// Interactive hexagon map for the CHAMP spatial diagnostics.
// Data: data/champ/<city>.json — hexagon centres (x/y in 1e-5° from `origin`),
// one shared hexagon template per city (`tpl`, in degrees) and one value array
// per layer (value × 100, -1 = no data).
(function () {
    const root = document.getElementById('champ-map');
    if (!root || typeof L === 'undefined') return;

    // Class 0 (no exposure) is light grey; 1-5 follow the QGIS ramp
    const COLORS = ['#d3d3d0', '#96bd3c', '#e6d20f', '#f3ad00', '#ea670f', '#ec1a37'];
    const LAYERS = {
        alagamento: { label: 'Alagamentos', breaks: [0, 1, 2, 3, 4, 5], unit: 'Exposição' },
        deslizamento: { label: 'Deslizamentos de terra', breaks: [0, 1, 2, 3, 4, 5], unit: 'Exposição' },
        inundacao: { label: 'Inundações', breaks: [0, 1, 2, 3, 4, 5], unit: 'Exposição' },
        calor: { label: 'Ondas de calor', breaks: [0, 1, 2, 3, 4, 5], unit: 'Exposição' }
    };

    const fmt = n => String(n).replace('.', ',');
    // QGIS graduated classes: 0 alone, then (lower, upper] ranges
    function classOf(v, breaks) {
        if (v < 0) return -1;
        if (v === 0) return 0;
        for (let i = 1; i < breaks.length; i++) if (v <= breaks[i] + 1e-9) return i;
        return breaks.length - 1;
    }

    // No zoom animation: the canvas is redrawn instantly, so hexagons never lag behind the tiles
    const map = L.map('champ-leaflet', { zoomControl: true, zoomAnimation: false, maxBoundsViscosity: 1, minZoom: 5, maxZoom: 16 });
    const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
    L.tileLayer(ESRI + 'World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
        maxNativeZoom: 16, maxZoom: 17
    }).addTo(map);
    // Labels sit above the hexagon canvas (z-index 450)
    map.createPane('labels').style.zIndex = 460;
    map.getPane('labels').style.pointerEvents = 'none';
    L.tileLayer(ESRI + 'World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
        pane: 'labels', maxNativeZoom: 16, maxZoom: 17
    }).addTo(map);

    const canvas = document.createElement('canvas');
    canvas.className = 'champ-canvas';
    canvas.style.opacity = '0.82';
    map.getContainer().appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const tip = document.getElementById('champ-tip');

    let city = null, layer = 'calor', data = null, grid = null, vals = null, classes = null, raf = 0;
    const cache = {};

    function buildGrid() {
        grid = new Map();
        const n = data.x.length;
        for (let i = 0; i < n; i++) {
            const k = Math.floor(data.x[i] / 100) + ',' + Math.floor(data.y[i] / 100);
            (grid.get(k) || grid.set(k, []).get(k)).push(i);
        }
    }

    function setLayer() {
        const def = LAYERS[layer];
        vals = data.layers[layer];
        classes = vals.map(v => classOf(v / 100, def.breaks));
    }

    // First index in sorted array `arr` with value >= v
    function lowerBound(arr, v) {
        let lo = 0, hi = arr.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
        return lo;
    }

    // closePath() is very slow on paths with thousands of sub-paths; fill() closes each polygon anyway
    function hexPath(path, px, py, tpl, close) {
        path.moveTo(px + tpl[0][0], py + tpl[0][1]);
        for (let k = 1; k < 6; k++) path.lineTo(px + tpl[k][0], py + tpl[k][1]);
        if (close) path.closePath();
    }

    function draw() {
        raf = 0;
        const size = map.getSize(), dpr = window.devicePixelRatio || 1;
        if (canvas.width !== size.x * dpr || canvas.height !== size.y * dpr) {
            canvas.width = size.x * dpr; canvas.height = size.y * dpr;
            canvas.style.width = size.x + 'px'; canvas.style.height = size.y + 'px';
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size.x, size.y);
        if (!data) return;

        const z = map.getZoom(), sx = 256 * Math.pow(2, z) / 360;
        const [ox, oy] = data.origin;
        const sy = sx / Math.cos(oy * Math.PI / 180);
        // Template drawn 3% larger so neighbouring hexagons overlap and leave no seams
        const tpl = data.tpl.map(p => [p[0] * sx * 1.03, -p[1] * sy * 1.03]);
        const o = map.latLngToContainerPoint([oy, ox]);
        const kx = sx * 1e-5, ky = -sy * 1e-5;
        const pad = 40;

        // Rows are sorted by y, so only the visible band is visited
        const hh = Math.max(...data.tpl.map(p => Math.abs(p[1]))) * 1e5;
        const yTop = (map.containerPointToLatLng([0, -pad]).lat - oy) * 1e5 + hh;
        const yBottom = (map.containerPointToLatLng([0, size.y + pad]).lat - oy) * 1e5 - hh;
        const lo = lowerBound(data.y, yBottom), hi = lowerBound(data.y, yTop);

        const paths = COLORS.map(() => new Path2D());
        for (let i = lo; i < hi; i++) {
            const c = classes[i];
            if (c < 0) continue;
            const px = o.x + data.x[i] * kx;
            if (px < -pad || px > size.x + pad) continue;
            hexPath(paths[c], px, o.y + data.y[i] * ky, tpl);
        }
        for (let c = 0; c < COLORS.length; c++) { ctx.fillStyle = COLORS[c]; ctx.fill(paths[c]); }

        if (hoverIdx >= 0) {
            const hp = new Path2D();
            hexPath(hp, o.x + data.x[hoverIdx] * kx, o.y + data.y[hoverIdx] * ky, tpl, true);
            ctx.strokeStyle = '#1c1a19'; ctx.lineWidth = 2; ctx.stroke(hp);
        }
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
    map.on('move zoom resize', schedule);

    let hoverIdx = -1;
    const onPoint = e => {
        if (!data) return;
        const x = Math.round((e.latlng.lng - data.origin[0]) * 1e5);
        const y = Math.round((e.latlng.lat - data.origin[1]) * 1e5);
        const bx = Math.floor(x / 100), by = Math.floor(y / 100);
        let best = -1, bd = Infinity;
        const r = Math.max(...data.tpl.map(p => Math.abs(p[0]))) * 1e5 * 0.9;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
            const cell = grid.get((bx + i) + ',' + (by + j));
            if (!cell) continue;
            for (const idx of cell) {
                const d = Math.hypot(data.x[idx] - x, (data.y[idx] - y) * 0.9);
                if (d < bd) { bd = d; best = idx; }
            }
        }
        if (best < 0 || bd > r) best = -1;
        if (best !== hoverIdx) { hoverIdx = best; schedule(); }
        if (best < 0 || classes[best] < 0) { tip.hidden = true; return; }
        const def = LAYERS[layer];
        tip.innerHTML = '<b>' + def.label + '</b><br>' + def.unit + ': ' + fmt((vals[best] / 100).toFixed(2).replace(/\.?0+$/, ''));
        tip.style.left = (e.containerPoint.x + 14) + 'px';
        tip.style.top = (e.containerPoint.y + 14) + 'px';
        tip.hidden = false;
    };
    map.on('mousemove', onPoint);
    map.on('click', onPoint); // touch screens
    map.on('mouseout', () => { hoverIdx = -1; tip.hidden = true; schedule(); });

    const cityBtns = document.getElementById('champ-cities');
    const layerBtns = document.getElementById('champ-layers');
    const status = document.getElementById('champ-status');

    function renderControls() {
        layerBtns.querySelectorAll('button').forEach(b => {
            const has = data && data.layers[b.dataset.layer];
            b.disabled = !has;
            b.setAttribute('aria-pressed', String(b.dataset.layer === layer));
        });
        cityBtns.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.city === city)));

    }

    // Fit the city, then lock panning and zooming to it
    function lockToCity() {
        const b = L.latLngBounds(data.bounds);
        map.setMaxBounds(null);
        map.setMinZoom(1);
        map.fitBounds(b, { padding: [20, 20], animate: false });
        const z = map.getZoom();
        map.setMinZoom(z);
        map.setMaxZoom(Math.min(16, z + 3));
        map.setMaxBounds(b.pad(0.12));
    }

    async function showCity(name) {
        status.textContent = 'Carregando…';
        try {
            if (!cache[name]) cache[name] = await (await fetch('data/champ/' + name + '.json')).json();
            data = cache[name]; city = name;
            if (!data.layers[layer]) layer = 'alagamento';
            buildGrid(); setLayer(); hoverIdx = -1; tip.hidden = true;
            lockToCity();
            status.textContent = '';
            renderControls(); schedule();
        } catch (err) {
            status.textContent = 'Não foi possível carregar o mapa.';
        }
    }

    cityBtns.addEventListener('click', e => { const b = e.target.closest('button'); if (b) showCity(b.dataset.city); });
    layerBtns.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        layer = b.dataset.layer; setLayer(); renderControls(); schedule();
    });

    // Load lazily when the map scrolls into view
    const start = () => { map.invalidateSize(); showCity('contagem'); };
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '300px' });
        io.observe(root);
    } else start();
})();
